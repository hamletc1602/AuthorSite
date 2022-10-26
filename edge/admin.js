"use strict";

const AWS = require('aws-sdk');

const s3 = new AWS.S3();
const targetRegion = 'us-east-1'
const lambda = new AWS.Lambda({ region: targetRegion });
var sqs = new AWS.SQS();

const logMsgTimeoutMS = 24 * 60 * 60 * 1000  // 24 hours
const lockTimeoutMs = 5 * 60 * 1000  // 5 Mins

const noCacheHeaders = {
    'cache-control': [
      {
          'key': 'Cache-Control',
          'value': 'no-cache,s-maxage=0'
      }
    ],
    'content-type': [
      {
          'key': 'Content-Type',
          'value': 'text/plain'
      }
    ]
  }

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

  //
  if (req.method === 'POST') {
    if (req.uri.indexOf('/admin/command/') === 0) {
      return postCommand(req)
    }
  } else if (req.method === 'GET') {
    if (req.uri.indexOf('/admin/admin.json') === 0) {
      // Only one page instance shold be active-polling to update the cached admin state at any one time. Other
      // pages will just get the current state returned.
      const queryObj = url.parse(req.uri, true).query;
      if (queryObj.active === 'true') {
        const resp = getAdminJson()
        if (resp) { return resp }
      }
    }
    else if (req.uri.indexOf('/admin/lock') === 0) {
      return getLock(req)
    }
  }

  // resolve request
  return req
};

const getAdminJson = async () => {
  try {
    // Read current state of the admin.json (unless cached in global var already)
    // TODO: This architecture is sensitve to more than one admin UI running at the same time from multiple browsers. I don't expect this
    //     to be a significant concern, but may want to put guards against it it future (Each admin UI generates a unique number, and first
    //     in sets a flag to disable state updates for the other one, and other Admin is set to read-only mode??)
    let state = stateCache
    if ( ! state) {
      console.log('Get state from bucket')
      const resp = await s3.getObject({ Bucket: adminUiBucket, Key: 'admin/admin.json' }).promise()
      const stateStr = resp.Body.toString()
      state = JSON.parse(stateStr)
    }

    console.log(`Clean up any old (>24 hours) log messages across all logs.`)
    console.log(`State: ${JSON.stringify(state)}`)
    if (state.logs) {
      const currMs = Date.now()
      const msgCount = state.logs.length
      state.logs = state.logs.filter(msg => {
        return (currMs - msg.time) < logMsgTimeoutMS
      })
      const cleaned = msgCount - state.logs.length
      if (cleaned > 0) {
        console.log(`Cleaned ${cleaned} messages from ${key} log.`)
      }
    }

    // Create state queue URL:
    // Eg. https://sqs.us-east-1.amazonaws.com/376845798252/demo-braevitae-com.fifo
    const stateQueueUrl = `https://sqs.${targetRegion}.amazonaws.com/${awsAccountId}/${rootName}.fifo`

    console.log(`Get all messages from the status queue: ${stateQueueUrl}`)
    const sqsResp = await sqs.receiveMessage({
      QueueUrl: stateQueueUrl,
      AttributeNames: ['ApproximateNumberOfMessages'],
      MaxNumberOfMessages: 10,
      MessageAttributeNames: ['All']
    }).promise()
    if (sqsResp.Messages) {
      console.log(`Received ${sqsResp.Messages.length} messages.`)
      sqsResp.Messages.forEach(msg => {
        let msgObj = null
        try {
          msgObj = JSON.parse(msg.Body)
        } catch(error) {
          console.log('Failed to parse message: ' + msg.Body + ' Error: ' + JSON.stringify(error))
        }
        try {
          mergeState(state, msgObj)
        } catch(error) {
          console.log('Failed to merge message. Error: ' + JSON.stringify(error))
        }
      })

      // Update global cache
      stateCache = state

      console.log(`Save the state (admin.json)`)
      await s3.putObject({
        Bucket: adminUiBucket,
        Key: 'admin/admin.json',
        Body: Buffer.from(JSON.stringify(state)),
        CacheControl: 'no-cache,s-maxage=0',
        ContentType: 'application/json',
      }).promise()

      console.log(`Delete ${sqsResp.Messages.length} merged messages`)
      const msgsForDelete = sqsResp.Messages.map(msg => {
        return {
          Id: msg.MessageId,
          ReceiptHandle: msg.ReceiptHandle
        }
      })
      const deleteResp = await sqs.deleteMessageBatch({
        QueueUrl: stateQueueUrl,
        Entries: msgsForDelete
      }).promise()
      if (deleteResp.Failed && deleteResp.Failed.length > 0) {
        console.log(`Failed to delete some processed messages: ${JSON.stringify(deleteResp.Failed)}`)
      } else {
        console.log(`Deleted all processed messages.`)
      }
    }
    // keep @Edge default handling
    return false
  } catch(error) {
    const msg = 'Failed to get messages or update status data: ' + JSON.stringify(error)
    console.log(msg)
    return {
      status: '500',
      statusDescription: msg
    }
  }
}

