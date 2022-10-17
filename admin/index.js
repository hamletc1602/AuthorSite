const AWS = require('aws-sdk');
const S3Sync = require('s3-sync-client')
const { TransferMonitor } = require('s3-sync-client');

const s3 = new AWS.S3();
const s3SyncClient = new S3Sync({ client: s3 })

/** Worker for admin tasks forwarded from admin@Edge lambda.
 - Publish: Sync all site files from the test site to the public site.
*/
exports.handler = async (event, context) => {
  //
  const publicBucket = process.env.publicBucket
  const adminBucket = process.env.adminBucket
  const adminUiBucket = process.env.adminUiBucket
  const siteBucket = process.env.siteBucket
  const testSiteBucket = process.env.testSiteBucket
  const maxAgeBrowser = process.env.maxAgeBrowser
  const maxAgeCloudFront = process.env.maxAgeCloudFront

  //
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
const deploySite = async (path, testSiteBucket, siteBucket) => {
  // Sync all test site files to prod site, deleting missing files (Full overwrite)

  // Update admin.json for start of transfer


  const monitor = new TransferMonitor();
  let prevP = null
  monitor.on('progress', p => {
      if (prevP && prevP.count.current !== p.count.current) {
          console.log(`Transferring file ${p.count.current} of ${p.count.total}`)
          // In progress update ??

      }
      prevP = p
  });
  try {
      const syncConfig = {
          monitor: monitor,
          del: true, // Delete dest objects if source deleted.
          maxConcurrentTransfers: 16,
          commandInput: {
              ACL: 'private',
              CacheControl: `max-age=${maxAgeBrowser},s-maxage=${maxAgeCloudFront}`,
              ContentType: (input) => {
                  const type = mime.getType(input.Key) || 'text/html'
                  console.log(`Upload file: ${input.Key} as type ${type}`)
                  return type
              },
          },
          filters: [
              { exclude: (key) => { key.indexOf('.DS_Store.') !== -1 } }
          ]
      }
      if (options.force !== undefined) {
          syncConfig.sizeOnly = !options.force
      }
      await s3SyncClient.sync('s3://' + testSiteBucket, 's3://' + siteBucket, syncConfig);

      // End update


  } catch (e) {
      console.error(`Website sync failed: ${JSON.stringify(e)}`)
      // Error update
  }
}
