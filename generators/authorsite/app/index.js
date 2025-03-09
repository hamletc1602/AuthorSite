'use strict'

const Handlebars = require('handlebars')
const Files = require('./files')
const AwsUtils = require('./awsUtils')
const Style = require('./style')
const Image = require('./image')
const Path = require('path')
const Webpack = require("webpack")

const defaultOptions = {
  buildId: Date.now(),
  types: 'desktop,mobile'
}
const memCache = {}

// Template processing helpers

Handlebars.registerHelper('breaklines', (text) => {
    text = Handlebars.Utils.escapeExpression(text);
    text = text.replace(/(\r\n|\n|\r)/gm, '<br>');
    return new Handlebars.SafeString(text);
});

Handlebars.registerHelper('noescape', (text) => {
    return new Handlebars.SafeString(text);
});

Handlebars.registerHelper('urlEncode', (text) => {
  return encodeURIComponent(text);
});

Handlebars.registerHelper("equal", function(value1, value2, options) {
  if (value1 === value2) {
    return options.fn(this);
  } else {
    return options.inverse(this);
  }
});

Handlebars.registerHelper('versionUrl', (options) => {
    let ret = options.fn(this);
    let sepChar = '?'
    if (ret.indexOf('?') > -1) {
      sepChar = "&"
    }
    // TODO:
    // Will need to put the output path as a root on this URL, which is partialy defined in
    // config file - Can I pass that in??
    // Also - Will need to make sure all output files (images, css, script) are pushed to the output dirs
    // _before_ the rest of the HTML template processing, so this helper can find the file content to
    // hash in the right directory.
    return new Handlebars.SafeString(ret + sepChar + Files.getMd5ForFile(ret))
})

