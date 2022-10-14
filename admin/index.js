const AWS = require('aws-sdk');
var CfnLambda = require('cfn-lambda');
const Unzipper = require('unzipper')
const Mime = require('mime');

const s3 = new AWS.S3();


/** Worker for admin tasks forwarded from admin@Edge lambda.

*/
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

  try {
    uploaderPassword = (await s3.getObject({ Bucket: adminBucket, Key: 'admin_secret', }).promise()).toString()
  } catch (error) {
    console.error(`Unable to get admin password from ${adminBucket}: ${JSON.stringify(error)}`)
    return {
      status: '400',
      statusDescription: 'Missing critical site configuration. See logs.'
    }
  }
  return req
};


/** Provisioning Hook, invoked during CFN Stack creation
    https://www.alexdebrie.com/posts/cloudformation-custom-resources/
*/

/** Create */
const cfnCreateHandler = async (params) => {
  try {
    //
    console.log(`Create invoked with: ${JSON.stringify(params)}`)

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

    //
    return {}
  } catch (error) {
    const msg = "Create failed: " + JSON.stringify(error)
    console.log(msg)
    return msg
  }
}

/** Delete */
const cfnDeleteHandler = async (params) => {
  try {
    //
    console.log(`Delete invoked with: ${JSON.stringify(params)}`)

    // Empty all site S3 buckets
    await deleteAllObjectsFromBucket(s3, WebLogsBucket)
    await deleteAllObjectsFromBucket(s3, TestWebLogsBucket)
    await deleteAllObjectsFromBucket(s3, WebDataBucket)
    await deleteAllObjectsFromBucket(s3, TestWebDataBucket)
    await deleteAllObjectsFromBucket(s3, FeedbackBucket)
    await deleteAllObjectsFromBucket(s3, AdminUiBucket)
    await deleteAllObjectsFromBucket(s3, AdminBucket)

    return {}
  } catch (error) {
    // Only log failure - Hard fail here can lock up the stack
    console.log("Delete failed: " + JSON.stringify(error))
    return {}
  }
}

/** Delete all objects from the named bucket. */
const deleteAllObjectsFromBucket = async (s3, bucketName) => {
  const data = await s3.listObjects({ Bucket: bucketName });
  let objects = data.Contents;
  await Promise.all(objects.map(obj => {
    return s3.deleteObject({
      Bucket: bucketName,
      Key: obj.Key,
    })
  }))
}

exports.provision = CfnLambda({
  AsyncCreate: cfnCreateHandler,
  //AsyncUpdate: cfnUpdateHandler, // TODO: Handle updates??
  AsyncDelete: cfnDeleteHandler,
});
