const AWS = require('aws-sdk');
const Unzipper = require('unzipper')

const s3 = new AWS.S3();
const secrets = new AWS.SecretsManager();

exports.handler = async (event, context) => {
  // Get site name from function name
  let functionName = null
  let siteBucket = null
  {
    if (context.functionName.indexOf('.') !== -1) {
      const parts = context.functionName.split('.')
      functionName = parts[1]
    } else {
      functionName = context.functionName
    }
    const parts = functionName.split('-')
    parts.pop()
    const siteBucket = parts.join('.')
  }

  // Load admin PW from secret named for the site domain name.
  console.log(`Load admin PW from secret: ${siteBucket}`)
  const adminSecret = await secrets.getSecretValue({ SecretId: siteBucket }).promise()
  console.debug(`Admin PW is: ${adminSecret}`)

  // Check S3 for admin UI files
     // site bucket name is same as domain name
  try {
    await s3.headObject({
      Bucket: siteBucket,
      Key: 'admin.html'
    }).promise();
  } catch (error) {
    if (error.name === 'NotFound') { // Note with v3 AWS-SDK use error.code
      console.log(`Copy admin UI files from braevitae-pub to ${siteBucket}`)
      // Copy all admin files from public bucket to this site's bucket.
      const directory = await unzipper.Open.s3(s3,{ Bucket: 'braevitae-pub', Key: 'AdminUI/adminui.zip' });
      await Promise.all(directory.files.map(file => {
        await s3.putObject({ Bucket: siteBucket, Key: file.path, Body: await file.buffer }).promise()
      }))

      // TODO; Remove if the unzipper is OK reading from S3:
      //const range = `bytes=0-${Math.min(item.Size, MAX_DATA_LEN)}`
      //const zipContent = await s3.getObject({ Bucket: 'braevitae-pub', Key: 'AdminUI/adminui.zip', Range: range }).promise()
      //zipContent.Body.

    } else {
      // TODO: Return error response
      console.error(`Failed to get status of admin.html in S3 bucket ${iteBucket}: ${JSON.stringify(error)}`)
      return {
        status: '400',
        statusDescription: 'Site provisioning failed. See logs.'
      }
    }
  }

  // Accept new config data posted from client (only if the provided pasword matches the admin PW secret)
  if (request.method === 'POST') {
    const req = event.Records[0].cf.request
    if (req.uri.indexOf('admin') === 0) {
      if (req.headers.secret !== uploaderPassword) {
        return {
          status: '403',
          statusDescription: 'Invalid admin secret'
        }
      }
      const parts = req.uri.split('/')
      parts.shift()
      const adminPath = parts.join('/')
      const body = Buffer.from(request.body.data, 'base64')
      const params = {
        Bucket: functionName,
        Key:  'adminPath',
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
    } // is admin path
  }

  // resolve request
  return request;
};
