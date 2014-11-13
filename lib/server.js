var http = require('http'),
    https = require('https'),
    crypto = require('crypto'),
    URL = require('url');
var knox = require('knox'),
    s3UrlSigner = require('amazon-s3-url-signer'),
    Q = require('q'),
    debug = require('debug')('proxxy');
var config = require('../config');

var DEFAULT_REGION = 'use1';
var DEFAULT_TTL = 3600;
var DEFAULT_AGENT_MAX_SOCKETS = 25;

http.globalAgent.maxSockets = DEFAULT_AGENT_MAX_SOCKETS;
https.globalAgent.maxSockets = DEFAULT_AGENT_MAX_SOCKETS;

var server = http.createServer();
server.on('request', handleRequest);
module.exports = server;

var signer = s3UrlSigner.urlSigner(config.s3.key, config.s3.secret, {
  protocol: 'https'
});

function handleRequest(req, res) {
  if (req.method !== 'GET') {
    return sendError(res, 405);
  }

  if (!('host' in req.headers)) {
    return sendError(res, 400, 'no host header');
  }

  var host = req.headers['host'];
  var url = req.url;

  var backend = getBackendByHost(host);
  if (!backend) {
    return sendError(res, 400, 'unknown backend');
  }

  var region = getRegionByHost(host);
  if (!region) {
    return sendError(res, 400, 'unknown region');
  }

  var ctx = {
    backend: backend,
    region: region,
    url: url
  };

  console.log('request:', ctx);

  return isAvailableOnS3(ctx, function(err, isAvailable) {
    if (err) {
      console.error('isAvailableOnS3 error:', err);
      return sendError(ctx, 500, 'isAvailableOnS3 error');
    }

    if (isAvailable) {
      return redirectToS3(res, ctx);
    } else {
      var promise = uploadToS3(ctx);
      promise.done(function(resGetBackend) {
        if (resGetBackend) {
          // non-200 response from backend - passthroug
          console.log('response: HTTP %s (passthrough)', resGetBackend.statusCode);
          res.writeHead(resGetBackend.statusCode, resGetBackend.headers);
          return resGetBackend.pipe(res);
        }

        return redirectToS3(res, ctx);
      }, function(err) {
        console.error('uploadToS3 error:', err);
        return sendError(ctx, 500, 'uploadToS3 error');
      });
    }
  });
}

function sendError(res, code, message) {
  if (!message) {
    message = http.STATUS_CODES[code] || 'unknown error';
  }

  res.writeHead(code, {
    'Content-Type': 'text/plain',
    'Content-Length': message.length
  });
  res.end(message);
}

function getBackendByHost(host) {
  for (var k in config.backends) {
    if (host.indexOf(k) === 0) {
      return k;
    }
  }
  return false;
}

function getRegionByHost(host) {
  for (var k in config.regions) {
    var needle = '.' + k + '.';
    if (host.indexOf(needle) !== -1) {
      return k;
    }
  }
  return DEFAULT_REGION;
}

function getUrlHash(url) {
  return crypto.createHash('md5').update(url, 'utf8').digest('hex');
}

function getS3Path(backend, url) {

  return '/' + backend + '/' + getUrlHash(url);
}

function getSignedS3Url(region, backend, url) {
  var backendOptions = config.backends[backend];
  var bucket = 'proxxy-' + region;
  var path = backend + '/' + getUrlHash(url);
  var ttl = backendOptions.ttl || DEFAULT_TTL;
  return signer.getUrl('GET', path, bucket, ttl);
}

function getBackendUrl(backend, url) {
  var options = config.backends[backend];
  return options.url + url;
}

function getHttpClientForUrl(url) {
  if (url.indexOf('https:') === 0) {
    return https;
  } else {
    return http;
  }
}

function isAvailableOnS3(ctx, callback) {
  var s3 = getS3ClientForRegion(ctx.region);
  var s3path = getS3Path(ctx.backend, ctx.url);
  var reqS3Head = s3.head(s3path);
  debug('S3 HEAD: %s', s3path);
  reqS3Head.on('response', function(resS3Head) {
    debug('resS3Head statusCode:', resS3Head.statusCode);
    debug('resS3Head headers:', resS3Head.headers);

    switch (resS3Head.statusCode) {
      case 404:
        return callback(null, false);

      case 200:
        return callback(null, true);

      default:
        var err = new Error('unknown S3 HEAD status code: ' + resS3Head.statusCode);
        return callback(err);
    }
  });
  reqS3Head.on('error', callback);
  reqS3Head.end();
}

