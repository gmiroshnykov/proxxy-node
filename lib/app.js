var http = require('http');
var debug = require('debug')('proxxy:app'),
    co = require('co'),
    koa = require('koa'),
    thunkify = require('thunkify');

var config = require('../config'),
    init = require('./init');
    requestHandler = require('./requestHandler');

var app = koa();
app.name = 'proxxy';
app.use(requestHandler);

var server = http.createServer(app.callback());
server.listen = thunkify(server.listen);
server.close = thunkify(server.close);

app.start = function() {
  return co(function *(){
    yield [init(), startHttpServer()];
    return server;
  });
};

app.stop = function() {
  return co(function *(){
    yield [stopHttpServer()];
  });
};

function* startHttpServer() {
  return yield server.listen(config.port, config.host);
}

function* stopHttpServer() {
  debug('stopping HTTP server...');
  yield server.close();
  debug('stopped HTTP server');
}

module.exports = app;
