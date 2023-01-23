const sdk = require('aws-sdk');
const AwsUtils = require('./awsUtils')
const Unzipper = require('unzipper')
const Yaml = require('yaml')

const JsonContentType = 'application/json'

const publicBucket = process.env.publicBucket
const adminBucket = process.env.adminBucket
const adminUiBucket = process.env.adminUiBucket
const siteBucket = process.env.siteBucket
const testSiteBucket = process.env.testSiteBucket
const stateQueueUrl = process.env.stateQueueUrl

// Other config available from stack if needed
//const maxAgeBrowser = process.env.maxAgeBrowser
//const maxAgeCloudFront = process.env.maxAgeCloudFront

const aws = new AwsUtils({
  files: null,  // Not needed (though perhaps this suggests we need two different modules)
  s3: new sdk.S3(),
  sqs: new sdk.SQS(),
  stateQueueUrl: stateQueueUrl
})

/** Worker for admin tasks forwarded from admin@Edge lambda.
 - Publish: Sync all site files from the test site to the public site.
*/
exports.handler = async (event, _context) => {
  console.log('Event: ' + JSON.stringify(event))

  // Handle action requests
  switch (event.command) {
    case 'template':
      return applyTemplate(publicBucket, adminBucket, adminUiBucket, event.body)
    case 'publish':
      return deploySite(testSiteBucket, siteBucket, event.body)
    case 'completeUpload':
      return completeFileUpload(adminBucket, adminUiBucket, event.body)
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
    const msg = `Deploy complete: Updated: ${counts.updated}, Added: ${counts.added}, Deleted: ${counts.deleted}, Unchanged: ${counts.unchanged}`
    console.log(msg)
    await aws.displayUpdate(Object.assign(counts, { deploying: false }), 'publish', msg)
  }
}

