"use strict";

const helper = require("../helper");
const request = require('supertest');
const assert = require('chai').assert;

var api;


module.exports = {
  before: function () {
    api = request(helper.assertEnv("API_URL_0"));
  },

  'TEST 1: GET /hello': function*() {
    let res = yield api
      .get('/hello')
      .assertStatus(200)
      .end();
    assert.equal(res.text, 'world', `Invalid response. Expected "world", but got "${res.text}".$END`);
  },

  'TEST 2: GET /hello-json': function*() {
    let res = yield api
      .get('/hello-json')
      .assertStatus(200)
      .assertJson()
      .assertObject()
      .end();
    const expected = {hello: 'world'};
    assert.deepEqual(res.body, expected,`Invalid response. Expected "${JSON.stringify(expected)}", but got "${JSON.stringify(res.body)}".$END`);
  }
};
