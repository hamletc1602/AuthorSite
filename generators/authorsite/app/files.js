const Fs = require('fs-extra')
const Delimiters = require('handlebars-delimiters')
const Handlebars = require('handlebars')
const Path = require('path')
const Markdown = require( "markdown" ).markdown;
const StripJsonComments = require('strip-json-comments');
const StripHtmlComments = require('strip-html-comments')
const Md5File = require("md5-file")
const Yaml = require('yaml');
const fileCompare = require('filecompare');
var Rss = require('rss');

const compareReadSize = 4096;
const compareBufferSize = 8192;

/* Shadow of Fs copy */
exports.copy = (src, dest) => {
  return Fs.copyFile(src, dest)
}

/** Return true if the file path exists, False if it does not. */
exports.exists = (filePath) => {
  return Fs.existsSync(filePath)
}

/** Load and parse a config file, whether JSON or YAML. */
exports.loadConfig = (filepath, config) => {
  const ext = Path.extname(filepath).toLowerCase()
  switch (ext) {
    case '.json':
      return this.loadJson(filepath, config)
    case '.yaml':
      return this.loadYaml(filepath, config)
    default:
      throw new Error(`Configuration files must be JSON or YAML '${ext}' files are not supported.`)
  }
}

/** Load and parse a JSON file. Returns null if the file does not exist. */
exports.loadJson = (filepath, config) => {
  return new Promise((resolve, reject) => {
    if ( ! Fs.existsSync(filepath)) {
      resolve(null)
    }
    Fs.readFile(filepath, 'utf8', (err, content) => {
      var jsonTpl = null
      if (err) {
        reject(err)
      } else {
        try {
          // console.debug("Load template: " + filepath)
          content = StripJsonComments(content)
          Delimiters(Handlebars, ['{%', '%}'])
          if (config) {
            // If config is provied, treat the JSON file as a template
            // to be processed with the config as data.
            jsonTpl = Handlebars.compile(content);
            content = jsonTpl(config)
          }
          resolve(JSON.parse(content))
        } catch (err) {
          reject(err)
        }
      }
    })
  })
}

/** Load and parse a 'large data' file (for blurbs, author bio, etc.) */
exports.loadLargeData = (filepath, config) => {
  return new Promise((resolve, reject) => {
    Fs.readFile(filepath, 'utf8', (err, content) => {
      var tpl = null
      if (err) {
        reject(err)
      } else {
        try {
          // console.log("Load template: " + filepath)
          Delimiters(Handlebars, ['{%', '%}'])
          if (config) {
            // If config is provied, treat the file as a template
            // to be processed with the config as data.
            tpl = Handlebars.compile(content);
            content = tpl(config)
          }
          // If the source file ends with .md, process it as markdown
          if (/\.md$/.test(filepath)) {
            content = Markdown.toHTML(content)
          }
          resolve(content)
        } catch (err) {
          reject(err)
        }
      }
    })
  })
}

/** Load and parse a template
    type: desktop or mobile, etc. (will be ignored if null or undefined).
*/
exports.loadTemplate = (dirPath, type, fileName) => {
  return new Promise((resolve, reject) => {
    // Create a list of all possible template locations, in priority order.
    const paths = []
    if (dirPath) {
      if (type) {
        paths.push(Path.join(dirPath, type, fileName))
      }
      paths.push(Path.join(dirPath, 'default', fileName))
      paths.push(Path.join(dirPath, fileName))
    }
    if (type) {
      paths.push(Path.join('templates', type, fileName))
    }
    paths.push(Path.join('templates/default', fileName))
    paths.push(Path.join('templates', fileName))
    // Check each path in priority order and stop at the first one found to exist
    let filepath = null
    for (const path of paths) {
      if (Fs.existsSync(path)) {
        filepath = path
        //console.log(`Found template: ${path}`, paths)
        break
      }
    }
    if (filepath === null) {
      throw new Error(`Unable to find template for file: ${fileName}, type: ${type}, override dir: ${dirPath}`, paths)
    }
    // Load and process the template
    Fs.readFile(filepath, 'utf8', (err, content) => {
      if (err) {
        reject(err)
      } else {
        try {
          content = StripHtmlComments(content)
          if (/\..*css$/g.test(filepath)) {
            Delimiters(Handlebars, ['<%', '%>'])
          } else {
            Delimiters(Handlebars, ['{%', '%}'])
          }
          resolve(Handlebars.compile(content))
        } catch (err) {
          reject(err)
        }
      }
    })
  })
}

/** Load and parse a template */
exports.loadTemplateDirect = (content) => {
    Delimiters(Handlebars, ['{%', '%}'])
    return Handlebars.compile(content)
}

