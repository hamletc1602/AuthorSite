const aws = require('aws-sdk');
const s3 = new aws.S3();
const sns = new aws.SNS();

const MIN_INTERVAL_MS = 10 * 1000
const MAX_DATA_LEN = 500 * 1024  // 500KB
let lastRun = null

//
exports.onFeedback = async function (event, context) {
    // Throttle one execution per min_interval_ms
    if (lastRun) {
      const sinceLastRun = Date.now() - lastRun
      if (sinceLastRun < MIN_INTERVAL_MS) {
        return {
          status: '429',
          statusDescription: 'Throttled'
        }
      }
    }
    const now = new Date()
    lastRun = now.getTime()

    const request = event.Records[0].cf.request;

    // In CloudFront context, function name is qualified with a region name, separated by period
    let functionName = null
    if (context.functionName.indexOf('.') !== -1) {
      const parts = context.functionName.split('.')
      functionName = parts[1]
    } else {
      functionName = context.functionName
    }

    if (request.method === 'POST') {
      const body = Buffer.from(request.body.data, 'base64').toString();
      const params = {
        Bucket: functionName,
        Key:  'received/' + now.toISOString(),
        Body: body
      }
      return s3.putObject(params).promise()
        .then(data => {
          return {
            status: '200',
            statusDescription: 'OK'
          }
        })
        .catch(error => {
          console.error(`Failed write key ${params.Key} to S3 bucket ${params.Bucket}: ${JSON.stringify(error)}`)
          return {
            status: '400',
            statusDescription: 'Send failed. See log.'
          }
        })
    }
};

//
exports.publisher = async function (event, context) {
    try {
        // Read from S3 bucket received folder
        const b = process.env.BUCKET
        const listData = await s3.listObjectsV2({ Bucket: b, Prefix: 'received' }).promise()
        console.log(`Found ${listData.KeyCount} received messages` + (listData.isTruncated ? ' (truncated)' : ''))
        await Promise.all(listData.Contents.map(async item => {
            try {
                // Get item content
                const subject = b + ': ' + item.Key.replace(/^received\//, '')
                const range = `bytes=0-${Math.min(item.Size, MAX_DATA_LEN)}`
                const content = await s3.getObject({ Bucket: b, Key: item.Key, Range: range }).promise()
                // Send to topic
                await sns.publish({ TopicArn: process.env.TOPIC, Message: content.Body.toString(), Subject: subject }).promise()
                // Move from recieved to sent folder
                const newKey = item.Key.replace(/^received/, 'sent')
                await s3.copyObject({ Bucket: b, CopySource: `/${b}/${item.Key}`, Key: newKey }).promise()
                await s3.deleteObject({ Bucket: b, Key: item.Key }).promise()
                console.log(`Sent message ${subject}, size: ${item.Size}`)
            } catch(error) {
              console.error(`Failed publish message ${item.Key} to topic ${process.env.TOPIC}: ${JSON.stringify(error)}`)
            }
        })) // For each recieved bucket item
    } catch (error) {
      console.error(`Failed to read feedback from bucket ${process.env.BUCKET}: ${JSON.stringify(error)}`)
    }
};
