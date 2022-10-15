const AWS = require('aws-sdk');
const Unzipper = require('unzipper')
const Mime = require('mime');
const Handlebars = require('handlebars')

const s3 = new AWS.S3();


/** Worker for admin tasks forwarded from admin@Edge lambda.

*/
exports.handler = async (event, context) => {
  //
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
      let ret = null
      switch (action) {
        case 'deploy':
          ret = await deploySite(parts.join('/'), testSiteBucket, siteBucket)
          break
        case 'refreshUi':
          ret = await compileUiTemplates(parts.join('/'), adminBucket, adminUiBucket)
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
  return req
};

/** Copy entire Test site to Live Site. */
const deploySite = async (path, testSiteBucket, siteBucket) => {
  // Sync all test site files to prod site, deleting missing files (Full overwrite)
}

/** Compile the UI precompiled templates from admin bucket template code and save them to the UI bucket. */
const compileUiTemplates = async (path, adminBucket, adminUiBucket) => {
  try {
    compileTemplate(adminBucket, adminUiBucket, 'desktop/admin')
    compileTemplate(adminBucket, adminUiBucket, 'mobile/admin')
    return {
      status: '200',
      statusDescription: `Refresh UI Success`
    }
  } catch (error) {
    return {
      status: '500',
      statusDescription: `Refresh UI failed: ${JSON.stringify(error)}`
    }
  }
}

const compileTemplate = async (adminBucket, uiBucket, templateName) => {
  const tpl = await s3.getObject({ Bucket: adminBucket, Key: `templates/${templateName}.handlebars` }).promise()
  const pre = Handlebars.precompile(desktopTpl);
  await s3.putObject({ Bucket: uiBucket, Key: `${templateName}.handlebars.js`, Body: Buffer.from(pre) }).promise()
}