/** Main Entry Point */
const handler = async (event, context) => {
  console.log('Event: ' + JSON.stringify(event))
  const startTs = Date.now()
  let options = {}
  let Aws = {
    // Mock function in case we're not running in AWS Lambda
    displayUpdate: function(params, msg) {
      console.log(JSON.stringify(params) + ' ' + msg)
    },
    push: function(sourceDir, bucket, keyPrefix) {
      console.log(`Push ${sourceDir} to S3 ${bucket}/${keyPrefix}*`)
    }
  }

  //
  try {
    // Mem Cache warmup
    if (memCache.init) {
      console.log("Warm cache")
    } else {
      console.log("Cold cache")
      memCache.init = true
    }

    // Load options from Environment
    addEnv(options, 'types')
    addEnv(options, 'adminBucket')
    addEnv(options, 'adminUiBucket')
    addEnv(options, 'stateQueueUrl')
    addEnv(options, 'testSiteBucket')
    addEnv(options, 'domainName')
    options = Object.assign(defaultOptions, options)

    // load app config and Env. vars that control app state.
    let appConfig = null
    if (context) {
      appConfig = await Files.loadYaml("conf.aws.yaml")
    } else {
      appConfig = await Files.loadYaml("conf.local.yaml")
    }
    let configName = null
    let configDebug = null
    if (context) {
      configName = event.tpl
      configDebug = event.debug
    } else {
      configName = process.env.npm_config_authorsite_site
      configDebug = process.env.npm_config_authorsite_debug
    }

    console.log(`Loading and processing configuration data for ${configName}. BuildId: ${options.buildId}`)

    let year = new Date().getFullYear()
    let confDir = appConfig.configPath
    let contentDir = appConfig.contentPath
    let cacheDir = appConfig.cachePath
    let tempDir = appConfig.tempPath
    if (configName) {
      confDir = confDir.replace('${site}', configName)
      contentDir = contentDir.replace('${site}', configName)
      cacheDir = cacheDir.replace('${site}', configName)
      tempDir = tempDir.replace('${site}', configName)
    }
    Files.ensurePath(confDir)
    Files.ensurePath(tempDir)
    Files.ensurePath(cacheDir)

    // When in AWS, will need to copy all site template files from S3 to the local disk before build
    if (context) {
      try {
        const sdk = require('aws-sdk')
        Aws = new AwsUtils({
          files: Files,
          s3: new sdk.S3(),
          sqs: new sdk.SQS(),
          stateQueueUrl: options.stateQueueUrl
        })
        await displayUpdate(Aws, { building: true, buildError: false, stepMsg: 'Generating' }, `Build ${options.buildId} started`)
        await Aws.pull(options.adminBucket, `site-config/${configName}/`, confDir)
        await Aws.pull(options.adminUiBucket, `content/${configName}/`, contentDir)
        await Aws.pull(options.adminBucket, `cache/${configName}/`, cacheDir)
        await displayUpdate(Aws, {}, `Merged all source files`)
      } catch (e) {
        console.error(`Pull of config failed: ${e.message}`, e)
        throw new Error(`Pull of config failed: ${e.message}`, e)
      }

      // Ensure we update the admin state on any unhandled rejections
      process.on('unhandledRejection', async error => {
        const errMsg = `Website build ${options.buildId} failed.`
        await displayUpdate(Aws, { building: false, buildError: true, stepMsg: 'Generating', buildErrMsg: errMsg }, errMsg)
        console.log(`Unhandled promise rejection that escaped the main try/catch wrapper, somehow?`, error)
      });
    }

    //
    Files.ensurePath(Path.join(cacheDir, 'headers'))

    // Load conf index, convert to map
    let confIndex = {}
    {
      const indexList = await Files.loadYaml(confDir + '/editors.yaml')
      confIndex = indexList.reduce((accum, item) => {
        accum[item.id] = item
        return accum
      }, {})
    }

    // Load all data
    const initConfig = { build: options.buildId, yyyy: year }
    let config = await Files.loadConfig(Path.join(confDir, confIndex.general.data), initConfig)
    //    Process general conf. one more time, with site-name added to the initial config, so we cna use siteName in the same file where it's defined.
    initConfig.siteName = config.siteName
    config = await Files.loadConfig(Path.join(confDir, confIndex.general.data), initConfig)
    config.hostName = options.domainName
    config._tempDir = tempDir
    const data = {
      config: config,
      structure: await Files.loadConfig(Path.join(confDir, confIndex.structure.data), config),
      style: await Files.loadConfig(confDir + '/' + confIndex.style.data, config),
      published: await Files.loadConfig(confDir + '/' + confIndex.books.data, config),
      social: await Files.loadConfig(confDir + '/' + confIndex.social.data, config),
      authors: await Files.loadConfig(confDir + '/' + confIndex.authors.data, config),
      series: await Files.loadConfig(confDir + '/' + confIndex.series.data, config),
      news: await Files.loadConfig(confDir + '/' + confIndex.news.data, config),
      distributors: await Files.loadConfig(confDir + '/' + confIndex.distributors.data, config)
    }

    // Various small config enhancements
    {
      // Added 'skin' config adjustments
      const skin = data.style
      skin._imageFileNameRoot = Path.basename(skin.background, Path.extname(skin.background))
      // Shift paths vars up to root of structure config where the code expects them.
      Object.assign(data.structure, data.structure.paths)
      // Ensure all logo sizes are defined, borrowing oher logo sizes if needed.
      fillInMissingLogoEntries(data.style.logo)
      // Add flags to adjust page rendering based on the number of books available
      config._useBookLists = data.published.length >= Number(config.minBooksForList)
      config._useBookCategories = data.published.length >= Number(config.minBooksForCategories)
    }

    // Load all schema
    const schema = {
      config: await Files.loadConfig(Path.join(confDir, confIndex.general.schema)),
      style: await Files.loadConfig(Path.join(confDir, confIndex.style.schema)),
      published: await Files.loadConfig(Path.join(confDir, confIndex.books.schema)),
      social: await Files.loadConfig(Path.join(confDir, confIndex.social.schema)),
      authors: await Files.loadConfig(Path.join(confDir, confIndex.authors.schema)),
      series: await Files.loadConfig(Path.join(confDir, confIndex.series.schema)),
      news: await Files.loadConfig(Path.join(confDir, confIndex.news.schema)),
      distributors: await Files.loadConfig(Path.join(confDir, confIndex.distributors.schema))
    }

    // Remove properties that refer to files that don't exist, to prevent further builder code from attempting to
    // load them and failing at an awkward spot.
    const clearMissingFilesWorker  = async (value, schema, _config, parent, key) => {
      if (schema.type === 'image' || schema.type === 'file' || schema.type === 'text') {
        //console.log(`Check existence of File ${Path.join(contentDir, value)} for prop ${key}.`)
        if (value && ! Files.exists(Path.join(contentDir, value))) {
          console.log(`File ${value} for prop ${key} not found. Clearing property value for this run.`)
          parent[key] = null
        }
      }
    }

    // Remove properties that are empty strings
    const clearMissingValuesWorker  = async (value, _schema, _config, parent, key) => {
      //console.log(`Checking: ${key}: ${value}`)
      if (value === '') {
        console.log(`Prop for ${key} is an empty string. Clearing property value for this run.`)
        parent[key] = null
      }
    }

    // Load real content for any 'text' type elements and replace the file path
    const resolveFileRefsWorker= async (schema, value, parent, key) => {
      // Replace key value with external text content (possibly also rendered from a template)
      if (typeof value === 'string' || value instanceof String) {
        parent[key] = await Files.loadLargeData(schema.textType || 'markdown', Path.join(contentDir, value), { props: parent, config: data.config });
      } else {
        console.warn(`Text type value is not string. Value: ${JSON.stringify(value)}`)
      }
    }

    // Appy data manipulations to all configuration objects
    for (const key in data) {
      const d = data[key]
      const s = schema[key]
      if (s) {
        await visitProperties(d, s, config, clearMissingFilesWorker)
        await visitProperties(d, s, config, clearMissingValuesWorker)
        await resolveFileRefs(d, s, config, resolveFileRefsWorker)
        await resolveGeneratorPaths(d, s, config)
        await ensureProtocolOnUrls(d, s, config)
      }
    }

    // Force debug to true in config if it's supplied at runtime
    if (options.debug || configDebug == 'true') {
      config.debug = true
    }

    // Generate site for each output type ( ie. desktop and mobile, usually )
    for (let type of options.types.split(",")) {
      type = type.trim()
      const outputDir = Path.join(tempDir, 'site', type)
      // Clean any old files
      cleanDirs(tempDir)
      Files.createOutputDirs([tempDir, outputDir]);

      // Publish any content marked as 'publish' to the site output dir
      const pubContentWorker = async (value, pubDir) => {
        let filePath = null
        if (pubDir) {
          const parts = value.split('/')
          const fileName = parts[parts.length - 1]
          filePath = Path.join(outputDir, pubDir, fileName)
        } else {
          filePath = Path.join(outputDir, value)
        }
        Files.ensurePath(filePath)
        await Files.copy(Path.join(contentDir, value), filePath)
      }

      // Appy data manipulations that require the output path to all configuration objects
      for (const key in data) {
        const d = data[key]
        const s = schema[key]
        if (s) {
          await publishContent(d, s, config, pubContentWorker)
        }
      }

      // Deep Copy all source data so any manipulations in one build type don't impact the next
      const dataCopy = JSON.parse(JSON.stringify(data))
      // Merge core configuration files (Separate files make editing config easier, but this builder expects them as one)
      const mergedConfig = Object.assign({}, dataCopy.config, dataCopy.structure, dataCopy.style)

      // Assign the first non-external author in the list as 'the author' for sites that are focussed on
      // only one author, rather than a group of authors.
      dataCopy.author = dataCopy.authors.find(p => ! p.external)

      //
      console.log(`======== Render site for ${type} ========`)
      await displayUpdate(Aws, { building: true, stepMsg: `Generating ${type}` }, `Render website for ${type}`)
      const pageData = await preparePageData(contentDir, cacheDir, mergedConfig, schema, dataCopy, dataCopy.style, tempDir, outputDir, options);
      await displayUpdate(Aws, { stepMsg: `Generating ${type}` }, `Generating server content`)
      await renderPages(confDir, mergedConfig, contentDir, pageData, type, outputDir, options);
      await displayUpdate(Aws, { stepMsg: `Generating ${type}` }, `Generating client side code`)
      await renderReactComponents(mergedConfig, outputDir, tempDir, options);

      // Copy favicon to root of site
      //     TODO: Ignoring 'pubDir' in favour of custom handling for favIcon.
      if (dataCopy.style.favicon) {
        await Files.copy(Path.join(contentDir, dataCopy.style.favicon), Path.join(outputDir, 'favicon.ico'))
      }
      // Font files (These static fonr files are specific to BraeVitae, other sites should use webfonts for now)
      try {
        await mergeToOutput(Path.join(contentDir, 'fonts'), Path.join(outputDir, 'fonts'))
      } catch (e) {
        // Ignore
      }
      // Copy selected cached content to output dir (TODO: make this a structure config option? )
      await mergeToOutput(Path.join(cacheDir, 'headers'), Path.join(outputDir, 'image', 'headers'))
      // AWS Only
      if (context) {
        // Push completed build back to S3
        let s3Dest = configName === 'published' ? options.siteBucket : options.testSiteBucket
        try {
          await displayUpdate(Aws, {}, `Push site content to ${s3Dest}`)
          await Aws.mergeToS3(outputDir, s3Dest, type, 0, 0, {
            push: event => {
              console.log(mergeEventToString(event))
            }
          })
        } catch (e) {
          const msg = `Sync to (${s3Dest}) for ${type} failed`
          console.error(msg + ` ${JSON.stringify(e)}`)
          await displayUpdate(Aws, { stepMsg: `Generating ${type}` }, msg)
        }
      }
    }

    // Save current cache content back to S3 (if updated)
    if (context) {
      Aws.push(cacheDir, options.adminBucket, `cache/${configName}`)
    }

    // Finish
    let dur = Date.now() - startTs
    console.log(`Complete in ${dur / 1000}s`)
    await displayUpdate(Aws, { building: false, buildError: false, stepMsg: 'Generating' }, `Website build ${options.buildId} complete in ${dur / 1000}s`)
    return {
      statusCode: 200,
      body: JSON.stringify({
        msg: `Complete in ${dur / 1000}s`
      })
    }
  } catch (err) {
    try {
      const errMsg = `Website build ${options.buildId} failed: ${err.stack || err}. ${err.details}`
      await displayUpdate(Aws, { building: false, buildError: true, stepMsg: 'Generating', buildErrMsg: errMsg }, errMsg)
        .catch(err => { console.log(`Display update failed: ${err.message}`, err) })
      console.log(err.stack || err)
      if (err.details) {
        console.log(err.details)
      }
      return {
        statusCode: 500,
        body: JSON.stringify({
          msg: err.stack || err,
          details: err.details
        })
      }
    } catch (err2) {
      const err2Msg = `Website build ${options.buildId} failed. ${err2.message}`
      await displayUpdate(Aws, { building: false, buildError: true, stepMsg: 'Generating', buildErrMsg: err2Msg}, err2Msg)
      console.log(`Failure in failure handler code! ${err2.message}`, { error1: err, error2: err2 })
    }
  }
}

