const AWS = require('aws-sdk');
const mime = require('mime');
const Fs = require('fs-extra')
const Files = require('./files')

const s3 = new AWS.S3();
var sqs = new AWS.SQS();

/** Get all files from an S3 bucket and save them to disk */
exports.pull = async (bucket, keyPrefix, destDir) => {
    const list = await this.list(bucket)
    const filtered = list.filter(item => item.Key.indexOf(keyPrefix) === 0)
    const batchedList = this.batch(filtered)
    await this.saveFiles(bucket, keyPrefix, batchedList, destDir)
}

/** Get all files from under sourceDir and push to S3 with the given key prefix. Maintain dir. structure.
    First, compare hash values and don't re-copy files that have matching hashes
    Delete any files that no longer exist in the source tree.
*/
exports.push = async (bucket, keyPrefix, sourceDir) => {
    // TODO Implement
    // - First need to get metadata for all files in the bucket
    // compare with files on disk (MD5 hash)
    // create an upload list, and a delete list (missing files)
    // Delete files
    // upload files
}

/** List metadata for all objects from and S3 bucket */
exports.list = async (bucket) => {
    let isTruncated = true;
    let marker;
    const items = []
    while(isTruncated) {
        let params = { Bucket: bucket }
        if (marker) {
            params.Marker = marker
        }
        const response = await s3.listObjects(params).promise();
        items.push(...response.Contents)
        isTruncated = response.IsTruncated
        if (isTruncated) {
            marker = response.Contents.slice(-1)[0].Key;
        }
    }
    return items;
}

/** Group a list of items into sub groups of the given size */
exports.batch = (list, size) => {
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
exports.saveFiles = async (bucket, keyPrefix, batchedList, destDir) => {
    for (let i = 0; i < batchedList.length; ++i) {
        await Promise.all(batchedList[i].map(async item => {
            const obj = await s3.getObject({ Bucket: bucket, Key: item.Key }).promise()
            console.log(`Downloading: ${item.Key}`)
            const filePath = destDir + '/' + item.Key.substring(keyPrefix.length)
            Files.ensurePath(filePath)
            await Fs.writeFile(filePath, obj.Body)
        }))
    }
}