/** Create (if needed) all the extra directories in the website output dir. */
exports.createOutputDirs = (dirPathList) => {
    dirPathList.forEach(dirPath => {
        if ( ! Fs.existsSync(dirPath)) {
            this.ensurePath(dirPath)
        }
    });
}

/** Clean all the generated output files/dirs */
exports.cleanOutput = (pathList) => {
    pathList.forEach(path => {
        if (Fs.existsSync(path)) {
            var stats = Fs.statSync(path)
            if (stats.isDirectory()) {
                Fs.removeSync(path)
            } else {
                Fs.unlinkSync(path)
            }
        }
    })
}

/** Ensure all directories in the given path are created, if they don't already exist. */
exports.ensurePath = (filePath) => {
  let parts = filePath.split('/');
  if (parts[parts.length - 1].indexOf('.') > -1) {
    parts = parts.slice(0, parts.length - 1);
  }
  const dirPath = parts.join('/');
  if ( ! Fs.existsSync(dirPath)) {
    Fs.ensureDirSync(dirPath)
  }
}

/** Save HTML content to output */
exports.savePage = (filepath, content) => {
  this.ensurePath(filepath);
  return exports.saveFile(filepath, content)
}

/** Save file content to output */
exports.saveFile = (filepath, content) => {
  return new Promise((resolve, reject) => {
    Fs.writeFile(filepath, content, 'utf8', (err) => {
      if (err) {
        reject(err)
      } else {
        try {
          resolve()
        } catch (err) {
          reject(err)
        }
      }
    })
  })
}

/** Append file content to existing (or new) file. */
exports.appendFile = (filepath, content) => {
  return new Promise((resolve, reject) => {
    Fs.appendFile(filepath, content, (err) => {
      if (err) {
        reject(err)
      } else {
        try {
          resolve()
        } catch (err) {
          reject(err)
        }
      }
    })
  })
}

/** Copy files for a list of source & dest dirs  */
exports.copyResourcesOverwrite = (srcConfigName, destConfigName, pathList) => {
  if (pathList) {
    pathList.forEach(function(path) {
      Fs.copySync(Path.join(srcConfigName, path), Path.join(destConfigName, path), { overwrite: true })
    });
  } else {
    if (Fs.existsSync(srcConfigName)) {
      Fs.copySync(srcConfigName, destConfigName, { overwrite: true })
    }
  }
}

/** Copy files for a list of source & dest dirs  */
exports.copyResourcesIfNotExist = (srcPath, destPath, pathList) => {
  pathList.forEach(function(path) {
    if ( ! Fs.existsSync(Path.join(destPath, path))) {
      Fs.copySync(Path.join(srcPath, path), Path.join(destPath, path))
    }
  });
}

/** From the given path, and a modifier string, return a new path, and ensure that the new file exists, copying
    the given source file to the new name if needed.
 */
exports.cloneToNewPath = function(rootPath, origPath, destRootPath, modifier) {
  let newPath = this.createNewPath(origPath, modifier)
  if ( ! Fs.existsSync(Path.join(destRootPath, newPath))) {
    Fs.copySync(Path.join(rootPath, origPath), Path.join(destRootPath, newPath))
  }
  return newPath
}

exports.createNewPath = (origPath, modifier) => {
  let extStart = origPath.length - 4  // Assume 4 char ext. Cheezy, but a good bet.
  return origPath.substr(0, extStart) + '_' + modifier + origPath.substr(extStart)
}

/** */
exports.loadFileBinary = (filepath) => {
  return new Promise((resolve, reject) => {
    Fs.readFile(filepath, (err, content) => {
      if (err) {
        reject(err)
      } else {
        resolve(content)
      }
    })
  })
}

exports.getMd5ForFile = (filePath) => {
  return Md5File.sync(filePath);
}

exports.getETagForFile = (filePath) => {
  return '"' + Md5File.sync(filePath) + '"';
}

exports.loadYaml = (filepath) => {
  return new Promise((resolve, reject) => {
    Fs.readFile(filepath, 'utf8', (err, content) => {
      if (err) {
        reject(err)
      } else {
        try {
          const obj = Yaml.parse(content);
          resolve(obj);
        } catch (err) {
          reject(err)
        }
      }
    })
  })
}

exports.isDirectory = async (path) => {
  return Fs.lstat(path).then(stat => stat.isDirectory())
}

exports.listDirWithHash = async (path, basePath) => {
  const files = await Fs.readdir(path)
  const list = []
  await Promise.all(
    files.map(async file => {
      if (file === '.DS_Store') { return }
      const fullPath = Path.join(path, file)
      if (await exports.isDirectory(fullPath)) {
        list.push(...await exports.listDirWithHash(fullPath, basePath || path))
      } else {
        list.push({
          path: fullPath,
          relPath: fullPath.replace(basePath || path, ''),
          hash: Md5File.sync(fullPath),
        })
      }
    })
  )
  return list
}

