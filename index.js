var Server = require('./lib/server'),
    config = require('./config');

Server.start(function(err, server) {
  if (err) throw err;
  var address = server.address();
  console.log('listening on %s:%d', address.address, address.port);
});
