const mime = require('mime');

const logMsgTimeoutMS = 24 * 60 * 60 * 1000  // 24 hours
const lockTimeoutMs = 5 * 60 * 1000  // 5 Mins

const noCacheHeaders = {
    'cache-control': [
      {
          'key': 'Cache-Control',
          'value': 'no-cache,s-maxage=0'
      }
    ],
    'content-type': [
      {
          'key': 'Content-Type',
          'value': 'text/plain'
      }
    ]
  }

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

AwsUtils.prototype.getS3 = function() {
  return this.s3
}

AwsUtils.prototype.getSqs = function() {
  return this.sqs
}

/** Get all files from an S3 bucket and save them to disk */
AwsUtils.prototype.pull = async function(bucket, keyPrefix, destDir) {
    console.log(`Start pull of config from ${bucket}:${keyPrefix} to ${destDir}`)
    const list = await this.list(bucket, keyPrefix)
    const filtered = list.filter(item => item.Key[item.Key.length - 1] !== '/' )
    const batchedList = this.batch(filtered, 32)
    await this.saveFiles(bucket, keyPrefix, batchedList, destDir)
}

/** List metadata for all objects from and S3 bucket */
AwsUtils.prototype.list = async function(bucket, keyPrefix) {
    let isTruncated = true;
    let marker;
    const items = []
    while(isTruncated) {
        let params = { Bucket: bucket, Prefix: keyPrefix }
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
  const list = await this.list(bucket, keyPrefix)
  const filtered = list.filter(item => item.Key[item.Key.length - 1] !== '/' )
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
      let filePath = null
      try {
        const obj = await this.get(bucket, item.Key)
        filePath = destDir + '/' + item.Key.substring(keyPrefix.length)
        this.files.ensurePath(filePath)
        await this.files.saveFile(filePath, obj.Body)
      } catch(e) {
        if (filePath) {
          console.error(`Failed to save ${item.Key} to ${filePath}`, e)
        } else {
          console.error(`Failed to get ${item.Key}`, e)
        }
      }
    }))
  }
}

AwsUtils.prototype.get = async function(bucket, key) {
  return this.s3.getObject({ Bucket: bucket, Key: key }).promise()
}

AwsUtils.prototype.put = async function(bucket, key, type, content) {
  if ( ! content) {
    console.log(`Put to S3 ${bucket}:${key} with empty content. Problem?`)
  }
  return this.s3.putObject({
    Bucket: bucket,
    Key: key,
    Body: content,
    ContentType: type,
    CacheControl: `max-age=${this.maxAgeBrowser},s-maxage=${this.maxAgeCloudFront}`
  }).promise()
}

