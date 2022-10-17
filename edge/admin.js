const AWS = require('aws-sdk');

const s3 = new AWS.S3();
const lambda = new AWS.Lambda({ region: process.env.AWS_REGION });

exports.handler = async (event, context) => {
  // Accept new config data posted from client (only if the provided pasword matches the admin PW secret)
  //console.log('Event: ' + JSON.stringify(event))
  const req = event.Records[0].cf.request
  console.log(`Method: ${req.method}, URI: ${req.uri}`)
  if (req.method === 'POST') {
    if (req.uri.indexOf('/admin/command/') === 0) {
      // Get site name from function name
      let functionName = null
      {
        if (context.functionName.indexOf('.') !== -1) {
          const parts = context.functionName.split('.')
          functionName = parts[1]
        } else {
          functionName = context.functionName
        }
      }
      console.log(`POST request recieved. Func name: ${functionName}`)

      // Get the lambda function ARN prefix, so we cna use it to construct ARNs for other lambdas to invoke
      // Eg. arn:aws:lambda:us-east-1:376845798252:function:demo2-braevitae-com- ...
      // NOTE: This code assumes the specific part of the name of this lambda has no '-' in it!
      let arnPrefix = null
      {
        const parts = context.invokedFunctionArn.split("-")
        parts.pop()
        arnPrefix = parts.join('-')
      }

      const adminBucket = functionName
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

      const parts = req.uri.split('/')
      parts.shift() // /
      parts.shift() // admin
      const action = parts.shift()
      console.log(`Action: ${action}`)
      if (action === 'command') {
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
  }
  // resolve request
  return req
};

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