var s3Clients = {};
function getS3ClientForRegion(region) {
  if (!(region in s3Clients)) {
    var regionOptions = config.regions[region];

    var client = knox.createClient({
      key: config.s3.key,
      secret: config.s3.secret,
      bucket: config.s3.bucket_prefix + region,
      region: regionOptions.region,
      style: 'path'
    });
    s3Clients[region] = client;
  }
  return s3Clients[region];
}

var deferredUploadToS3 = {};
function uploadToS3(ctx) {
  var deferredKey = JSON.stringify(ctx);
  if (deferredKey in deferredUploadToS3) {
    return deferredUploadToS3[deferredKey].promise;
  }

  var deferred = Q.defer();
  deferredUploadToS3[deferredKey] = deferred;
  deferred.promise.finally(function() {
    delete deferredUploadToS3[deferredKey];
  });

  var backendUrl = getBackendUrl(ctx.backend, ctx.url);
  debug('Backend GET: %s', backendUrl);
  var client = getHttpClientForUrl(backendUrl);
  var reqGetBackend = client.get(backendUrl);
  reqGetBackend.on('error', deferred.reject);
  reqGetBackend.on('response', function(resGetBackend) {
    resGetBackend.on('error', deferred.reject);

    debug('resGetBackend statusCode:', resGetBackend.statusCode);
    debug('resGetBackend headers:', resGetBackend.headers);
    if (resGetBackend.statusCode !== 200) {
      return deferred.resolve(resGetBackend);
    }

    if ('content-length' in resGetBackend.headers) {
      return streamingUploadToS3(ctx, resGetBackend, deferred);
    } else {
      return bufferedUploadToS3(ctx, resGetBackend, deferred);
    }
  });

  return deferred.promise;
}

function streamingUploadToS3(ctx, resGetBackend, deferred) {
  var s3path = getS3Path(ctx.backend, ctx.url);

  debug('streaming S3 PUT:', s3path);
  var s3headers = {
    'content-type': resGetBackend.headers['content-type'],
    'content-length': resGetBackend.headers['content-length']
  };

  var s3 = getS3ClientForRegion(ctx.region);
  var reqPutS3 = s3.put(s3path, s3headers);
  reqPutS3.on('error', deferred.reject);
  reqPutS3.on('response', function(resPutS3) {
    return handleUploadToS3(resPutS3, deferred);
  });
  resGetBackend.pipe(reqPutS3);
}

function bufferedUploadToS3(ctx, resGetBackend, deferred) {
  var s3path = getS3Path(ctx.backend, ctx.url);
  debug('buffered S3 PUT:', s3path);

  var buffer;
  resGetBackend.on('data', function(chunk) {
    buffer = buffer ? Buffer.concat([buffer, chunk]) : chunk;
  });
  resGetBackend.on('end', function() {
    var s3headers = {
      'content-type': resGetBackend.headers['content-type'],
      'content-length': buffer.length
    };

    var s3 = getS3ClientForRegion(ctx.region);
    var reqPutS3 = s3.put(s3path, s3headers);
    reqPutS3.on('error', deferred.reject);
    reqPutS3.on('response', function(resPutS3) {
      return handleUploadToS3(resPutS3, deferred);
    });
    reqPutS3.end(buffer);
  });
}

function handleUploadToS3(resPutS3, deferred) {
  debug('resPutS3 statusCode:', resPutS3.statusCode);
  debug('resPutS3 headers:', resPutS3.headers);
  switch (resPutS3.statusCode) {
    case 200:
      return deferred.resolve();

    default:
      var body = '';
      resPutS3.setEncoding('utf8');
      resPutS3.on('data', function(chunk) {
        body += chunk;
      });
      resPutS3.on('end', function() {
        var message = 'unknown S3 PUT staus code: ' + resPutS3.statusCode + "\n";
        message += 'body: ' + body;
        var err = new Error(message);
        return deferred.reject(err);
      });
  }
}

function redirectToS3(res, ctx) {
  var signedUrl = getSignedS3Url(ctx.region, ctx.backend, ctx.url);
  res.writeHead(302, {
    'Location': signedUrl
  });
  res.end();
  console.log('response: HTTP 302:', signedUrl);
}
