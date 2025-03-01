const sdk = require('aws-sdk');
const AwsUtils = require('./awsUtils')
const Unzipper = require('unzipper')
const Yaml = require('yaml')
const Fs = require('fs-extra')
const Files = require('./files')
const Path = require('path')
const Mime = require('mime');
const Zip = require('zip-a-folder')
const Uuid = require('uuid')

const JsonContentType = 'application/json'
const HoursToMs = 60 * 60 * 1000

const LogGroupsTemplate = [{
  groupName: '/aws/lambda/@SITE_NAME@-admin-worker',
  name: 'Admin Worker'
},{
  groupName: '/aws/lambda/@SITE_NAME@-builder',
  name: 'Builder'
},{
  groupName: '/aws/lambda/@SITE_NAME@-provisioner',
  name: 'Provisioner'
},{
  groupName: '/aws/lambda/@SITE_NAME@-publisher',
  name: 'Publisher'
},{
  groupName: '/aws/lambda/@SITE_NAME@-state-pump',
  name: 'State Pump'
},{
  groupName: '/aws/lambda/us-east-1.@SITE_NAME@-admin',
  name: 'Admin Edge',
  edge: true
},{
  groupName: '/aws/lambda/us-east-1.@SITE_NAME@-edge',
  name: 'Site Edge',
  edge: true
},{
  groupName: '/aws/lambda/us-east-1.@SITE_NAME@-azn-url',
  name: 'Amazon URL Forwarder',
  edge: true
}]

let MaxGroupNameLength = 0
{
  // Static: Calculate the Max. group name length from the existing data.
  LogGroupsTemplate.forEach(group => {
    if (MaxGroupNameLength < group.name.length) {
      MaxGroupNameLength = group.name.length
    }
  })
}

const publicBucket = process.env.publicBucket
const version = process.env.version
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
  stateQueueUrl: stateQueueUrl,
  cf: new sdk.CloudFront(),
  acm: new sdk.ACM(),
  r53: new sdk.Route53(),
  logs: new sdk.CloudWatchLogs()
})

/** Worker for admin tasks forwarded from admin@Edge lambda.
 - Publish: Sync all site files from the test site to the public site.
*/
exports.handler = async (event, _context) => {
  //
  aws.logsEdge = new sdk.CloudWatchLogs({ region: event.body.edgeRegion })

  //
  if (event.command === 'setPassword') {
    console.log('Event: setPassword')
  } else {
    console.log('Event: ' + JSON.stringify(event))
  }

  // Handle action requests
  switch (event.command) {
    case 'template':
      return applyTemplate(adminBucket, event.body)
    case 'publish':
      return deploySite(testSiteBucket, siteBucket, event.body)
    case 'completeUpload':
      return completeFileUpload(adminBucket, adminUiBucket, event.body)
    case 'updateTemplate':
      return upateTemplate(adminBucket, event.body)
    case 'updateAdminUi':
      return updateAdminUi(publicBucket, adminUiBucket, event.body)
    case 'saveTemplate':
      // Args:
      // id: ID of the template with the data to save
      // name: New name, and ID, for the saved template
      // description: A text descripton of the new template.
      // overwrite: A flag that allows template overwrite
      return saveTemplate(sharedBucket, adminBucket, event.body)
    case 'deleteTemplate':
      // Args:
      // name: Name, and ID, for the saved template
      return deleteTemplate(sharedBucket, adminBucket, event.body)
    case 'renameTemplate':
      // Args:
      // name: Name, and ID, for the saved template
      // toName: New name, and ID, for the saved template
      return renameTemplate(sharedBucket, adminBucket, event.body)
    case 'setPassword':
      return setPassword(adminBucket, event.body)
    case 'getAvailableDomains':
      return getAvailableDomains(event.body)
    case 'setSiteDomain':
      return setSiteDomain(adminBucket, event.body)
    case 'captureLogs':
      return captureLogs(adminBucket, event.body)
    case 'checkCfDistroState':
      return checkCfDistroState(event.body)
    case 'deleteAllLogGroups':
      return deleteAllLogGroups(event.body)
    default:
      return {
        status: '404',
        statusDescription: `Unknown admin acion: ${event.command}`
      }
  }
}

