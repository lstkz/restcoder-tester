"use strict";

const helper = require("../helper");
const request = require('supertest');
const fs = require('fs');
const _ = require('underscore');
const pg = require('pg');
const assert = require('chai').assert;

var api1;
var api2;
var client;
var expected;

module.exports = {
  before: function*() {
    api1 = request(helper.assertEnv("API_URL_0"));
    api2 = request(helper.assertEnv("API_URL_1"));
    client = new pg.Client(helper.assertEnv("POSTGRES_URL"));
    yield client.connect.bind(client);
    expected = require("./data/expected.json");
  },

  'TEST 1: Inserting test data': function*() {
    try {
      yield client.query.bind(client, fs.readFileSync(__dirname + "/data/init.sql", 'utf8'));
    } catch (e) {
      var err = new Error("Couldn't insert test data. Did you create a 'product' table?");
      err.userError = true;
      throw err;
    }
  },

  'TEST 2: GET /products - first instance': function*() {
    let res = yield api1
      .get('/products')
      .assertStatus(200)
      .assertJson()
      .assertArray()
      .end();

    assert.deepEqual(res.body, expected, `Invalid response.$END`);
  },

  'TEST 3: GET /products - second instance': function*() {
    let res = yield api2
      .get('/products')
      .assertStatus(200)
      .assertJson()
      .assertArray()
      .end();

    assert.deepEqual(res.body, expected, `Invalid response.$END`);
  },

  'TEST 4: GET /products - stress test': function*() {
    yield _.range(1, 20).map((operation) => function*() {
      const api = operation % 2 ? api1 : api2;
      let res = yield api
        .get('/products')
        .end();

      assert.deepEqual(res.body, expected, `Invalid response.$END`);
    });
  }
};
