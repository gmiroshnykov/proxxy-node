var app = require('./lib/app');
app.start().then(function() {
  var address = app.server.address();
  console.log("listening on %s:%d", address.address, address.port);
}, function(err) {
  console.error(err.stack);
});

process.on('SIGINT', gracefulShutdown);

function gracefulShutdown() {
  console.log('shutting down gracefully...');
  app.stop().then(function() {
    process.exit(0);
  }, function(err) {
    console.error('Error during graceful shutdown:');
    console.error(err.stack);
    process.exit(1);
  });

  setTimeout(forceShutdown, 30 * 1000);
}

function forceShutdown() {
  console.log('graceful shutdown is taking too long, forcing hard shutdown...');
  process.exit(1);
}
