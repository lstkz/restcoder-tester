"use strict";

const helper = require("../helper");
const request = require('supertest');
const _ = require('underscore');
const Assert = helper.assert;

var api1;
var api2;
var testCount = 0;

module.exports = {
  before: function() {
    api1 = request(helper.assertEnv("API_URL_0"));
    api2 = request(helper.assertEnv("API_URL_1"));
  },

  [`TEST ${++testCount}`]: function*() {
    var operation = 0;
    var assert = 0;

    let res = yield api1
      .post('/todos')
      .send({
        name: 'item 1'
      })
      .end(++operation);
    const expected = {id: 1, name: 'item 1', done: false};
    Assert.equal(res.status, 201, operation, ++assert);
    Assert.deepEqual(res.body, expected, operation, ++assert);
  },

  [`TEST ${++testCount}`]: function*() {
    var operation = 0;
    var assert = 0;

    let res = yield api2
      .post('/todos')
      .send({
        name: 'item 2'
      })
      .end(++operation);
    const expected = {id: 2, name: 'item 2', done: false};
    Assert.equal(res.status, 201, operation, ++assert);
    Assert.deepEqual(res.body, expected, operation, ++assert);
  },

  [`TEST ${++testCount}`]: function*() {
    var operation = 0;
    var assert = 0;

    let res = yield api2
      .post('/todos/2/done')
      .end(++operation);
    Assert.equal(res.status, 204, operation, ++assert);
  },

  [`TEST ${++testCount}`]: function*() {
    var operation = 0;
    var assert = 0;

    let res = yield api1
      .post('/todos/2/done')
      .end(++operation);
    Assert.equal(res.status, 400, operation, ++assert);
  },

  [`TEST ${++testCount}`]: function*() {
    var operation = 0;
    var assert = 0;

    let res = yield api1
      .get('/todos')
      .end(++operation);
    const expected = [{id: 1, name: 'item 1', done: false}, {id: 2, name: 'item 2', done: true}];
    Assert.equal(res.status, 200, operation, ++assert);
    Assert.deepEqual(res.body, expected, operation, ++assert);
  },

  [`TEST ${++testCount}`]: function*() {
    var operation = 0;
    var assert = 0;

    let res = yield api1
      .post('/todos')
      .end(++operation);
    Assert.equal(res.status, 400, operation, ++assert);
    res = yield api1
      .post('/todos')
      .send({
        name: null
      })
      .end(++operation);
    Assert.equal(res.status, 400, operation, ++assert);
    res = yield api1
      .post('/todos')
      .send({
        name: {}
      })
      .end(++operation);
    Assert.equal(res.status, 400, operation, ++assert);
    res = yield api1
      .post('/todos')
      .send({
        name: []
      })
      .end(++operation);
    Assert.equal(res.status, 400, operation, ++assert);
    res = yield api1
      .post('/todos')
      .send({
        name: 1234
      })
      .end(++operation);
    Assert.equal(res.status, 400, operation, ++assert);
  },

  [`TEST ${++testCount}`]: function*() {
    var operation = 0;
    var assert = 0;

    let res = yield api1
      .post('/todos/1.1/done')
      .end(++operation);
    Assert.equal(res.status, 400, operation, ++assert);
    res = yield api1
      .post('/todos/-1/done')
      .end(++operation);
    Assert.equal(res.status, 400, operation, ++assert);
    res = yield api1
      .post('/todos/asd/done')
      .end(++operation);
    Assert.equal(res.status, 400, operation, ++assert);
  },

  [`TEST ${++testCount}`]: function*() {
    var operation = 0;
    var assert = 0;

    let res = yield api1
      .post('/todos/3847573/done')
      .end(++operation);
    Assert.equal(res.status, 404, operation, ++assert);
  },

  [`TEST ${++testCount}`]: function*() {
    var operation = 0;
    var assert = 0;
    yield _.range(1, 60).map((nr) => {
      const api = nr % 2 ? api1 : api2;
      return api.post('/todos')
        .send({
          name: 'stress ' + nr
        })
        .end(++operation);
    });

    let res = yield api1
      .get('/todos')
      .end(++operation);
    Assert.equal(res.status, 200, operation, ++assert);
    let id = 1;
    operation++;
    res.body.forEach((item) => {
      Assert.equal(item.id, id++, operation, ++assert);
    });
  }

};
