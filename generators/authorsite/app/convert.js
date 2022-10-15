const Fs = require('fs-extra')
const Files = require('./files');
const Path = require('path');
const Walk = require('walk');


/** */
const main = async function(configName) {
    let confDir = Path.join('conf', configName)

    const config = await Files.loadJson(confDir + "/conf.json");
    const authors = await Files.loadJson(confDir + "/authors.json", config)

    // Visit all files in the source dir and generate 'published' data
    let publishedMap = await Promise.all(authors.map(author => {
        return exports.deploy(configName, author);
    }));

    // Convert map into flat array and save to file.
    let published = []
    publishedMap.map(entry => {
        published.push(...entry)
    })
    await Files.saveFile(Path.join(confDir, 'published.json'), JSON.stringify(published, null, 4))
}

/**  */
exports.deploy = async (configName, author) => {
    let confDir = Path.join('conf', configName)
    let rootPath = Path.join(confDir, 'oldSiteImages', author.name)
    let published = []

    return new Promise( async (resolve, reject) => {
        let walker = Walk.walk(rootPath, {})

        walker.on('file', async (root, fileStats, next) => {
            if (/\.DS_Store|Thumbs.db/.test(fileStats.name)) {
                next()
                return
            }
            let sourcePath = Path.join(root, fileStats.name)
            let filename = fileStats.name.toLowerCase()
            let localPath = Path.join(root.substring(rootPath.length + 1), author.name)
            let parts = Path.parse(filename)

            published.push({
                isbn: parts.name,
                "title": parts.name,
                "author": author.name,
                "type": "painting",
                "coverImage": Path.join("covers", localPath, filename),
                "published": "yes",
                "logline": parts.name,
                "blurb": parts.name
            })

            let destDir = Path.join('conf', configName, 'covers', localPath);
            let destPath = Path.join(destDir, filename)
            console.log(`Convert image: ${sourcePath} to ${destPath}`)
            if ( ! Fs.existsSync(destPath)) {
                Fs.ensureDir(destDir)
                Fs.copySync(sourcePath, destPath)
            }

            next()
        })

        walker.on('errors', (root, nodeStatsArray, next) => {
            console.log("Errors: ", JSON.stringify(nodeStatsArray))
            next()
        })

        walker.on('end', () => {
            resolve(published)
        })
    })    
}

//
main(process.argv[2])