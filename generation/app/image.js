const ImageLib = require('./imagePure')
const ImageSharp = require('sharp')
const Vibrant = require('node-vibrant')
const path = require('path');
const Handlebars = require('handlebars')
const Fs = require('fs-extra')

let skip = false

exports.setSkip = (value) => {
    skip = value;
}

exports.prepare = async (confPath, bkgndConfig, skin) => {
    if (skip) { return }
    const sourceImagePath = path.join(confPath, 'backgrounds', skin.imageFileNameRoot) + '.jpg'
    const siteImage = await ImageLib.load(sourceImagePath)

    // Generate output file name template
    const outNameTpl = Handlebars.compile(path.join(confPath, 'image', 'headers', skin.imageFileNameRoot) + '{%type%}{%size%}.png')

    // Split the site image into header and footer parts and save them as separate files.
    await prepareSm(bkgndConfig, outNameTpl, siteImage)
    await prepareMd(bkgndConfig, outNameTpl, siteImage)
    await prepareLg(bkgndConfig, outNameTpl, siteImage)
    await prepareXl(bkgndConfig, outNameTpl, siteImage)
}

exports.combineHeaderFooter = async (confPath, bkgndConfig, skin) => {
    if (skip) { return }
    const sourceImageRoot = path.join(confPath, 'backgrounds', skin.imageFileNameRoot)
    const headerImagePath = sourceImageRoot + 'header.jpg'
    const footerImagePath = sourceImageRoot + 'footer.jpg'
    const destImagePath = sourceImageRoot + '.jpg'

    // If the separate header and footer images exist, but the combined image does not, merge the header and footer
    // into a single image (as imput the the rest of the process)
    if ( ! Fs.existsSync(destImagePath) && Fs.existsSync(headerImagePath) && Fs.existsSync(footerImagePath)) {
        let headerImage, footerImage

        try {
            headerImage = await ImageLib.load(headerImagePath)
            footerImage = await ImageLib.load(footerImagePath)

            let img = await ImageLib.create(headerImage.width, headerImage.height + footerImage.height)

            ImageLib.blit(img, headerImage, 0, 0, 0, 0, headerImage.width, headerImage.height)
            ImageLib.blit(img, footerImage, 0, headerImage.height - 1, 0, 0, footerImage.width, footerImage.height)

            await ImageLib.save(img, destImagePath)
        } catch (err) {
            console.error(JSON.stringify(err))
            throw err
        }
    }
}

exports.resizeBookIcon = async (srcImagePath, newImagePath, newHeight) => {
    if (skip) {
        const destImg = await ImageLib.load(newImagePath)
        return { height: destImg.height, width: destImg.width }
    }
    const srcImg = await ImageLib.load(srcImagePath)
    if (srcImg) {
        let newWidth = (newHeight / srcImg.height) * srcImg.width
        // Sharp requires an integer width
        newWidth = Math.round(newWidth);
        if (srcImg.height !== newHeight) {
            await ImageSharp(srcImagePath).resize(newWidth, newHeight).toFile(newImagePath);
            return { height: newHeight, width: newWidth }
        }
    } else {
        console.log(`Could not load image ${srcImagePath}`)
    }
}

/** Apply a sticker and overwite the provided image file. */
exports.applySticker = async (srcImagePath, stickerImagePath, vAlign, hAlign) => {
    if (skip) { return; }
    const srcImg = await ImageLib.load(srcImagePath)
    if (srcImg) {
        const stickerImg = await ImageLib.load(stickerImagePath)
        if (stickerImg) {
            ImageLib.addOverlay(srcImg, stickerImg, vAlign, hAlign)
            await ImageLib.save(srcImg, srcImagePath)
        } else {
            console.log(`Could not load image ${imagePath}`)
        }
    } else {
        console.log(`Could not load image ${imagePath}`)
    }
}

