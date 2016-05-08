'use strict';

const config = require('config');
const AWS = require('aws-sdk-promise');
const tmp = require('tmp');
const co = require('co');
const moment = require('moment');
const winston = require('winston');
const util = require('util');
const fs = require('mz/fs');
const logger = require('../common/logger');
const helper = require('../common/helper');
AWS.config.update({
  s3: '2006-03-01',
  accessKeyId: config.AWS_ACCESS_KEY,
  secretAccessKey: config.AWS_SECRET_KEY,
  region: config.AWS_REGION
});
const s3 = new AWS.S3();

module.exports = {
  createLogger,
  createWinstonLogger
};


function createWinstonLogger(maxSize) {
  var info = tmp.fileSync();
  var path = info.name;
  var opts = {
    maxsize: maxSize,
    maxFiles: 1,
    tailable: true,
    filename: path,
    json: false
  };

  var ret = new (winston.Logger)({
    transports: [
      new (winston.transports.Console)(),
      new (winston.transports.File)(opts)
    ]
  });
  ret.logFullError = function (err/* , signature*/) {
    if (!err) {
      return;
    }
    var args = Array.prototype.slice.call(arguments);
    args.shift();
    ret.error.apply(ret, args);
    ret.error(util.inspect(err));
    ret.error(err.stack);
  };

  ret.s3Upload = function* () {
    try {
      var stat = yield fs.stat(path);
      if (!stat.size) {
        return null;
      }

      var stream = fs.createReadStream(path);
      var key = moment().format('YYYY-MM-DD') + '/' + helper.randomUniqueString() + '.log';
      var params = {
        Bucket: config.S3_BUCKET,
        Key: key,
        Body: stream,
        ContentType: 'text/plain'
      };
      yield s3.putObject(params).promise();
      params = {
        Bucket: config.S3_BUCKET,
        Key: key
      };
      return s3.getSignedUrl('getObject', params).split('?')[0];
    } catch (e) {
      logger.logFullError(e, 's3Upload');
      return null;
    }
  };
  ret.fnProfile = function* (name, fn) {
    ret.profile(name);
    yield fn();
    ret.profile(name);
  };

  return ret;
}


// function _getTempFile() {
//    return new Promise((resolve, reject) => {
//        tmp.file(function(err, path, fd, cleanupCallback) {
//            if (err) {
//                return reject(err);
//            }
//            resolve({path, fd, cleanupCallback});
//        });
//    });
// }

function createLogger(maxSize) {
  var info = tmp.fileSync();
  info.path = info.name;
  var currentSize = 0;
  var isTruncated = false;

    // log is written in background
    // use promises to keep correct order of logged lines
  var promise = Promise.resolve();

  function append(data) {
    promise = promise.then(() => {
      return co(fs.appendFile(info.path, data)).catch(e => {
        logger.logFullError(e, 'log');
      });
    });
  }

  return {
    log: function (data) {
      if (isTruncated) {
        return;
      }
      if (currentSize + data.length > maxSize) {
        isTruncated = true;
        append('\nTRUNCATED');
        return;
      }
      currentSize += data.length;
      append(data);
    },
    s3Upload: function* () {
      if (!currentSize) {
        return null;
      }
      try {
        yield promise;

        var stream = fs.createReadStream(info.path);
        var key = moment().format('YYYY-MM-DD') + '/' + helper.randomUniqueString() + '.log';
        var params = {
          Bucket: config.S3_BUCKET,
          Key: key,
          Body: stream,
          ContentType: 'text/plain'
        };
        yield s3.putObject(params).promise();
        params = {
          Bucket: config.S3_BUCKET,
          Key: key
        };
        return s3.getSignedUrl('getObject', params).split('?')[0];
      } catch (e) {
        logger.logFullError(e, 's3Upload');
        return null;
      }
    }
  };
}
