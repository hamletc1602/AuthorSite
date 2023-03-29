const Fs = require('fs-extra')
const Path = require('path')
const Md5File = require("md5-file")

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

exports.getETagForFile = (filePath) => {
  return '"' + Md5File.sync(filePath) + '"';
}

exports.isDirectory = async (path) => {
  return Fs.lstat(path).then(stat => stat.isDirectory())
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
