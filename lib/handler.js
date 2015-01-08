var crypto = require('crypto'),
    URL = require('url'),
    PATH = require('path');
var debug = require('debug')('proxxy:handler'),
    AWS = require('aws-sdk');
var config = require('../config');

var DEFAULT_FILENAME = 'index.html';

var s3 = new AWS.S3();

module.exports = function *() {
  // only GETs are supported
  if (this.method !== 'GET') {
    this.throw(405);
  }

  // can't work without Host header
  if (!this.host) {
    this.throw(400, 'no host header');
  }

  var backend = getBackendByHost(this.host);
  if (!backend) {
    this.throw(400, 'unknown backend');
  }

  var region = getRegionByHost(this.host);
  if (!region) {
    this.throw(400, 'unknown region');
  }

  var url = this.url;
  var isAvailable = yield isAvailableOnS3(backend, region, url);
  if (isAvailable) {
    this.body = 'TODO: redirect to S3';
  } else {
    this.body = 'TODO: upload to S3';
  }
}

function* isAvailableOnS3(backend, region, url) {
  debug('isAvailableOnS3(%s, %s, %s)', backend, region, url);
  var s3Path = getS3Path(backend, url);
  var options = {
    Bucket: getBucketForRegion(region),
    Key: s3Path
  };
  debug('s3.headObject', options);
  var request = s3.headObject(options);
  var isAvailable = false;
  try {
    var result = yield request.send.bind(request);
    console.log(request);
    isAvailable = true;
  } catch (e) {
    if (e.code !== 'NotFound') {
      throw e;
    }
  }

  debug('isAvailableOnS3(%s, %s, %s) === %s', backend, region, url, isAvailable);
  return isAvailable;
}


function getBackendByHost(host) {
  // check if host begins with one of the configured backends,
  // e.g. 'ftp.mozilla.org.usw2.example.com' will match 'ftp.mozilla.org'
  for (var k in config.backends) {
    if (host.indexOf(k) === 0) {
      return k;
    }
  }

  return false;
}

function getRegionByHost(host) {
  // look for patterns like '.use1.' and '.usw2.' in the host
  // to detect the region
  for (var region in config.regions) {
    var needle = '.' + region + '.';
    if (host.indexOf(needle) !== -1) {
      return region;
    }
  }

  return false;
}

function getBucketForRegion(region) {
  return config.s3.bucket_prefix + region;
}

function getS3Path(backend, url) {
  return '/' + backend + '/' + getUrlHash(url) + '/' + getFilename(url);
}

function getUrlHash(url) {
  return crypto.createHash('md5').update(url, 'utf8').digest('hex');
}

function getFilename(url) {
  var urlParts = URL.parse(url);
  if (!urlParts.pathname) {
    return DEFAULT_FILENAME;
  }

  var filename = PATH.basename(urlParts.pathname);
  if (!filename) {
    return DEFAULT_FILENAME;
  }

  return filename;
}