/** Add property to the opts object ONLY if the env var is defined. */
const addEnv = (opts, name) => {
  if (process.env[name] !== undefined) {
    opts[name] = process.env[name]
  }
  return opts
}

const displayUpdate = async (Aws, params, logMsg) => {
  // TOOD: step message and log message will likely diverge in future, with step msg. as an explicit parameter.
  // This is a quick hack to show something in the UI.
  params.stepMsg = logMsg
  await Aws.displayUpdate(params, 'build', logMsg)
}

/**  */
const mergeEventToString = (event) => {
  let action = null
  if (event.updated) { action = 'Updated' }
  if (event.added) { action = 'Added' }
  if (event.deleted) { action = 'Deleted' }
  if (event.destFile) {
    return `${action} ${event.destFile}`
  } else if (event.sourceFile) {
    return `${action} ${event.sourceFile}`
  } else {
    return JSON.stringify(event)
  }
}

/** If one of the logo sizes or logo text font sizes is missing, fill it in from the nearest available size. */
const fillInMissingLogoEntries = (logo) => {
  if ( ! logo.small) { logo.small = logo.medium || logo.large || logo.extraLarge }
  if ( ! logo.medium) { logo.medium = logo.small || logo.large || logo.extraLarge }
  if ( ! logo.large) { logo.large = logo.medium || logo.small || logo.extraLarge }
  if ( ! logo.extraLarge) { logo.extraLarge = logo.large || logo.medium || logo.small }
  if ( ! logo.fontSizeSmall) { logo.fontSizeSmall = logo.fontSizeMedium || logo.fontSizeLarge || logo.fontSizeExtraLarge }
  if ( ! logo.fontSizeMedium) { logo.fontSizeMedium = logo.fontSizeSmall || logo.fontSizeLarge || logo.fontSizeExtraLarge }
  if ( ! logo.fontSizeLarge) { logo.fontSizeLarge = logo.fontSizeMedium || logo.fontSizeSmall || logo.fontSizeExtraLarge }
  if ( ! logo.fontSizeExtraLarge) { logo.extraLarge = logo.fontSizeLarge || logo.fontSizeMedium || logo.fontSizeSmall }
}

