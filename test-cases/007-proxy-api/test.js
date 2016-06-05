"use strict";

const helper = require("../helper");
const request = require('supertest');
const _ = require('underscore');
const Assert = helper.assert;

var api1;
var api2;
var proxyApi;
var testCount = 0;

const SECRET = 'r3st0d34Secret';

function* _setProxy(data) {
  yield proxyApi
    .post('/set')
    .set({authorization: SECRET})
    .send(data)
    .end(null);
}

module.exports = {
  before: function*() {
    api1 = request(helper.assertEnv("API_URL_0"));
    api2 = request(helper.assertEnv("API_URL_1"));
    proxyApi = request(helper.assertEnv("PROXY_API_URL"));
  },

  [`TEST ${++testCount}`]: function*() {
    var operation = 0;
    var assert = 0;
    yield _setProxy({
      url: "/testing",
      settings: {
        type: "ok",
        status: 200,
        json: {
          foo: 1
        }
      }
    });
    let res = yield api1.get('/testing').end(++operation);
    Assert.equal(res.status, 200, operation, ++assert);
    Assert.deepEqual(res.body, {foo: 1}, operation, ++assert);
    assert = 0;
    res = yield api2.get('/testing').end(++operation);
    Assert.equal(res.status, 200, operation, ++assert);
    Assert.deepEqual(res.body, {foo: 1}, operation, ++assert);
  },

  [`TEST ${++testCount}`]: function*() {
    var operation = 0;
    var assert = 0;
    yield _setProxy({
      url: "/testing2",
      settings: {
        type: "ok",
        status: 400,
        json: {
          foo: 1
        }
      }
    });
    let res = yield api1.get('/testing2').end(++operation);
    Assert.equal(res.status, 502, operation, ++assert);
  },

  [`TEST ${++testCount}`]: function*() {
    var operation = 0;
    var assert = 0;
    yield _setProxy({
      url: "/testing3",
      settings: {
        type: "error"
      }
    });
    let res = yield api2.get('/testing3').end(++operation);
    Assert.equal(res.status, 502, operation, ++assert);
  },


  [`TEST ${++testCount}`]: function*() {
    var operation = 0;
    var assert = 0;
    const url = '/foo/bar/a/b/c/6666?q1=2&q2=3&q6';
    const checkResponse = (api, body) => function* () {
      assert = 0;
      let res = yield api.get(url).end(++operation);
      Assert.equal(res.status, 200, operation, ++assert);
      Assert.deepEqual(res.body, body, operation, ++assert);
    };
    yield _setProxy({
      url: url,
      settings: {
        type: "ok",
        status: 200,
        json: {
          foo: 100
        }
      }
    });
    yield checkResponse(api1, {foo: 100});
    yield checkResponse(api2, {foo: 100});

    yield _setProxy({
      url: url,
      settings: {
        type: "ok",
        status: 200,
        json: {
          foo: 101
        }
      }
    });
    yield checkResponse(api1, {foo: 100});
    yield checkResponse(api2, {foo: 100});
  },

  [`TEST ${++testCount}`]: function*() {
    this.timeout(6000);
    const setData = (nr) => function* () {
      yield _setProxy({
        url: '/' + nr,
        settings: {
          type: "ok",
          status: 200,
          json: {
            nr
          }
        }
      });
    };
    
    yield setData(1);
    yield setData(2);
    yield setData(3);
    
    let operation = 0;
    let assert = 0;
    const fetchResponse = (api, nr) => function* () {
      assert = 0;
      let res = yield api.get('/' + nr).end(++operation);
      Assert.equal(res.status, 200, operation, ++assert);
      Assert.deepEqual(res.body, {nr}, operation, ++assert);
    };
    yield [
      fetchResponse(api1, 1), fetchResponse(api1, 2), fetchResponse(api1, 3),
      fetchResponse(api2, 1), fetchResponse(api2, 2), fetchResponse(api2, 3),
      fetchResponse(api1, 1), fetchResponse(api2, 2), fetchResponse(api1, 3),
    ];

    yield _setProxy({
      url: '/1',
      settings: {
        type: "ok",
        status: 200,
        json: {
          foo: 'new-data'
        }
      }
    });
    yield _setProxy({
      url: '/2',
      settings: {
        type: "ok",
        status: 400,
        json: {
          foo: 'foo'
        }
      }
    });
    yield _setProxy({
      url: '/3',
      settings: {
        type: "error"
      }
    });
    yield (cb) => setTimeout(cb, 5100);

    assert = 0;
    let res = yield api1.get('/1').end(++operation);
    Assert.equal(res.status, 200, operation, ++assert);
    Assert.deepEqual(res.body, {foo: 'new-data'}, operation, ++assert);

    assert = 0;
    res = yield api2.get('/2').end(++operation);
    Assert.equal(res.status, 502, operation, ++assert);

    assert = 0;
    res = yield api2.get('/3').end(++operation);
    Assert.equal(res.status, 502, operation, ++assert);
  },
};
