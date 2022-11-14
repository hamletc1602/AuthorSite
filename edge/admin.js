"use strict";

const AWS = require('aws-sdk');
const AwsUtils = require('./awsUtils')

const targetRegion = 'us-east-1'
const lambda = new AWS.Lambda({ region: targetRegion });

// When run in rapid succession, AWS may retain some state between executions, so we don't need to reload the
// state file from S3.
let stateCache = null

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
        return postCommand(aws, req, adminBucket, awsAccountId, rootName)
      }
      return authResp
    } else if (req.uri.indexOf('/admin/site-config/') === 0) {
      const authResp = await authenticate(aws, req, adminBucket)
      if (authResp.authorized) {
        return siteConfig(aws, req, adminBucket)
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
  }

  // resolve request
  return req
};

/** Check the basic auth header in the request vs the site admin password in S3. */
const authenticate = async (aws, req, adminBucket) => {
  let uploaderPassword = null
  try {
    uploaderPassword = (await aws.get(adminBucket, 'admin_secret')).toString()
  } catch (error) {
    console.error(`Unable to get admin password from ${adminBucket}: ${JSON.stringify(error)}`)
    return {
      status: '400',
      statusDescription: 'Missing critical site configuration. See logs.'
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
      if (parts.length > 1 && parts[1] === uploaderPassword) {
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
    return {
      status: '403',
      statusDescription: 'Invalid admin secret'
    }
  }
  return auth
}

/** Handle commands posted to the admin interface */
const postCommand = async (aws, req, adminBucket, awsAccountId, rootName) => {
  const parts = req.uri.split('/')
  parts.shift() // /
  parts.shift() // admin
  const action = parts.shift()
  console.log(`Action: ${action}`)
  if (action === 'command') {
    // Get the lambda function ARN prefix, so we can use it to construct ARNs for other lambdas to invoke
    // Eg. arn:aws:lambda:us-east-1:376845798252:function:demo2-braevitae-com- ...
    // NOTE: This code assumes the specific part of the name of this lambda has no '-' in it!
    const arnPrefix = `arn:aws:lambda:${targetRegion}:${awsAccountId}:function:${rootName}`
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
        ret = deploySite(command, arnPrefix + '-admin-worker', params)
        break
      case 'build':
        ret = buildSite(parts.join('/'), adminBucket, arnPrefix + '-builder', params)
        break
      case 'publish':
        ret = deploySite(command, arnPrefix + '-admin-worker', params)
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

const deploySite = async (command, adminWorkerArn, params) => {
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
  const parts = req.uri.split('/')
  parts.shift() // /
  parts.shift() // admin
  parts.shift() // site-config
  const template = parts.shift()
  const name = parts.shift()
  console.log(`Config name: ${name}`)
  if (req.method === 'GET') {
    try {
      let content = null
      if ( ! name) {
        content = await aws.get(adminBucket, `site-config/${template}/editors.json`)
      } else {
        content = await aws.get(adminBucket, `site-config/${template}/${name}`)
      }
      if (content) {
        console.log('Return site config content:', content)
        return {
          status: '200',
          statusDescription: 'OK',
          headers: {
            'content-type': content.contentType
          },
          body: content.body.toString()
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
  } else if (req.method === 'POST') {
    try {
      if (req.body && req.body.data) {
        const body = Buffer.from(req.body.data, 'base64')
        await aws.put(adminBucket, `site-config/${template}/${name}`, req.headers['content-type'], body)
        return {
          status: '200',
          statusDescription: 'OK'
        }
      } else {
        console.error(`Received empty content when setting site-config/${template}/${name}`)
        return {
          status: '400',
          statusDescription: 'Missing content. Unable to write.',
        }
      }
    } catch (error) {
      console.error(`Failed to set content for site-config/${template}/${name}`, error)
      return {
        status: '500',
        statusDescription: 'Unable to write content.',
      }
    }
  }
}
