const sdk = require('aws-sdk');
const AwsUtils = require('./awsUtils')

const publicBucket = process.env.publicBucket
const adminBucket = process.env.adminBucket
const adminUiBucket = process.env.adminUiBucket
const siteBucket = process.env.siteBucket
const testSiteBucket = process.env.testSiteBucket
const stateQueueUrl = process.env.stateQueueUrl
const maxAgeBrowser = process.env.maxAgeBrowser
const maxAgeCloudFront = process.env.maxAgeCloudFront

const aws = new AwsUtils({
  files: null,  // Not needed (though perhaps this suggests we need two different modules)
  s3: new sdk.S3(),
  sqs: new sdk.SQS(),
  stateQueueUrl: stateQueueUrl
})

/** Worker for admin tasks forwarded from admin@Edge lambda.
 - Publish: Sync all site files from the test site to the public site.
*/
exports.handler = async (event, context) => {
  console.log('Event: ' + JSON.stringify(event))

  // Handle action requests
  switch (event.command) {
    case 'template':
      return await applyTemplate(publicBucket, adminBucket)
    case 'publish':
      return await deploySite(testSiteBucket, siteBucket)
    default:
      return {
        status: '404',
        statusDescription: `Unknown admin acion: ${event.command}`
      }
  }
}

/** Copy entire Test site to Live Site. */
const deploySite = async (testSiteBucket, siteBucket) => {
  const counts = {
    updated: 0,
    added: 0,
    deleted: 0,
    unchanged: 0
  }
  try {
    // Sync all test site files to prod site, deleting missing files (Full overwrite)
    await aws.displayUpdate(Object.assign(counts, { deploying: true }), 'publish', 'Starting deploy...')
    await aws.mergeBuckets(testSiteBucket, '', siteBucket, '', {
        push: async event => {
          if (event.updated) { counts.updated++ }
          if (event.added) { counts.added++ }
          if (event.deleted) { counts.deleted++ }
          if (event.unchanged) { counts.unchanged++ }
          //console.log(mergeEventToString(event))
          await aws.displayUpdate(Object.assign(counts, { deploying: true, total: event.total }), 'publish')
        }
      })
  } catch (e) {
      const msg = `Deploy failed: ${JSON.stringify(e)}`
      console.error(msg)
      await aws.displayUpdate(Object.assign(counts, { deployError: JSON.stringify(e) }), 'publish', msg)
  } finally {
    const msg = `Deploy complete: Updated: ${updatedCount}, Added: ${addedCount}, Deleted: ${deletedCount}, Unchanged: ${unchangedCount}`
    console.log(msg)
    await aws.displayUpdate(Object.assign(counts, { deploying: false }), 'publish', msg)
  }
}

/** Copy default site template selected by the user from braevitae-pub to this site's bucket. */
async function applyTemplate(publicBucket, adminBucket, templateName) {
  console.log(`Copy default site template ${templateName} from ${publicBucket} to ${adminBucket}`)
  await aws.displayUpdate(Object.assign(counts, { deploying: true }), 'publish', 'Starting deploy...')
  const siteConfigDir = await Unzipper.Open.s3(s3,{ Bucket: publicBucket, Key: `AutoSite/site-config/${templateName}.zip` });
  await Promise.all(siteConfigDir.files.map(async file => {
    console.log(`Copying ${file.path}`)
    await s3.putObject({
      Bucket: adminBucket,
      Key: 'site-config/' + file.path,
      Body: await file.buffer()
    }).promise()
  }))
}

/**  */
const mergeEventToString = (event) => {
  let action = null
  if (event.updated) { action = 'Updated' }
  if (event.added) { action = 'Added' }
  if (event.deleted) { action = 'Deleted' }
  if (event.destFile) {
    return `${action} ${event.destFile}`
  } else if (event.sourceFile) {
    return `${action} ${event.sourceFile}`
  } else {
    return JSON.stringify(event)
  }
}
