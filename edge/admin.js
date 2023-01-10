"use strict";

const AWS = require('aws-sdk');
const AwsUtils = require('./awsUtils')

const targetRegion = 'us-east-1'
const lambda = new AWS.Lambda({ region: targetRegion });
const AuthFailWindowMs = 5 * 60 * 1000
const MaxAuthFailedAttempts = 10

// When run in rapid succession, AWS may retain some state between executions so we defined some
// globals where it would be useful to retain state.
let stateCache = null
let editorsList = null

/**
  - Get admin state update messages from the state queue and merge them into the state.json in S3
  - Add file data received from the client to the admin bucket.
  - Forward admin actions to backend worker lambdas.
*/
exports.handler = async (event, context) => {
  console.log('Event: ' + JSON.stringify(event))
  const req = event.Records[0].cf.request
  console.log(`Method: ${req.method}, URI: ${req.uri}`)

  // Get site name from function name
  const awsAccountId = context.invokedFunctionArn.split(':')[4]
  let rootName = null
  let functionName = null
  {
    if (context.functionName.indexOf('.') !== -1) {
      const parts = context.functionName.split('.')
      functionName = parts[1]
    } else {
      functionName = context.functionName
    }
    const parts = functionName.split('-')
    parts.pop()
    rootName = parts.join('-')
  }
  console.log(`Method: ${req.method}, Func name: ${functionName}, Root name: ${rootName}`)
  const adminBucket = functionName
  const adminUiBucket = adminBucket + '-ui'

  // Get the lambda function ARN prefix, so we can use it to construct ARNs for other lambdas to invoke
  // Eg. arn:aws:lambda:us-east-1:376845798252:function:demo2-braevitae-com- ...
  // NOTE: This code assumes the specific part of the name of this lambda has no '-' in it!
  const arnPrefix = `arn:aws:lambda:${targetRegion}:${awsAccountId}:function:${rootName}`

  const aws = new AwsUtils({
    files: null,  // Not needed (though perhaps this suggests we need two different modules)
    s3: new AWS.S3(),
    sqs: new AWS.SQS(),
    stateQueueUrl: `https://sqs.${targetRegion}.amazonaws.com/${awsAccountId}/${rootName}.fifo`
  })

  //
  if (req.method === 'POST') {
    if (req.uri.indexOf('/admin/command/') === 0) {
      const authResp = await authenticate(aws, req, adminBucket)
      if (authResp.authorized) {
        return postCommand(aws, req, adminBucket, arnPrefix)
      }
      return authResp
    } else if (req.uri.indexOf('/admin/site-content/') === 0) {
      const authResp = await authenticate(aws, req, adminBucket)
      if (authResp.authorized) {
        return siteContent(aws, req, adminBucket, arnPrefix)
      }
      return authResp
    }
  } else if (req.method === 'GET') {
    if (req.uri.indexOf('/admin/admin.json') === 0) {
      // Only one page instance shold be active-polling to update the cached admin state at any one time. Other
      // pages will just get the current state returned.
      const queryObj = new URLSearchParams(req.querystring)
      if (queryObj.get('active') === 'true') {
        const resp = await aws.updateAdminStateFromQueue(stateCache, adminUiBucket)
        if (resp) { return resp }
      }
    }
    else if (req.uri.indexOf('/admin/lock') === 0) {
      const queryObject = new URLSearchParams(req.querystring)
      const newLockId = queryObject.get('lockId')
      console.log(`Lock handler. LockId: ${newLockId} params: ${req.querystring}`)
      return aws.takeLockIfFree(newLockId, adminUiBucket)
    }
    else if (req.uri.indexOf('/admin/site-config/') === 0) {
      const authResp = await authenticate(aws, req, adminBucket)
      if (authResp.authorized) {
        return siteConfig(aws, req, adminBucket)
      }
      return authResp
    }
    else if (req.uri.indexOf('/admin/site-content/') === 0) {
      const authResp = await authenticate(aws, req, adminBucket)
      if (authResp.authorized) {
        return siteContent(aws, req, adminBucket)
      }
      return authResp
    }
  }

  // resolve request
  return req
};