/**  */
async function sleep(seconds) {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
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
    await aws.displayUpdate({ deploying: true, deployError: false, stepMsg: `Starting deploy ${deployId}` }, 'publish', 'Starting deploy...')
    await aws.mergeBuckets(testSiteBucket, '', siteBucket, '', {
        push: async event => {
          if (event.updated) { counts.updated++ }
          if (event.added) { counts.added++ }
          if (event.deleted) { counts.deleted++ }
          if (event.unchanged) { counts.unchanged++ }
        }
      })
  } catch (e) {
      const msg = `Deploy ${deployId} failed: ${e.message}`
      console.error(msg)
      await aws.displayUpdate({ deploying: false, deployError: true, stepMsg: msg }, 'publish', msg)
  } finally {
    const msg = `Deploy ${deployId} complete: Updated: ${counts.updated}, Added: ${counts.added}, Deleted: ${counts.deleted}, Unchanged: ${counts.unchanged}`
    console.log(msg)
    await aws.displayUpdate({ deploying: false, stepMsg: msg }, 'publish', msg)
  }
}

/** Reurn the access level for the template with the given name (so we know where to look for it) */
async function getLocationForTemplate(templateName, siteVersion) {
  try {
    const templates = await aws.getTemplates(publicBucket, sharedBucket, adminBucket, siteVersion)
    const templateProps = templates.find(p => p.id === templateName)
    if (templateProps) {
      return templateProps.access
    }
    return 'local'
  } catch (e) {
    console.log(`Unable to get templates metadata. Assume only public templates are available?`, e)
    return 'public'
  }
}

/** Return the AWS bucket name to use for this source location. */
function getSourceBucket(sourceLoc) {
  switch (sourceLoc) {
    case 'public': return publicBucket
    case 'shared': return sharedBucket
    case 'local': return adminBucket
    default: return adminBucket
  }
}

