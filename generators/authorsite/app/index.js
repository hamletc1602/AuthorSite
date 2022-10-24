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
  types: 'desktop,mobile',
  skipImages: false
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
  const startTs = Date.now()
  let options = {}
  let Aws = {
    // Mock function in case we're not running in AWS Lambda
    displayUpdate: function(params, msg) {
      console.log(JSON.stringify(params) + ' ' + msg)
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
    addEnv(options, 'skipImages')
    addEnv(options, 'types')
    addEnv(options, 'adminBucket')
    addEnv(options, 'stateQueueUrl')
    addEnv(options, 'testSiteBucket')
    options = Object.assign(defaultOptions, options)

    // Apply global options to libraries
    Image.setSkip(options.skipImages);

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
      // TODO: This assumes a specific form of domain name. like '**.{domain}.*' - generalize this, or make site name and top-level
      // domain separate fields in CloudFormation script?
      const configDomain = process.env.siteDomain
      const parts = configDomain.split(".")
      configName = parts[parts.length - 2] // 2nd last element
      configDebug = process.env.debug //TODO: Will need admin checkbox for debug on/off, and pass it in on build call
    } else {
      configName = process.env.npm_config_authorsite_site
      configDebug = process.env.npm_config_authorsite_debug
    }

    console.log(`Loading and processing configuration data for ${configName}. BuildId: ${options.buildId}`)

    let year = new Date().getFullYear()
    let confDir = appConfig.configPath
    let tempDir = appConfig.tempPath
    if (configName) {
      confDir = Path.join(confDir, configName)
      tempDir = Path.join(tempDir, configName)
    }
    Files.ensurePath(confDir)
    Files.ensurePath(tempDir)

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
        await displayUpdate(Aws, { building: true }, 'build', `Website build ${options.buildId} started`)
        await Aws.pull(options.adminBucket, 'site-config/', confDir)
      } catch (e) {
        console.error(`Pull of config failed: ${JSON.stringify(e)}`)
      }
    }

    // The core configuration file that drives the entire generation process
    const config = await Files.loadJson(confDir + "/conf.json", { build: options.buildId, yyyy: year })
    //config.outputDir = tempDir;
    config.tempDir = tempDir;

    // Force debug to true in config if it's supplied at runtime
    if (options.debug || configDebug == 'true') {
      config.debug = true
    }

    // Resolve file refs for conf after local is applied, but before enccoding and loading
    // other properties files.
    await resolveFileRefs(confDir, config, config);

    // clean any old files
    cleanDirs(tempDir)
    Files.createOutputDirs([tempDir]);

    //
    for (let type of options.types.split(",")) {
      type = type.trim()
      console.log(`======== Render site for ${type} ========`)
      await displayUpdate(Aws, { building: true }, `Render website for ${type}`)
      const data = await preparePageData(confDir, config, tempDir, options);
      await displayUpdate(Aws, { building: true }, `Generating server content`)
      await renderPages(confDir, config, tempDir, data, type, tempDir, options);
      await displayUpdate(Aws, { building: true }, `Generating client side code`)
      await renderReactComponents(config, tempDir, tempDir, options);
      if (context) {
        // Push completed build back to S3 (Test site)
        await displayUpdate(Aws, { building: true }, `Push site content to ${options.testSiteBucket}`)
        try {
          await Aws.mergeToS3(tempDir, options.testSiteBucket, type, {
            push: event => {
              console.log(mergeEventToString(event))
            }
          })
        } catch (e) {
          const msg = `Sync to test site for ${type} failed: ${JSON.stringify(e)}`
          console.error(msg)
          await displayUpdate(Aws, { building: true }, msg)
        }
      }
    }

    // Finish
    let dur = Date.now() - startTs
    console.log(`Complete in ${dur / 1000}s`)
    await displayUpdate(Aws, { building: false }, `Website build ${options.buildId} complete in ${dur / 1000}s`)
    return {
      statusCode: 200,
      body: JSON.stringify({
        msg: `Complete in ${dur / 1000}s`
      })
    }
  } catch (err) {
    console.log(err.stack || err)
    if (err.details) {
      console.log(err.details)
    }
    await displayUpdate(Aws, { building: false }, `Website build ${options.buildId} failed: ${err.stack || err}. ${err.details}`)
    return {
      statusCode: 500,
      body: JSON.stringify({
        msg: err.stack || err,
        details: err.details
      })
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
  await displayUpdate(Aws, params, 'build', logMsg)
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

/** Prepare data used when rendering page templates */
const preparePageData = async (confDir, config, tempDir, options) => {
    const data = {
      styleConfig: await Files.loadJson(confDir + "/style.json", config),
      published: await Files.loadJson(confDir + "/published.json", config),
      authors: await Files.loadJson(confDir + "/authors.json", config),
      series: await Files.loadJson(confDir + "/series.json", config),
      news: await Files.loadJson(confDir + "/news.json", config),
      distributors: await Files.loadJson(confDir + "/distributors.json", config)
    }

    //
    await resolveFileRefs(confDir, data.styleConfig, config);
    await resolveFileRefs(confDir, data.published, config);
    await resolveFileRefs(confDir, data.authors, config);
    await resolveFileRefs(confDir, data.series, config);
    await resolveFileRefs(confDir, data.news, config);
    await resolveFileRefs(confDir, data.distributors, config);

    //
    console.info("Prepare headers and footers from page backgound images")
    await Promise.all(data.styleConfig.skins.map(async skin => {
      if ( ! skin.active) {
        // skip inactive skins
        return
      }

      // Use class name for image name root, by defualt.
      if ( ! skin.imageFileNameRoot) {
        skin.imageFileNameRoot = skin.className
      }

      // If there are any missing background images, see if there are separate header/footer images
      // that can be combined.
      await Image.combineHeaderFooter(confDir, data.styleConfig.bkgndConfig, skin)

      // Split page background images into sectons for small to XL screens
      await Image.prepare(confDir, data.styleConfig.bkgndConfig, skin);
    }))

    //
    console.info("Generate default color palettes for each page background")
    //   Note: must be executed syncronously, since Vibrant library is not thread-safe.
    let i = 0
    for (i = 0; i < data.styleConfig.skins.length; i += 1) {
      let skin = data.styleConfig.skins[i];
      if ( ! skin.active) {
        // skip inactive skins
        continue
      }

      // Check for a saved palette file
      let paletteFile = Path.join(confDir, `/${skin.className}-palette.json`)
      let palette = null
      try {
        palette = await Files.loadJson(paletteFile, config)
      } catch (err) {
        // ignore
      }

      if ( ! palette) {
        // Generate a palette from the header and footer parts of each backgound image.
        let vibrantPalette = await Image.generatePalette(confDir, tempDir, data.styleConfig.bkgndConfig, skin);
        palette = Image.extractVibrantPaletteColors(vibrantPalette);
        await Files.saveFile(paletteFile, JSON.stringify(palette, null, 4))
      }

      // Store the loaded or generated palette in the skin object.
      skin.palette = palette

      // Fill in any missing syle colors in the skin from the palette.
      Image.prepStyleFromPalette(skin, palette)
    }

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
      pub.published = (pub.published === 'yes')
      pub.loglineTrunc = pub.logline.substr(0, 50) + "..."

      if (pub.seriesName && pub.seriesName.length > 0) {
        pub.series = seriesMap[pub.seriesName]
        if (pub.series && pub.seriesIndex) {
          if (!pub.series.books) { pub.series.books = [] }
          pub.series.books[pub.seriesIndex] = pub
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
      Object.keys(data.distributors).map(function(key) {
        var distributor = Object.assign({}, data.distributors[key]),
            externalId = pub[distributor.bookIdProp]
        if (externalId) {
          let externalIdEnc = externalId
          if (key == 'infoRequest') {
            // URL-Encode these types of external links
            externalIdEnc = encodeURIComponent(externalId)
          }
          distributor.url = distributor.url.replace(/@BOOKID@/g, externalIdEnc)
          list.push(distributor);
          if ( pub.primaryDistributor == key) {
            pub.primaryDistributor = distributor
          }
        }
      })
      if (list.length == 1) {  // A special case, when there's only one distributor (This avoids adding primaryDistributor to every painting in mum's site.)
        pub.primaryDistributor = list[0]
      }
      // Assign all non-hidden distributors to the item
      pub.distributors = list.filter(dist => ! dist.hidden)

      // Add booleans for pub type conditionals in templates. Eg: 'anthology' becomes 'isAnthology = true'
      pub['is' + pub.type[0].toUpperCase() + pub.type.substr(1)] = true

      // Ensure all icon and feature images exist, and are the proper size.
      //console.debug(`Ensure all icon and feature images exist for ${pub.title}, and are the proper size`)
      if ( ! pub.featureCoverImage) {
        pub.featureCoverImage = Files.createNewPath(pub.coverImage, 'feature')
        const newPath = Path.join(tempDir, 'image', pub.featureCoverImage)
        Files.ensurePath(newPath)
        pub.featureCoverImageSize = await Image.resizeBookIcon(Path.join(confDir, pub.coverImage), newPath, config.featureImageHeight)
        if (config.unpublishedFeatureStickerImage && ! pub.published) {
          await Image.applySticker(newPath, Path.join(confDir, config.unpublishedFeatureStickerImage), 'bottom', 'right')
        }
      }
      if ( ! pub.coverIcon) {
        pub.coverIcon = Files.createNewPath(pub.coverImage, 'icon')
        const newPath = Path.join(tempDir, 'image', pub.coverIcon)
        Files.ensurePath(newPath)
        pub.coverIconSize = await Image.resizeBookIcon(Path.join(confDir, pub.coverImage), newPath, config.coverIconHeight)
        if (config.unpublishedStickerImage && ! pub.published) {
          await Image.applySticker(newPath, Path.join(confDir, config.unpublishedStickerImage), 'bottom', 'right')
        }
      }
      if ( ! pub.coverPromo) {
        pub.coverPromo = Files.createNewPath(pub.coverImage, 'promo')
        const newPath = Path.join(tempDir, 'image', pub.coverPromo)
        Files.ensurePath(newPath)
        pub.coverPromoSize = await Image.createPromo(Path.join(tempDir, 'image', pub.featureCoverImage), Path.join(confDir, 'image', config.coverPromoBackground), newPath)
        if (config.logoSticker && pub.publisher == 'BraeVitae') {
          await Image.applySticker(newPath, Path.join(confDir, config.logoSticker), 'top', 'left')
        }
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
    await Promise.all(data.news.map(async post => {
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
    }))

    //
    addBooksToAuthors(config, authorMap, seriesMap, data.published)

    // Save the author map and other config for later use as data by the client code generation.
    let clientAuthorMap = filterAuthorMap(config, authorMap);
    Files.ensurePath(Path.join(tempDir, 'script-src'))
    await Files.saveFile(Path.join(tempDir, 'script-src', 'authorMap.json'), JSON.stringify(clientAuthorMap, null, 4))
    await Files.saveFile(Path.join(tempDir, 'script-src', 'skins.json'), JSON.stringify(data.styleConfig.skins, null, 4))
    await Files.saveFile(Path.join(tempDir, 'script-src', 'breakpoints.json'), JSON.stringify(data.styleConfig.bkgndConfig, null, 4))

    return data;
}

/** Render all Pages */
const renderPages = async (confDir, config, tempDir, data, templateType, outputDir, options) => {
  // For adding global config data to template resolution.
  const tplData = { data: { config: Object.assign({}, config, options) }}

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

  // Templates for the main site pages
  const mainTpl = await Files.loadTemplate(config.templatesDir, templateType, config.menu.main.template)
  const altTpl = await Files.loadTemplate(config.templatesDir, templateType, config.menu.alt.template)
  const newsTpl = await Files.loadTemplate(config.templatesDir, templateType, config.menu.news.template)
  const contactUsTpl = await Files.loadTemplate(config.templatesDir, templateType, config.menu.contact.template)
  // Template for each book page
  const itemTpl = await Files.loadTemplate(config.templatesDir, templateType, 'item.html')
  const catchupTpl = await Files.loadTemplate(config.templatesDir, templateType, 'catchup.html')
  // Template for each author page
  const groupTpl = await Files.loadTemplate(config.templatesDir, templateType, 'group.html')
  const authorFacebookTpl = await Files.loadTemplate(config.templatesDir, templateType, 'authorFacebook.html')
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
  Files.copyResourcesOverwrite(require.resolve('slick-carousel/slick/slick.css'), Path.join(outputDir, 'style', 'slick.css'))
  Files.copyResourcesOverwrite(require.resolve('slick-carousel/slick/slick-theme.css'), Path.join(outputDir, 'style', 'slick-theme.css'))

  //
  console.log("Rendering pages.")
  const renderData = {
    items: data.published,
    groups: data.authors,
    series: data.series,
    feature: data.published[0],
    news: data.news,
    share: config,
    style: data.styleConfig
  }
  Files.savePage(`${outputDir}/${config.menu.main.name}.html`, mainTpl(renderData, tplData))
  Files.savePage(`${outputDir}/${config.menu.alt.name}.html`, altTpl(renderData, tplData))
  Files.savePage(`${outputDir}/${config.menu.news.name}.html`, newsTpl(renderData, tplData))
  Object.keys(data.postsByCat).map(catId => {
    let category = data.postsByCat[catId];
    Files.savePage(outputDir + `/n/cat-${catId}.html`, newsTpl(Object.assign(renderData, { news: category.posts, category: category }), tplData))
  })
  Files.savePage(`${outputDir}/${config.menu.contact.name}.html`, contactUsTpl(renderData, tplData))

  // Write custom content pages defined in Config:
  if (config.customPages) {
    Object.keys(config.customPages).forEach(pageId => {
      const pageConfig = config.customPages[pageId]
      const pageContentConfig = {
        name: 'page-' + pageId,
        content: pageConfig.content
      };
      if (pageConfig.menuRef) {
        pageContentConfig[pageConfig.menuRef] = true;
      }

      Files.savePage(outputDir + '/' + pageConfig.outputPath, contentPage(pageContentConfig, tplData))
    })
  }

  // For each book in the published list, render a new book page based on the book template.
  await Promise.all(data.published.map(async elem => {
    // Add a category field to all promos that don't have one already
    if (elem.promos) {
      const promosWithCategory = elem.promos.map(promo => {
        if (promo.category) {
          return promo
        }
        let category = { twitter: true, facebook: true }
        if (promo.imageUrl.indexOf('-tw') !== -1) { category = { twitter: true } }
        else if (promo.imageUrl.indexOf('-fb') !== -1) { category = { facebook: true } }
        return {
          ...promo,
          category: category
        }
      })
      elem.promos = promosWithCategory
    } else {
      elem.promos = []
    }

    // Construct at least one promo, with the book's over only, so support the social media share buttons
    const autoPromo = { name: 'cover', imageUrl: elem.coverPromo, category: { twitter: true, facebook: true } }
    elem.promos.unshift(Object.assign(autoPromo, elem));

    // Write Promo thumbnail images
    if (elem.promos) {
      await Promise.all(elem.promos.map(async promo => {
        if (promo.imageUrl.indexOf('covers/') !== -1) {
          // This is the auto-generated cover promo image
          promo.thumbImage = Files.createNewPath(promo.imageUrl, 'thumb')
          const newPath = Path.join(tempDir, 'image', promo.thumbImage)
          Files.ensurePath(newPath)
          promo.thumbSize = await Image.resizeBookIcon(Path.join(tempDir, 'image', promo.imageUrl), newPath, config.promoThumbImageHeight)
        } else {
          promo.thumbImage = Files.createNewPath(promo.imageUrl.replace('promotion/', 'promo/'), 'thumb')
          const newPath = Path.join(tempDir, 'image', promo.thumbImage)
          Files.ensurePath(newPath)
          promo.thumbSize = await Image.resizeBookIcon(Path.join(confDir, 'image', promo.imageUrl), newPath, config.promoThumbImageHeight)
        }
      }));
    }

    // Write book pages
    const bookShare = bookToShare(Object.assign(autoPromo, elem));
    bookShare.url = `/p/fb/${elem.id}-${autoPromo.name}`
    let content = itemTpl({ book: elem, share: bookShare, style: data.styleConfig }, tplData);
    Files.savePage(outputDir + '/w/' + elem.id + '.html', content)

    if (elem.catchup && elem.series) {
      content = catchupTpl({ book: elem, share: bookShare, style: data.styleConfig }, tplData);
      Files.savePage(`${outputDir}/series/${elem.series.id}-catchup-${elem.seriesIndex}.html`, content)
    }

    // Write promos pages
    if (elem.promos) {
      elem.promos.map(promoElem => {
        const share = bookToShare(Object.assign(promoElem, elem))
        if (promoElem.category.facebook) {
          share.url = `/p/fb/${elem.id}-${promoElem.name}`
          content = bookPromoFacebookTpl({ book: elem, promo: promoElem, share: share }, tplData)
          Files.savePage(outputDir + share.url + '.html', content)
        }
        if (promoElem.category.twitter) {
          share.url = `/p/tw/${elem.id}-${promoElem.name}`
          content = bookPromoTwitterTpl({ book: elem, promo: promoElem, share: share }, tplData)
          Files.savePage(outputDir + share.url + '.html', content)
        }
      })
    }
  }))

  // For each author, render a new author page based on the author template.
  data.authors.map(function(elem) {
    let content = groupTpl({ group: elem, share: groupToShare(elem, 'author', 'books.author'), style: data.styleConfig }, tplData)
    Files.savePage(outputDir + '/author/' + elem.id + '.html', content)
  })

  // For each series, render a new series page based on the series template
  data.series.map(function(elem) {
    let content = groupTpl({ group: elem, share: groupToShare(elem, 'series', 'books'), style: data.styleConfig }, tplData)
    Files.savePage(outputDir + '/series/' + elem.id + '.html', content)
  })

  // Render stylesheets
  console.log("Rendering stylsheets.")
  let content = await Style.render(templateType, 'style/main.scss', { style: data.styleConfig }, tplData)
  Files.savePage(outputDir + `/style/main.css`, content.css)
  content = await Style.render(templateType, 'style/images.scss', {  style: data.styleConfig, books: data.published, groups: [...data.authors, ...data.series] }, tplData)
  Files.savePage(outputDir + `/style/images.css`, content.css)
  let tpl = await Files.loadTemplate(outputDir + `/style`, null, 'grid-min.css')
  Files.savePage(outputDir + `/style/grid-min.css`, tpl({ bkgndConfig: data.styleConfig.bkgndConfig }, tplData))
}

/** Compile React components and style for this config into an app package */
const renderReactComponents = async (config, outputDir, tempDir, options) => {
  console.log(`Rendering React components for client side script. tempDir=${tempDir}, outputDir=${outputDir}`)
  const absTempDir = (tempDir[0] === '/' ? tempDir : Path.join(__dirname, '..', tempDir))
  const absOutputDir = (outputDir[0] === '/' ? outputDir : Path.join(__dirname, '..', outputDir))
  Files.copyResourcesOverwrite('lib/script-src', Path.join(absTempDir, 'script-src'), [
    'index.jsx', 'booksSlider.jsx', 'themeSelect.jsx', 'textSlider.jsx', 'copyToClipboard.jsx', 'feedback.jsx'
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

/** Resolve all { file: } references in the given props object and all child objects */
const resolveFileRefs = async (rootDir, props, config) => {
    return Promise.all(Object.keys(props).map(async key => {
      let value = props[key];
      if (value) {
        if (value.constructor === Object) {
          if (Object.keys(value).length === 1 && value.file) {
            // If there's one key, and it's 'file'
            props[key] = await Files.loadLargeData(Path.join(rootDir, value.file), { props: props, config: config });
          } else {
            // Other object, recursively check all properties
            await resolveFileRefs(rootDir, value, config)
          }
        }
      }
    }))
}

const bookToShare = (book) => {
  const redirectUrl = book.primaryDistributor ? book.primaryDistributor.url : `/w/${book.id}`
  return {
    ogType: 'book',
    redirectUrl: redirectUrl,
    isbn: book.isbn,
    title: book.promoTitle || book.title,
    description: book.text || book.logline,
    keywords: book.tags,
    keywordsArray: (book.tags ? book.tags.split(',').map(tag => tag.trim()) : null),
    image: book.imageUrl || book.coverPromo,
    imageAlt: book.imageAlt || book.promoTitle || book.title + ' book cover',
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

const splitTextForSlider = (source, maxVisibleLines) => {
  let ret = {}

  let lines = source.split(/[\r\n]+/)

  ret.startText = lines.slice(0, maxVisibleLines).join("\n\n")
  if (lines.length > maxVisibleLines) {
    ret.lastLine = lines[maxVisibleLines].substr(0,30)
    ret.moreText = lines.slice(maxVisibleLines).join("\n\n")
  }

  return ret
}

const addBooksToAuthors = (config, authorMap, seriesMap, published) => {
  var typePluralMap = {
    book: "books",
    short: "shorts",
    anthology: "anthologies"
  };

  var displayNameMap = {
    books: "Novels",
    shorts: "Short Stories",
    anthologies: "Anthologies"
  };

  published.map(pub => {
    //
    const type = typePluralMap[pub.type] || pub.type
    const authorList = pub.author.split(",")
    const authorObjList = []

    // cache plural type in Pub object for template use.
    pub.typePlural = type

    //
    authorList.map(authorName => {
      authorName = authorName.trim()
      const author = authorMap[authorName]
      const pubs = author.pubs || {}

      authorObjList.push(author)

      // Add books to author
      if ( ! pubs[type]) {
        pubs[type] = {
          displayName: displayNameMap[type] || type,
          list: []
        }
      }
      pubs[type].list.push(pub)
      if ( ! author.pubs) {
        author.pubs = pubs
      }
    })

    // Replace list of author names with objects.
    pub.author = authorObjList

    // Series
    const series = seriesMap[pub.seriesName]
    if (series) {
      const pubs = series.pubs || {}
      // Add books to series
      if ( ! pubs[type]) {
        pubs[type] = {
          displayName: displayNameMap[type] || type,
          list: []
        }
      }
      pubs[type].list.push(pub)
      if ( ! series.pubs) {
        series.pubs = pubs
      }
    }

  })
}

// Trim down the data we save to the page as data input to the client side code generation
// Look here if a poperty you need is not available in client side code!
const filterAuthorMap = (config, authorMap) => {
  return Object.keys(authorMap).map(authorName => {
    let author = authorMap[authorName];
    let ret = {
      id: author.id,
      pubs: null
    }
    if (author.pubs) {
      ret.pubs = Object.keys(author.pubs).map(pubTypeName => {
        let pubType = author.pubs[pubTypeName]
        return {
          showTitles: config.showTitlesOnGroupedPage,
          list: pubType.list.map(pub => {
            return {
              id: pub.id,
              title: pub.title,
              logline: pub.logline,
              detailsUrl: Path.join(config.booksPath, pub.id),
              primaryDistributor: pub.primaryDistributor,
              published: pub.published
            }
          })
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

/** Rot-13 encrypt/decrypt */
function endecode(source) {
    return source.replace(/[a-zA-Z]/g,function(c){return String.fromCharCode((c<="Z"?90:122)>=(c=c.charCodeAt(0)+13)?c:c-26);});
}

/** Encode a list of properties on the given object, appending props names with "Encoded" */
function encodeProps(propNames, config) {
  propNames.map(function(propName) {
    if (config[propName]) {
      config[propName + "Encoded"] = endecode(config[propName]);
    }
  });
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

  return handler({}).then(() => {
  })
}