/** Apply cover image on top of the background and save to a new path. */
exports.createPromo = async (srcImagePath, bkgrndImagePath, outImagePath) => {
    if (skip) {
        const bkgrndImg = await ImageLib.load(bkgrndImagePath)
        return { width: bkgrndImg.width, height: bkgrndImg.height }
    }
    const srcImg = await ImageLib.load(srcImagePath)
    if (srcImg) {
        const bkgrndImg = await ImageLib.load(bkgrndImagePath)
        if (bkgrndImg) {
            const destX = (bkgrndImg.width / 2) - (srcImg.width / 2)
            ImageLib.blit(bkgrndImg, srcImg, destX, 0, 0, 0, srcImg.width, srcImg.height)
            await ImageLib.save(bkgrndImg, outImagePath)
            return { width: bkgrndImg.width, height: bkgrndImg.height }
        } else {
            console.log(`Could not load image ${imagePath}`)
        }
    } else {
        console.log(`Could not load image ${imagePath}`)
    }
}

/** Must be run synchronously since Vibrant lib is not thread-safe. */
exports.generatePalette = async (confPath, tempDir, config, skin) => {
    const siteImage = await ImageLib.load(path.join(confPath, 'backgrounds', skin.imageFileNameRoot) + '.jpg')
    const origHeight = siteImage.height
    const origWidth = siteImage.width

    try {
        // Create combined header+footer image for Vibrant to work on.
        let img = await ImageLib.create(origWidth, config.height + config.footerHeight)
        ImageLib.blit(img, siteImage, 0, 0, 0, 0, origWidth, config.height)
        ImageLib.blit(img, siteImage, 0, config.height, 0, origHeight - config.footerHeight, origWidth, config.footerHeight)

        // Save a temp file, reun Vibrant and delete the temp (since Noode-Vibrant only accepts a file path)
        sourceImagePath = path.join(tempDir, skin.imageFileNameRoot + '_Palette_Source.png')
        await ImageLib.save(img, sourceImagePath)
        let palette = await Vibrant.from(sourceImagePath).getPalette()
        Fs.unlinkSync(sourceImagePath)

        //
        return palette
    } catch(err) {
        console.error(JSON.stringify(err));
        throw err;
    }
}

