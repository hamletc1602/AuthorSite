const sdk = require('aws-sdk');
const AwsUtils = require('./awsUtils')
const Unzipper = require('unzipper')
const Yaml = require('yaml')
const Fs = require('fs')
const Path = require('path')

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
  const deployId = new Date().getTime()
  const counts = {
    updated: 0,
    added: 0,
    deleted: 0,
    unchanged: 0
  }
  try {
    // Sync all test site files to prod site, deleting missing files (Full overwrite)
    await aws.displayUpdate(Object.assign(counts, { deploying: true, deployError: false, stepMsg: `Starting deploy ${deployId}` }), 'publish', 'Starting deploy...')
    await aws.mergeBuckets(testSiteBucket, '', siteBucket, '', {
        push: async event => {
          if (event.updated) { counts.updated++ }
          if (event.added) { counts.added++ }
          if (event.deleted) { counts.deleted++ }
          if (event.unchanged) { counts.unchanged++ }
          //console.log(mergeEventToString(event))
        }
      })
  } catch (e) {
      const msg = `Deploy ${deployId} failed: ${e.message}`
      console.error(msg)
      await aws.displayUpdate(Object.assign(counts, { deploying: false, deployError: true, stepMsg: msg }), 'publish', msg)
  } finally {
    const msg = `Deploy ${deployId} complete: Updated: ${counts.updated}, Added: ${counts.added}, Deleted: ${counts.deleted}, Unchanged: ${counts.unchanged}`
    console.log(msg)
    await aws.displayUpdate(Object.assign(counts, { deploying: false, stepMsg: msg }), 'publish', msg)
  }
}

/** Copy default site template selected by the user from braevitae-pub to this site's bucket. */
async function applyTemplate(publicBucket, adminBucket, adminUiBucket, params) {
  let success = true
  const templateName = params.id
  try {
    //
    await aws.displayUpdate({
        preparing: true, prepareError: false, stepMsg: 'Prepare'
      }, 'prepare', `Starting prepare with ${templateName} template.`)

    // Check if this template is a public or private template
    let isPublicTemplate = false
    const adminConfigBuff = (await aws.get(adminUiBucket, 'admin/admin.json')).Body
    if (adminConfigBuff) {
      const adminConfig = JSON.parse(adminConfigBuff.toString())
      const templateProps = adminConfig.templates.find(p => p.id === templateName)
      if (templateProps) {
        isPublicTemplate = templateProps.access === 'public'
      }
    }
    const sourceBucket = isPublicTemplate ? publicBucket : adminBucket
    //const markdownTest = /.md$/

    console.log(`Copy ${isPublicTemplate ? 'public' : 'private'} site template '${templateName}' from ${sourceBucket} to ${adminBucket}`)

    // Copy template archive to local FS.
    const archiveFile = `/tmp/${templateName}.zip`
    const archive = await aws.get(sourceBucket,  `AutoSite/site-config/${templateName}.zip`)
    Fs.writeFileSync(archiveFile, archive.Body)

    // Copy all the site template files to the local buckets
    const zip = Fs.createReadStream(archiveFile).pipe(Unzipper.Parse({forceStream: true}));
    for await (const entry of zip) {
      if (entry.type === 'File') {
        pushTemplateFile(aws, templateName, entry)
      } else {
        entry.autodrain();
      }
    }

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
    await aws.displayUpdate({ preparing: false, prepareError: true }, 'prepare', `Failed prepare with ${templateName} template. Error: ${error.message}.`)
    success = false
  } finally {
    if (success) {
      console.log(`Successfull prepare with ${templateName} template.`)
      await aws.displayUpdate({ preparing: false }, 'prepare', `Prepared with ${templateName} template.`)
      // Update prepared template ID in config state (This should trigger the UI to refresh if the prepared template is different)
      await aws.adminStateUpdate({ config: { preparedTemplateId: templateName, preparedTemplates: [templateName] } })
    } else {
      console.log(`Failed prepare with ${templateName} template.`)
      await aws.displayUpdate({ preparing: false, prepareError: true }, 'prepare', `Failed Prepare with ${templateName} template.`)
    }
  }
}

/** Return an appropriate content type for the file path. */
function getContentType(filePath) {
  // for now, just use the extension of the file to indicate the content type. This is only relevant for
  // pre-prepared template files, so we have some control over the file extensions used.
  // Doing this manually because I'd like the content type values to exactly match what the editor
  // is expecting.
  const ext = Path.extname(filePath)
  console.log(`Add content ${filePath} with content-type ${ext}`)
  switch (ext) {
    case '.jpg': return 'image/jpeg'
    case '.jpeg': return 'image/jpeg'
    case '.png': return 'image/png'
    case '.md': return 'text/plain'
    case '.txt': return 'text/plain'
    default: return 'application/octet-stream'
  }

}

/** Copy this file (unzipper util file record) to the appropriate S3
    destination, based on the root path element name.
*/
async function pushTemplateFile(aws, templateName, file, opts) {
  opts = opts || {}
  try {
    const pathParts = file.path.split('/')
    if (pathParts.length > 0) {
      const pathRoot = pathParts.shift()
      const filePath = pathParts.join('/')
      const type = getContentType(file.path)
      const body = await file.buffer()
      if (opts.verbose) {
        console.log(`Copying file ${file.path}`, { entry: file, body: body })
      } else {
        console.log(`Copying file ${file.path}`)
      }
      switch (pathRoot) {
        case 'config':
          // Config is not delivered via CloudFront origin (only viewer func) but content type is copied from the S3 record.
          // Maybe relevant? But does not appear to be an issue so far.
          await aws.put(adminBucket, `site-config/${templateName}/${filePath}`, null, body)
          break
        case 'content':
          // Content is delivered via CloudFront origin, so cache settings are vital, and content-type is vital to how the
          // editor interprets the data.
          await aws.put(adminUiBucket, `content/${templateName}/${filePath}`, type, body, 0, 0)
          break
        case 'cache':
          // Cache is used only internally by the site generator, never delivered via CloudFront.
          await aws.put(adminBucket, `cache/${templateName}/${filePath}`, null, body)
          break
        default:
          console.log(`Unknown path root '${pathRoot}' in template ${templateName}`)
      }
      if (opts.delay) {
        // Delay between each file push
        await opts.delay(opts.delayMs || 250)
      }
    } else {
      console.log(`skipping top level file in template: ${file.path}`)
    }
  } catch (e) {
    console.log(`Failed to copy file: ${file.path}. ${e.message}`, e)
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
