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
    const adminSecretData = {
      password: params.UploaderPassword
    }
    console.log('Create uploader password file.')
    await s3.putObject({
      Bucket: params.AdminBucket,
      Key: 'admin_secret',
      Body: Buffer.from(JSON.stringify(adminSecretData))
    }).promise()

    // Get the site templates metadata:
    let templates = null
    const templateMetadataObj = await s3.getObject({ Bucket: params.PublicBucket, Key: 'AutoSite/site-config/metadata.json'}).promise()
    if (templateMetadataObj) {
      const templatesStr = templateMetadataObj.Body.toString()
      if (templatesStr) {
        templates = JSON.parse(templatesStr)
      }
    }
    if (params.PrivateTemplates) {
      const list = params.PrivateTemplates.split(',')
      list.forEach(name => {
        name = name.trim()
        templates.push({
          id: name,
          name: name,
          display: name,
          description: 'A private, user provided template.',
          access: 'private'
        })
      })
    }

    // Generate default admin data in Admin UI bucket.
    //    This data object will be replaced/updated in S3 by other admin processes as needed.
    console.log('Create default admin state file.')
    await s3.putObject({
      Bucket: params.AdminUiBucket,
      Key: 'admin/admin.json',
      CacheControl: 'no-cache,s-maxage=0',
      ContentType: 'application/json',
      Body: Buffer.from(JSON.stringify({
        generator: params.SiteGenerator,
        templates: templates,
        config: {},
        display: {}
      }))
    }).promise()

    // Copy all admin UI static files from public bucket to this site's bucket.
    //   Simply duplicate admin UI to desktop and mobile folders for now. Maybe there will be a mobile-specific
    //   version in future.
    console.log(`Copy admin UI files from braevitae-pub to ${params.AdminUiBucket}`)
    await Promise.all(['desktop', 'mobile'].map(async mode => {
      const adminUiDir = await Unzipper.Open.s3(s3,{ Bucket: params.PublicBucket, Key: 'AutoSite/provision/adminui.zip' });
      await Promise.all(adminUiDir.files.map(async file => {
        console.log(`Copying ${file.path}`)
        await s3.putObject({
          Bucket: params.AdminUiBucket,
          Key: mode + '/admin/' + file.path,
          Body: await file.buffer(),
          CacheControl: `max-age=${params.MaxAgeBrowser},s-maxage=${params.MaxAgeCloudFront}`,
          ContentType: Mime.getType(file.path) || 'text/html'
        }).promise()
      }))
    }))

    // Add default index.html to site buckets with redirect to the admin site
    const indexPage = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta http-equiv="refresh" content="4; URL='https://${params.DomainName}/admin/index'" />
        </head>
        <body>
          <h1>Under Construction!</h1>
          <p>Redirecting to admin UI,,,,</p>
        </body>
      </html>
    `
    await s3.putObject({
      Bucket: params.WebDataBucket,
      Key: 'desktop/index.html',
      Body: indexPage,
      CacheControl: `max-age=${params.MaxAgeBrowser},s-maxage=${params.MaxAgeCloudFront}`,
      ContentType: 'text/html'
    }).promise()
    await s3.putObject({
      Bucket: params.WebDataBucket,
      Key: 'mobile/index.html',
      Body: indexPage,
      CacheControl: `max-age=${params.MaxAgeBrowser},s-maxage=${params.MaxAgeCloudFront}`,
      ContentType: 'text/html'
    }).promise()
    await s3.putObject({
      Bucket: params.TestWebDataBucket,
      Key: 'desktop/index.html',
      Body: indexPage,
      CacheControl: `max-age=${params.MaxAgeBrowser},s-maxage=${params.MaxAgeCloudFront}`,
      ContentType: 'text/html'
    }).promise()
    await s3.putObject({
      Bucket: params.TestWebDataBucket,
      Key: 'mobile/index.html',
      Body: indexPage,
      CacheControl: `max-age=${params.MaxAgeBrowser},s-maxage=${params.MaxAgeCloudFront}`,
      ContentType: 'text/html'
    }).promise()

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
    await deleteAllObjectsFromBucket(s3, params.WebDataBucket)
    await deleteAllObjectsFromBucket(s3, params.TestWebDataBucket)
    await deleteAllObjectsFromBucket(s3, params.FeedbackBucket)
    await deleteAllObjectsFromBucket(s3, params.AdminUiBucket)
    await deleteAllObjectsFromBucket(s3, params.AdminBucket)
    await deleteAllObjectsFromBucket(s3, params.TestWebLogsBucket)
    await deleteAllObjectsFromBucket(s3, params.WebLogsBucket)

    return {}
  } catch (error) {
    // Only log failure - Hard fail here can lock up the stack
    console.log("Delete failed: " + JSON.stringify(error))
    return {}
  }
}

/** Delete all objects from the named bucket. */
const deleteAllObjectsFromBucket = async (s3, bucketName) => {
  console.log(`Delete all data from ${bucketName}`)
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
