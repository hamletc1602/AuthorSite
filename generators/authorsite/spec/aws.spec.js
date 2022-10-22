const Sinon = require('sinon')
const AWSLib = require('aws-sdk');

describe("AWS", function() {
    let AWS = null

    const fakeItems1 = [{
        Bucket: 'bucket',
        Key: 'one'
      },{
        Bucket: 'bucket',
        Key: 'two'
      }]

      const fakeItems2 = [{
        Bucket: 'bucket',
        Key: 'three'
      }]

      const fakeItems = [...fakeItems1, ...fakeItems2]

    function promiseWrap(subFunc) {
      return function() {
        return {
          promise: subFunc.bind(this, ...arguments)
        }
      }
    }

    beforeEach(() => {
        // Mock AWS client functions
        Sinon.stub(AWSLib, 'S3').returns({
          listObjects: promiseWrap(async (params) => {
            if (params.Marker) {
              return {
                Contents: fakeItems2,
                IsTruncated: false
              }
            } else {
              return {
                Contents: fakeItems1,
                IsTruncated: true
              }
            }
          }),
          getObject: promiseWrap(Sinon.fake.resolves({ Key: '1' })),
          putObject: promiseWrap(Sinon.fake.resolves())
        })

        // Require module under test AFTER mocking
        AWS = require('../app/aws')
    });

    afterEach(() => {
        Sinon.restore()
    })

    it("batch an even array into groups of two", function() {
        const result = AWS.batch([1,2,3,4,5,6], 2)
        expect(result).toEqual([[1,2],[3,4],[5,6]]);
    });

    it("batch an odd array into groups of two", function() {
        const result = AWS.batch([1,2,3,4,5], 2)
        expect(result).toEqual([[1,2],[3,4],[5]]);
    });

    it("batch an even array into groups of three", function() {
        const result = AWS.batch([1,2,3,4,5,6], 3)
        expect(result).toEqual([[1,2,3],[4,5,6]]);
    });

    it("batch an odd array into groups of three", function() {
        const result = AWS.batch([1,2,3,4,5], 3)
        expect(result).toEqual([[1,2,3],[4,5]]);
    });

    it("List objects in a bucket", async function() {
        const result = await AWS.list('bucket')
        expect(result).toEqual(fakeItems);
    });

    it("List objects in a bucket", async function() {
      const result = await AWS.list('bucket')
      expect(result).toEqual(fakeItems);
  });


});