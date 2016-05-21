'use strict';

const winston = require('winston');
const Mocha = require('mocha');
const _ = require('underscore');

process.on('message', function (msg) {
  console.log(msg);
  _.extend(process.env, msg.testEnv);

  var mocha = new Mocha();
  mocha.ui('exports');
  mocha.timeout(5000);
  mocha.bail(true);
  msg.files.forEach(f => mocha.addFile(f));

  var testResult = {
    passed: true
  };
  var totalTests;

  mocha.reporter(function (runner) {

    runner.on('start', function () {
      totalTests = runner.total;
      process.send({ type: 'START', totalTests: totalTests });
    });

    runner.on('test', function (test) {
      testResult[test.title] = {
        startedAt: new Date(),
        name: test.title,
        result: 'UNKNOWN'
      };
      process.send({ type: 'TEST_RESULT', data: { name: test.title, result: 'PENDING' } });
    });

    runner.on('fail', function (test, err) {
      var ctx = runner.currentRunnable.ctx;
      var result = {
        finishedAt: new Date(),
        name: test.title,
        result: 'FAIL'
      };
      if (err.userError) {
        result.userErrorMessage = err.message;
        result.errorInfo = {
          message: err.orgError.message,
          stack: err.orgError.stack
        };
      } else {
        var reg = /timeout of .*? exceeded./;
        var match = reg.exec(err.message);
        if (match) {
          result.userErrorMessage = `Operation ${ctx.operation}: ${match[0]}`;
        } else {
          result.userErrorMessage = 'Internal server error';
        }
        result.errorInfo = {
          message: err.message,
          stack: err.stack
        };
      }
      testResult.passed = false;
      testResult[test.title] = result;

      process.send({ type: 'TEST_RESULT', data: { name: test.title, result: 'FAIL', userErrorMessage: result.userErrorMessage } });
    });

    runner.on('pass', function (test) {
      testResult[test.title] = {
        finishedAt: new Date(),
        name: test.title,
        result: 'PASS'
      };
      process.send({ type: 'TEST_RESULT', data: { name: test.title, result: 'PASS' } });
    });
  });

  try {
    mocha.run(function () {
      process.send({ type: 'END', result: testResult });
      process.exit(0);
    });
  } catch (e) {
    process.send({ type: 'ERROR', data: e.stack || e.message });
  }
});