/** Check the basic auth header in the request vs the site admin password in S3. */
const authenticate = async (aws, req, adminBucket) => {
  let passwdInfo = null
  try {
    const passwdStr = (await aws.get(adminBucket, 'admin_secret')).Body.toString()
    passwdInfo = JSON.parse(passwdStr)
  } catch (error) {
    console.error(`Unable to get admin password from ${adminBucket}: ${JSON.stringify(error)}`)
    return {
      status: '400',
      statusDescription: 'Missing critical site configuration. See logs.'
    }
  }
  try {
    const time = Date.now()
    if ((time - passwdInfo.lastFailTs) > AuthFailWindowMs) {
      console.log(`login lockout reset after ${AuthFailWindowMs}ms`)
      passwdInfo.failedCount = 0
    } else {
      if (passwdInfo.failedCount >= MaxAuthFailedAttempts) {
        console.log('Too many failed login attempts')
        return {
          status: '403',
          statusDescription: 'Too many failed login attempts'
        }
      }
    }
    let auth = null
    if (req.headers.authorization) {
      //console.log(`Got basic auth header: ${JSON.stringify(req.headers.authorization)}`)
      const authValue = req.headers.authorization[0].value
      let parts = authValue.split(' ')
      if (parts[0] === 'BASIC') {
        const plain = Buffer.from(parts[1], 'base64').toString()
        //console.log(`Got basic auth header value: ${plain} vs. password ${JSON.stringify(uploaderPassword)}`)
        parts = plain.split(":")
        if (parts.length > 1 && parts[1] === passwdInfo.password) {
          //console.log(`Auth success with pwd: ${parts[1]}`)
          auth = {
            authorized: true,
            user: parts[0]
          }
        } else {
          //console.log(`Auth failed with creds: ${plain}`)
          console.log(`Auth failed`)
        }
      }
    }
    if ( ! auth) {
      passwdInfo.lastFailTs = Date.now()
      passwdInfo.failedCount++
      console.log('Invalid admin secret')
      return {
        status: '403',
        statusDescription: 'Invalid admin secret'
      }
    }
    return auth
  } finally {
    await aws.put(adminBucket, 'admin_secret', 'application/json', JSON.stringify(passwdInfo))
  }
}

/** Handle commands posted to the admin interface */
const postCommand = async (aws, req, adminBucket, arnPrefix) => {
  const parts = req.uri.split('/')
  parts.shift() // /
  parts.shift() // admin
  const action = parts.shift()
  console.log(`Action: ${action}`)
  if (action === 'command') {
    let ret = null
    const command = parts.shift()
    let body = null
    if (req.body && req.body.data) {
      body = Buffer.from(req.body.data, 'base64')
    }
    console.log(`Command: ${command}, Body: ${body}`)
    let params = {}
    if (body) {
      params = JSON.parse(body.toString())
    }
    switch (command) {
      case 'validate':
        ret = {
          status: '200',
          statusDescription: `validated.`
        }
        break
      case 'config':
        // Update app config state
        await aws.adminStateUpdate({ config: params })
        ret = {
          status: '200',
          statusDescription: `Updated config.`
        }
        break
      case 'template':
        // Set the current template in the admin state
        await aws.adminStateUpdate({ config: { templateId: params.id } })
        // Invoke worker to copy template files
        ret = invokeAdminWorker(command, arnPrefix + '-admin-worker', params)
        break
      case 'build':
        ret = buildSite(parts.join('/'), adminBucket, arnPrefix + '-builder', params)
        break
      case 'publish':
        ret = invokeAdminWorker(command, arnPrefix + '-admin-worker', params)
        break
      default:
        ret = {
          status: '404',
          statusDescription: `Unknown admin acion: ${command}`
        }
    }
    console.log(`Return: ${JSON.stringify(ret)}`)
    return ret
  }
}

const invokeAdminWorker = async (command, adminWorkerArn, params) => {
  try {
    const payload = JSON.stringify({ command: command, body: params })
    console.log(`Send command ${command} site to admin-worker. Payload: ${payload}`)
    const respData = await lambda.invoke({
      FunctionName: adminWorkerArn,
      InvocationType: 'Event',
      Payload: payload
    }).promise()
    console.log(`Aync Invoked ${adminWorkerArn}, response: ${JSON.stringify(respData)}`)
    return {
      status: '200',
      statusDescription: `Invoked admin worker: ${JSON.stringify(respData)}`
    }
  } catch(error) {
    console.log(`Failed invoke of ${adminWorkerArn}: ${error}`)
    return {
      status: '500',
      statusDescription: `Failed to invoke admin worker: ${JSON.stringify(error)}`
    }
  }
}

const buildSite = async (path, adminBucket, builderArn, params) => {
  try {
    const parts = adminBucket.split('-')
    parts.pop()
    const siteBucket = parts.join('.')
    const testSiteBucket = 'test.' + siteBucket
    console.log(`Build site from ${adminBucket} to ${testSiteBucket}.`)
    const respData = await lambda.invoke({
      FunctionName: builderArn,
      InvocationType: 'Event',
      Payload: JSON.stringify(params)
    }).promise()
    console.log(`Aync Invoked ${builderArn}, response: ${JSON.stringify(respData)}`)
    return {
      status: '200',
      statusDescription: `Invoked site builder: ${JSON.stringify(respData)}`
    }
  } catch(error) {
    console.log(`Failed invoke of ${builderArn}: ${error}`)
    return {
      status: '500',
      statusDescription: `Failed to invoke site builder: ${JSON.stringify(error)}`
    }
  }
}

