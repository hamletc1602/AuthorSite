const AWS = require('aws-sdk');
var CfnLambda = require('cfn-lambda');
const Unzipper = require('unzipper')
const Mime = require('mime');

const s3 = new AWS.S3();

/** Provisioning Hook, invoked during CFN Stack creation
    https://www.alexdebrie.com/posts/cloudformation-custom-resources/
*/

/** Create */
const cfnCreateHandler = async (params) => {
  try {
    //
    console.log(`Create invoked with: ${JSON.stringify(params)}`)

    // Copy the uploader password provided to the CFN Stack to the site admin bucket
    await s3.putObject({
      Bucket: params.AdminBucket,
      Key: 'admin_secret',
      Body: Buffer.from(params.UploaderPassword)
    }).promise()

    // Copy all admin static files from public bucket to this site's bucket.
    console.log(`Copy admin files from braevitae-pub to ${params.AdminBucket}`)
    const directory = await Unzipper.Open.s3(s3,{ Bucket: params.PublicBucket, Key: 'AutoSite/AdminUI/admin.zip' });
    await Promise.all(directory.files.map(async file => {
      console.log(`Copying ${file.path}`)
      await s3.putObject({
        Bucket: params.AdminBucket,
        Key: file.path,
        Body: await file.buffer(),
        CacheControl: `max-age=${params.MaxAgeBrowser},s-maxage=${params.MaxAgeCloudFront}`,
        ContentType: Mime.getType(file.path) || 'application/javascript'
      }).promise()
    }))

    // Generate default admin data in Admin UI bucket.
    //    This data object will be replaced/updated in S3 by other admin processes as needed.
    await s3.putObject({
      Bucket: params.AdminUiBucket,
      Key: 'admin.json',
      Body: Buffer.from(JSON.stringify({
        template: params.SiteTemplate,
        properties: [{
        }],
        buttons: [{
          id: 'buildSite',
          name: 'Create Site',
          enabled: true
        },{
          id: 'publishSite',
          name: 'Publish',
          enabled: false
        }]
      }))
    }).promise()

    // Copy all admin UI static files from public bucket to this site's bucket.
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
    await deleteAllObjectsFromBucket(s3, params.WebLogsBucket)
    await deleteAllObjectsFromBucket(s3, params.TestWebLogsBucket)
    await deleteAllObjectsFromBucket(s3, params.WebDataBucket)
    await deleteAllObjectsFromBucket(s3, params.TestWebDataBucket)
    await deleteAllObjectsFromBucket(s3, params.FeedbackBucket)
    await deleteAllObjectsFromBucket(s3, params.AdminUiBucket)
    await deleteAllObjectsFromBucket(s3, params.AdminBucket)

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

exports.handler = CfnLambda({
  AsyncCreate: cfnCreateHandler,
  //AsyncUpdate: cfnUpdateHandler, // TODO: Handle updates??
  AsyncDelete: cfnDeleteHandler,
});
