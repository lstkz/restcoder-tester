"use strict";


//tests will support generators
require("co-mocha");


//fix supertest to support promises
const Url = require('url');
const _ = require('underscore');
const assert = require('chai').assert;
const Test = require('supertest/lib/test');
var orgEnd = Test.prototype.end;


Test.prototype.assertStatus = function (status) {
  if (!this._customAsserts) {
    this._customAsserts = [];
  }
  this._customAsserts.push({type: 'assertStatus', status});
  return this;
};

Test.prototype.assertJson = function () {
  if (!this._customAsserts) {
    this._customAsserts = [];
  }
  this._customAsserts.push({type: 'assertJson'});
  return this;
};

Test.prototype.assertObject = function () {
  if (!this._customAsserts) {
    this._customAsserts = [];
  }
  this._customAsserts.push({type: 'assertObject'});
  return this;
};

Test.prototype.assertArray = function () {
  if (!this._customAsserts) {
    this._customAsserts = [];
  }
  this._customAsserts.push({type: 'assertArray'});
  return this;
};

function _trim(value) {
  if (!value) {
    return value;
  }
  const max = 30;
  if (value.length > max) {
    return value.substr(max) + '<truncated>';
  }
  return value;
}

Test.prototype.end = function () {
  var self = this;
  const url = Url.parse(this.url);
  const endpoint =`Endpoint: ${this.method.toUpperCase()} ${url.pathname} $END`;
  return new Promise(function (resolve, reject) {
    orgEnd.call(self, function (err, res) {
      if (err) {
        var error = new Error(`Connection refused to your API. Your application probably crashed. ${endpoint}`);
        error.userError = true;
        error.orgError = err;
        reject(error);
        return;
      }
      if (self._customAsserts) {
        for (const condition of self._customAsserts) {
          switch (condition.type) {
            case 'assertStatus':
              assert.equal(res.status, condition.status,
                `Expected ${condition.status} status. Your API returned ${Number(res.status)}. ${endpoint}`);
              break;
            case 'assertJson':
              const contentType = res.header['content-type'] || '<not defined>';
              assert.ok(/json/.test(contentType), 
                `Expected JSON content (header 'content-type' must equal to 'application/json'). Got ${_trim(contentType)}. ${endpoint}`);
              break;
            case 'assertObject':
              assert.ok(_.isObject(res.body),
                `Expected response to be an object. Got type "${typeof res.body}". ${endpoint}`);
              break;
            case 'assertArray':
              assert.ok(_.isArray(res.body),
                `Expected response to be an array. Got type "${typeof res.body}". ${endpoint}`);
              break;
            default:
              break;
          }
        }
      }
      resolve(res);
    });
  });
};


//assert.assertStatus = function (res, expectedStatus) {
//  console.log(res);
//  assert.equal(res.status, expectedStatus, `Expected ${expectedStatus} status. Your api returned ${Number(res.status)}.`);
//};

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