/** Handle access to site config. Site config is stored in the admin bucket. */
const siteConfig = async (aws, req, adminBucket) => {
  const uriParts = req.uri.split('/')
  uriParts.shift() // /
  uriParts.shift() // admin
  uriParts.shift() // site-config
  const template = uriParts.shift()
  const name = uriParts.shift()
  console.log(`Config name: ${name}`)
  if (req.method === 'GET') {
    try {
      let content = null
      let schema = null
      const editors = await aws.get(adminBucket, `site-config/${template}/editors.json`)
      if ( ! name) {
        content = editors
      } else {
        if ( ! editorsList) {
          editorsList = JSON.parse(editors.Body.toString())
        }
        const editor = editorsList.find(p => p.id === name)
        content = await aws.get(adminBucket, `site-config/${template}/${editor.data}`)
        schema = await aws.get(adminBucket, `site-config/${template}/${editor.schema}`)
      }
      if (content && schema) {
        return {
          status: '200',
          statusDescription: 'OK',
          headers: {
            'Content-Type': [{ key: 'Content-Type', value: 'application/json' }]
          },
          body: `{"content": ${content.Body.toString()}, "schema": ${schema.Body.toString()} }`,
        }
      } else if (content) {
        return {
          status: '200',
          statusDescription: 'OK',
          headers: {
            'Content-Type': [{ key: 'Content-Type', value: content.ContentType }]
          },
          body: content.Body.toString()
        }
      } else {
        console.error(`Found empty content for site-config/${template}/${name}`)
        return {
          status: '500',
          statusDescription: 'Unable to read content.',
        }
      }
    } catch (error) {
      console.error(`Failed to get content for site-config/${template}/${name}`, error)
      return {
        status: '500',
        statusDescription: 'Unable to read content.',
      }
    }
  }
}

/** Handle access to site content. Site content is stored in the admin bucket. */
const siteContent = async (aws, req, adminBucket, arnPrefix) => {
  const uriParts = req.uri.split('/')
  uriParts.shift() // /
  uriParts.shift() // admin
  uriParts.shift() // site-content
  const template = uriParts.shift()
  const contentPath = uriParts.join('/')
  console.log(`${req.method} Template: ${template}. Content path: ${contentPath}`)
  if (req.method === 'GET') {
    const contentAbsPath = `site-config/${template}/${contentPath}`
    console.log(`Get S3 content from ${contentAbsPath}`)
    try {
      const contentRec = await aws.get(adminBucket, contentAbsPath)
      if (contentRec) {
        let encoding = 'base64'
        let base64 = true
        if (contentRec.ContentType === 'text/plain'
          || contentRec.ContentType === 'application/json'
        ) {
          encoding = 'utf8'
          base64 = false
        }
        return {
          status: '200',
          statusDescription: 'OK',
          headers: {
            'Content-Type': [{ key: 'Content-Type', value: contentRec.ContentType }]
          },
          body: contentRec.Body.toString(encoding),
          isBase64Encoded: base64
        }
      } else {
        console.error(`Found empty content for ${contentAbsPath}`)
        return {
          status: '404',
          statusDescription: 'Not found',
        }
      }
    } catch (error) {
      console.error(`Failed to get content for ${contentAbsPath}`, error)
      return {
        status: '404',
        statusDescription: 'Not Found',
      }
    }
  } else if (req.method === 'POST' || req.method === 'PUT') {
    try {
      if (req.body && req.body.data) {
        //const reqContentType = req.headers['content-type'][0].value // Should always be JSON now
        const body = Buffer.from(req.body.data, 'base64')
        console.log(`Upload: Body: ${body.toString()}`)
        const data = JSON.parse(body.toString())
        const contentAbsPath = `site-config/${template}/${data.path}`
        let ret = {
          status: '200',
          statusDescription: 'OK'
        }
        if (data.partCount > 1) {
          // Part of a multi-part upload (Note: this is still base64 encoded data)
          await aws.put(adminBucket, contentAbsPath + '.part_' + data.part, 'text/plain', data.content)
          if (data.part == data.partCount) {
            // Last part received. Invoke worker lambda to Load previous parts from S3 and concatenate into the final file
            console.log(`Invoke worker to assemble ${data.partCount} uploaded file parts.`)
            ret = invokeAdminWorker('completeUpload', arnPrefix + '-admin-worker', {
              basePath: contentAbsPath,
              partCount: data.partCount,
              contentType: data.contentType
            })
          }
        } else {
          // If there's only one part, total, we can just put it directly
          const content = Buffer.from(data.content, 'base64')
          await aws.put(adminBucket, contentAbsPath, data.contentType, content)
        }
        return ret
      } else {
        console.error(`Received empty content when setting ${contentPath}`)
        return {
          status: '400',
          statusDescription: 'Missing content. Unable to write.',
        }
      }
    } catch (error) {
      console.error(`Failed to set content for ${contentPath}`, error)
      return {
        status: '500',
        statusDescription: 'Unable to write content.',
      }
    }
  }
}