// /lock.json?clientId=uuid
const getLock = async (req) => {
  const queryObject = url.parse(req.uri, true).query;
  let locked = null
  try {
    const lockResp = await s3.getObject({ Bucket: adminUiBucket, Key: 'admin/lock' }).promise()
    if (lockResp) {
      const parts = lockResp.Body.split(' ')
      const lockId = parts[0]
      const lockTime = parts[1]
      if (query.lockId !== lockId && Number(lockTime) + lockTimeoutMs > Date.now()) {
        locked = lockTime
      }
    }
  } catch (e) {
    console.log('Failed to get admin lock:', e)
  }
  const resp = null
  if (locked !== null) {
    resp = 'locked ' + lockTime
  } else {
    resp = 'unlocked'
    // (re-)write the lock file
    const lockStr = query.lockId + ' ' + Date.now()
    await s3.putObject({ Bucket: adminUiBucket, Key: 'admin/lock', Body: Buffer.from(lockStr) }).promise()
  }
  return {
    status: '200',
    statusDescription: 'OK',
    headers: noCacheHeaders,
    body: resp
  }
}

const postCommand = async (req) => {
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
    console.log(`Command: ${command}`)
    switch (command) {
      case 'template':
        ret = deploySite(command, adminBucket, arnPrefix + '-admin-worker')
        break
      case 'build':
        ret = buildSite(parts.join('/'), adminBucket, arnPrefix + '-builder')
        break
      case 'publish':
        ret = deploySite(command, adminBucket, arnPrefix + '-admin-worker')
        break
      case 'upload':
        ret = uploadResource(parts.join('/'), adminBucket, req)
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

/** Merge this new message into the current state. */
const mergeState = (state, message) => {
  // Add any new log messages to the state
  //    Log messages will have a current time in MS set when they are generated at the source (time)
  //    And a receipt time (rcptTime) is added here, in case of any major clock differences or processing
  //    hangups.
  console.log(`Merge into state: ${JSON.stringify(message)}`)
  if (message.logs) {
    const rcptTime = Date.now()
    if ( ! state.logs) {
      state.logs = []
    }
    log.forEach(logMsg => {
      logMsg.rcptTime = rcptTime
      state.logs.push(logMsg)
    })
  }
  // replace the latest logs with the last 3 messages
  state.latest = state.logs.slice(-3)
  // Display properties
  state.display = Object.assign(state.display, message.display)
}

const deploySite = async (command, adminBucket, adminWorkerArn) => {
  try {
    const parts = adminBucket.split('-')
    parts.pop()
    const siteBucket = parts.join('.')
    const testSiteBucket = 'test.' + siteBucket
    console.log(`Deploy site from ${testSiteBucket} to ${siteBucket}.`)
    const respData = await lambda.invoke({
      FunctionName: adminWorkerArn,
      InvocationType: 'Event',
      Payload: JSON.stringify({ command: command })
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

const buildSite = async (path, adminBucket, builderArn) => {
  try {
    const parts = adminBucket.split('-')
    parts.pop()
    const siteBucket = parts.join('.')
    const testSiteBucket = 'test.' + siteBucket
    console.log(`Build site from ${adminBucket} to ${testSiteBucket}.`)
    const respData = await lambda.invoke({
      FunctionName: builderArn,
      InvocationType: 'Event',
      Payload: JSON.stringify({})
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

const uploadResource = async (resourcePath, adminBucket, req) => {
  console.log(`Upload resource ${resourcePath} to ${adminBucket}.`)
  const body = Buffer.from(req.body.data, 'base64')
  const params = {
    Bucket: adminBucket,
    Key:  resourcePath,
    Body: body
  }
  return s3.putObject(params).promise()
    .then(data => {
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