/** Prepare data used when rendering page templates */
const preparePageData = async (contentDir, cacheDir, config, schema, data, skin, tempDir, outputDir, _options) => {
    //
    console.info("Prepare headers and footers from page backgound images")

    // Split page background images into sectons for small to XL screens
    const updateCache = await Image.prepare(contentDir, cacheDir, config.bkgndConfig, skin);

    //
    console.info("Generate default color palettes for each page background")
    //   Note: must be executed syncronously, since Vibrant library is not thread-safe.

    const paletteFile = Path.join(cacheDir, `${skin._imageFileNameRoot}-palette.json`)
    let palette = null
    if ( ! updateCache) {
      // Check for a saved palette file
      try {
        palette = await Files.loadJson(paletteFile, config)
      } catch (err) {
        // ignore
      }
    }
    if ( ! palette) {
      // Generate a palette from the header and footer parts of each backgound image.
      let vibrantPalette = await Image.generatePalette(contentDir, tempDir, config.bkgndConfig, skin);
      palette = Image.extractVibrantPaletteColors(vibrantPalette);
      await Files.saveFile(paletteFile, JSON.stringify(palette, null, 4))
    }

    // Store the loaded or generated palette in the skin object.
    skin.palette = palette

    // Fill in any missing syle colors in the skin from the palette.
    Image.prepStyleFromPalette(skin, palette)

    //
    console.info("Preparing input configuration data for templates.")

    // Create map of authors by name
    console.debug("Create map of authors by name.")
    var authorMap = {}
    await Promise.all(data.authors.map(async author => {
      author.id = removeSpaces(author.name)
      authorMap[author.name] = author;
    }))

    // Create map of series by name
    console.debug("Create map of series by name.")
    var seriesMap = {}
    await Promise.all(data.series.map(async series => {
      series.id = removeSpaces(series.name).toLowerCase()
      series.imageExtraStyle = "padding-md"
      seriesMap[series.name] = series;
    }))

    // Create distributors map from the books source data
    console.debug("Create distributors map from the books source data")
    await Promise.all(data.published.map(async pub => {
      // Generate ID from title
      pub.id = removeSpaces(pub.title).toLowerCase();
      if (/^\d/.test(pub.id[0])) {
        pub.id = '_' + pub.id
      }
      pub.loglineTrunc = pub.logline.substr(0, 50) + "..."

      if (pub.seriesName && pub.seriesName.length > 0) {
        pub.series = seriesMap[pub.seriesName]
        if (pub.series && pub.seriesIndex) {
          if (!pub.series.list) { pub.series.list = [] }
          pub.series.list[pub.seriesIndex] = pub
        } else {
          console.warn(`Missing config for series: ${pub.seriesName}.`)
        }
      }

      // Check ISBNs and Create display versions for EBook and Print if they look valid
      if (pub.isbn && pub.isbn.length == 13) {
        pub.showEBookIsbn = true
        pub.ebookIsbnDisp = formatIsbn(pub.isbn);
      }
      if (pub.printIsbn && pub.printIsbn.length == 13) {
        pub.showPrintIsbn = true
        pub.printIsbnDisp = formatIsbn(pub.printIsbn);
      }

      // Add a copy of each distributor record to each book that has
      // a corresponding external book ID for that distributor.
      var list = [];
      data.distributors.map((distributor) => {
        const d = Object.assign({}, distributor)
        const externalId = pub['_distId_' + d.bookIdProp] // Prefix is added when props are generated in the UI.
        if (externalId) {
          let externalIdEnc = externalId
          if (d.id == 'infoRequest') {
            // URL-Encode these types of external links
            externalIdEnc = encodeURIComponent(externalId)
          }
          d.url = d.url.replace(/@BOOKID@/g, externalIdEnc)
          const iconFileName = Path.parse(d.icon).base
          d.iconUrl = `/${schema.distributors.properties.icon.pubDir}/${iconFileName}`
          const featIconFileName = Path.parse(d.featureIcon).base
          d.featureIconUrl = `/${schema.distributors.properties.featureIcon.pubDir}/${featIconFileName}`
          list.push(d);
          if ( pub.primaryDistributor == d.id) {
            pub.primaryDistributor = d
          }
        }
      })
      if (list.length == 1) {  // A special case, when there's only one distributor (This avoids adding primaryDistributor to every artwork in Artist template.)
        pub.primaryDistributor = list[0]
      }
      // Assign all non-hidden distributors to the item
      pub.distributors = list.filter(dist => ! dist.hidden)

      // Add booleans for pub type conditionals in templates. Eg: 'anthology' becomes 'isAnthology = true'
      let pubType = pub.type
      if ( ! Array.isArray(pubType)) {
        pubType = [pubType]
      }
      pubType.forEach(type => {
        pub['is' + type[0].toUpperCase() + type.substr(1)] = true
      })

      // Ensure all icon and feature images exist, and are the proper size.
      //console.debug(`Ensure all icon and feature images exist for ${pub.title}, and are the proper size`)
      if (pub.coverImage) {
        if ( ! pub.featureCoverImage) {
          pub.featureCoverImage = Files.createNewPath(pub.coverImage, 'feature')
          const newPath = Path.join(outputDir, 'image', pub.featureCoverImage)
          Files.ensurePath(newPath)
          pub.featureCoverImageSize = await Image.resizeBookIcon(Path.join(contentDir, pub.coverImage), newPath, config.featureImageHeight)
          if (config.unpublishedFeatureStickerImage && ! pub.published) {
            await Image.applySticker(newPath, Path.join(contentDir, config.unpublishedFeatureStickerImage), 'bottom', 'right')
          }
        }
        if ( ! pub.coverIcon) {
          pub.coverIcon = Files.createNewPath(pub.coverImage, 'icon')
          const newPath = Path.join(outputDir, 'image', pub.coverIcon)
          Files.ensurePath(newPath)
          pub.coverIconSize = await Image.resizeBookIcon(Path.join(contentDir, pub.coverImage), newPath, config.coverIconHeight)
          if (config.unpublishedStickerImage && ! pub.published) {
            await Image.applySticker(newPath, Path.join(contentDir, config.unpublishedStickerImage), 'bottom', 'right')
          }
        }
        if ( ! pub.coverPromo) {
          // Create cover promo image in content dir to allow following code to deal with generated and static
          // promo conent in the same way.
          pub.coverPromo = Files.createNewPath(Path.join('social', pub.coverImage), 'promo')
          const newPath = Path.join(contentDir, pub.coverPromo)
          Files.ensurePath(newPath)
          pub.coverPromoSize = await Image.createPromo(Path.join(outputDir, 'image', pub.featureCoverImage), Path.join(contentDir, config.coverPromoBackground), newPath)
          if (config.logo && config.addLogoToSocialImages) {
            await Image.applySticker(newPath, Path.join(contentDir, config.logo.small), 'top', 'left')
          }
        }
      } else {
        console.warn(`Missing cover image for book ${pub.title}. Generation will likely fail.`)
      }

      // Add sharing data to feed the 'sharing.html' template, invoked from item.html template (and others)
      const bookShare = bookToShare(pub);
      pub.sharing = {
        page: `${pub.id}-cover`,
        title: bookShare.title,
        description: bookShare.description
      }
    }))

    Object.keys(seriesMap).forEach(seriesName => {
      const s = seriesMap[seriesName]
      if ( ! s.books) { return }
      s.books.forEach((book, index) => {
        if (index > 0) {
          const prev = s.books[index - 1]
          if (prev) {
            book.seriesPrev = {
              id: prev.id,
              title: prev.title,
              index: index - 1
            }
          }
        }
        if (index < (s.books.length - 1)) {
          const next = s.books[index + 1]
          if (next) {
            book.seriesNext = {
              id: next.id,
              title: next.title,
              index: index + 1
            }
          }
        }
      })
    })

    console.debug(`Add books to authors and resolve author names in news data.`)
    data.postsByCat = {}
    // Resolve author names in news data.
    await Promise.all(data.news.map(async (post, index) => {
      // Resolve author
      post.author = authorMap[post.author] || post.author;
      // Add ids to category entries
      post.category = post.category.map(catStr => {
        let catId = removeSpaces(catStr).toLowerCase()
        if ( ! data.postsByCat[catId]) {
          data.postsByCat[catId] = { name: catStr, posts: [] }
        }
        data.postsByCat[catId].posts.push(post);
        return { id: catId, name: catStr }
      })
      // Add image left/right flags to each post
      if ( ! post.imagePosition || post.imagePosition === 'auto') {
        if (index % 2 === 0) {
          post.imageLeft = true
        } else {
          post.imageRight = true
        }
      } else {
        if (post.imagePosition === 'left') {
          post.imageLeft = true
        }
        if (post.imagePosition === 'right') {
          post.imageRight = true
        }
      }
    }))

    //
    addBooksToAuthors(config, authorMap, seriesMap, data.published)

    // Save the author map and other config for later use as data by the client code generation.
    let clientAuthorMap = filterAuthorMap(config, authorMap);
    console.log('Client author map: ' + JSON.stringify(clientAuthorMap))
    Files.ensurePath(Path.join(tempDir, 'script-src'))
    await Files.saveFile(Path.join(tempDir, 'script-src', 'authorMap.json'), JSON.stringify(clientAuthorMap, null, 4))
    await Files.saveFile(Path.join(tempDir, 'script-src', 'skin.json'), JSON.stringify(data.style, null, 4))
    await Files.saveFile(Path.join(tempDir, 'script-src', 'breakpoints.json'), JSON.stringify(config.bkgndConfig, null, 4))

    return data;
}

