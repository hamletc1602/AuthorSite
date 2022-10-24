const mime = require('mime');

/** Constructor */
function AwsUtils(options) {
  if (!(this instanceof AwsUtils)) {
    return new AwsUtils(options);
  }
  this.files = options.files
  this.s3 = options.s3
  this.sqs = options.sqs
  this.stateQueueUrl = options.stateQueueUrl
  this.maxAgeBrowser = options.maxAgeBrowser || 60 * 60 * 24  // 24 hours
  this.maxAgeCloudFront = options.maxAgeCloudFront || 60  // 60 seconds
}

/** Get all files from an S3 bucket and save them to disk */
AwsUtils.prototype.pull = async function(bucket, keyPrefix, destDir) {
    console.log(`Start pull of config from ${bucket}:${keyPrefix} to ${destDir}`)
    const list = await this.list(bucket)
    const filtered = list.filter(item => item.Key.indexOf(keyPrefix) === 0)
    const batchedList = this.batch(filtered, 32)
    await this.saveFiles(bucket, keyPrefix, batchedList, destDir)
}

/** List metadata for all objects from and S3 bucket */
AwsUtils.prototype.list = async function(bucket) {
    let isTruncated = true;
    let marker;
    const items = []
    while(isTruncated) {
        let params = { Bucket: bucket }
        if (marker) {
            params.Marker = marker
        }
        const response = await this.s3.listObjects(params).promise();
        items.push(...response.Contents)
        isTruncated = response.IsTruncated
        if (isTruncated) {
            marker = response.Contents.slice(-1)[0].Key;
        }
    }
    return items;
}

/** List all keys in the bucket, filtered by the given prefix. Intentionally mathing the interface of Files.listDir. */
AwsUtils.prototype.listDir = async function(bucket, keyPrefix) {
  const list = await this.list(bucket)
  const filtered = list.filter(item => item.Key.indexOf(keyPrefix) === 0)
  return filtered.map(item => {
      return {
          path: item.Key,
          relPath: item.Key.substring(keyPrefix.length),
          hash: item.ETag  // ETag will be MD5 hash for objects <16MB, for non-encrypted buckets
      }
  })
}

/** Group a list of items into sub groups of the given size */
AwsUtils.prototype.batch = function(list, size) {
    const ret = []
    let start = 0
    while ((start + size) < list.length) {
        ret.push(list.slice(start, start + size))
        start += size
    }
    ret.push(list.slice(start, list.length))
    return ret
}

/** Save all files matching a specific RE to disk. Batched list is an array of arrays of S3 items. */
AwsUtils.prototype.saveFiles = async function(bucket, keyPrefix, batchedList, destDir) {
  for (let i = 0; i < batchedList.length; ++i) {
    await Promise.all(batchedList[i].map(async item => {
      try {
        const obj = await this.get(bucket, item.Key)
        const filePath = destDir + '/' + item.Key.substring(keyPrefix.length)
        this.files.ensurePath(filePath)
        await this.files.saveFile(filePath, obj.Body)
      } catch(e) {
        console.error(`Failed to save ${keyPrefix}`)
      }
    }))
  }
}

AwsUtils.prototype.get = async function(bucket, key) {
  return await this.s3.getObject({ Bucket: bucket, Key: key }).promise()
}

AwsUtils.prototype.put = async function(bucket, key, type, content) {
  return await this.s3.putObject({
    Bucket: bucket,
    Key: key,
    Body: content,
    ContentType: type,
    CacheControl: `max-age=${this.maxAgeBrowser},s-maxage=${this.maxAgeCloudFront}`
  }).promise()
}

AwsUtils.prototype.delete = async function(bucket, key) {
  return await this.s3.deleteObject({ Bucket: bucket, Key: key }).promise()
}

