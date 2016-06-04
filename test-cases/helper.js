"use strict";


//tests will support generators
require("co-mocha");


//fix supertest to support promises
const _ = require('underscore');
const assert = require('chai').assert;
const Test = require('supertest/lib/test');
var orgEnd = Test.prototype.end;
Test.prototype.end = function (operation) {
  var self = this;
  return new Promise(function (resolve, reject) {
    orgEnd.call(self, function (err, response) {
      if (err) {
        var error = new Error(`Connection refused in operation ${operation}`);
        error.userError = true;
        error.orgError = err;
        reject(error);
      } else {
        resolve(response);
      }
    });
  });
};

var customAssert = {};

module.exports = {
  assertEnv,
  assertResponse,
  wrap,
  wrapAsync,
  assert: customAssert
};

function wrap(operationNr, assertNr, fun) {
  try {
    fun();
  } catch (e) {
    console.log(e);
    var error = new Error(`Assert ${assertNr} failed in operation ${operationNr}`);
    error.userError = true;
    error.orgError = e;
    throw error;
  }
}

function* wrapAsync(operationNr, assertNr, fun) {
  try {
    yield fun();
  } catch (e) {
    console.log(e);
    var error = new Error(`Assert ${assertNr} failed in operation ${operationNr}`);
    error.userError = true;
    error.orgError = e;
    throw error;
  }
}

_.extend(customAssert, {
  equal: function (actual, expected, operationNr, assertNr) {
    wrap(operationNr, assertNr, () => assert.equal(actual, expected));
  },
  deepEqual: function (actual, expected, operationNr, assertNr) {
    wrap(operationNr, assertNr, () => assert.deepEqual(actual, expected));
  },
  ok: function (actual, operationNr, assertNr) {
    wrap(operationNr, assertNr, () => assert.ok(actual));
  },
  response: function (res, operation) {
    if (!res) {
      var error = new Error(`Connection refused in operation ${operation}`);
      error.userError = true;
      throw error;
    }
  }
});


function assertResponse(res) {
  if (!res) {
    var error = new Error("Connection refused");
    error.userError = true;
    throw error;
  }
}

function assertEnv(name) {
  if (!process.env[name]) {
    throw new Error(`${name} is not configured`);
  }
  return process.env[name];
}

