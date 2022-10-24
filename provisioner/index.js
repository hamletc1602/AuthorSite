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
    console.log('Create uploader password file.')
    await s3.putObject({
      Bucket: params.AdminBucket,
      Key: 'admin_secret',
      Body: Buffer.from(params.UploaderPassword)
    }).promise()

    // Generate default admin data in Admin UI bucket.
    //    This data object will be replaced/updated in S3 by other admin processes as needed.
    console.log('Create default admin state file.')
    await s3.putObject({
      Bucket: params.AdminUiBucket,
      Key: 'admin/admin.json',
      CacheControl: 'no-cache,s-maxage=0',
      ContentType: 'application/json',
      Body: Buffer.from(JSON.stringify({
        template: params.SiteTemplate,
        domain: params.SiteDomain,
        display: {},
        logs: {}
      }))
    }).promise()

    // Copy all admin UI static files from public bucket to this site's bucket.
    console.log(`Copy admin UI files from braevitae-pub to ${params.AdminUiBucket}`)
    const adminUiDir = await Unzipper.Open.s3(s3,{ Bucket: params.PublicBucket, Key: 'AutoSite/provision/adminui.zip' });
    await Promise.all(adminUiDir.files.map(async file => {
      console.log(`Copying ${file.path}`)
      await s3.putObject({
        Bucket: params.AdminUiBucket,
        Key: file.path,
        Body: await file.buffer(),
        CacheControl: `max-age=${params.MaxAgeBrowser},s-maxage=${params.MaxAgeCloudFront}`,
        ContentType: Mime.getType(file.path) || 'text/html'
      }).promise()
    }))

    // Copy default site template selected by the user from braevitae-pub to this site's bucket.
    console.log(`Copy default site template ${params.SiteTemplate} from braevitae-pub to ${params.AdminBucket}`)
    const siteConfigDir = await Unzipper.Open.s3(s3,{ Bucket: params.PublicBucket, Key: `AutoSite/site-config/${params.SiteTemplate}.zip` });
    await Promise.all(siteConfigDir.files.map(async file => {
      console.log(`Copying ${file.path}`)
      await s3.putObject({
        Bucket: params.AdminBucket,
        Key: 'site-config/' + file.path,
        Body: await file.buffer()
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
const cfnDeleteHandler = async (requestId, params) => {
  try {
    // RequestId: Eg:  arn:aws:cloudformation:us-east-1:376845798252:stack/AuthorSite-Demo2/b51b8540-4cd8-11ed-b81c-0afb2f50002b/ProvisionSiteTrigger/0febc9d5-53d0-41ea-8241-dff81629ee4d
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
  try {
    const data = await s3.listObjects({ Bucket: bucketName }).promise();
    console.log('List bucket result: ' + JSON.stringify(data))
    let objects = data.Contents;
    await Promise.all(objects.map(obj => {
      console.log('Each list result: ' + JSON.stringify(obj))
      return s3.deleteObject({
        Bucket: bucketName,
        Key: obj.Key,
      }).promise()
    }))
  } catch(error) {
    console.log(`Failed to delete contents of ${bucketName}: ${JSON.stringify(error)}`)
  }
}

exports.handler = CfnLambda({
  AsyncCreate: cfnCreateHandler,
  //AsyncUpdate: cfnUpdateHandler, // TODO: Handle updates??
  AsyncDelete: cfnDeleteHandler,
});