/** Merge all temp files to the output dir, only replacing output files if the hashes differ. */
AwsUtils.prototype.mergeToS3 = async function(sourceDir, destBucket, destPrefix, monitor) {
  console.log(`Merging ${sourceDir} to ${destBucket}/${destPrefix}.`)
  const excludes = ['.DS_Store', 'script-src']
  const sourceFiles = await this.files.listDir(sourceDir, excludes)
  const destFiles = await this.listDir(destBucket, destPrefix)
  console.log(`Found ${sourceFiles.length} source files and ${destFiles.length} dest files.`)
  // Add/Replace any dest keys where the source and dest hash don't match
  const destFilesMap = destFiles.reduce(function(map, obj) {
    map[obj.relPath] = obj;
    return map;
  }, {});
  const sourceBatched = this.batch(sourceFiles, 32)
  for (let i=0; i < sourceBatched.length; ++i) {
    const batch =  sourceBatched[i]
    await Promise.all(batch.map(async sourceFile => {
      try {
        const destFile = destFilesMap[sourceFile.relPath]
        let localHash = null
        if (destFile) {
          localHash = this.files.getETagForFile(sourceFile.path)
        }
        if ( !destFile || (localHash != destFile.hash)) {
          const content = await this.files.loadFileBinary(sourceFile.path)
          const type = mime.getType(sourceFile.path) || 'text/html'
          const destPath = destPrefix + sourceFile.relPath
          await this.put(destBucket, destPath, type, content)
          if (destFile) {
            monitor.push({
              updated: true,
              sourceFile: sourceFile.path,
              destFile: destFile ? destFile.path : null
            })
          } else {
            monitor.push({
              added: true,
              sourceFile: sourceFile.path,
            })
          }
        }
      } catch (e) {
        console.error(`Failed to transfer ${sourceFile.path}`, e)
      }
    }))
  }
  // Remove any dest keys that are no longer in source
  const sourceFilesMap = sourceFiles.reduce(function(map, obj) {
    map[obj.relPath] = obj;
    return map;
  }, {});
  await Promise.all(destFiles.map(async destFile => {
    try {
      const sourceFile = sourceFilesMap[destFile.relPath];
      if ( !sourceFile) {
        await this.delete(destBucket, destFile.path)
        monitor.push({
          deleted: false,
          destFile: destFile.path
        })
      }
    } catch (e) {
      console.error(`Failed to delete ${destFile.path}`, e)
    }
  }))
}

/** Merge one bucket to another, only replacing output files if the hashes differ. */
AwsUtils.prototype.mergeBuckets = async function(sourceBucket, sourcePrefix, destBucket, destPrefix, monitor) {
  console.log(`Merging ${sourceBucket}:${destBucket}. to ${destBucket}:${destPrefix}.`)
  const sourceFiles = await this.listDir(sourceBucket, sourcePrefix)
  const destFiles = await this.listDir(destBucket, destPrefix)
  console.log(`Found ${sourceFiles.length} source files and ${destFiles.length} dest files.`)
  // Add/Replace any dest keys where the source and dest hash don't match
  const destFilesMap = destFiles.reduce(function(map, obj) {
    map[obj.relPath] = obj;
    return map;
  }, {});
  const sourceBatched = this.batch(sourceFiles, 32)
  for (let i=0; i < sourceBatched.length; ++i) {
    const batch =  sourceBatched[i]
    await Promise.all(batch.map(async sourceFile => {
      try {
        const destFile = destFilesMap[sourceFile.relPath]
        if ( !destFile || (sourceFile.hash !== destFile.hash)) {
          const content = await this.get(sourceBucket, sourceFile.path)
          //console.log('file metadata: ', content)
          const type = mime.getType(sourceFile.path) || 'text/html'
          const destPath = destPrefix + sourceFile.relPath
          await this.put(destBucket, destPath, type, content.Body)
          if (destFile) {
            await monitor.push({
              total: sourceFiles.length,
              updated: true,
              sourceFile: sourceFile.path,
              destFile: destFile ? destFile.path : null
            })
          } else {
            await monitor.push({
              total: sourceFiles.length,
              added: true,
              sourceFile: sourceFile.path,
            })
          }
        } else {
          await monitor.push({
            total: sourceFiles.length,
            unchanged: true,
            sourceFile: sourceFile.path,
          })
        }
      } catch (e) {
        console.error(`Failed to transfer ${sourceFile.path}`, e)
      }
    }))
  }
  // Remove any dest keys that are no longer in source
  const sourceFilesMap = sourceFiles.reduce(function(map, obj) {
    map[obj.relPath] = obj;
    return map;
  }, {});
  await Promise.all(destFiles.map(async destFile => {
    try {
      const sourceFile = sourceFilesMap[destFile.relPath];
      if ( !sourceFile) {
        await this.delete(destBucket, destFile.path)
        await monitor.push({
          deleted: false,
          destFile: destFile.path
        })
      }
    } catch (e) {
      console.error(`Failed to delete ${destFile.path}`, e)
    }
  }))
}

/** Send an update to the site SQS queue. */
AwsUtils.prototype.displayUpdate = async function(params, logType, logStr) {
  try {
    const msg = {
      time: Date.now(),
      display: params
    }
    if (logStr) {
      msg.logs = [{
        time: Date.now(),
        type: logType,
        msg: logStr
      }]
    }
    const ret = await this.sqs.sendMessage({
      QueueUrl: this.stateQueueUrl,
      MessageBody: JSON.stringify(msg),
      MessageGroupId: 'admin'
    }).promise()
    return ret
  } catch (error) {
    console.error(`Failed to send display update: ${JSON.stringify(error)}`)
  }
}


//
module.exports = AwsUtils