/** Copy default site template selected by the user from braevitae-pub to this site's bucket. */
async function applyTemplate(adminBucket, params) {
  let success = true
  const templateName = params.id
  try {
    await aws.displayUpdate({
        preparing: true, prepareError: false, stepMsg: 'Prepare'
      }, 'prepare', `Starting prepare with ${templateName} template.`)
    const sourceLoc = await getLocationForTemplate(templateName, version)
    const keyRoot = sourceLoc === 'public' ? 'AutoSite' + version : 'AutoSite'
    const sourceBucket = getSourceBucket(sourceLoc)
    console.log(`Copy site template '${templateName}' from ${sourceBucket} to ${adminBucket}`)
    // Copy template archive to local FS.
    const archiveFile = `/tmp/${templateName}.zip`
    const archive = await aws.get(sourceBucket, `${keyRoot}/site-config/${templateName}.zip`)
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
async function upateTemplate(adminBucket, params) {
  let success = true
  const fromTemplate = params.fromId
  const templateName = params.id
  try {
    await aws.displayUpdate({
        updatingTemplate: true, updateTemplateError: false, stepMsg: 'Update Template'
      }, 'update', `Starting update with ${fromTemplate} template.`)
    // Copy template archive to local FS.
    const sourceLoc = await getLocationForTemplate(fromTemplate, version)
    const keyRoot = sourceLoc === 'public' ? 'AutoSite' + version : 'AutoSite'
    const sourceBucket = getSourceBucket(sourceLoc)
    console.log(`Copy site template '${fromTemplate}' schema and style from ${sourceBucket} to ${adminBucket}`)
    const archiveFile = `/tmp/${fromTemplate}.zip`
    const archive = await aws.get(sourceBucket, `${keyRoot}/site-config/${fromTemplate}.zip`)
    Fs.writeFileSync(archiveFile, archive.Body)
    const zip = Fs.createReadStream(archiveFile).pipe(Unzipper.Parse({forceStream: true}));
    for await (const entry of zip) {
      if (entry.type === 'File') {
        if (/config\/schema/.test(entry.path)
          || /config\/templates/.test(entry.path)
          || /config\/custom-pages/.test(entry.path)
          || /config\/editors\.yaml/.test(entry.path)
          // This one config file is also non-editable.
          //       TODO: Should look in editors.yaml for data files with no schema, instead of hard-coding (this would also
          //       allow new non-editable data files to be added)
          || /config\/conf\/structure.json/.test(entry.path)
          // TODO: This process will not allow new editable data files to be added. Maybe we need to try to write all files, and
          // just prevent overwrite for certain paths.
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
    await aws.mergeToS3('/tmp/config/schema', adminBucket, rootPath + 'schema', maxAgeBrowser, maxAgeCloudFront, monitor)
    if (await Fs.exists('/tmp/config/templates')) {
      await aws.mergeToS3('/tmp/config/templates', adminBucket, rootPath + 'templates', maxAgeBrowser, maxAgeCloudFront, monitor)
    }
    if (await Fs.exists('/tmp/config/custom-pages')) {
      await aws.mergeToS3('/tmp/config/custom-pages', adminBucket, rootPath + 'custom-pages', maxAgeBrowser, maxAgeCloudFront, monitor)
    }
    await aws.put(adminBucket, rootPath + 'conf/structure.json', 'application/json', Fs.readFileSync('/tmp/config/conf/structure.json'), maxAgeBrowser, maxAgeCloudFront)
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
    console.log(`Failed update with ${fromTemplate} template.`, error)
    const errMsg = `Failed update of ${fromTemplate} template. Error: ${error.message}.`
    await aws.displayUpdate({ updatingTemplate: false, updateTemplateError: true, updateTemplateErrMsg: errMsg }, 'update', errMsg)
    success = false
  } finally {
    if (success) {
      console.log(`Successfull update of ${fromTemplate} template.`)
      await aws.displayUpdate({ updatingTemplate: false, updateTemplateError: false }, 'update', `Updated ${templateName} template.`)
    } else {
      console.log(`Failed update of ${fromTemplate} template.`)
      const errMsg = `Failed update ${fromTemplate} template.`
      await aws.displayUpdate({ updatingTemplate: false, updateTemplateError: true, updateTemplateErrMsg: errMsg }, 'update', errMsg)
    }
  }
  sleep(2) // Wait for 2s  ( seems like some S3 operations aren't completing properly?? )
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
      let pathSubRoot = pathParts.shift()
      if (pathParts.length === 0) {
        // This is a file, not another directory, don't filter the same way
        pathSubRoot = 'FILE'
      }
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
            case 'templates':
              await aws.put(adminBucket, `site-config/${templateName}/${filePath}`, null, body)
            break
            case 'custom-pages':
              await aws.put(adminBucket, `site-config/${templateName}/${filePath}`, null, body)
            break
            case 'FILE':
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
      const adminUiDir = await Unzipper.Open.s3(aws.getS3(),{ Bucket: publicBucket, Key: `AutoSite${version}/provision/adminui.zip` });
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
  const update = {
    cmd: 'saveTemplate',
    state: {
      saveTpl: true,
      tplError: false,
      tplErrMsg: ''
    },
    msg: `Start save template: ${params.name}`
  }
  await aws.displayUpdate2(update)

  // Local dirs
  const confDir = '/tmp/' + params.name + '/config'
  const contentDir = '/tmp/' + params.name + '/content'
  Files.ensurePath(confDir)
  Files.ensurePath(contentDir)

  // Pull all site config and content down to the local machine
  await aws.pull(adminBucket, `site-config/${params.id}/`, confDir)
  await aws.pull(adminUiBucket, `content/${params.id}/`, contentDir)

  // Compress the site data into an archive
  const archiveLocalPath = '/tmp/' + params.name + '.zip'
  await Zip.zip('/tmp/' + params.name, archiveLocalPath);

  // Put the archive back to an S3 bucket (Either local admin bucket, or shared bucket if it exists)
  const bucketPath = 'AutoSite/site-config/' + params.name + '.zip'
  let success = false
  let nameExists = false
  let shared = false
  if (await aws.bucketExists(sharedBucket)) {
    shared = true
    let exist = false
    try {
      if (await aws.get(sharedBucket, bucketPath)) {
        exist = true
      }
    } catch (e) {
      // Ignore
    }
    if ( ! exist) {
      console.log(`Save bundle to shared bucket: ${sharedBucket}:${bucketPath}`)
      await aws.put(sharedBucket, bucketPath, null, Fs.readFileSync(archiveLocalPath))
      success = true
    } else {
      nameExists = true
    }
  } else {
    let exist = false
    try {
      if (await aws.get(adminBucket, bucketPath)) {
        exist = true
      }
    } catch (e) {
      // Ignore
    }
    if ( ! exist) {
      console.log(`Save bundle to admin bucket: ${adminBucket}:${bucketPath}`)
      await aws.put(adminBucket, bucketPath, null, Fs.readFileSync(archiveLocalPath))
      success = true
    } else {
      nameExists = true
    }
  }
  if (nameExists && ( ! params.overwrite)) {
    // Put error into display state
    update.state.saveTpl = false
    update.state.tplError = true
    update.state.tplErrMsg = `Template ${params.name} already exists.`
    update.msg = `Skip save template. Name ${params.name} already exists`
    await aws.displayUpdate2(update)
  }
  if (success) {
    try {
      const template = {
        //id: params.id,  // Keep Name and ID the same for now, since ID is how the templates are found in the list.
        id: params.name,
        name: params.name,
        access: shared ? 'shared' : 'private',
        description: params.desc
      }
      if (shared) {
        console.log(`Add template to the shared bucket metadata`)
        const metadataStr = (await aws.get(sharedBucket, 'AutoSite/site-config/metadata.json')).Body.toString()
        const metadata = JSON.parse(metadataStr)
        metadata.push(template)
        await aws.put(sharedBucket,  'AutoSite/site-config/metadata.json', 'applicaton/json', JSON.stringify(metadata), 0, 0)
      } else {
        console.log(`Add template to the private bucket metadata`)
        const metadataStr = (await aws.get(adminBucket, 'AutoSite/site-config/metadata.json')).Body.toString()
        const metadata = JSON.parse(metadataStr)
        metadata.push(template)
        await aws.put(adminBucket,  'AutoSite/site-config/metadata.json', 'applicaton/json', JSON.stringify(metadata), 0, 0)
      }
      console.log(`Signal Add template complete`)
      update.state.saveTpl = false
      update.msg = `Saved new template: ${params.name}`
      await aws.displayUpdate2(update)
    } catch (e) {
      update.state.saveTpl = false
      update.state.tplError = true
      update.state.tplErrMsg = `Failed to update templates list. ${e.message}`
      update.msg = update.tplErrMsg
      await aws.displayUpdate2(update)
    }
  }
}

/** Remove the template with the given name from the site's data. */
async function deleteTemplate(sharedBucket, adminBucket, params) {
  const update = {
    cmd: 'deleteTemplate',
    state: {
      delTpl: true,
      tplError: false,
      tplErrMsg: ''
    },
    msg: `Start delete template: ${params.name}`
  }
  await aws.displayUpdate2(update)
  const confDir = '/tmp/' + params.name + '/config'
  Files.ensurePath(confDir)
  try {
    let bucket = adminBucket
    if (await aws.bucketExists(sharedBucket)) {
      bucket = sharedBucket
    }
    console.log(`Remove template data from ${bucket} bucket`)
    await aws.delete(bucket, 'AutoSite/site-config/' + params.name + '.zip')
    console.log(`Remove template from ${bucket} bucket metadata`)
    const metadataStr = (await aws.get(bucket, 'AutoSite/site-config/metadata.json')).Body.toString()
    let metadata = JSON.parse(metadataStr)
    metadata = metadata.filter(p => p.id !== params.name)
    await aws.put(bucket, 'AutoSite/site-config/metadata.json', 'applicaton/json', JSON.stringify(metadata), 0, 0)
    update.state.delTpl = false
    update.msg = `Deleted template ${params.name}`
    await aws.displayUpdate2(update)
  } catch (e) {
    update.state.delTpl = false
    update.state.tplError = true
    update.state.tplErrMsg = `Failed to delete template ${params.name}. ${e.message}`
    update.msg = update.tplErrMsg
    await aws.displayUpdate2(update)
  }
}

/** Rename the template with the given bame from the site's data. */
async function renameTemplate(sharedBucket, adminBucket, params) {
  const update = {
    cmd: 'renameTemplate',
    state: {
      renTpl: true,
      tplError: false,
      tplErrMsg: ''
    },
    msg: `Start rename template: ${params.name}`
  }
  await aws.displayUpdate2(update)
  const confDir = '/tmp/' + params.name + '/config'
  Files.ensurePath(confDir)
  try {
    let bucket = adminBucket
    if (await aws.bucketExists(sharedBucket)) {
      bucket = sharedBucket
    }
    console.log(`Rename template data in ${bucket} bucket from ${params.name} to ${params.toName}`)
    await aws.rename(bucket, 'AutoSite/site-config/' + params.name + '.zip', 'AutoSite/site-config/' + params.toName + '.zip')
    console.log(`Rename template in ${bucket} bucket from ${params.name} to ${params.toName} in metadata`)
    const metadataStr = (await aws.get(bucket, 'AutoSite/site-config/metadata.json')).Body.toString()
    const metadata = JSON.parse(metadataStr)
    const template = metadata.find(p => p.id === params.name)
    template.id = params.toName
    template.name = params.toName
    await aws.put(bucket,  'AutoSite/site-config/metadata.json', 'applicaton/json', JSON.stringify(metadata), 0, 0)
    update.state.renTpl = false
    update.msg = `Renamed template ${params.name} to ${params.toName}`
    await aws.displayUpdate2(update)
  } catch (e) {
    update.state.renTpl = false
    update.state.tplError = true
    update.state.tplErrMsg = `Failed to rename template from ${params.name} to ${params.toName}. ${e.message}`
    update.msg = update.tplErrMsg
    await aws.displayUpdate2(update)
  }
}

/** */
async function setPassword(adminBucket, params) {
  try {
    await aws.displayUpdate({ settingPwd: true, setPwdError: false, setPwdErrMsg: '' }, 'changePassword', `Start change password`)
    const metadataStr = (await aws.get(adminBucket, 'admin_secret')).Body
    const metadata = JSON.parse(metadataStr.toString())
    metadata.password = params.newPassword
    await aws.put(adminBucket, 'admin_secret', null, JSON.stringify(metadata))
    await aws.displayUpdate({ settingPwd: false, setPwdError: false, setPwdErrMsg: '' }, 'changePassword', `End change password. Success.`)
  } catch (e) {
    console.log(`Failed to set new password.`, e)
    await aws.displayUpdate({ settingPwd: false, setPwdError: true, setPwdErrMsg: `Failed to change password ${e.message}` }, 'changePassword', `End change password. Failed: ${e.message}`)
  }
}

/** Return a list of all domains names that are not currently in use, and that match the domain/test.domain pattern required for administered
   sites. Using available certificates as a proxy for available domain names (later steps may need to create R53 records to support
   the routing to CloudFront for the custom domain).
 */
async function getAvailableDomains(_params) {
  try {
    await aws.displayUpdate({ getDomains: true, getDomError: false, getDomErrMsg: '' }, 'getDomains', `Start get available domains`)
    const validDomains = []
    const allFreeCerts = await aws.listCertificates()
    allFreeCerts.map(cert => {
      // Pair each cert with its test cert (all valid domains will come in domain and test pairs.)
      const testCert = allFreeCerts.find(p => p.domain === ('test.' + cert.domain))
      if (testCert) {
        validDomains.push({
          domain: cert.domain,
          testDomain: testCert.domain,
          arn: cert.arn,
          testArn: testCert.arn
        })
      }
    })
    // Send event to update admin state
    aws.updateAvailableDomains(validDomains)
    await aws.displayUpdate({ getDomains: false, getDomError: false, getDomErrMsg: '' }, 'getDomains', `End get available domains`)
    return {
      status: '200',
      statusDescription: `Found ${validDomains.length} domains.`
    }
  } catch (e) {
    console.log(`Failed to get available domains.`, e)
    await aws.displayUpdate({ getDomains: false, getDomError: true, getDomErrMsg: `Failed to get domains ${e.message}` }, 'getDomains', `End get available domains. Failed: ${e.message}`)
    return {
      status: '500',
      statusDescription: `Unable to get list of valid domains. ${e.message}. Please check logs.`
    }
  }
}

/**
  domains: Existing domains (object from adminState.domains)
  newDomain: Selected domain (from adminState.availableDomains)
*/
async function setSiteDomain(adminBucket, params) {
  try {
    if (params.newDomain) {
      // Change to or add a custom domain
      const hostedZoneId = await getHostedZoneId(params.newDomain.domain)
      await aws.displayUpdate({ setDomain: true, setDomError: false, setDomErrMsg: '' }, 'setDomain', `Start set/update custom domain for ${hostedZoneId} to ${params.domain}`)
      await upsertCustomDomain(hostedZoneId, params.domains, params.newDomain)
      await aws.updateSiteDomain(params.newDomain)
      await aws.displayUpdate({ cfDistUpdating: true }, 'setDomain', 'Force to true since we know CF will be updating')
    } else {
      // remove the custom domain (Site will only be accessable via the base CloudFront domain)
      const hostedZoneId = await getHostedZoneId(params.domains.current)
      await aws.displayUpdate({ setDomain: true, setDomError: false, setDomErrMsg: '' }, 'setDomain', `Start remove custom domain for ${hostedZoneId}`)
      try {
        await removeCustomDomain(hostedZoneId, params.domains)
      } finally {
        // Always update to the base domain if there's a failure - more likely the site will keep working, and user can try again.
        await aws.updateSiteDomain({ domain: params.domains.base, testDomain: params.domains.baseTest })
        await aws.displayUpdate({ cfDistUpdating: true }, 'setDomain', 'Force to true since we know CF will be updating')
      }
    }
    await aws.displayUpdate({ setDomain: false, setDomError: false, setDomErrMsg: '' }, 'setDomain', `End set domain`)
  } catch (e) {
    console.log(`Failed to set domain: ${JSON.stringify(e)}`, e)
    await aws.displayUpdate({ setDomain: false, setDomError: true, setDomErrMsg: `Failed to set domain ${e.message}` }, 'setDomain', `End set domain. Failed: ${e.message}`)
  }
}

/** */
async function upsertCustomDomain(hostedZoneId, domains, newDomain) {
  // Add/Update R53 domain records for main and test domain
  await execR53Changes(hostedZoneId, [createUpsertChange(newDomain.domain, domains.base, 'A')])
  await execR53Changes(hostedZoneId, [createUpsertChange('www.' + newDomain.domain, domains.base, 'A')])
  await execR53Changes(hostedZoneId, [createUpsertChange(newDomain.domain, domains.base, 'AAAA')])
  await execR53Changes(hostedZoneId, [createUpsertChange('www.' + newDomain.domain, domains.base, 'AAAA')])
  await execR53Changes(hostedZoneId, [createUpsertChange(newDomain.testDomain, domains.baseTest, 'A')])
  await execR53Changes(hostedZoneId, [createUpsertChange('www.' + newDomain.testDomain, domains.baseTest, 'A')])
  await execR53Changes(hostedZoneId, [createUpsertChange(newDomain.testDomain, domains.baseTest, 'AAAA')])
  await execR53Changes(hostedZoneId, [createUpsertChange('www.' + newDomain.testDomain, domains.baseTest, 'AAAA')])
  // Update CF Ditros domain aliases and certificates.
  await updateDistributionDomain(domains.dist, newDomain.domain, newDomain.arn)
  await updateDistributionDomain(domains.distTest, newDomain.testDomain, newDomain.testArn)
}

/** Replace the existing domain cert and aliases with the given values.
    Does NOT handle these aliases being in-use by another CF distribution, so aliases will need to be cleared
    first before this call.
*/
async function updateDistributionDomain(cfDistId, domain, certArn) {
  const resp = await aws.cf.getDistributionConfig({ Id: cfDistId }).promise()
  //console.log('CF Config:', resp)
  resp.DistributionConfig.Aliases.Quantity = 2
  resp.DistributionConfig.Aliases.Items = [domain, 'www.' + domain]
  resp.DistributionConfig.ViewerCertificate.CloudFrontDefaultCertificate = false
  resp.DistributionConfig.ViewerCertificate.ACMCertificateArn = certArn
  // AWS Sets Legacy Client Support (SSLSupportMethod === 'vip') when using the CloudFront default certificate, but does
  // not set it back to sni-only when a custome cert is added, so we need to ensure it's set back manually.
  resp.DistributionConfig.ViewerCertificate.SSLSupportMethod = 'sni-only'
  //
  resp.IfMatch = resp.ETag
  delete resp.ETag
  //
  resp.Id = cfDistId
  await aws.cf.updateDistribution(resp).promise()
}

/** */
async function removeCustomDomain(hostedZoneId, domains) {
  // Remove any R53 domain records for main and test domain
  if (hostedZoneId) {
    await execR53Changes(hostedZoneId, [createDeleteChange(domains.current, domains.base, 'A')])
    await execR53Changes(hostedZoneId, [createDeleteChange('www.' + domains.current, domains.base, 'A')])
    await execR53Changes(hostedZoneId, [createDeleteChange(domains.current, domains.base, 'AAAA')])
    await execR53Changes(hostedZoneId, [createDeleteChange('www.' + domains.current, domains.base, 'AAAA')])
    await execR53Changes(hostedZoneId, [createDeleteChange(domains.currentTest, domains.baseTest, 'A')])
    await execR53Changes(hostedZoneId, [createDeleteChange('www.' + domains.currentTest, domains.baseTest, 'A')])
    await execR53Changes(hostedZoneId, [createDeleteChange(domains.currentTest, domains.baseTest, 'AAAA')])
    await execR53Changes(hostedZoneId, [createDeleteChange('www.' + domains.currentTest, domains.baseTest, 'AAAA')])
  }
  // Remove alt domain names and custom cert from old CF.
  await clearDistributionDomain(domains.dist)
  await clearDistributionDomain(domains.distTest)
}

/** Remove any existing domain cert and aliases. */
async function clearDistributionDomain(cfDistId) {
  const resp = await aws.cf.getDistributionConfig({ Id: cfDistId }).promise()
  //console.log('CF Config:', resp)
  resp.DistributionConfig.Aliases.Quantity = 0
  resp.DistributionConfig.Aliases.Items = []
  resp.DistributionConfig.ViewerCertificate.CloudFrontDefaultCertificate = true
  resp.DistributionConfig.ViewerCertificate.ACMCertificateArn = null
  //
  resp.IfMatch = resp.ETag
  delete resp.ETag
  //
  resp.Id = cfDistId
  await aws.cf.updateDistribution(resp).promise()
}

/** */
async function execR53Changes(hostedZoneId, changes) {
  try {
    const param = {
      ChangeBatch: {
        Changes: changes,
        Comment: 'Remove custom domain'
      },
      HostedZoneId: hostedZoneId
    }
    await aws.r53.changeResourceRecordSets(param).promise()
  } catch (e) {
    if (e.message.indexOf('not found') !== -1) {
      console.log(`Domain to remove not found. Likely already removed by a previous operation. ${e.message}`)
    } else if (e.message.indexOf('values provided do not match the current values')) {
      console.log(`Domain to remove does not match expected config. Will likely be resolved by other updates, but may require manual change via AWS console. ${e.message}`)
    } else {
      throw e
    }
  }
}

/** Create a change to upsert a new record into R53. */
function createUpsertChange(domain, cfDomain, type) {
  return {
    Action: "UPSERT",
    ResourceRecordSet: {
      Name: domain,
      AliasTarget: {
        DNSName: cfDomain,
        EvaluateTargetHealth: false,
        HostedZoneId: "Z2FDTNDATAQYW2"
      },
      Type: type
    }
  }
}

/** Create a change record to delete an existing record from R53. */
function createDeleteChange(domain, cfDomain, type) {
  return {
    Action: "DELETE",
    ResourceRecordSet: {
      Name: domain,
      AliasTarget: {
        DNSName: cfDomain,
        EvaluateTargetHealth: false,
        HostedZoneId: "Z2FDTNDATAQYW2"
      },
      Type: type
    }
  }
}

/** Find the AWS hosted zone ID for this domain, or this domain's parent domain, if no zone
    exists. Return null if neither this domain or the parent domain can be found.
*/
async function getHostedZoneId(domainName) {
  const zones = await aws.r53.listHostedZones({}).promise()
  // Exact match
  let zone = zones.HostedZones.find(p => p.Name === (domainName + '.'))
  if (zone) return zone.Id.replace('/hostedzone/', '')
  // root domain match
  const rootDomainName = domainName.split('.').slice(1).join('.')
  zone = zones.HostedZones.find(p => p.Name === (rootDomainName + '.'))
  if (zone) return zone.Id.replace('/hostedzone/', '')
  return null
}

/** Get all log events, from all AutoSite related streams (for this site), for the requested time range. */
async function captureLogs(adminBucket, options) {
  try {
    await aws.displayUpdate({ getLogs: true, getLogsError: false, getLogsErrMsg: '' }, 'getLogs', `Start getLogs for the last ${options.durationH} hours.`)
    const siteName = truncateAtLastSeparator(adminBucket, '-')
    const logGroups = LogGroupsTemplate.map(tpl => {
      return {
        groupName: tpl.groupName.replace('@SITE_NAME@', siteName),
        name: tpl.name,
        edge: tpl.edge
      }
    })
    console.log('Log Groups: ' + JSON.stringify(logGroups))
    const endTs = Date.now()
    const startTs = endTs - (options.durationH * HoursToMs)
    // Get all events for this site's groups within this timerange from AWS CloudWatch
    const groupedMessages = await Promise.all(logGroups.map(async group => {
      const streamsRaw = await aws.getLogStreams(group.groupName, group.edge)
      const streamsInRange = streamsRaw.filter(group => {
        return (group.lastEventTs > startTs) && (group.firstEventTs < endTs)
      })
      console.log(`Got ${streamsInRange.length} log streams in range for group: ${group.groupName}, region: ${group.edge ? options.edgeRegion : process.env['AWS_REGION']}`)
      return {
        group: group.name,
        streams: await Promise.all(streamsInRange.map(async stream => {
           return await aws.getLogEvents(group.groupName, group.edge, stream.name, startTs, endTs)
        }))
      }
    }))
    await aws.displayUpdate({ getLogs: false, getLogsError: false, getLogsErrMsg: '' }, 'getLogs', 'Got AWS logs. Saving to Site storage.')
    // Collate all event arrays in groupedMessages, with group name
    const events = []
    groupedMessages.forEach(group => {
      group.streams.forEach(stream => {
        stream.forEach(event => {
          events.push({
            group: group.group,
            timestamp: event.timestamp,
            message: event.message
          })
        })
      })
    })
    // Sort all events in timestamp order
    events.sort((a, b) => a.timestamp - b.timestamp)
    //
    const eventMsgs = []
    events.forEach(event => {
      if ( ! isLambdaFramingLogMessage(event.message)) {
        const displayTs = new Date(event.timestamp).toISOString()
        eventMsgs.push(displayTs + ' ' + event.group.padEnd(MaxGroupNameLength, ' ') + ' ' + event.message)
      }
    })
    const endTsFmt = new Date(endTs).toISOString()
    const logFileName = 'logs/log-' + Uuid.v1() + '_' + endTsFmt + '.log'
    console.log(`Write ${eventMsgs.length} events to ${logFileName}`)
    await aws.put(adminUiBucket, logFileName, 'application/octet-stream', eventMsgs.join('\n'), 0, 0)
    await aws.displayUpdate({ getLogs: false, getLogsError: false, getLogsErrMsg: '' }, 'getLogs', 'AWS Logs ready for download.')
  } catch (e) {
    console.log(`Error in captureLogs:`, e)
    await aws.displayUpdate({ getLogs: false, getLogsError: true, getLogsErrMsg: `Failed to get AWS logs: ${e.message}` }, 'getLogs', 'Error: Failed to get AWS Logs.')
  }
}

/** Detect AWS Lambda framing messages
  Example:
  024-01-06T08:56:13.686Z Admin Edge           START RequestId: 28da71e6-a9f6-4778-9315-c47332f94a8e Version: 4
  2024-01-06T08:56:14.060Z Admin Edge           END RequestId: 28da71e6-a9f6-4778-9315-c47332f94a8e
  2024-01-06T08:56:14.060Z Admin Edge           REPORT RequestId: 28da71e6-a9f6-4778-9315-c47332f94a8e	Duration:
*/
function isLambdaFramingLogMessage(message) {
  if (message.indexOf('RequestId:') !== -1) {
    if (message.indexOf('START RequestId:') === 0
      || message.indexOf('END RequestId:') === 0
      || message.indexOf('REPORT RequestId:') === 0)
    {
      return true
    }
  }
  return false
}

/**
  Get the current state of all this site's distributions. If any are not in 'deployed' state,
  set the 'cfDistUpdating' flag in display properties to true. Otherwise, set it to false.
  Params:
    domain: {
      main: CF base domain for the main distro.
      test: CF base domain for the test distro.
    }
*/
async function checkCfDistroState(params) {
  try {
    const resp = await aws.cf.listDistributions().promise()
    //console.log(`CF domains state:`, resp.DistributionList.Items)
    let updating = false
    resp.DistributionList.Items.forEach(dist => {
      //console.log(`Domain: ${dist.DomainName} Status: ${dist.Status}`)
      if (dist.Status !== 'Deployed') {
        //console.log(`Domains:`, stateCache.state.domains)
        if (params.domains.main === dist.DomainName || params.domains.test === dist.DomainName) {
          updating = true
        }
      }
    })
    console.log(`CF Distros Updating: ` + updating)
    await aws.displayUpdate({ cfDistUpdating: updating }, 'checkCfDistroState', 'Got distros status.')
  } catch (e) {
    console.log('Failed to get CF update state.', e)
  }
}

/** Get all log events, from all AutoSite related streams (for this site), for the requested time range. */
async function deleteAllLogGroups(options) {
  try {
    const logGroups = LogGroupsTemplate.map(tpl => {
      return {
        name: tpl.groupName.replace('@SITE_NAME@', options.siteName),
      }
    })
    //console.log('Log Groups to delete: ' + JSON.stringify(logGroups))
    // Get all possible AWS regions
    const account = new sdk.Account();
    const regionsRet = await account.listRegions({ RegionOptStatusContains: ["ENABLED", "ENABLED_BY_DEFAULT"] }).promise()
    //console.log(`got all regions: `, regionsRet)
    await Promise.all(regionsRet.Regions.map(async region => {
      // Delete all matching log groups
      console.log(`Delete logs for region: ${region.RegionName}`)
      const cloudWatch = new sdk.CloudWatchLogs({ region: region.RegionName })
      await Promise.all(logGroups.map(async group => {
        try {
          await cloudWatch.deleteLogGroup({ logGroupName: group.name }).promise()
          console.log(`Deleted ${group.name} from ${region.RegionName}`)
        } catch (e) {
          // Ignore
          //console.log(`Failed delete of ${group.name} from ${region.RegionName}`, e)
        }
      }))
    }))
  } catch (e) {
    console.log(`Error in delete log groups:`, e)
  }
}

// Slice off the last 'part' of the given string as split by the provided separator string. Ignores any other
// instances of the separator string.
function truncateAtLastSeparator(source, sep) {
  const lastIndex = source.lastIndexOf(sep);
  return source.slice(0, lastIndex);
}