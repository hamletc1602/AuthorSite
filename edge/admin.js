"use strict";

const AWS = require('aws-sdk');
const AwsUtils = require('./awsUtils')

const s3 = new AWS.S3();
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
      return postCommand(aws, req, adminBucket, awsAccountId, rootName)
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
  }

  // resolve request
  return req
};

/** */
const postCommand = async (aws, req, adminBucket, awsAccountId, rootName) => {
  //
  let uploaderPassword = null
  try {
    uploaderPassword = (await s3.getObject({ Bucket: adminBucket, Key: 'admin_secret', }).promise()).Body.toString()
  } catch (error) {
    console.error(`Unable to get admin password from ${adminBucket}: ${JSON.stringify(error)}`)
    return {
      status: '400',
      statusDescription: 'Missing critical site configuration. See logs.'
    }
  }

  //
  let auth = null
  if (req.headers.authorization) {
    console.log(`Got basic auth header: ${JSON.stringify(req.headers.authorization)}`)
    const authValue = req.headers.authorization[0].value
    let parts = authValue.split(' ')
    if (parts[0] === 'BASIC') {
      const plain = Buffer.from(parts[1], 'base64').toString()
      console.log(`Got basic auth header value: ${plain} vs. password ${JSON.stringify(uploaderPassword)}`)
      parts = plain.split(":")
      if (parts.length > 1 && parts[1] === uploaderPassword) {
        console.log(`Auth success with pwd: ${parts[1]}`)
        auth = {
          user: parts[0]
        }
      } else {
        console.log(`Auth failed with creds: ${plain}`)
      }
    }
  }
  if ( ! auth) {
    return {
      status: '403',
      statusDescription: 'Invalid admin secret'
    }
  }

  //
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
      case 'template':
        // Set the current template in the admin state
        aws.adminStateUpdate({ config: { templateId: params.id } })
        // Invoke worker to copy template files
        ret = deploySite(command, arnPrefix + '-admin-worker', params)
        break
      case 'build':
        ret = buildSite(parts.join('/'), adminBucket, arnPrefix + '-builder', params)
        break
      case 'publish':
        ret = deploySite(command, arnPrefix + '-admin-worker', params)
        break
      case 'upload':
        ret = uploadResource(parts.join('/'), adminBucket, body, req)
        break
      default:
        ret = {
          status: '404',
          statusDescription: `Unknown admin acion: ${action}`
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

const uploadResource = async (resourcePath, adminBucket, body, _req) => {
  console.log(`Upload resource ${resourcePath} to ${adminBucket}.`)
  const params = {
    Bucket: adminBucket,
    Key:  resourcePath,
    Body: body
  }
  return s3.putObject(params).promise()
    .then(() => {
      return {
        status: '200',
        statusDescription: 'OK'
      }
    })
    .catch(error => {
      console.error(`Failed write key ${params.Key} to S3 bucket ${params.Bucket}: ${JSON.stringify(error)}`)
      return {
        status: '400',
        statusDescription: 'Send failed. See log.'
      }
    })
}
