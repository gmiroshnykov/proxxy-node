var debug = require('debug')('proxxy:init'),
    AWS = require('aws-sdk');
var config = require('../config');

var s3 = new AWS.S3();

module.exports = function *() {
  console.log('initializing...');
  //yield createBuckets();
  console.log('initialized');
};

function* createBuckets() {
  console.log('creating and configuring S3 buckets...');
  yield Object.keys(config.regions).map(createBucket);
  console.log('S3 buckets are ready');
}

function* createBucket(region) {
  debug('creating S3 bucket for region: ' + region);

  var options = {
    Bucket: config.s3.bucket_prefix + region
  };

  var regionOptions = config.regions[region];
  if (regionOptions.location) {
    options.CreateBucketConfiguration = {
      LocationConstraint: regionOptions.location
    };
  }

  debug('createBucket options:', options);

  var request = s3.createBucket(options);
  try {
    yield request.send.bind(request);
  } catch(e) {
    if (e.code !== 'BucketAlreadyOwnedByYou') {
      throw e;
    }
  }

  yield createBucketLifecycle(region);
}

function* createBucketLifecycle(region) {
  debug('creating S3 bucket lifecycle for region: ' + region);

  var options = {
    Bucket: config.s3.bucket_prefix + region,
    LifecycleConfiguration: {
      Rules: [
        {
          ID: 'proxxy',
          Prefix: '',
          Status: 'Enabled',
          Expiration: {
            Days: config.s3.expiration_days
          }
        }
      ]
    }
  };

  debug('putBucketLifecycle rules:', options.LifecycleConfiguration.Rules);

  var request = s3.putBucketLifecycle(options);
  yield request.send.bind(request);
}
