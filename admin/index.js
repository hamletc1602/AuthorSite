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
  let updatedCount = 0
  let addedCount = 0
  let deletedCount = 0
  let unchangedCount = 0
  try {
    // Sync all test site files to prod site, deleting missing files (Full overwrite)
    aws.displayUpdate({ deploying: true }, 'Starting deploy...')
    await aws.mergeBuckets(testSiteBucket, '', siteBucket, '', {
        push: event => {
          if (event.updated) { updatedCount++ }
          if (event.added) { addedCount++ }
          if (event.deleted) { deletedCount++ }
          if (event.unchanged) { unchangedCount++ }
          //console.log(mergeEventToString(event))
        }
      })
  } catch (e) {
      const msg = `Deploy failed: ${JSON.stringify(e)}`
      console.error(msg)
      aws.displayUpdate({ deployError: JSON.stringify(e) }, msg)
  } finally {
    const msg = `Deploy complete: Updated: ${updatedCount}, Added: ${addedCount}, Deleted: ${deletedCount}, Unchanged: ${unchangedCount}`
    console.log(msg)
    aws.displayUpdate({ deploying: false }, msg)
  }
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
