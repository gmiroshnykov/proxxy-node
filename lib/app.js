var connect = require('connect');
var app = connect();

// check if a file is on S3 and return 302 ASAP
app.use(fastRoute);

// if the file is not on S3 yet, fall back to "slow route"
app.use(slowRoute);

module.exports = app;

function fastRoute(req, res, next) {
  process.nextTick(next);
}

function slowRoute(req, res, next) {
  process.nextTick(next);
}