/** Render all Pages */
const renderPages = async (confDir, config, contentDir, data, templateType, outputDir, options) => {
  // For adding global config data to template resolution.
  const tplData = { data: { config: Object.assign({}, config, options) }}

  // If a custom templates dir is defined, and exists, use it.
  // If a default template-specfic templates dir exists, use that.
  // Otherwise, clear the templates dir setting (don't try to use a bogus setting if the dir does not exist)
  const templatesDirs = []
  if (config.templatesDir) {
    templatesDirs.push(config.templatesDir)
  }
  templatesDirs.push(Path.join(confDir, 'templates'))
  config.templatesDir = null
  for (const dir of templatesDirs) {
    if (Files.exists(dir)) {
      config.templatesDir = dir
    }
  }
  if (config.templatesDir) {
    console.log(`Loading page templates from custom: ${config.templatesDir}.`)
  } else {
    console.log('Loading page templates.')
  }

  // Template for all pages Header and Footer
  const pageTpl = await Files.loadTemplate(config.templatesDir, templateType, 'page.html')
  Handlebars.registerPartial("page", pageTpl)
  const sharingTpl = await Files.loadTemplate(config.templatesDir, templateType, 'sharing.html')
  Handlebars.registerPartial("sharing", sharingTpl)
  const bookFeatureTpl = await Files.loadTemplate(config.templatesDir, templateType, 'bookFeature.html')
  Handlebars.registerPartial("bookFeature", bookFeatureTpl)

  // Templates for the main site pages
  //    ( Custom pages won't have templates, so if there's a template loading error here, assume it's a custome page menu item )
  const menuTemplates = await Promise.all(config.menu.map(async m => {
    try {
      return {
        name: m.name,
        pageId: m.pageId,
        bin: await Files.loadTemplate(config.templatesDir, templateType, m.template)
      }
    } catch (e) {
      // ignore
    }
    return null
  }).filter(p => p !== null))

  // Template for each book page
  const itemTpl = await Files.loadTemplate(config.templatesDir, templateType, 'item.html')
  const catchupTpl = await Files.loadTemplate(config.templatesDir, templateType, 'catchup.html')
  // Template for each author page
  const groupTpl = await Files.loadTemplate(config.templatesDir, templateType, 'group.html')
  // Template for each series page
  const seriesTpl = await Files.loadTemplate(config.templatesDir, templateType, 'series.html')
  //const authorFacebookTpl = await Files.loadTemplate(config.templatesDir, templateType, 'authorFacebook.html')
  // Template for each book promo URL page
  const bookPromoFacebookTpl = await Files.loadTemplate(config.templatesDir, templateType, 'bookPromoFacebook.html')
  const bookPromoTwitterTpl = await Files.loadTemplate(config.templatesDir, templateType, 'bookPromoTwitter.html')
  // Generic content page template
  const contentPage = Files.loadTemplateDirect(
      '{%#> page this %}<div class="{%name%} content">{%noescape content%}</div>{%/page%}')

  //
  console.log("Cleaning and re-creating output directories.")
  createDirs(outputDir)
  Files.copyResourcesOverwrite('lib/style', Path.join(outputDir, 'style'))
  Files.copyResourcesOverwrite('lib/image', Path.join(outputDir, 'image'))
  Files.copyResourcesOverwrite(Path.join(confDir, 'style'), Path.join(outputDir, 'style'))
  Files.copyResourcesOverwrite(Path.join(confDir, 'image'), Path.join(outputDir, 'image'))
  Files.copyResourcesOverwrite(Path.join(confDir, "favicon.ico"), Path.join(outputDir, 'favicon.ico'))

  //
  console.log("Rendering pages.")
  const renderData = {
    items: data.published,
    groups: data.authors,
    group: data.author,
    social: data.social,
    series: data.series,
    feature: data.published.find(p => p.featured === true),
    news: data.news,
    share: config.metadata,
    style: data.style
  }

  //
  renderData.items.useCarousel = renderData.items.length >= Number(config.minBooksForCarousel)

  // Write custom content pages defined in Config:
  if (config.customPages && config.customPages.map) {
    Promise.all(config.customPages.map(async pageConfig => {
      if (pageConfig.content) {
        const pageContentConfig = Object.assign({
          name: 'page-' + pageConfig.id,
          // TODO: Potentially pass config here if the custom page looks like a mustache template format?
          content: await Files.loadLargeData(pageConfig.textType || 'markdown', Path.join(contentDir, pageConfig.content))
        }, renderData);
        if (pageConfig.menuRef) {
          pageContentConfig[pageConfig.menuRef] = true;
        }
        await Files.savePage(outputDir + '/' + pageConfig.outputPath, contentPage(pageContentConfig, tplData))
      }
    }))
  }

  // For each book in the published list, render a new book page based on the book template.
  await Promise.all(data.published.map(async elem => {
    // Construct at least one promo, with the book's cover only, to support the social media share buttons
    const autoPromo = {
      id: elem.id + '-cover',
      image: elem.coverPromo,
      imageHeight: elem.coverPromoSize.height,
      imageWidth: elem.coverPromoSize.width,
      category: { twitter: true, facebook: true }
    }
    data.social.push(autoPromo);

    // Write book pages
    const bookShare = bookToShare(Object.assign(autoPromo, elem));
    bookShare.url = `/p/fb/${bookShare.id}`
    let content = itemTpl({ pageId: 'books', book: elem, share: bookShare, style: data.style }, tplData);
    await Files.savePage(outputDir + '/w/' + elem.id + '.html', content)

    if (elem.catchup && elem.catchup.content && elem.series) {
      content = catchupTpl({ pageId: 'books', book: elem, share: bookShare, style: data.style }, tplData);
      await Files.savePage(`${outputDir}/series/${elem.series.id}-catchup-${elem.seriesIndex}.html`, content)
    }
  }))

  // Social images  ( Replace entire social data list here in the render data, because we're adding extra details )
  renderData.social = await Promise.all(data.social.map(async promo => {
    // Convert categories from editor format (array of strings) to object format for handlebars template
    if (promo.category && Array.isArray(promo.category)) {
      const newCats = {}
      promo.category.forEach(cat => {
        newCats[cat] = true
      })
      promo.category = newCats
    } else {
      promo.category = {
        facebook: true,
        twitter: true
      }
    }
    const share = Object.assign({}, bookToShare(promo), promo)
    // Write shareable page
    if (share.category.facebook) {
      share.url = `/p/fb/${share.id}`
      const content = bookPromoFacebookTpl({ promo: promo, share: share }, tplData)
      await Files.savePage(outputDir + share.url + '.html', content)
    }
    if (share.category.twitter) {
      share.url = `/p/tw/${share.id}`
      const content = bookPromoTwitterTpl({ promo: promo, share: share }, tplData)
      await Files.savePage(outputDir + share.url + '.html', content)
    }
    // TODO: Copy full images from content to site.
    Files.ensurePath(Path.join(outputDir, share.image))
    await Files.copy(Path.join(contentDir, share.image), Path.join(outputDir, share.image))
    // Create a thumbnail images
    share.thumbImage = Files.createNewPath(share.image, 'thumb')
    Files.ensurePath(Path.join(outputDir, share.thumbImage))
    share.thumbSize = await Image.resizeBookIcon(Path.join(contentDir, share.image), Path.join(outputDir, share.thumbImage), config.promoThumbImageHeight)
    //
    return share
  }));

  // For each author, render a new author page based on the author template. (And copy author image referenced in config from content to the site.)
  await Promise.all(data.authors.map(async function(elem) {
    let content = groupTpl({ pageId: 'author', group: elem, share: groupToShare(elem, 'author', 'books.author'), style: data.style }, tplData)
    await Files.savePage(outputDir + '/author/' + elem.id + '.html', content)
    if (elem.image) {
      Files.ensurePath(Path.join(outputDir, elem.image))
      await Files.copy(Path.join(contentDir, elem.image), Path.join(outputDir, elem.image))
    }
  }))

  // For each series, render a new series page based on the series template
  await Promise.all(data.series.map(async function(elem) {
    let content = seriesTpl({ pageId: 'books', group: elem, share: groupToShare(elem, 'series', 'books'), style: data.style }, tplData)
    await Files.savePage(outputDir + '/series/' + elem.id + '.html', content)
  }))

  // Render main pages
  await Promise.all(menuTemplates.map(async tpl => {
    if (tpl) {    //TODO: tpl _shouldn't ever be null here, but somehow the filter up around ln700 is not removing the nulls from the list?
      renderData.pageId = tpl.pageId
      return await Files.savePage(`${outputDir}/${tpl.name}.html`, tpl.bin(renderData, tplData))
    }
  }))

  // News category pages
  const newsTpl = menuTemplates.find(p => p.name === 'news').bin
  await Promise.all(Object.keys(data.postsByCat).map(async catId => {
    let category = data.postsByCat[catId];
    await Files.savePage(outputDir + `/n/cat-${catId}.html`, newsTpl(Object.assign(renderData, { pageId: 'news', news: category.posts, category: category }), tplData))
  }))

  // Render stylesheets
  console.log("Rendering stylsheets.")
  let content = await Style.render(templateType, 'style/main.scss', { style: data.style }, tplData)
  await Files.savePage(outputDir + `/style/main.css`, content.css)
  content = await Style.render(templateType, 'style/images.scss', {  style: data.style, books: data.published, groups: [...data.authors, ...data.series], news: data.news }, tplData)
  await Files.savePage(outputDir + `/style/images.css`, content.css)
  let tpl = await Files.loadTemplate(outputDir + `/style`, null, 'grid-min.css')
  await Files.savePage(outputDir + `/style/grid-min.css`, tpl({ bkgndConfig: config.bkgndConfig }, tplData))
}

