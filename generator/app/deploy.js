require('dotenv').config()

const Path = require('path');
const Files = require('./files');
const { S3 } = require('@aws-sdk/client-s3');
const S3Sync = require('s3-sync-client')
const { TransferMonitor } = require('s3-sync-client');
const mime = require('mime');

/** */
const main = async function(optionsStr) {
    const defaultOptions = {
        dryRun: false,
        force: undefined,
        testSite: false,
        subPath: null  // Deploy this subset only (to the same relative paths)
    }

    // Load command line options
    let options = defaultOptions;
    if (optionsStr) {
      const loaded = JSON.parse(optionsStr);
      options = Object.assign(options, loaded);
    }

    // load app config and Env. vars that control app state.
    const appConfig = await Files.loadYaml("conf.yaml")
    const configName = process.env.npm_config_authorsite_site
    let confDir = appConfig.configPath
    let outputDir = appConfig.outputPath
    if (configName) {
      confDir = Path.join(confDir, configName)
      outputDir = Path.join(outputDir, configName)
    }
    if (options.subPath) {
        let subDir = appConfig.outputPath
        if (configName) {
            subDir = Path.join(subDir, configName)
        }
        outputDir = Path.join(subDir, options.subPath)
    }

    console.log(`Deploy ${configName}. Options = ${JSON.stringify(options)}`)

    const credentials = await Files.loadJson(Path.join(appConfig.configPath, '/credentials.json'))
    return await exports.deploy(confDir, outputDir, credentials, options);
}

/**  */
exports.deploy = async (confDir, outputDir, credentials, options) => {
    const startTs = Date.now()
    const config = await Files.loadJson(Path.join(confDir, 'conf.json'));
    if ( ! credentials) {
        throw new Error("Missing conf/credentials.json file")
    }

    let deployConfig = null
    if (options.testSite) {
        deployConfig = config.deployTest
    } else {
        deployConfig = config.deploy
    }

    let bucketPath = deployConfig.bucket
    if (options.subPath) {
        bucketPath += '/' + options.subPath
    }
    console.log(`Start sync from ${outputDir} to ${bucketPath}`)

    const creds = credentials.awsIams[deployConfig.user];
    const maxAgeBrowser = 60 * 60 * 24
    const maxAgeCloudFront = 60

    const s3Client = new S3({
        region: config.deploy.region,
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey
    })
    const s3SyncClient = new S3Sync({ client: s3Client })

    const monitor = new TransferMonitor();
    let prevP = null
    monitor.on('progress', p => {
        if (prevP && prevP.count.current !== p.count.current) {
            console.log(`Transferring file ${p.count.current} of ${p.count.total}`)
        }
        prevP = p
    });

    try {
        const syncConfig = {
            monitor: monitor,
            dryRun: options.dryRun,
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
        await s3SyncClient.sync(outputDir, 's3://' + bucketPath, syncConfig);
    } catch (e) {
        console.error(`Website sync failed: ${JSON.stringify(e)}`)
    }

    let dur = Date.now() - startTs
    console.log(`Deploy of ${outputDir} complete in ${dur / 1000}s`)
}

// Entrypoint
main(...process.argv.slice(2))
