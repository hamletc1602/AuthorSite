const sdk = require('aws-sdk');
const AwsUtils = require('./awsUtils')
const Unzipper = require('unzipper')
const Yaml = require('yaml')
const Fs = require('fs-extra')
const Files = require('./files')
const Path = require('path')
const Mime = require('mime');
const Zip = require('zip-a-folder')

const JsonContentType = 'application/json'

const publicBucket = process.env.publicBucket
const sharedBucket = process.env.sharedBucket
const adminBucket = process.env.adminBucket
const adminUiBucket = process.env.adminUiBucket
const siteBucket = process.env.siteBucket
const testSiteBucket = process.env.testSiteBucket
const stateQueueUrl = process.env.stateQueueUrl
const maxAgeBrowser = process.env.maxAgeBrowser
const maxAgeCloudFront = process.env.maxAgeCloudFront

const aws = new AwsUtils({
  files: Files,
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
    case 'updateTemplate':
      return upateTemplate(publicBucket, adminBucket, event.body)
    case 'updateAdminUi':
      return updateAdminUi(publicBucket, adminUiBucket, event.body)
    case 'saveTemplate':
      return saveTemplate(sharedBucket, adminBucket, event.body)
    case 'setPassword':
      return setPassword(adminBucket, event.body)
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

/** Reurn true if this template is a public template (vs. private to this user's AWS tenant) */
async function getBucketForTemplate(templateName) {
  const adminConfigBuff = (await aws.get(adminUiBucket, 'admin/admin.json')).Body
  if (adminConfigBuff) {
    const adminConfig = JSON.parse(adminConfigBuff.toString())
    const templateProps = adminConfig.templates.find(p => p.id === templateName)
    if (templateProps) {
      if (templateProps.access === 'public') { return publicBucket }
      if (templateProps.access === 'shared') { return sharedBucket }
      return adminBucket
    }
  }
  return adminBucket
}

/** Copy default site template selected by the user from braevitae-pub to this site's bucket. */
async function applyTemplate(publicBucket, adminBucket, params) {
  let success = true
  const templateName = params.id
  try {
    await aws.displayUpdate({
        preparing: true, prepareError: false, stepMsg: 'Prepare'
      }, 'prepare', `Starting prepare with ${templateName} template.`)
    const sourceBucket = await getBucketForTemplate(templateName)
    console.log(`Copy site template '${templateName}' from ${sourceBucket} to ${adminBucket}`)
    // Copy template archive to local FS.
    const archiveFile = `/tmp/${templateName}.zip`
    const archive = await aws.get(sourceBucket,  `AutoSite/site-config/${templateName}.zip`)
    Fs.writeFileSync(archiveFile, archive.Body)
    // Copy all the site template files to the local buckets
    const zip = Fs.createReadStream(archiveFile).pipe(Unzipper.Parse({forceStream: true}));
    for await (const entry of zip) {
      if (entry.type === 'File') {
        pushTemplateFile(aws, templateName, entry, { copyData: true })
      } else {
        entry.autodrain(); // NOTE: Very important to call either await buffer() or autodrain() for every zip entry, or NodeJS will fail with a hard to diagnose error
      }
    }
    //
    console.log('Convert YAML configuration files to JSON.')
    try {
      success = await ensureSchemaJsonFiles(adminBucket, templateName)
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

/** Copy only the non-config & content parts of the template from the template source.
    (schema and template files, etc.)
*/
async function upateTemplate(publicBucket, adminBucket, params) {
  let success = true
  const templateName = params.id
  try {
    await aws.displayUpdate({
        updatingTemplate: true, updateTemplateError: false, stepMsg: 'Update Template'
      }, 'update', `Starting update with ${templateName} template.`)
    // Copy template archive to local FS.
    const sourceBucket = await getBucketForTemplate(templateName)
    console.log(`Copy site template '${templateName}' schema and style from ${sourceBucket} to ${adminBucket}`)
    const archiveFile = `/tmp/${templateName}.zip`
    const archive = await aws.get(sourceBucket,  `AutoSite/site-config/${templateName}.zip`)
    Fs.writeFileSync(archiveFile, archive.Body)
    const zip = Fs.createReadStream(archiveFile).pipe(Unzipper.Parse({forceStream: true}));
    for await (const entry of zip) {
      if (entry.type === 'File') {
        if (/config\/schema/.test(entry.path)
          || /config\/template/.test(entry.path)
          || /config\/editors\.yaml/.test(entry.path)
        ) {
          const path = '/tmp/' + entry.path
          console.log(`Write file: ${path}`)
          Files.ensurePath(path)
          Fs.writeFileSync(path, await entry.buffer())
        } else {
          entry.autodrain();
        }
      } else {
        entry.autodrain();
      }
    }
    // Replace all non-editiable files of the template  ( This is a bit messy because the non-editable and editable are mixed in together
    //    Special handling needed for editors.yaml, and specific schema and templates dirs so we don't overwrite (or delete) the conf dir
    //    that holds the editable files.
    // Any auto-generated JSON files are removed as part of this process, to be re-generated by the 'ensureSchemaJsonFiles' call below.
    console.log('Copy all the non-user-editable site template files to the local buckets (And remove any files no longer in source)')
    const rootPath = `site-config/${templateName}/`
    await aws.put(adminBucket, rootPath + 'editors.yaml', 'text/yaml', Fs.readFileSync('/tmp/config/editors.yaml'), maxAgeBrowser, maxAgeCloudFront)
    await aws.delete(adminBucket, rootPath + 'editors.json')
    const monitor = { push: async _event => {} }
    aws.mergeToS3('/tmp/config/schema', adminBucket, rootPath + 'schema', maxAgeBrowser, maxAgeCloudFront, monitor)
    if (await Fs.exists('/tmp/config/templates')) {
      aws.mergeToS3('/tmp/config/templates', adminBucket, rootPath + 'templates', maxAgeBrowser, maxAgeCloudFront, monitor)
    }
    //
    console.log('Convert YAML configuration files to JSON.')
    try {
      success = await ensureSchemaJsonFiles(adminBucket, templateName)
    } catch (error) {
      success = false
      console.log(`Broken template. Missing editors.yaml. Error: ${JSON.stringify(error)}`)
      await aws.displayUpdate({}, 'update', 'Broken template. Missing editors.yaml')
    }
  } catch (error) {
    console.log(`Failed update with ${templateName} template.`, error)
    await aws.displayUpdate({ updatingTemplate: false, updateTemplateError: true }, 'update', `Failed update of ${templateName} template. Error: ${error.message}.`)
    success = false
  } finally {
    if (success) {
      console.log(`Successfull update of ${templateName} template.`)
      await aws.displayUpdate({ updatingTemplate: false, updateTemplateError: false }, 'update', `Updated ${templateName} template.`)
    } else {
      console.log(`Failed update of ${templateName} template.`)
      await aws.displayUpdate({ updatingTemplate: false, updateTemplateError: true }, 'update', `Failed update ${templateName} template.`)
    }
  }
}

/** Convert YAML configuration files to JSON */
async function ensureSchemaJsonFiles(adminBucket, templateName) {
  const rootPath = `site-config/${templateName}/`
  let editors = null
  {
    const yaml = (await aws.get(adminBucket, rootPath + 'editors.yaml')).Body.toString()
    editors = Yaml.parse(yaml, {});
  }
  console.log('Editors: ', editors)
  let success = true
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
  return success
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

    opts:
    copyData: If true, include the settings and content data from the template (this would
              overwrite any existing user editable data, use with care.)
*/
async function pushTemplateFile(aws, templateName, file, opts) {
  opts = opts || {}
  try {
    const pathParts = file.path.split('/')
    if (pathParts.length > 0) {
      const pathRoot = pathParts.shift()
      const filePath = pathParts.join('/')
      const pathSubRoot = pathParts.shift()
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
          switch (pathSubRoot) {
            case 'conf':
              if (opts.copyData) {
                await aws.put(adminBucket, `site-config/${templateName}/${filePath}`, null, body)
              }
              break
            case 'schema':
              await aws.put(adminBucket, `site-config/${templateName}/${filePath}`, null, body)
              break
            case 'template':
              await aws.put(adminBucket, `site-config/${templateName}/${filePath}`, null, body)
            break
            default:
              console.log(`Unknown path root config/${pathSubRoot} in template ${templateName}`)
          }
          break
        case 'content':
          // Content is delivered via CloudFront origin, so cache settings are vital, and content-type is vital to how the
          // editor interprets the data.
          if (opts.copyData) {
            await aws.put(adminUiBucket, `content/${templateName}/${filePath}`, type, body, 0, 0)
          }
          break
        case 'cache':
          // Cache is used only internally by the site generator, never delivered via CloudFront.
          if (opts.copyData) {
            await aws.put(adminBucket, `cache/${templateName}/${filePath}`, null, body)
          }
          break
        default:
          console.log(`Unknown path root '${pathRoot}' in template ${templateName}`)
      }
    } else {
      console.log(`skipping top level file in template: ${file.path}`)
    }
  } catch (e) {
    console.log(`Failed to copy file: ${file.path}. ${e.message}`, e)
  }
}

/** Copy the latest AdminUI deploy from the BraeVitae public bucket to this stack
    Params:
     - updateRecoveryPath: True to copy current admin UI to teh recovery UI.
                          ( Should NOT be true for an update request from the
                            admin UI running from the recovery path, but the
                            UI itself needs to provide this flag.
                          )
     -
*/
async function updateAdminUi(publicBucket, adminUiBucket, params) {
  try {
    await aws.displayUpdate({
        updatingUi: true, updateUiError: false, stepMsg: 'Update UI'
      }, 'update', `Starting Admin UI update.`)
    await Promise.all(['desktop', 'mobile'].map(async mode => {
      // Copy current adminUi to the 'recovery' dir ( For recovery In case there's an issue with the upgrade )
      if (params.updateRecoveryPath) {
        console.log(`Copy current admin UI to the backup recovery path`)
        await aws.mergeBuckets(adminUiBucket, mode + '/admin', adminUiBucket, mode + '/recovery', {
          push: async _event => {}
        })
      }
      // Copy latest AdminUI from BraeVitae
      console.log(`Copy admin UI files from braevitae-pub to ${adminUiBucket}`)
      const adminUiDir = await Unzipper.Open.s3(aws.getS3(),{ Bucket: publicBucket, Key: 'AutoSite/provision/adminui.zip' });
      await Promise.all(adminUiDir.files.map(async file => {
        console.log(`Copying ${file.path}`)
        await aws.put(adminUiBucket, mode + '/admin/' + file.path, Mime.getType(file.path) || 'text/html',
          await file.buffer(), maxAgeBrowser, maxAgeCloudFront)
      }))
    }))
  } catch (error) {
    console.log(`Failed Admin UI update.`, error)
    await aws.displayUpdate({ updatingUi: false, updateUiError: true }, 'update', `Failed update of Admin UI. Error: ${error.message}.`)
  } finally {
    console.log(`Successfull Admin UI update.`)
    await aws.displayUpdate({ updatingUi: false, updateUiError: false }, 'update', `Updated Admin UI.`)
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

/** Compress all site static, config, and content data into an archive for use when re-preparing a site, or
    creating new site stacks.
 */
async function saveTemplate(sharedBucket, adminBucket, params) {
  //
  await aws.displayUpdate({ savingTpl: true, saveTplError: false, saveTplErrMsg: '' }, 'saveTemplate', `Start save template: ${params.name}`)

  // Local dirs
  const confDir = '/tmp/' + params.name + '/config'
  const contentDir = '/tmp/' + params.name + '/content'
  Files.ensurePath(confDir)
  Files.ensurePath(contentDir)

  // Pull all site config and content down to the local machine
  await aws.pull(adminBucket, `site-config/${params.name}/`, confDir)
  await aws.pull(adminUiBucket, `content/${params.name}/`, contentDir)

  // Compress the site data into an archive
  const archiveLocalPath = '/tmp/' + params.name + '.zip'
  await Zip.zip('/tmp/' + params.name, archiveLocalPath);

  // Put the archive back to an S3 bucket (Either local admin bucket, or shared bucket if it exists)
  const bucketPath = 'AutoSite/site-config/' + params.name + '.zip'
  let success = false
  let nameExists = false
  let shared = false
  if (aws.bucketExist(sharedBucket)) {
    shared = true
    const exist = aws.get(sharedBucket, archiveLocalPath)
    if ( ! exist) {
      aws.put(sharedBucket, bucketPath, null, Fs.readFileSync(archiveLocalPath))
      success = true
    } else {
      nameExists = true
    }
  } else {
    const exist = aws.get(adminBucket, archiveLocalPath)
    if ( ! exist) {
      aws.put(sharedBucket, bucketPath, null, Fs.readFileSync(archiveLocalPath))
      success = true
    } else {
      nameExists = true
    }
  }
  if (nameExists) {
    // Put error into display state
    await aws.displayUpdate({ savingTpl: false, saveTplError: true, saveTplErrMsg: `Template ${params.name}` }, 'saveTemplate', `Skip save template. Name ${params.name} already exists`)
  }
  if (success) {
    // Add this template to the admin state
    try {
      const template = {
        id: params.id,
        name: params.name,
        access: shared ? 'shared' : 'private',
        description: params.desc
      }
      aws.addTemplate(template)
      // Add any shared templates to the shared bucket metadata
      if (shared) {
        const metadataStr = aws.get(sharedBucket, 'AutoSite/site-config/metadata.json')
        const metadata = JSON.parse(metadataStr)
        metadata.push(template)
        aws.put(sharedBucket,  'AutoSite/site-config/metadata.json', null, JSON.stringify(metadata))
      }
      await aws.displayUpdate({ savingTpl: false, saveTplError: false, saveTplErrMsg: '' }, 'saveTemplate', `Saved new template: ${params.name}`)
    } catch (e) {
      await aws.displayUpdate({ savingTpl: false, saveTplError: true, saveTplErrMsg: `Failed to update templates list ${e.message}` }, 'saveTemplate', `Failed to update templates list ${e.message}`)
    }
  }
}

/** */
async function setPassword(adminBucket, params) {
  // {"password":"****","lastFailTs":1680198297459,"failedCount":0}
  try {
    await aws.displayUpdate({ savingTpl: true, setPwdError: false, setPwdErrMsg: '' }, 'changePassword', `Start change password`)
    const metadataStr = aws.get(adminBucket, 'admin_secret')
    const metadata = JSON.parse(metadataStr)
    metadata.password = params.newPassword
    aws.put(adminBucket, 'admin_secret', null, JSON.stringify(metadata))
    await aws.displayUpdate({ settingPwdTpl: false, setPwdError: false, setPwdErrMsg: '' }, 'changePassword', `Saved new template: ${params.name}`)
  } catch (e) {
    await aws.displayUpdate({ settingPwdTpl: false, setPwdError: true, setPwdErrMsg: `Failed to change password ${e.message}` }, 'changePassword', `Failed to change password ${e.message}`)
  }
}
