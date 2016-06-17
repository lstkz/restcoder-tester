"use strict";

const helper = require("../helper");
const request = require('supertest');
const fs = require('fs');
const _ = require('underscore');
const pg = require('pg');
const assert = require('chai').assert;

var api;
var client;
var expected;

module.exports = {
  before: function*() {
    api = request(helper.assertEnv("API_URL_0"));
    client = new pg.Client(helper.assertEnv("POSTGRES_URL"));
    yield client.connect.bind(client);
    yield client.query.bind(client, fs.readFileSync(__dirname + "/data/init.sql", 'utf8'));
    expected = require("./data/expected.json");
  },

  'TEST 1: GET /products': function*() {
    let res = yield api
      .get('/products')
      .assertStatus(200)
      .assertJson()
      .assertArray()
      .end();

    assert.deepEqual(res.body, expected, `Invalid response. Make sure to sort items by ID.$END`);
  },

  'TEST 2: GET /products - stress test': function*() {
    yield _.range(1, 20).map(() => function*() {
      let res = yield api
        .get('/products')
        .end();

      assert.deepEqual(res.body, expected, `Invalid response.$END`);
    });
  }
};
