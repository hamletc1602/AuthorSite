const AWS = require('aws-sdk');
const Unzipper = require('unzipper')
const Mime = require('mime');
var CfnLambda = require('cfn-lambda');

const s3 = new AWS.S3();
const secrets = new AWS.SecretsManager({ region: 'us-east-1' });

const maxAgeBrowser = 60 * 60 * 24
const maxAgeCloudFront = 60

exports.handler = async (event, context) => {
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

  // try {
  //   await s3.headObject({ Bucket: adminBucket, Key: 'admin_secret' }).promise();
  // } catch (error) {
  //   if (error.name === 'NotFound') { // Note with v3 AWS-SDK use error.code
  //     // This block runs once on first access of any admin UI path
  //     //    TODO: Likely need to move this code to a separate lambda invoked from here, or scheduled, to stay within edge lambda 5s limit.
  //     const adminUiBucket = functionName + 'UI'
  //     const parts = functionName.split('-')
  //     parts.pop()
  //     const siteBucket = parts.join('.')
  //     const secretName = siteBucket

  //     // Copy all admin files from public bucket to this site's bucket.
  //     console.log(`Copy admin UI files from braevitae-pub to ${adminUiBucket}`)
  //     const directory = await Unzipper.Open.s3(s3,{ Bucket: 'braevitae-pub', Key: 'AutoSite/AdminUI/adminui.zip' });
  //     await Promise.all(directory.files.map(async file => {
  //       console.log(`Copying ${file.path}`)
  //       await s3.putObject({
  //         Bucket: adminUiBucket,
  //         Key: file.path,
  //         Body: await file.buffer(),
  //         CacheControl: `max-age=${maxAgeBrowser},s-maxage=${maxAgeCloudFront}`,
  //         ContentType: Mime.getType(file.path) || 'text/html'
  //       }).promise()
  //     }))

  //     // Load admin PW from secret named for the site domain name and re-write it to the admin bucket, then delete the secret.
  //     console.log(`Load admin PW from secret: ${secretName}`)
  //     const adminSecretData = await secrets.getSecretValue({ SecretId: secretName }).promise()
  //     const uploaderPassword = adminSecretData.SecretString
  //     await s3.putObject({ Bucket: adminBucket, Key: 'admin_secret', Body: Buffer.from(uploaderPassword) }).promise()
  //     await secrets.deleteSecret({ SecretId: secretName }).promise()

  //   } else {
  //     // TODO: Return error response
  //     console.error(`Provisioning failed for ${siteBucket}: ${JSON.stringify(error)}`)
  //     return {
  //       status: '400',
  //       statusDescription: 'Site provisioning failed. See logs.'
  //     }
  //   }
  // }

  //
  if (uploaderPassword == null) {
    try {
      uploaderPassword = (await s3.getObject({ Bucket: adminBucket, Key: 'admin_secret', }).promise()).toString()
    } catch (error) {
      console.error(`Unable to get admin password from ${adminBucket}: ${JSON.stringify(error)}`)
      return {
        status: '400',
        statusDescription: 'Missing critical site configuration. See logs.'
      }
    }
  }

  // Accept new config data posted from client (only if the provided pasword matches the admin PW secret)
  const req = event.Records[0].cf.request
  if (req.method === 'POST') {
    if (req.uri.indexOf('admin') === 0) {

      // TODO: Move setup above into here, so this function does nothing on GET calls, only POST


      if (req.headers.secret !== uploaderPassword) {
        return {
          status: '403',
          statusDescription: 'Invalid admin secret'
        }
      }
      const parts = req.uri.split('/')
      parts.shift() // admin
      const action = parts.shift()
      ret = null
      switch (action) {
        case 'deploy':
          ret = deploySite(parts.join('/'), adminBucket)
          break
        case 'upload':
          ret = uploadResource(parts.join('/'), adminBucket, req)
          break
        default:

      }
      return ret
    } // is admin path
  }
  // resolve request
  return req
};

const deploySite = async (path) => {
    const parts = functionName.split('-')
    parts.pop()
    const siteBucket = parts.join('.')
    const testSiteBucket = 'test.' + siteBucket

    // Sync all objects from test site to main site

}

const uploadResource = async (resourcePath, adminBucket, req) => {
  const resourcePath = parts.join('/')
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


/** Provisioning Hook, invoked during CFStack creation

    https://www.alexdebrie.com/posts/cloudformation-custom-resources/
*/
exports.provision = CfnLambda({
  AsyncCreate: cfnCreateHandler,
  //AsyncUpdate: cfnUpdateHandler, // TODO: Handle updates??
  AsyncDelete: cfnDeleteHandler,
});

const cfnCreateHandler = async (params) => {
  try {
    // Copy the uploader password provided to the CFN Stack to the site admin bucket
    await s3.putObject({ Bucket: params.AdminBucket, Key: 'admin_secret', Body: Buffer.from(params.UploaderPassword) }).promise()

    // Copy all admin files from public bucket to this site's bucket.
    console.log(`Copy admin UI files from braevitae-pub to ${params.AdminUiBucket}`)
    const directory = await Unzipper.Open.s3(s3,{ Bucket: params.PublicBucket, Key: 'AutoSite/AdminUI/adminui.zip' });
    await Promise.all(directory.files.map(async file => {
      console.log(`Copying ${file.path}`)
      await s3.putObject({
        Bucket: params.AdminUiBucket,
        Key: file.path,
        Body: await file.buffer(),
        CacheControl: `max-age=${params.MaxAgeBrowser},s-maxage=${params.MaxAgeCloudFront}`,
        ContentType: Mime.getType(file.path) || 'text/html'
      }).promise()
    }))

    // Register S3 Trigger for site builder lamnbda for Admin data changes



    // Maybe need to return physical ID? ( But it's suppossed to default? )
        // return {
        //   PhysicalResourceId: "yopadope",
        //   FnGetAttrsDataObj: {
        //     MyObj: "dopeayope"
        //   }
    return {}
  } catch (error) {
    const msg = "Provision faild: " + JSON.stringify(error)
    console.log(msg)
    return msg
  }
}

const cfnDeleteHandler = async (params) => {
  try {
    // Empty all site S3 buckets?


    // Other general cleanup?


    return {}
  } catch (error) {
    // Only log failure - Hard fail here can lock up the stack
    console.log("Delete failed: " + JSON.stringify(error))
    return {}
  }
}
