'use strict';

var winston = require('winston');
var util = require('util');
var config = require('config');
var logger = new (winston.Logger)({
  transports: [
    new (winston.transports.Console)({ level: config.LOG_LEVEL })
  ]
});

/**
 * Log error details with signature
 * @param err the error
 * @param signature the signature
 */
logger.logFullError = function (err, signature) { // jshint ignore:line
  if (!err) {
    return;
  }
  var args = Array.prototype.slice.call(arguments);
  args.shift();
  winston.error.apply(winston, args);
  winston.error(util.inspect(err));
  winston.error(err.stack);
};





module.exports = logger;