/** Compile React components and style for this config into an app package */
const renderReactComponents = async (config, outputDir, tempDir, _options) => {
  console.log(`Rendering React components for client side script. tempDir=${tempDir}, outputDir=${outputDir}`)
  const absTempDir = (tempDir[0] === '/' ? tempDir : Path.join(__dirname, '..', tempDir))
  const absOutputDir = (outputDir[0] === '/' ? outputDir : Path.join(__dirname, '..', outputDir))
  Files.copyResourcesOverwrite('lib/script-src', Path.join(absTempDir, 'script-src'), [
    'index.jsx', 'booksSlider.jsx', 'copyToClipboard.jsx', 'feedback.jsx'
  ])
  let nodeModulesPath = require.resolve('babel-loader')
  {
    let parts = nodeModulesPath.split(Path.sep)
    parts = parts.slice(0, parts.findIndex(p => p === 'node_modules') + 1)
    nodeModulesPath = parts.join(Path.sep)
  }
  let stats = await webpack({
    mode: (config.debug ? 'development' : 'production'),
    entry: Path.join(absTempDir, 'script-src', 'index.jsx'),
    module: {
      rules: [
        {
          test: /\.(js|jsx)$/,
          exclude: /node_modules/,
          use: [
            {
              loader: 'babel-loader',
              options: {
                presets: [
                  "@babel/preset-env", "@babel/preset-react"
                ]
              }
            }
          ]
        }
      ]
    },
    resolve: {
      extensions: ['*', '.js', '.jsx'],
      modules: [nodeModulesPath],
    },
    resolveLoader: {
      modules: [nodeModulesPath],
    },
    output: {
      path: Path.join(absOutputDir, `script`),
      filename: (config.debug ? 'app.js' : 'app.min.js')
    }
  });
  let info = stats.toJson();
  if (stats.hasErrors()) {
    console.log("React Errors:\n\n" + JSON.stringify(info.errors.map(p => p.message)))
  }
  if (stats.hasWarnings()) {
    console.log("React Warnings:\n\n" + JSON.stringify(info.warnings.map(p => p.message)))
  }
}

