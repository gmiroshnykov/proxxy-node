var server = require('./lib/server'),
    config = require('./config');

server.listen(config.port, config.host, function(err) {
  if (err) throw err;
  var address = server.address();
  console.log('listening on %s:%d', address.address, address.port);
});
