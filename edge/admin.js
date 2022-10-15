const AWS = require('aws-sdk');

const s3 = new AWS.S3();

const maxAgeBrowser = 60 * 60 * 24
const maxAgeCloudFront = 60

exports.handler = async (event, context) => {
  // Accept new config data posted from client (only if the provided pasword matches the admin PW secret)
  const req = event.Records[0].cf.request
  if (req.method === 'POST') {
    if (req.uri.indexOf('admin') === 0) {
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

      const adminBucket = functionName
      let uploaderPassword = null
      try {
        uploaderPassword = (await s3.getObject({ Bucket: adminBucket, Key: 'admin_secret', }).promise()).toString()
      } catch (error) {
        console.error(`Unable to get admin password from ${adminBucket}: ${JSON.stringify(error)}`)
        return {
          status: '400',
          statusDescription: 'Missing critical site configuration. See logs.'
        }
      }

      if (req.headers.secret !== uploaderPassword) {
        return {
          status: '403',
          statusDescription: 'Invalid admin secret'
        }
      }
      const parts = req.uri.split('/')
      parts.shift() // admin
      const action = parts.shift()
      let ret = null
      switch (action) {
        case 'deploy':
          ret = deploySite(parts.join('/'), adminBucket)
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
      return ret
    } // is admin path
  }
  // resolve request
  return req
};

const deploySite = async (path, adminBucket) => {
    const parts = adminBucket.split('-')
    parts.pop()
    const siteBucket = parts.join('.')
    const testSiteBucket = 'test.' + siteBucket

    // Sync all objects from test site to main site
    // Likely need to invoke a background worker lambda for this? I don't think it can be done in <5s ?

}

const uploadResource = async (resourcePath, adminBucket, req) => {
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
