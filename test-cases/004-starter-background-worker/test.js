"use strict";

const helper = require("../helper");
const request = require('supertest');
const pg = require('pg');
const Assert = helper.assert;

var api;
var testCount = 0;
var client;


function _insert(sql) {
  return new Promise((resolve, reject) => {
    pg.connect(helper.assertEnv("POSTGRES_URL"), function (err, client, done) {
      if (err) {
        return reject(err);
      }
      client.query(sql, function (err) {
        if (err) {
          return reject(err);
        }
        resolve();
      });
    });
  });
}

function* _assertSum(sum) {
  var operation = 0;
  var assert = 0;

  let res = yield api
    .get('/sum')
    .end(++operation);

  Assert.equal(res.status, 200, operation, ++assert);
  Assert.deepEqual(res.body, { sum }, operation, ++assert);
}

module.exports = {
  before: function*() {
    api = request(helper.assertEnv("API_URL_0"));
    client = new pg.Client(helper.assertEnv("POSTGRES_URL"));
  },

  [`TEST ${++testCount}`]: function*() {
    yield _assertSum(13);
  },

  [`TEST ${++testCount}`]: function*() {
    yield _insert(`INSERT INTO product(id, name, quantity) VALUES (7, 'prodBBB', 1); `);
    yield (cb) => setTimeout(cb, 2000);
    yield _assertSum(14);
  },

  [`TEST ${++testCount}`]: function*() {
    yield _insert(`DELETE FROM product; `);
    yield (cb) => setTimeout(cb, 2000);
    yield _assertSum(0);
  }
};
