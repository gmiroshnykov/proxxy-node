var http = require('http'),
    https = require('https');
var knox = require('knox'),
    s3UrlSigner = require('amazon-s3-url-signer'),
    debug = require('debug')('proxxy');
var config = require('./config');

var DEFAULT_REGION = 'use1';
var DEFAULT_TTL = 3600;
var DEFAULT_AGENT_MAX_SOCKETS = 25;

http.globalAgent.maxSockets = DEFAULT_AGENT_MAX_SOCKETS;
https.globalAgent.maxSockets = DEFAULT_AGENT_MAX_SOCKETS;

var server = http.createServer();
server.on('request', handleRequest);
server.listen(config.port, config.host, function(err) {
  if (err) throw err;
  var address = server.address();
  console.log('listening on %s:%d', address.address, address.port);
});

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
      return uploadToS3(ctx, function(err) {
        if (err) {
          if (err.res) {
            // backend returned non-200 status code, simply pass it through
            console.log('response: HTTP %s (passthrough)', err.res.statusCode);
            res.writeHead(err.res.statusCode, err.res.headers);
            return err.res.pipe(res);
          }

          console.error('uploadToS3 error:', err);
          return sendError(ctx, 500, 'uploadToS3 error');
        }

        return redirectToS3(res, ctx);
      })
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

function indexify(url) {
  if (url.slice(-1) === '/') {
    return url + 'index.html';
  }
  return url;
}

function getS3Path(backend, url) {
  return '/' + backend + indexify(url);
}

function getSignedS3Url(region, backend, url) {
  var backendOptions = config.backends[backend];
  var bucket = 'proxxy-' + region;
  var path = backend + indexify(url);
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

function getCacheKey(ctx) {
  return ctx.region + ':' + getS3Path(ctx.backend, ctx.url);
}

// TODO: replace by a more sophisticated LRU cache
var cacheAvailableOnS3 = {};
function isAvailableOnS3(ctx, callback) {
  var cacheKey = getCacheKey(ctx);
  if (cacheKey in cacheAvailableOnS3) {
    return process.nextTick(function() {
      return callback(null, true);
    });
  }

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
        cacheAvailableOnS3[cacheKey] = true;
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

function uploadToS3(ctx, callback) {
  var backendUrl = getBackendUrl(ctx.backend, ctx.url);
  debug('Backend GET: %s', backendUrl);
  var client = getHttpClientForUrl(backendUrl);
  var reqGetBackend = client.get(backendUrl);
  reqGetBackend.on('error', callback);
  reqGetBackend.on('response', function(resGetBackend) {
    resGetBackend.on('error', callback);

    debug('resGetBackend statusCode:', resGetBackend.statusCode);
    debug('resGetBackend headers:', resGetBackend.headers);
    if (resGetBackend.statusCode !== 200) {
      var err = new Error('unknown backend status code: ' + resGetBackend.statusCode);
      err.res = resGetBackend;
      return callback(err);
    }

    if ('content-length' in resGetBackend.headers) {
      return streamingUploadToS3(ctx, resGetBackend, callback);
    } else {
      return bufferedUploadToS3(ctx, resGetBackend, callback);
    }
  });
}

function streamingUploadToS3(ctx, resGetBackend, callback) {
  var s3path = getS3Path(ctx.backend, ctx.url);

  debug('streaming S3 PUT:', s3path);
  var s3headers = {
    'content-type': resGetBackend.headers['content-type'],
    'content-length': resGetBackend.headers['content-length']
  };

  var s3 = getS3ClientForRegion(ctx.region);
  var reqPutS3 = s3.put(s3path, s3headers);
  reqPutS3.on('error', callback);
  reqPutS3.on('response', function(resPutS3) {
    return handleUploadToS3(resPutS3, callback);
  });
  resGetBackend.pipe(reqPutS3);
}

function bufferedUploadToS3(ctx, resGetBackend, callback) {
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
    reqPutS3.on('error', callback);
    reqPutS3.on('response', function(resPutS3) {
      return handleUploadToS3(resPutS3, callback);
    });
    reqPutS3.end(buffer);
  });
}

function handleUploadToS3(resPutS3, callback) {
  debug('resPutS3 statusCode:', resPutS3.statusCode);
  debug('resPutS3 headers:', resPutS3.headers);
  switch (resPutS3.statusCode) {
    case 200:
      return callback(null);

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
        return callback(err);
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