exports.listDir = async (path, excludeList, basePath) => {
  const files = await Fs.readdir(path)
  const list = []
  await Promise.all(
    files.map(async file => {
      if (excludeList.find(item => item === file)) { return }
      const fullPath = Path.join(path, file)
      if (await exports.isDirectory(fullPath)) {
        list.push(...await exports.listDir(fullPath, excludeList, basePath || path))
      } else {
        list.push({
          path: fullPath,
          relPath: fullPath.replace(basePath || path, ''),
        })
      }
    })
  )
  return list
}

exports.compare = (src, dest) => {
  return new Promise((resolve, reject) => {
    try {
      fileCompare(src, dest, (equal => resolve(equal)), compareReadSize, compareBufferSize)
    } catch (e) {
      reject(e)
    }
  })
}

/*

// lets create an rss feed
var feed = new RSS({
  title: 'title',
  description: 'description',
  feed_url: 'http://example.com/rss.xml',
  site_url: 'http://example.com',
  image_url: 'http://example.com/icon.png',
  docs: 'http://example.com/rss/docs.html',
  managingEditor: 'Dylan Greene',
  webMaster: 'Dylan Greene',
  copyright: '2013 Dylan Greene',
  language: 'en',
  categories: ['Category 1','Category 2','Category 3'],
  pubDate: 'May 20, 2012 04:00:00 GMT',
  ttl: '60',
  custom_namespaces: {
    'itunes': 'http://www.itunes.com/dtds/podcast-1.0.dtd'
  },
  custom_elements: [
    {'itunes:subtitle': 'A show about everything'},
    {'itunes:author': 'John Doe'},
    {'itunes:summary': 'All About Everything is a show about everything. Each week we dive into any subject known to man and talk about it as much as we can. Look for our podcast in the Podcasts app or in the iTunes Store'},
    {'itunes:owner': [
      {'itunes:name': 'John Doe'},
      {'itunes:email': 'john.doe@example.com'}
    ]},
    {'itunes:image': {
      _attr: {
        href: 'http://example.com/podcasts/everything/AllAboutEverything.jpg'
      }
    }},
    {'itunes:category': [
      {_attr: {
        text: 'Technology'
      }},
      {'itunes:category': {
        _attr: {
          text: 'Gadgets'
        }
      }}
    ]}
  ]
});

// loop over data and add to feed
feed.item({
  title:  'item title',
  description: 'use this for the content. It can include html.',
  url: 'http://example.com/article4?this&that', // link to the item
  guid: '1123', // optional - defaults to url
  categories: ['Category 1','Category 2','Category 3','Category 4'], // optional - array of item categories
  author: 'Guest Author', // optional - defaults to feed author property
  date: 'May 27, 2012', // any format that js Date can parse.
  lat: 33.417974, //optional latitude field for GeoRSS
  long: -111.933231, //optional longitude field for GeoRSS
  enclosure: {url:'...', file:'path-to-file'}, // optional enclosure
  custom_elements: [
    {'itunes:author': 'John Doe'},
    {'itunes:subtitle': 'A short primer on table spices'},
    {'itunes:image': {
      _attr: {
        href: 'http://example.com/podcasts/everything/AllAboutEverything/Episode1.jpg'
      }
    }},
    {'itunes:duration': '7:04'}
  ]
});

*/

exports.writeRss = (config, news, fileName) => {




  const feed = new Rss({
    title: 'title',
    description: 'description',
    feed_url: 'http://example.com/rss.xml',
    site_url: 'http://example.com',
    image_url: 'http://example.com/icon.png',
    docs: 'http://example.com/rss/docs.html',  // ??
    managingEditor: 'Dylan Greene',  // ??
    webMaster: 'Dylan Greene',  // ??
    copyright: config.copyright,
    language: 'en',
    categories: ['Category 1','Category 2','Category 3'],  // Condense from all news entries
    pubDate: 'May 20, 2012 04:00:00 GMT',  // Current date?
    ttl: '60',
  })

  // Add the latest 20 news entries
  feed.item({
    title:  'item title',
    description: 'use this for the content. It can include html.',
    url: 'http://example.com/article4?this&that', // link to the item
    categories: ['Category 1','Category 2','Category 3','Category 4'], // optional - array of item categories
    author: 'Guest Author', // optional - defaults to feed author property
    date: 'May 27, 2012', // any format that js Date can parse.
    enclosure: {url:'...', file:'path-to-file'}, // optional enclosure  // Image??
  })

  const xml = feed.xml()
}