/** Copy default site template selected by the user from braevitae-pub to this site's bucket. */
async function applyTemplate(publicBucket, adminBucket, adminUiBucket, params) {
  let success = true
  const templateName = params.id
  try {
    //
    await aws.displayUpdate({
        preparing: true, stepMsg: 'Prepare'
      }, 'prepare', `Starting prepare with ${templateName} template.`)

    // Check if this template is a public or private template
    let isPublicTemplate = false
    const adminConfigBuff = (await aws.get(adminUiBucket, 'admin/admin.json')).Body
    if (adminConfigBuff) {
      const adminConfig = JSON.parse(adminConfigBuff.toString())
      const templateProps = adminConfig.templates.find(p => p.name === templateName)
      if (templateProps) {
        isPublicTemplate = templateProps.access === 'public'
      }
    }
    const sourceBucket = isPublicTemplate ? publicBucket : adminBucket

    // Copy all the site template files to the local buckets
    console.log(`Copy ${isPublicTemplate ? 'public' : 'private'} site template '${templateName}' from ${sourceBucket} to ${adminBucket}`)
    const siteConfigDir = await Unzipper.Open.s3(aws.getS3(),{ Bucket: sourceBucket, Key: `AutoSite/site-config/${templateName}.zip` });
    await Promise.all(siteConfigDir.files.map(async file => {
      console.log(`Copying ${file.path}`)
      const pathParts = file.path.split('/')
      if (pathParts.length > 0) {
        const pathRoot = pathParts.shift()
        const filePath = pathParts.join('/')
        switch (pathRoot) {
          case 'config':
            await aws.getS3().putObject({
              Bucket: adminBucket,
              Key: `site-config/${templateName}/${filePath}`,
              Body: await file.buffer()
            }).promise()
            break
          case 'content':
            await aws.getS3().putObject({
              Bucket: adminUiBucket,
              Key: `content/${templateName}/${filePath}`,
              Body: await file.buffer()
            }).promise()
            break
          case 'cache':
            await aws.getS3().putObject({
              Bucket: adminBucket,
              Key: `cache/${templateName}/${filePath}`,
              Body: await file.buffer()
            }).promise()
            break
          default:
            console.log(`Unknown path root '${pathRoot}' in template ${templateName}`)
        }
      } else {
        console.log(`skipping top level file in template: ${file.path}`)
      }
    }))
    // Get the editors config file
    console.log('Convert YAML configuration files to JSON.')
    try {
      const rootPath = `site-config/${templateName}/`
      let editors = null
      {
        const yaml = (await aws.get(adminBucket, rootPath + 'editors.yaml')).Body.toString()
        editors = Yaml.parse(yaml, {});
      }
      console.log('Editors: ', editors)
      await Promise.all(editors.map(async editor => {
        try {
          console.log('Editor: ' + editor.id)
          console.log('Schema: ' + editor.schema)
          if (/.*yaml$/.test(editor.schema)) {
            const yaml = (await aws.get(adminBucket, rootPath + editor.schema)).Body.toString()
            editor.schema += '.json'
            console.log('rewrite as: ' + editor.schema, JSON.stringify(Yaml.parse(yaml)))
            await aws.put(adminBucket, rootPath + editor.schema, JsonContentType, JSON.stringify(Yaml.parse(yaml)))
          }
          console.log('Schema: ' + editor.data)
          if (/.*yaml$/.test(editor.data)) {
            const yaml = (await aws.get(adminBucket, rootPath + editor.data)).Body.toString()
            editor.data += '.json'
            console.log('rewrite as: ' + editor.data, JSON.stringify(Yaml.parse(yaml)))
            await aws.put(adminBucket, rootPath + editor.data, JsonContentType, JSON.stringify(Yaml.parse(yaml)))
          }
        } catch (error) {
          success = false
          console.log(`Failed converting editor: ${JSON.stringify(editor)}`, error)
        }
      }))
      console.log('rewrite editors as: ', JSON.stringify(editors))
      await aws.put(adminBucket, rootPath + 'editors.json', JsonContentType, JSON.stringify(editors))
    } catch (error) {
      success = false
      console.log(`Broken template. Missing editors.yaml. Error: ${JSON.stringify(error)}`)
      await aws.displayUpdate({}, 'prepare', 'Broken template. Missing editors.yaml')
    }
  } catch (error) {
    console.log(`Failed prepare with ${templateName} template.`, error)
    await aws.displayUpdate({ preparing: false }, 'prepare', `Failed prepare with ${templateName} template. Error: ${error.message}.`)
    success = false
  } finally {
    if (success) {
      await aws.displayUpdate({ preparing: false }, 'prepare', `Prepared with ${templateName} template.`)
      // Update prepared template ID in config state (This should trigger the UI to refresh if the prepared template is different)
      await aws.adminStateUpdate({ config: { preparedTemplateId: templateName, preparedTemplates: [templateName] } })
    } else {
      await aws.displayUpdate({ preparing: false }, 'prepare', `Failed Prepare with ${templateName} template.`)
    }
  }
}

async function completeFileUpload(adminBucket, adminUiBucket, params) {
  try {
    const destBucket = params.isConfig ? adminBucket : adminUiBucket
    // Get all content parts
    const contentList = []
    for (let i = 1; i <= params.partCount; ++i) {
      const partContent = await aws.get(adminBucket, params.basePath + '.part_' + i)
      contentList.push(partContent.Body)
    }
    // Put complete file to the original path
    const finalBuff = Buffer.concat(contentList)
    await aws.put(destBucket, params.basePath, params.contentType, finalBuff, 0, 0)
    // Clean up parts
    for (let i = 1; i <= params.partCount; ++i) {
      await aws.delete(adminBucket, params.basePath + '.part_' + i)
    }
  } catch (error) {
    const msg = `Failed upload for ${params.basePath}. Error: ${JSON.stringify(error)}.`
    console.log(msg)
    await aws.displayUpdate({}, 'upload', msg)
  }
}
