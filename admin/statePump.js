const sdk = require('aws-sdk');
const AwsUtils = require('./awsUtils')

const adminBucket = process.env.adminBucket
const adminUiBucket = process.env.adminUiBucket
const stateQueueUrl = process.env.stateQueueUrl

const aws = new AwsUtils({
  files: null,  // Not needed (though perhaps this suggests we need two different modules)
  s3: new sdk.S3(),
  sqs: new sdk.SQS(),
  stateQueueUrl: stateQueueUrl
})

/** Task run periodically to check for admin state queue events and store them to the state file so
    queue events don't time out and vanish if no one uses the admin UI for a while (>14 days)

    At the same time, check if there are any old log messages (>24 hours) and remove them.
*/
exports.handler = async (_event, _context) => {
  const lock = await aws.getCurrentLock(adminUiBucket)
  if (lock) {
    console.log(`State locked by ${lock.id}, skipping this update.`)
  }
  await aws.updateAdminStateFromQueue(adminBucket, adminUiBucket, { deleteOldLogs: true })
}
