"use strict";

const helper = require("../helper");
const request = require('supertest');
const _ = require('underscore');
const assert = require('chai').assert;

var api1;
var api2;

module.exports = {
  before: function() {
    api1 = request(helper.assertEnv("API_URL_0"));
    api2 = request(helper.assertEnv("API_URL_1"));
  },

  'TEST 1: POST /todos': function*() {
    let res = yield api1
      .post('/todos')
      .send({
        name: 'item 1'
      })
      .assertStatus(201)
      .assertJson()
      .end();
    const expected = {id: 1, name: 'item 1', done: false};
    assert.deepEqual(res.body, expected, `Invalid response. Expected "${JSON.stringify(expected)}", but got "${JSON.stringify(res.body)}".$END`);
  },

  'TEST 2: POST /todos': function*() {
    let res = yield api2
      .post('/todos')
      .send({
        name: 'item 2'
      })
      .assertStatus(201)
      .assertJson()
      .end();
    const expected = {id: 2, name: 'item 2', done: false};
    assert.deepEqual(res.body, expected, `Invalid response. Expected "${JSON.stringify(expected)}", but got "${JSON.stringify(res.body)}".$END`);
  },

  'TEST 3: POST /todos/:id/done': function*() {
    yield api2
      .post('/todos/2/done')
      .assertStatus(204)
      .end();
  },

  'TEST 4: POST /todos/:id/done': function*() {
    yield api1
      .post('/todos/2/done')
      .assertStatus(400)
      .end();
  },

  'TEST 5: GET /todos': function*() {
    let res = yield api1
      .get('/todos')
      .assertArray()
      .end();
    const expected = [{id: 1, name: 'item 1', done: false}, {id: 2, name: 'item 2', done: true}];
    assert.deepEqual(res.body, expected, 'Invalid response.$END');
  },

  'TEST 6: POST /todos - validation': function*() {
     yield api1
      .post('/todos')
      .assertStatus(400)
      .end();
    yield api1
      .post('/todos')
      .send({
        name: null
      })
      .assertStatus(400)
      .end();
    yield api1
      .post('/todos')
      .send({
        name: {}
      })
      .assertStatus(400)
      .end();
    yield api1
      .post('/todos')
      .send({
        name: []
      })
      .assertStatus(400)
      .end();
    yield api1
      .post('/todos')
      .send({
        name: 1234
      })
      .assertStatus(400)
      .end();
  },

  'TEST 7: POST /todos/:id/done - validation': function*() {
    yield api1
      .post('/todos/1.1/done')
      .assertStatus(400)
      .end();
     yield api1
      .post('/todos/-1/done')
      .assertStatus(400)
      .end();
    yield api1
      .post('/todos/asd/done')
      .assertStatus(400)
      .end();
  },

  'TEST 8: POST /todos/:id/done - not found': function*() {
    yield api1
      .post('/todos/3847573/done')
      .assertStatus(404)
      .end();
  },

  'TEST 9: stress test': function*() {
    yield _.range(1, 60).map((nr) => {
      const api = nr % 2 ? api1 : api2;
      return api.post('/todos')
        .send({
          name: 'stress ' + nr
        })
        .end();
    });

    let res = yield api1
      .get('/todos')
      .assertStatus(200)
      .end();
    let id = 1;
    res.body.forEach((item) => {
      assert.equal(item.id, id++, 'Invalid id.$END');
    });
  }

};
