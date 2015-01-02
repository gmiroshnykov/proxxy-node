var http = require('http');
var debug = require('debug')('app'),
    co = require('co'),
    koa = require('koa'),
    thunkify = require('thunkify');

var config = require('../config');

var app = koa();
module.exports = app;

app.name = 'proxxy';

app.start = function() {
  return co(function *(){
    yield [startServer()];
  });
};

app.stop = function() {
  return co(function *(){
    yield [stopServer()];
  });
};

app.use(function *() {
  this.body = 'Hello World!';
});

function* startServer() {
  app.server = http.createServer(app.callback());
  app.server.listen = thunkify(app.server.listen);
  app.server.close = thunkify(app.server.close);
  return yield app.server.listen(config.port, config.host);
}

function* stopServer() {
  if (app.server) {
    debug('stopping server...');
    yield app.server.close();
    debug('stopped server');
  }
}