AwsUtils.prototype.delete = async function(bucket, key) {
  return this.s3.deleteObject({ Bucket: bucket, Key: key }).promise()
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
        if ( !destFile || (localHash !== destFile.hash)) {
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
  console.log(`Merging ${sourceBucket}:${sourcePrefix}. to ${destBucket}:${destPrefix}.`)
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
          // console.log('file metadata: ', content)
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
AwsUtils.prototype.adminStateUpdate = async function(update) {
  try {
    const msg = Object.assign({
      time: Date.now(),
    }, update)
    const ret = await this.sqs.sendMessage({
      QueueUrl: this.stateQueueUrl,
      MessageBody: JSON.stringify(msg),
      MessageGroupId: 'admin'
    }).promise()
    return ret
  } catch (error) {
    console.error(`Failed to send admin state update: ${JSON.stringify(error)}`)
  }
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

/** Before returning the admin.json state file from S3, check the state queue for any messages and merge them into the
    state before returning it.

    This architecture is sensitve to more than one admin UI running at the same time from multiple pages so the UI that
    calls this must also call for /admin/lock to check if there's any other active admin UI running.
*/
AwsUtils.prototype.updateAdminStateFromQueue = async function(state, adminUiBucket) {
  try {
    // Read current state of the admin.json (unless cached in global var already)
    if ( ! state) {
      console.log('Get state from bucket')
      const resp = await this.s3.getObject({ Bucket: adminUiBucket, Key: 'admin/admin.json' }).promise()
      const stateStr = resp.Body.toString()
      state = JSON.parse(stateStr)
    }

    console.log(`Clean up any old (>24 hours) log messages.`)
    console.log(`State: ${JSON.stringify(state)}`)
    if (state.logs) {
      const currMs = Date.now()
      const msgCount = state.logs.length
      state.logs = state.logs.filter(msg => {
        return (currMs - msg.time) < logMsgTimeoutMS
      })
      const cleaned = msgCount - state.logs.length
      if (cleaned > 0) {
        console.log(`Cleaned ${cleaned} messages from log.`)
      }
    }

    console.log(`Get all messages from the status queue: ${this.stateQueueUrl}`)
    const sqsResp = await this.sqs.receiveMessage({
      QueueUrl: this.stateQueueUrl,
      AttributeNames: ['ApproximateNumberOfMessages'],
      MaxNumberOfMessages: 10,
      MessageAttributeNames: ['All']
    }).promise()
    if (sqsResp.Messages) {
      console.log(`Received ${sqsResp.Messages.length} messages.`)
      sqsResp.Messages.forEach(msg => {
        let msgObj = null
        try {
          msgObj = JSON.parse(msg.Body)
        } catch(error) {
          console.log('Failed to parse message: ' + msg.Body + ' Error: ' + JSON.stringify(error))
        }
        try {
          _mergeState(state, msgObj)
        } catch(error) {
          console.log('Failed to merge message. Error: ' + JSON.stringify(error))
        }
      })

      // Move the current top 3 messages to the 'latest' logs section (Sort desc. by timestamp each time to ensure we get the latest 3)
      let allLogs = [...state.latest, ...state.logs]
      allLogs = allLogs.sort((a, b) => b.time - a.time)
      state.latest =allLogs.slice(0, 3)
      state.logs = allLogs.slice(3)

      console.log(`Save the state (admin.json)`)
      await this.s3.putObject({
        Bucket: adminUiBucket,
        Key: 'admin/admin.json',
        Body: Buffer.from(JSON.stringify(state)),
        CacheControl: 'no-cache,s-maxage=0',
        ContentType: 'application/json',
      }).promise()

      console.log(`Delete ${sqsResp.Messages.length} merged messages`)
      const msgsForDelete = sqsResp.Messages.map(msg => {
        return {
          Id: msg.MessageId,
          ReceiptHandle: msg.ReceiptHandle
        }
      })
      const deleteResp = await this.sqs.deleteMessageBatch({
        QueueUrl: this.stateQueueUrl,
        Entries: msgsForDelete
      }).promise()
      if (deleteResp.Failed && deleteResp.Failed.length > 0) {
        console.log(`Failed to delete some processed messages: ${JSON.stringify(deleteResp.Failed)}`)
      } else {
        console.log(`Deleted all processed messages.`)
      }

    }
    // keep @Edge default handling
    return false
  } catch(error) {
    const msg = 'Failed to get messages or update status data: ' + JSON.stringify(error)
    console.log(msg)
    return {
      status: '500',
      statusDescription: msg
    }
  }
}

// Merge this new message into the current state.
const _mergeState = (state, message) => {
  // Add any new log messages to the state
  //    Log messages will have a current time in MS set when they are generated at the source (time)
  //    And a receipt time (rcptTime) is added here, in case of any major clock differences or processing
  //    hangups.
  console.log(`Merge into state: ${JSON.stringify(message)}`)
  if (message.logs) {
    const rcptTime = Date.now()
    if ( ! state.logs) {
      state.logs = []
    }
    message.logs.forEach(logMsg => {
      logMsg.rcptTime = rcptTime
      state.logs.unshift(logMsg)
    })
  }
  // Config properties
  Object.assign(state.config, message.config)
  // Display properties
  Object.assign(state.display, message.display)
}

/** Check the contents of the lock file against the given lockId. Return locked or unlocked state, and
    take the lock for ourselves if it's open.
 */
AwsUtils.prototype.takeLockIfFree = async function(newLockId, adminUiBucket) {
  const lock = await this.getCurrentLock(adminUiBucket)
  let locked = false
  if (lock) {
    if (lock.id !== newLockId) {
      locked = true
    }
  }
  let resp = null
  if (locked) {
    console.log(`locked by ${lock.id} at ${lock.time}`)
    resp = `locked by ${lock.id} at ${lock.time}`
  } else {
    console.log('unlocked')
    resp = 'unlocked'
    // (re-)write the lock file
    const lockStr = newLockId + ' ' + Date.now()
    await this.s3.putObject({ Bucket: adminUiBucket, Key: 'admin/lock', Body: Buffer.from(lockStr) }).promise()
  }
  return {
    status: '200',
    statusDescription: 'OK',
    headers: noCacheHeaders,
    body: resp
  }
}

/** Get the current lock ID if it's still active, null if there's no active lock. */
AwsUtils.prototype.getCurrentLock = async function(adminUiBucket) {
  try {
    const lockResp = await this.s3.getObject({ Bucket: adminUiBucket, Key: 'admin/lock' }).promise()
    if (lockResp) {
      const raw = lockResp.Body.toString()
      const parts = raw.split(' ')
      const lockId = parts[0]
      const lockTime = parts[1]
      if (((Date.now() - Number(lockTime)) < lockTimeoutMs)) {
        return {
          id: lockId,
          time: lockTime
        }
      }
    }
  } catch (e) {
    console.log('Failed to get admin lock file:', e)
  }
  return null
}

//
module.exports = AwsUtils