/** Merge all temp files to the output dir, only replacing output files if the hashes differ. */
const mergeToOutput = async (sourceDir, destDir) => {
  console.log(`Merging ${sourceDir} to ${destDir}.`)
  Files.ensurePath(destDir)
  const excludes = ['.DS_Store', 'script-src']
  const sourceFiles = await Files.listDir(sourceDir, excludes);
  const destFiles = await Files.listDir(destDir, excludes);
  const destFilesMap = destFiles.reduce(function(map, obj) {
    map[obj.relPath] = obj;
    return map;
  }, {});
  return Promise.all(sourceFiles.map(async sourceFile => {
    const destFile = destFilesMap[sourceFile.relPath];
    if ( !destFile || !(await Files.compare(sourceFile.path, destFile.path))) {
      if (destFile) {
        await Files.copy(sourceFile.path, destFile.path)
      } else {
        const newPath = Path.join(destDir, sourceFile.relPath)
        Files.ensurePath(newPath)
        await Files.copy(sourceFile.path, newPath)
      }
      return {
        updated: true,
        sourceFile: sourceFile.path,
        destFile: destFile ? destFile.path : null
      }
    }
    return {
      updated: false,
      sourceFile: sourceFile.path,
      destFile: destFile.path
    }
  }))
}

/** Vist all schema elements, while resolving the properties object associated with that level of schema. */
const visitProperties = async (value, schema, config, actionFunc, parent, key) => {
  if (schema.type === 'list' && (!schema.closed || schema.multi)) {
    // Check all items in multi-value lists
    if (value.map) {
      await Promise.all(value.map(async (item, index) => {
        // Each list item uses the same schema info from the parent
        await visitProperties(item, { type: schema.elemType, properties: schema.properties }, config, actionFunc, value, index)
      }))
    } else {
      console.log(`List type property ${key} does not have an array type value`)
    }
  } else if (schema.type === 'object') {
    // Check all properties
    await Promise.all(Object.keys(value).map(async itemKey => {
      let defn = schema.properties[itemKey];
      if (defn) {
        let item = value[itemKey];
        if (item !== undefined && item !== null) {
          await visitProperties(item, defn, config, actionFunc, value, itemKey)
        }
      } else {
        // TODO: It's largely generated props that don't have a schema. Could likely check this case and generate
        // the relevant schema from the dynamicProperties section of the parent schema.
        if (itemKey[0] !== '_') {
          console.log(`Missing schema for ${itemKey}`)
        }
      }
    }))
  } else {
    await actionFunc(value, schema, config, parent, key)
  }
}

/** Resolve external text elements in the given props object and all child objects */
const resolveFileRefs = async (valueI, schemaI, configI, worker) => {
  await visitProperties(valueI, schemaI, configI, async (value, schema, _config, parent, key) => {
    if (schema.type === 'text') {
      await worker(schema, value, parent, key)
    }
  })
}

