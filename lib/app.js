var http = require('http');
var co = require('co'),
    thunkify = require('thunkify'),
    koa = require('koa'),
    logger = require('koa-logger'),
    debug = require('debug')('proxxy:app');

var config = require('../config'),
    init = require('./init');
    handler = require('./handler');

var app = koa();
app.name = 'proxxy';
app.use(logger());
app.use(handler);

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
