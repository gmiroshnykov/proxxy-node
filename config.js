var config = exports;

config.host = process.env.HOST || '0.0.0.0';
config.port = parseInt(process.env.PORT || '8000', 10);

config.s3 = {
  key: process.env.AWS_ACCESS_KEY,
  secret: process.env.AWS_SECRET_KEY,
  bucket_prefix: 'mozilla-releng-proxxy-'
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

if (!config.s3.key) {
  console.error('Error: AWS_ACCESS_KEY not set');
  process.exit(1);
}

if (!config.s3.secret) {
  console.error('Error: AWS_SECRET_KEY not set');
  process.exit(1);
}