/** Ensure all URL type properties begin with the appropriate protocol. */
const ensureProtocolOnUrls = async (valueI, schemaI, configI) => {
  await visitProperties(valueI, schemaI, configI, async (value, schema, _config, parent, key) => {
    if (schema.type === 'url') {
      if (value.length <= 3) {
        // Don't try to much with any URL string 3 chars or less. this is likely an error.
        return
      }
      if (value[0] === '/' && value[1] !== '/') {
        // Don't motify root-relative URLs starting with a single fwd-slash /
        return
      }
      let proto = '//'
      if (schema.forceHttps) {
        proto = 'https://'
      } else if (schema.forceHttp) {
        proto = 'http://'
      }
      if (value.indexOf(proto) !== 0) {
        // Replace any existing protocol value with the proper one.
        value = value.replace(/^\/\//, '').replace(/^http:\/\//, '').replace(/^https:\/\//, '')
        parent[key] = proto + value
      }
    }
  })
}

/** Find schema elements that have altered generator paths, copy the value from it's current config path to the gnerator path. */
const resolveGeneratorPaths = async (valueI, schemaI, configI) => {
  await visitProperties(valueI, schemaI, configI, async (value, schema, _config, _parent, _key) => {
    if (schema.path) {
      const parts = schema.path.split('/')
      let currValue = valueI
      for (const part of parts.slice(0, -1)) {
        currValue = currValue[part]
      }
      currValue[parts[parts.length -1]] = value
    }
  })
}

/** Resolve external text elements in the given props object and all child objects */
const publishContent = async (valueI, schemaI, configI, worker) => {
  await visitProperties(valueI, schemaI, configI, async (value, schema, _config, _parent, key) => {
    if (schema.publish) {
      if (schema.pubDir) {
        console.log(`Publish content ${key}:${value} to site at dir ${schema.pubDir}.`)
      } else {
        console.log(`Publish content ${key}:${value} to site.`)
      }
      try {
        await worker(value, schema.pubDir)
      } catch (ex) {
        console.log(`Failed to copy content ${key}:${value} to site: ${ex.message}.`, ex)
      }
    }
  })
}

const bookToShare = (book) => {
  const redirectUrl = book.targetUrl || (book.primaryDistributor ? book.primaryDistributor.url : `/w/${book.id}`)
  // Handle book.tags as a comma-separated list, or array (TODO: refactor this to one standard once config settles)
  let tags = null
  if (book.tags) {
    if (book.tags.split) {
      tags = book.tags.split(',')
      tags = tags.map(tag => tag.trim())
    } else if (book.tags.length) {
      tags = book.tags
    }
  }
  //
  return {
    id: book.id || removeSpaces(book.title).toLowerCase(),
    ogType: 'book',
    redirectUrl: redirectUrl,
    isbn: book.isbn,
    title: book.promoTitle || book.title,
    description: book.text || book.logline,
    keywords: book.keywords || tags,
    image: book.image,
    altText: book.altText || book.promoTitle || book.title + ' book cover',
    imageType: book.imageType || book.coverImageType || 'image/jpeg',
    imageHeight: book.imageHeight || book.coverPromoSize.height || '400',
    imageWidth: book.imageWidth || book.coverPromoSize.width || '800'
  }
}

const groupToShare = (group, subpath, ogType) => {
  let ret = {}

  ret.ogType = ogType
  ret.url = '/' + subpath + '/' + group.id
  ret.title = group.name
  ret.description = group.shortDesc
  ret.image = group.image
  ret.imageType = group.imageType | 'image/jpeg'
  ret.imageWidth = group.imageWidth
  ret.imageHeight = group.imageHeight

  return ret
}

const addBooksToAuthors = (config, authorMap, seriesMap, published) => {

  const displayNameMap = {}
  config.itemCategories.map(cat => {
    displayNameMap[cat.name] = {
      single: cat.single,
      plural: cat.plural
    }
  })

  published.map(pub => {
    // Currently, book type is a single-select, but it may change to multi-select in future
    let pubType = pub.type
    if ( ! Array.isArray(pubType)) {
      pubType = [pubType]
    }
    //
    const authorObjList = []
    pub.author.map(authorName => {
      authorName = authorName.trim()
      const author = authorMap[authorName]
      if (author) {
        author.list = author.list || []
        const pubs = author.pubs || {}

        authorObjList.push(author)

        // Add books to author
        author.list.push(pub)

        pubType.forEach(type => {
          if ( ! pubs[type]) {
            pubs[type] = {
              name: type,
              displayName: (displayNameMap[type] && displayNameMap[type].plural) || type,
              list: []
            }
          }
          pubs[type].list.push(pub)
          if ( ! author.pubs) {
            author.pubs = pubs
          }
        })
      } else {
        console.error(`Can't find author ${authorName} in the list of authors.`, authorMap)
      }
    })

    // Replace list of author names with objects.
    pub.author = authorObjList

    // Add category properties to book
    const category = config.itemCategories.find(p => p.name === pubType[0])
    console.log('Copy category elements to book: ' + pub.title, category)
    if (category) {
      pub.categoryId = category.name
      pub.categoryName = category.single
      pub.categoryNamePlural = category.plural
      pub.publishedStickerText = category.publishedStickerText || config.publishedStickerText
      pub.unpublishedStickerText = category.unpublishedStickerText || config.unpublishedStickerText
    }
  })

  // Convert author pubs to a list, and Sort book categories to the same order as they are defined in the config
  //    Also: Add 'useCarousel' flag to authors and each pub type within author, for use in UI rendering
  Object.keys(authorMap).forEach(authorKey => {
    const author = authorMap[authorKey]
    const pubList = []
    if (author.pubs) {
      Object.keys(author.pubs).forEach(pubKey => {
        const pub = author.pubs[pubKey]

        pub.order = config.itemCategories.findIndex(p => p.name === pubKey)
        pub.useCarousel = pub.list.length >= Number(config.minBooksForCarousel)
        pubList.push(pub)
      })
    }
    author.pubs = pubList
    author.pubs.sort((a, b) => a.order - b.order)
    author.useCarousel = author.pubs.length >= Number(config.minBooksForCarousel)
  })
}

// Trim down the data we save to the page as data input to the client side code generation
// Look here if a property you need is not available in client side code!
const filterAuthorMap = (config, authorMap) => {
  return Object.keys(authorMap).map(authorName => {
    let author = authorMap[authorName];
    let ret = {
      id: author.id,
      pubs: null,
      list: null
    }
    if (author.pubs) {
      ret.pubs = author.pubs.map(pubType => {
        return {
          showTitles: config.showTitlesOnGroupedPage,
          pubType: pubType.name,
          list: pubType.list.map(pub => {
            return {
              id: pub.id,
              title: pub.title,
              logline: pub.logline,
              detailsUrl: Path.join(config.booksPath, pub.id),
              primaryDistributor: pub.primaryDistributor,
              published: pub.published,
              publishedStickerText: pub.publishedStickerText || config.publishedStickerText,
              unpublishedStickerText: pub.unpublishedStickerText || config.unpublishedStickerText
            }
          })
        }
      })
    }
    if (author.list) {
      ret.list = author.list.map(pub => {
        return {
          id: pub.id,
          title: pub.title,
          logline: pub.logline,
          detailsUrl: Path.join(config.booksPath, pub.id),
          primaryDistributor: pub.primaryDistributor,
          published: pub.published,
          publishedStickerText: pub.publishedStickerText || config.publishedStickerText,
          unpublishedStickerText: pub.unpublishedStickerText || config.unpublishedStickerText
        }
      })
    }
    return ret
  })
}

/** Format a bare ISBN number string to dipslay format with dashes.
    Eg: 9781928025252 to 978-1-928025-25-2
*/
const formatIsbn = (isbnStr) => {
  let ret = "";
  for (let i = 0; i < isbnStr.length; ++i) {
    if (i == 3 || i == 4 || i == 10 || i == 12) {
      ret += '-' + isbnStr[i]
    } else {
      ret += isbnStr[i]
    }
  }
  return ret;
}

/* Remove all characters other than alphanumeric, dash and underscore from the source string to make
  it a safe ID.
*/
const removeSpaces = (sourceStr) => {
  return sourceStr.replace(/[\W-]/g, '')
}

// Clean existing generated output
const cleanDirs = (outputDir) => {
    Files.cleanOutput([outputDir])
}

// Create output dirs if they don't exist
const createDirs = (outputDir) => {
    Files.createOutputDirs([
      outputDir,
      outputDir + '/author',
      outputDir + '/image',
      outputDir + '/p',
      outputDir + '/p/fb',
      outputDir + '/p/tw',
      outputDir + '/script',
      outputDir + '/style',
      outputDir + '/w',
      outputDir + '/n'
    ])
}

function webpack(config) {
  return new Promise((resolve, reject) => {
    Webpack(config, function(err, stats) {
      if (err) {
        reject(err)
      } else {
        resolve(stats)
      }
    })
  })
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
exports.handler = handler


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Entrypoint
if ( ! process.env.AWS_EXECUTION_ENV) {
  //require('dotenv').config()

  // Load command line options into environment vars
  const args = process.argv.slice(2)
  for (let i = 0; i < args.length; i += 2) {
    process.env[args[i]] = args[i + 1]
  }

  handler({}).then(() => {
  })
}
