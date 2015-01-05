var config = exports;

config.host = process.env.HOST || '::';
config.port = parseInt(process.env.PORT || '8000', 10);

config.s3 = {
  bucket_prefix: process.env.S3_BUCKET_PREFIX || 'mozilla-releng-proxxy-',
  expiration_days: parseInt(process.env.S3_EXPIRATION_DAYS || '1')
};

config.backends = {
  'ftp.mozilla.org': {
    url: 'https://ftp.mozilla.org'
  },
  'runtime-binaries.pvt.build.mozilla.org': {
    url: 'http://runtime-binaries.pvt.build.mozilla.org'
  },
  'pypi.pvt.build.mozilla.org': {
    url: 'http://pypi.pvt.build.mozilla.org'
  },
  'pypi.pub.build.mozilla.org': {
    url: 'http://pypi.pub.build.mozilla.org'
  }
};

config.regions = {
  use1: {
    region: 'us-east-1',
    endpoint: 's3-external-1.amazonaws.com',
    location: ''
  },
  usw2: {
    region: 'us-west-2',
    endpoint: 's3-us-west-2.amazonaws.com',
    location: 'us-west-2'
  }
};
