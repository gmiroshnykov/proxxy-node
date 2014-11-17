var config = exports;

config.host = process.env.HOST || '0.0.0.0';
config.port = parseInt(process.env.PORT || '8000', 10);

config.s3 = {
  key: process.env.AWS_ACCESS_KEY,
  secret: process.env.AWS_SECRET_KEY,
  bucket_prefix: 'proxxy-'
};

config.backends = {
  'ftp.mozilla.org': {
    url: 'https://ftp.mozilla.org'
  }
};

config.regions = {
  use1: {
    region: 'us-east-1',
    location: ''
  },
  usw2: {
    region: 'us-west-2',
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
