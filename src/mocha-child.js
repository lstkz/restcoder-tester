"use strict";

const winston = require('winston');
const Mocha = require('mocha');
const _ = require('underscore');

//var EventEmitter = require('events').EventEmitter;
//var emitter = new EventEmitter();
//
//testRunner.setEmitter(emitter);

process.on('message', function (msg) {
    console.log(msg);
    _.extend(process.env, msg.testEnv);

    var mocha = new Mocha();
    mocha.ui('exports');
    mocha.timeout(5000);
    msg.files.forEach(f => mocha.addFile(f));

    var testResult = {};
    var totalTests;

    mocha.reporter(function (runner) {

        runner.on('start', function() {
            totalTests = runner.total;
            process.send({type: "start", totalTests: totalTests});
        });

        runner.on('test', function(test) {
            testResult[test.title] = {
                startedAt: new Date(),
                name: test.title,
                result: "UNKNOWN",
                log: {}
            };
        });

        runner.on('fail', function(test, err){
            var result = {
                finishedAt: new Date(),
                name: test.title,
                result: "FAIL"
            };
            if (err.userError) {
                result.userErrorMessage = err.message;
                result.errorInfo = {
                    message: err.orgError.message,
                    stack: err.orgError.stack
                };
            } else {
                result.userErrorMessage = "Internal server error";
                result.errorInfo = {
                    message: err.message,
                    stack: err.stack
                };
            }
        });

        runner.on('pass', function(test){
            testResult[test.title] = {
                finishedAt: new Date(),
                name: test.title,
                result: "PASS"
            };
        });
    });

    mocha.run(function () {
        process.send({type: "end", result: testResult});
        process.exit(0);
    });
});