/** Extract foreground and background colors from the Vibrant palette object so they can be used directly
    in CSS.
*/
exports.extractVibrantPaletteColors = palette => {
      //
      function addColorProps(dest, name, color) {
        let rgb = color.getRgb();

        dest.bkgnd[name] = color.getHex();
        [1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(index => {
          dest.bkgnd[name + '0' + index] = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.${index})`
        });

        dest.fgnd[name + 'TitleText'] = color.getTitleTextColor()
        dest.fgnd[name + 'BodyText'] = color.getBodyTextColor()
      }

      //
      let p = { bkgnd: {}, fgnd: {} }

      // Vibrant can sometimes be missing colors. Attempt to adjust by substituting a nearby color.
      if ( ! palette.Vibrant) {
        palette.Vibrant = palette.LightVibrant
      }
      if ( ! palette.DarkVibrant) {
        palette.DarkVibrant = palette.Vibrant
      }
      if ( ! palette.LightVibrant) {
        palette.LightVibrant = palette.Vibrant
      }
      if ( ! palette.Muted) {
        palette.Muted = palette.LightMuted
      }
      if ( ! palette.DarkMuted) {
        palette.DarkMuted = palette.Muted
      }
      if ( ! palette.LightMuted) {
        palette.LightMuted = palette.Muted
      }

      addColorProps(p, 'vibrant', palette.Vibrant)
      addColorProps(p, 'lightMuted', palette.LightMuted)
      addColorProps(p, 'darkMuted', palette.DarkMuted)
      addColorProps(p, 'muted', palette.Muted)
      addColorProps(p, 'lightVibrant', palette.LightVibrant)
      addColorProps(p, 'darkVibrant', palette.DarkVibrant)

      return p
}

exports.prepStyleFromPalette = (skin, palette) => {
    //
    function setProp(name, value) {
        if ( ! skin[name]) {
            skin[name] = value;
        }
    }

    // Page background colors
    if (skin.theme.toLowerCase() === 'dark') {
        // Dark Look
        setProp('headerColor', palette.bkgnd.darkVibrant)
        setProp('footerColor', palette.bkgnd.darkVibrant)
        setProp('contentBkColor', palette.bkgnd.muted05)
        setProp('contentBoxShadowColor', palette.bkgnd.muted08)
        setProp('featureBkColor', palette.bkgnd.muted07)
    } else if (skin.theme.toLowerCase() === 'light') {
        // light Look
        setProp('headerColor', palette.bkgnd.lightVibrant)
        setProp('footerColor', palette.bkgnd.lightVibrant)
        setProp('contentBkColor', palette.bkgnd.darkMuted05)
        setProp('contentBoxShadowColor', palette.bkgnd.darkMuted08)
        setProp('featureBkColor', palette.bkgnd.darkMuted07)
    } else if (skin.theme.toLowerCase() === 'darkmuted') {
        // dark Look
        setProp('headerColor', palette.bkgnd.darkMuted)
        setProp('footerColor', palette.bkgnd.darkMuted)
        setProp('contentBkColor', palette.bkgnd.muted05)
        setProp('contentBoxShadowColor', palette.bkgnd.muted08)
        setProp('featureBkColor', palette.bkgnd.muted07)
    } else if (skin.theme.toLowerCase() === 'lightmuted') {
        // light Look
        setProp('headerColor', palette.bkgnd.lightMuted)
        setProp('footerColor', palette.bkgnd.lightMuted)
        setProp('contentBkColor', palette.bkgnd.darkMuted05)
        setProp('contentBoxShadowColor', palette.bkgnd.darkMuted08)
        setProp('featureBkColor', palette.bkgnd.darkMuted07)
    } else if (skin.theme.toLowerCase() === 'muted') {
        // light Look
        setProp('headerColor', palette.bkgnd.darkVibrant)
        setProp('footerColor', palette.bkgnd.darkVibrant)
        setProp('contentBkColor', palette.bkgnd.muted05)
        setProp('contentBoxShadowColor', palette.bkgnd.muted08)
        setProp('featureBkColor', palette.bkgnd.darkMuted07)
    }

    //
    setProp('textColor', palette.fgnd.darkMutedBodyText)
    setProp('linkColor', skin.textColor)
    setProp('headerMenuColor', palette.fgnd.darkMutedTitleText)
    setProp('headerMenuHoverColor', palette.bkgnd.darkVibrant)
    setProp('headerMenuSelectedColor', skin.textColor)
    setProp('headerMenuHoverBkgnd', skin.contentBkColor)
    setProp('headerMenuSelectedBkgnd', skin.contentBkColor)
    setProp('titleFlipColor', skin.headerColor)
    setProp('titleFlipShadowColor', skin.textColor)
    setProp('footerTextColor', skin.textColor)
    setProp('footerTextShadowColor', palette.bkgnd.Muted)
    setProp('featureTextColor', skin.textColor)
    setProp('featureLoglineColor', palette.bkgnd.darkVibrant)
}

const prepareSm = async function(config, outNameTpl, origImage) {
    const origHeight = origImage.height
    const origWidth = origImage.width
    const origCenter = origWidth / 2
    const halfWidth = config.widthSm / 2

    const x1 = origCenter - halfWidth

    let outName = outNameTpl({ type: '', size: 'SM' })
    if ( ! Fs.existsSync(outName)) {
        try {
            console.log(`Create ${outName}`)
            let img = await ImageLib.create(origWidth, config.heightSm)
            ImageLib.blit(img, origImage, x1 - 1, 0, x1 - 1, 0, config.widthSm + 2, config.heightSm)
            await ImageLib.save(img, outName)
            delete img;
        } catch(err) {
            console.error(JSON.stringify(err));
            throw err;
        }
    }

    outName = outNameTpl({ type: 'Footer', size: 'SM' })
    if ( ! Fs.existsSync(outName)) {
        try {
            console.log(`Create ${outName}`)
            let img = await ImageLib.create(origWidth, config.footerHeight)
            ImageLib.blit(img, origImage, x1 - 1, 0, x1 - 1, origHeight - config.footerHeight, config.widthSm + 2, config.footerHeight)
            await ImageLib.save(img, outName)
            delete img
        } catch(err) {
            console.error(JSON.stringify(err));
            throw err;
        }
    }
}

const prepareMd = async function(config, outNameTpl, origImage) {
    const origHeight = origImage.height
    const origWidth = origImage.width
    const origCenter = origWidth / 2
    const halfWidthSm = config.widthSm / 2
    const halfWidthMd = config.widthMd / 2

    const partWidth = halfWidthMd - halfWidthSm
    const x1 = origCenter - halfWidthMd
    const x2 = origCenter + halfWidthSm

    let outName = outNameTpl({ type: '', size: 'MD' })
    if ( ! Fs.existsSync(outName)) {
        console.log(`Create ${outName}`)
        try {
            let img = await ImageLib.create(origWidth, config.height)
            ImageLib.blit(img, origImage, x1 - 1, 0, x1 - 1, 0, partWidth + 2, config.height)
            ImageLib.blit(img, origImage, x2 - 1, 0, x2 - 1, 0, partWidth + 2, config.height)
            ImageLib.blit(img, origImage, x1 + partWidth - 1, config.heightSm, x1 + partWidth - 1, config.heightSm, config.widthSm + 2, config.height - config.heightSm)
            await ImageLib.save(img, outName)
            delete img;
        } catch(err) {
            console.error(JSON.stringify(err));
            throw err;
        }
    }

    outName = outNameTpl({ type: 'Footer', size: 'MD' })
    if ( ! Fs.existsSync(outName)) {
        console.log(`Create ${outName}`)
        try {
            let img = await ImageLib.create(origWidth, config.footerHeight)
            ImageLib.blit(img, origImage, x1 - 1, 0, x1 - 1, origHeight - config.footerHeight, partWidth + 2, config.footerHeight)
            ImageLib.blit(img, origImage, x2 - 1, 0, x2 - 1, origHeight - config.footerHeight, partWidth + 2, config.footerHeight)
            await ImageLib.save(img, outName)
            delete img
        } catch(err) {
            console.error(JSON.stringify(err));
            throw err;
        }
    }
}

const prepareLg = async function(config, outNameTpl, origImage) {
    const origHeight = origImage.height
    const origWidth = origImage.width
    const origCenter = origWidth / 2
    const halfWidthMd = config.widthMd / 2
    const halfWidthLg = config.widthLg / 2

    const partWidth = halfWidthLg - halfWidthMd
    const x1 = origCenter - halfWidthLg
    const x2 = origCenter + halfWidthMd

    await prepareSides(config, outNameTpl, 'LG', origImage, x1, x2, partWidth)
}

const prepareXl = async function(config, outNameTpl, origImage) {
    const origHeight = origImage.height
    const origWidth = origImage.width
    const origCenter = origWidth / 2
    const halfWidthLg = config.widthLg / 2

    const partWidth = origCenter - halfWidthLg
    const x1 = 0
    const x2 = origCenter + halfWidthLg

    await prepareSides(config, outNameTpl, 'XL', origImage, x1, x2, partWidth)
}

const prepareSides = async function(config, outNameTpl, size, origImage, x1, x2, partWidth) {
    const origHeight = origImage.height
    const origWidth = origImage.width

    let outName = outNameTpl({ type: '', size: size })
    if ( ! Fs.existsSync(outName)) {
        console.log(`Create ${outName}`)
        try {
            let img = await ImageLib.create(origWidth, config.height)
            ImageLib.blit(img, origImage, x1 - 1, 0, x1 - 1, 0, partWidth + 2, config.height)
            ImageLib.blit(img, origImage, x2 - 1, 0, x2 - 1, 0, partWidth + 2, config.height)
            await ImageLib.save(img, outName)
            delete img;
        } catch(err) {
            console.error(JSON.stringify(err));
            throw err;
        }
    }

    outName = outNameTpl({ type: 'Footer', size: size })
    if ( ! Fs.existsSync(outName)) {
        console.log(`Create ${outName}`)
        try {
            let img = await ImageLib.create(origWidth, config.footerHeight)
            ImageLib.blit(img, origImage, x1 - 1, 0, x1 - 1, origHeight - config.footerHeight, partWidth + 2, config.footerHeight)
            ImageLib.blit(img, origImage, x2 - 1, 0, x2 - 1, origHeight - config.footerHeight, partWidth + 2, config.footerHeight)
            await ImageLib.save(img, outName)
            delete img
        } catch(err) {
            console.error(JSON.stringify(err));
            throw err;
        }
    }
}
