const PImage = require('pureimage')
const Fs = require('fs-extra')

exports.load = function(imagePath) {
    if (/\.png$/i.test(imagePath)) {
        return PImage.decodePNGFromStream(Fs.createReadStream(imagePath));
    } else if (/\.jpg$/i.test(imagePath)) {
        return PImage.decodeJPEGFromStream(Fs.createReadStream(imagePath));
    }
}

exports.create = function(width, height) {
    return PImage.make(width, height)
}

exports.blit = function(destImg, srcImg, destX, destY, srcX, srcY, width, height) {
    let ctx = destImg.getContext('2d');
    ctx.drawImage(srcImg, srcX, srcY, width, height, destX, destY, width, height)
}

exports.save = function(image, outPath) {
    if (/\.png$/i.test(outPath)) {
        return PImage.encodePNGToStream(image, Fs.createWriteStream(outPath))
    } else if (/\.jpg$/i.test(outPath)) {
        return PImage.encodeJPEGToStream(image, Fs.createWriteStream(outPath))
    }
}

exports.resize = function(srcImg, newWidth, newHeight) {
    let resized = PImage.make(newWidth, newHeight)
    let ctx = resized.getContext('2d');
    ctx.drawImage(srcImg, 0, 0, srcImg.width, srcImg.height, 0, 0, newWidth, newHeight)
    return resized;
}

// Directly modifies the source image to add all non-trnasparent pixels from overlay image to the new
// image. Default to adding starting from the bottom right corner of the source image.
exports.addOverlay = function(srcImg, overlayImg, vAlign, hAlign) {
    let startY = -1
    switch (vAlign) {
        case 'top': startY = 0; break
        case 'center': startY = (srcImg.height / 2) - (overlayImg.height / 2); break
        case 'bottom': startY = srcImg.height - overlayImg.height; break
        default: throw `Unnexcpected vert. align value: ${vAlign}`
    }
    let startX = -1
    switch (hAlign) {
        case 'left': startX = 0; break
        case 'center': startX = (srcImg.width / 2) - (overlayImg.width / 2); break
        case 'right': startX = srcImg.width - overlayImg.width; break
        default: throw `Unnexcpected horiz. align value: ${hAlign}`
    }
    for (let ix = 0; ix < overlayImg.width; ++ix) {
        for (let iy = 0; iy < overlayImg.height; ++iy) {
            const pix = overlayImg.getPixelRGBA_separate(ix, iy);
            if (pix[3] > 0) {
                const destPixSep = mergePixels(pix, srcImg.getPixelRGBA_separate(ix, iy))
                srcImg.setPixelRGBA_i(ix + startX, iy + startY, destPixSep[0], destPixSep[1], destPixSep[2], destPixSep[3])
            }
        }
    }
}

/** Merge two RGB pixels with transparency
aOut = aA + (aB * (255 - aA) / 255)
rOut = (rA * aA + rB * aB * (255 - aA) / 255)/aOut
gOut = (gA * aA + gB * aB * (255 - aA) / 255)/aOut
bOut = (bA * aA + bB * aB * (255 - aA) / 255)/aOut
*/
const mergePixels = (a, b) => {
    const outA = a[3] + (b[3] * (255 - a[3]) / 255)
    return [
        (a[0] * a[3] + b[0] * b[3] * (255 - a[3]) / 255) / outA,
        (a[1] * a[3] + b[1] * b[3] * (255 - a[3]) / 255) / outA,
        (a[2] * a[3] + b[2] * b[3] * (255 - a[3]) / 255) / outA,
        outA
    ]
}
