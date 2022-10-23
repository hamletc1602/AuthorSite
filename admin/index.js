const AWS = require('aws-sdk');
const S3Sync = require('s3-sync-client')
const { TransferMonitor } = require('s3-sync-client');
const Mime = require('mime')

const s3 = new AWS.S3();
const s3SyncClient = new S3Sync({ client: s3 })
var sqs = new AWS.SQS();

const publicBucket = process.env.publicBucket
const adminBucket = process.env.adminBucket
const adminUiBucket = process.env.adminUiBucket
const siteBucket = process.env.siteBucket
const testSiteBucket = process.env.testSiteBucket
const stateQueueUrl = process.env.stateQueueUrl
const maxAgeBrowser = process.env.maxAgeBrowser
const maxAgeCloudFront = process.env.maxAgeCloudFront

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

const displayUpdate = (params, logStr) => {
  try {
    console.log(`Display update: ${JSON.stringify(params)}  Msg: ${logStr}`)
    const msg = {
      time: Date.now(),
      display: params
    }
    if (logStr) {
      msg.logs = {
        deploy: [{
          time: Date.now(),
          msg: logStr
        }]
      }
    }
    console.log(`Queue Message to ${stateQueueUrl}  Msg: ${JSON.stringify(msg)}`)
    sqs.sendMessage({
      QueueUrl: stateQueueUrl,
      MessageBody: JSON.stringify(msg)
    })
  } catch (error) {
    console.log(`Failed to send display update: ${JSON.stringify(error)}`)
  }
}

/** Copy entire Test site to Live Site. */
const deploySite = async (path, testSiteBucket, siteBucket) => {
  try {
    // Sync all test site files to prod site, deleting missing files (Full overwrite)
    displayUpdate({ deploying: true }, 'Starting deploy...')
    const monitor = new TransferMonitor();
    let prevP = null
    monitor.on('progress', p => {
      if (prevP && prevP.count.current !== p.count.current) {
        const msg = `Transferring file ${p.count.current} of ${p.count.total}`
        console.log(msg)
        displayUpdate({ deployFileCurrent: p.count.current, deployFileTotal: p.count.total }, msg)
      }
      prevP = p
    });
    const syncConfig = {
      monitor: monitor,
      del: true, // Delete dest objects if source deleted.
      maxConcurrentTransfers: 16,
      commandInput: {
          ACL: 'private',
          CacheControl: `max-age=${maxAgeBrowser},s-maxage=${maxAgeCloudFront}`,
          ContentType: (input) => {
              const type = Mime.getType(input.Key) || 'text/html'
              console.log(`Upload file: ${input.Key} as type ${type}`)
              return type
          },
      },
      filters: [
          { exclude: (key) => { key.indexOf('.DS_Store.') !== -1 } }
      ]
    }
    // Override hash check
    // if (options.force !== undefined) {
    //     syncConfig.sizeOnly = !options.force
    // }
    await s3SyncClient.sync('s3://' + testSiteBucket, 's3://' + siteBucket, syncConfig);
  } catch (e) {
      const msg = `Website sync failed: ${JSON.stringify(e)}`
      console.error(msg)
      displayUpdate({ deployError: JSON.stringify(e) }, msg)
  } finally {
    displayUpdate({ deploying: false }, 'Deploy complete.')
  }
}
