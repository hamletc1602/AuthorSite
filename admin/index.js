const AWS = require('aws-sdk');
const Unzipper = require('unzipper')
const Mime = require('mime');
const Handlebars = require('handlebars')

const s3 = new AWS.S3();


/** Worker for admin tasks forwarded from admin@Edge lambda.

*/
exports.handler = async (event, context) => {
  //
  const publicBucket = process.env.publicBucket
  const adminBucket = process.env.adminBucket
  const adminUiBucket = process.env.adminUiBucket
  const siteBucket = process.env.siteBucket
  const testSiteBucket = process.env.testSiteBucket

  // Handle action requests
  const req = event.Records[0].cf.request
  if (req.method === 'POST') {
    if (req.uri.indexOf('admin') === 0) {
      const parts = req.uri.split('/')
      parts.shift() // admin
      const action = parts.shift()
      if (action === 'command') {
        const command = parts.shift()
        let ret = null
        switch (command) {
          case 'publish':
            ret = await deploySite(parts.join('/'), testSiteBucket, siteBucket)
            break
          default:
            ret = {
              status: '404',
              statusDescription: `Unknown admin acion: ${action}`
            }
        }
        return ret
      }
    }
  }
  return req
};

/** Copy entire Test site to Live Site. */
const deploySite = async (path, testSiteBucket, siteBucket) => {
  // Sync all test site files to prod site, deleting missing files (Full overwrite)
}
