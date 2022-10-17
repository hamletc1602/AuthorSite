const AWS = require('aws-sdk');
const { stat } = require('fs');

const s3 = new AWS.S3();
const targetRegion = 'us-east-1'
const lambda = new AWS.Lambda({ region: targetRegion });
var sqs = new AWS.SQS();

const MSin24Hours = 24 * 60 * 60 * 1000

let stateCache = null

/**
  - Get admin state update messages from the state queue and merge them into the state.json in S3
  - Add file data received from the client to the admin bucket.
  - Forward admin actions to backend worker lambdas.
*/
exports.handler = async (event, context) => {
  //console.log('Event: ' + JSON.stringify(event))
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

  // POST Handling
  if (req.method === 'POST') {
    if (req.uri.indexOf('/admin/command/') === 0) {
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
          case 'publish':
            ret = deploySite(parts.join('/'), adminBucket, arnPrefix + '-admin-worker')
            break
          case 'build':
            ret = buildSite(parts.join('/'), adminBucket, arnPrefix + '-builder')
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
    } // is admin path

  // GET Handling
  } else if (req.method === 'GET') {
    if (req.uri.indexOf('/admin/admin.json') === 0) {
      try {
        // Create state queue URL:
        // Eg. https://sqs.us-east-1.amazonaws.com/376845798252/demo-braevitae-com.fifo
        const stateQueueUrl = `https://sqs.${targetRegion}.amazonaws.com/${awsAccountId}/${rootName}.fifo`

        // Read current state of the admin.json (unless cached in global var already)
        // TODO: This architecture is sensitve to more than one admin UI running at the same time from multiple browsers. I don't expect this
        //     to be a significant concern, but may want to put guards against it it future (Each admin UI generates a unique number, and first
        //     in sets a flag to disable state updates for the other one, and other Admin is set to read-only mode??)
        let state = stateCache
        if ( ! state) {
          console.log('Using cached state.')
          state = await s3.getObject({ Bucket: adminBucket, Key: 'admin/admin.json' }).promise().Body.toString()
        }

        // Clean up any old (>24 hours) log messages across all logs
        Object.keys(state.logs).forEach(key => {
          const log = state.logs[key]
          const currMs = Date.now()
          const msgCount = log.messages.length
          log.messages = log.messages.filter(msg => {
            return (currMs - msg.time) < MSin24Hours
          })
          const cleaned = msgCount - log.messages.length
          if (cleaned > 0) {
            console.log(`Cleaned ${cleaned} messages from ${key} log.`)
          }
        })

        // Get all messages from the status queue
        const sqsResp = await sqs.receiveMessage({
          QueueUrl: stateQueueUrl,
          AttributeNames: ['ApproximateNumberOfMessages'],
          MaxNumberOfMessages: 10,
          MessageAttributeNames: 'All'
          //VisibilityTimeout: 'NUMBER_VALUE', // Assuming these will default to the queue settings? If not, may need to set them explicitly?
          //WaitTimeSeconds: 'NUMBER_VALUE'
        }).promise()

        // Combine the current json + new messages into a current state representation.
        console.log(`Merge ${sqsResp.messages.length} new messages into state.`)
        sqsResp.Messages.forEach(msg => {
          mergeState(state, msg)
        })

        // Update global cache
        stateCache = state

        // Save the state (admin.json)
        await s3.putObject({
          Bucket: adminBucket,
          Key: 'admin/admin.json',
          Body: Buffer.from(state, 'base64').toString()
        }).promise()

        // Delete merged messages
        const msgsForDelete = sqsResp.Messages.map(msg => {
          return {
            Id: msg.MessageId,
            ReceiptHandle: msg.ReceiptHandle
          }
        })
        deleteResp = await sqs.deleteMessageBatch({
          QueueUrl: stateQueueUrl,
          Entries: msgsForDelete
        }).promise()
        if (deleteResp.Failed && deleteResp.Failed.length > 0) {
          console.log(`Failed to delete some processed messages: ${JSON.stringify(deleteResp.Failed)}`)
        } else {
          console.log(`Deleted all processed messages.`)
        }
      } catch(error) {
        const msg = 'Failed to get messages or update status data: ' + JSON.stringify(error)
        console.log(msg)
        return {
          status: '500',
          statusDescription: msg
        }
      }
    }
  }
  // resolve request
  return req
};

/** Merge this new message into the current state. */
const mergeState = (state, message) => {
  // Add any new log messages to the state
  //    Log messages will have a current time in MS set when they are generated at the source (time)
  //    And a receipt time (rcptTime) is added here, in case of any major clock differences or processing
  //    hangups.
  Object.keys(state.logs).forEach(key => {
    const log = state.logs[key]
    if (message.logs[key]) {
      const rcptTime = Date.now()
      message.logs[key].messages.forEach(logMsg => {
        logMsg.rcptTime = rcptTime
        log.messages.push(logMsg)
      })
    }
  })
  // Display properties
  state.display = Object.assign(state.display, message.display)
}

const deploySite = async (path, adminBucket, adminWorkerArn) => {
  try {
    const parts = adminBucket.split('-')
    parts.pop()
    const siteBucket = parts.join('.')
    const testSiteBucket = 'test.' + siteBucket
    console.log(`Deploy site from ${testSiteBucket} to ${siteBucket}.`)
    const respData = await lambda.invoke({
      FunctionName: adminWorkerArn,
      InvocationType: 'Event',
      Payload: JSON.stringify({})
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
