"use strict";

const helper = require("../helper");
const superagent = require('superagent-promise')(require('superagent'), Promise);
const request = require('supertest');
const jwt = require('jwt-simple');
const _ = require('underscore');
const speakeasy = require('speakeasy');
const base32 = require('base32.js');
const Assert = helper.assert;
const wrap = helper.wrap;
const wrapAsync = helper.wrapAsync;

var api1;
var api2;
var testCount = 0;
var JWT_TOKEN_SECRET;
var userToken;
var userSecret;

const USERNAME_TEST = 'demouser' + (new Date().getTime() % 5447);
const PASSWORD = 'pass'+ (new Date().getTime() % 7388);

function* _decodeQR(binaryQr, operation, assert) {
  let url = null;
  yield wrapAsync(operation, assert, function*() {
    const res = yield superagent.post('http://api.qrserver.com/v1/read-qr-code/')
      .attach('file', binaryQr, 'file')
      .end();
    const result = res.body[0].symbol[0];
    if (result.error) {
      throw new Error(result.error);
    }
    url = result.data;
  });
  return url;
}

function _getCode(diff) {
  return speakeasy.totp({
    secret: userSecret,
    encoding: 'base32',
    time: new Date().getTime() / 1000 + diff
  });
}

function* _getSecret(api, operation, userToken) {
  let assert = 0;
  let res = yield api
    .post('/two-factor')
    .set({
      authorization: `JWT ${userToken}`
    })
    .end(++operation);
  Assert.equal(res.status, 200, operation, ++assert);
  let url = yield _decodeQR(res.body, operation, ++assert);
  const exec = /secret=(\w+)/.exec(url);
  Assert.ok(exec, operation, ++assert);
  return exec[1];
}

module.exports = {
  before: function() {
    api1 = request(helper.assertEnv("API_URL_0"));
    api2 = request(helper.assertEnv("API_URL_1"));
    JWT_TOKEN_SECRET = helper.assertEnv("JWT_TOKEN_SECRET");
  },

  [`TEST ${++testCount}`]: function*() {
    var operation = 0;
    var assert = 0;

    let res = yield api1
      .post('/register')
      .send({
        username: USERNAME_TEST,
        password: PASSWORD
      })
      .end(++operation);
    Assert.equal(res.status, 204, operation, ++assert);
  },

  [`TEST ${++testCount}`]: function*() {
    var operation = 0;
    var assert = 0;

    let res = yield api2
      .post('/login')
      .send({
        username: USERNAME_TEST,
        password: PASSWORD
      })
      .end(++operation);
    Assert.equal(res.status, 200, operation, ++assert);
    Assert.ok(res.body, operation, ++assert);
    Assert.ok(res.body.token, operation, ++assert);
    userToken = res.body.token;
    wrap(operation, ++assert, () => jwt.decode(userToken, JWT_TOKEN_SECRET));
  },

  [`TEST ${++testCount}`]: function*() {
    var operation = 0;
    var assert = 0;

    let res = yield api1
      .get('/me')
      .set({
        authorization: `JWT ${userToken}`
      })
      .end(++operation);
    const expected = {username: USERNAME_TEST};
    Assert.equal(res.status, 200, operation, ++assert);
    Assert.deepEqual(res.body, expected, operation, ++assert);
  },

  [`TEST ${++testCount}`]: function*() {
    var operation = 0;
    var assert = 0;

    let res = yield api2
      .post('/two-factor')
      .set({
        authorization: `JWT ${userToken}`
      })
      .end(++operation);
    Assert.equal(res.status, 200, operation, ++assert);
    operation++;
    assert = 0;
    let url = yield _decodeQR(res.body, operation, ++assert);
    operation++;
    assert = 0;
    const exec = /secret=(\w+)/.exec(url);
    Assert.ok(exec, operation, ++assert);
    userSecret = exec[1];

    operation++;
    assert = 0;
    Assert.ok(url.indexOf(`otpauth://totp/${USERNAME_TEST}?`) === 0, operation, ++assert);
    Assert.ok(/issuer=RestCoder($|&)/.test(url), operation, ++assert);
    
    operation++;
    assert = 0;
    const ascii = base32.decode(userSecret);
    Assert.equal(ascii.length, 32, operation, ++assert);
  },

  [`TEST ${++testCount}`]: function*() {
    var operation = 0;
    var assert = 0;
    const assertWrong = (api, code) => function* () {
      operation++;
      assert=0;
      let res = yield api
        .post('/two-factor/confirm')
        .set({
          authorization: `JWT ${userToken}`
        })
        .send({
          code
        })
        .end(operation);
      Assert.equal(res.status, 400, operation, ++assert);
      Assert.ok(res.body, operation, ++assert);
      Assert.equal(res.body.error, 'INVALID_CODE', operation, ++assert);
    };

    yield assertWrong(api1, '123456');
    yield assertWrong(api2, '1234');
    yield assertWrong(api2, _getCode(-31));
    yield assertWrong(api1, _getCode(35));
    operation++;
    assert=0;
    let res = yield api1
      .post('/two-factor/confirm')
      .set({
        authorization: `JWT ${userToken}`
      })
      .send({
        code: _getCode(0)
      })
      .end(operation);
    Assert.equal(res.status, 204, operation, ++assert);
    operation++;
    assert=0;
    res = yield api2
      .post('/two-factor/confirm')
      .set({
        authorization: `JWT ${userToken}`
      })
      .send({
        code: _getCode(0)
      })
      .end(operation);

    Assert.equal(res.status, 400, operation, ++assert);
    Assert.ok(res.body, operation, ++assert);
    Assert.equal(res.body.error, 'ALREADY_ENABLED', operation, ++assert);
  },

  [`TEST ${++testCount}`]: function*() {
    var operation = 0;
    var assert = 0;
    const assertError = (api, values, errorCode) => function* () {
      operation++;
      assert=0;
      let res = yield api
        .post('/login')
        .set({
          authorization: `JWT ${userToken}`
        })
        .send(values)
        .end(operation);
      Assert.equal(res.status, 401, operation, ++assert);
      Assert.ok(res.body, operation, ++assert);
      Assert.equal(res.body.error, errorCode, operation, ++assert);
    };

    yield assertError(api1, {
      username: USERNAME_TEST + 'random',
      password: PASSWORD
    }, 'INVALID_CREDENTIALS');

    yield assertError(api2, {
      username: USERNAME_TEST,
      password: PASSWORD  + 'random'
    }, 'INVALID_CREDENTIALS');

    yield assertError(api1, {
      username: USERNAME_TEST,
      password: PASSWORD
    }, 'CODE_REQUIRED');

    yield assertError(api2, {
      username: USERNAME_TEST,
      password: PASSWORD,
      code: '1234'
    }, 'INVALID_CODE');

    yield assertError(api1, {
      username: USERNAME_TEST,
      password: PASSWORD,
      code: _getCode(-31)
    }, 'INVALID_CODE');

    yield assertError(api2, {
      username: USERNAME_TEST,
      password: PASSWORD,
      code: _getCode(35)
    }, 'INVALID_CODE');

    assert = 0;
    let res = yield api2
      .post('/login')
      .send({
        username: USERNAME_TEST,
        password: PASSWORD,
        code: _getCode(0)
      })
      .end(++operation);
    Assert.equal(res.status, 200, operation, ++assert);
    Assert.ok(res.body, operation, ++assert);
    Assert.ok(res.body.token, operation, ++assert);

    assert = 0;
    res = yield api2
      .get('/me')
      .set({
        authorization: `JWT ${res.body.token}`
      })
      .end(++operation);
    const expected = {username: USERNAME_TEST};
    Assert.equal(res.status, 200, operation, ++assert);
    Assert.deepEqual(res.body, expected, operation, ++assert);
  },

  [`TEST ${++testCount}`]: function*() {
    var operation = 0;
    var assert = 0;

    let res = yield api2
      .post('/two-factor')
      .set({
        authorization: `JWT ${userToken}`
      })
      .end(++operation);
    Assert.equal(res.status, 400, operation, ++assert);
    Assert.ok(res.body, operation, ++assert);
    Assert.equal(res.body.error, 'ALREADY_ENABLED', operation, ++assert);
  },
  [`TEST ${++testCount}`]: function*() {
    var operation = 0;
    var assert = 0;

    let res = yield api2
      .delete('/two-factor')
      .set({
        authorization: `JWT ${userToken}`
      })
      .end(++operation);
    Assert.equal(res.status, 204, operation, ++assert);
    res = yield api2
      .delete('/two-factor')
      .set({
        authorization: `JWT ${userToken}`
      })
      .end(++operation);
    Assert.equal(res.status, 400, operation, ++assert);
    Assert.ok(res.body, operation, ++assert);
    Assert.equal(res.body.error, 'NOT_ENABLED', operation, ++assert);
  },

  [`TEST ${++testCount}`]: function*() {
    var operation = 0;
    var assert = 0;

    let res = yield api2
      .post('/login')
      .send({
        username: USERNAME_TEST,
        password: PASSWORD
      })
      .end(++operation);
    Assert.equal(res.status, 200, operation, ++assert);
    Assert.ok(res.body, operation, ++assert);
    Assert.ok(res.body.token, operation, ++assert);
    userToken = res.body.token;
    wrap(operation, ++assert, () => jwt.decode(userToken, JWT_TOKEN_SECRET));
  },

  [`TEST ${++testCount}`]: function*() {
    var operation = 0;
    var assert = 0;
       
    const secret1 = yield _getSecret(api1, ++operation, userToken);
    const secret2 = yield _getSecret(api2, ++operation, userToken);

    const invalidCode = speakeasy.totp({
      secret: secret1,
      encoding: 'base32'
    });

    const validCode = speakeasy.totp({
      secret: secret2,
      encoding: 'base32'
    });
    operation++;
    let res = yield api2
      .post('/two-factor/confirm')
      .set({
        authorization: `JWT ${userToken}`
      })
      .send({
        code:invalidCode
      })
      .end(operation);

    Assert.equal(res.status, 400, operation, ++assert);
    Assert.ok(res.body, operation, ++assert);
    Assert.equal(res.body.error, 'INVALID_CODE', operation, ++assert);
    
    res = yield api1
      .post('/two-factor/confirm')
      .set({
        authorization: `JWT ${userToken}`
      })
      .send({
        code: validCode
      })
      .end(operation);

    Assert.equal(res.status, 204, operation, ++assert);
  },

  [`TEST ${++testCount}`]: function*() {
    const verify = (api, operation, username, password) => function* () {
      var assert = 0;
      let res = yield api
        .post('/register')
        .send({ username, password })
        .end(operation);
      Assert.equal(res.status, 204, operation, ++assert);
      res = yield api
        .post('/login')
        .send({ username, password })
        .end(operation);
      Assert.equal(res.status, 200, operation, ++assert);
      const token = res.body.token;
      const secret = yield _getSecret(api, operation, token);
      res = yield api2
        .post('/two-factor/confirm')
        .set({
          authorization: `JWT ${token}`
        })
        .send({
          code: speakeasy.totp({
            secret: secret,
            encoding: 'base32'
          })
        })
        .end(operation);
      Assert.equal(res.status, 204, operation, ++assert);
      res = yield api
        .post('/login')
        .send({ username, password })
        .end(operation);
      Assert.equal(res.status, 401, operation, ++assert);
      Assert.ok(res.body, operation, ++assert);
      Assert.equal(res.body.error, 'CODE_REQUIRED', operation, ++assert);
      res = yield api
        .post('/login')
        .send({
          username,
          password,
          code: speakeasy.totp({
            secret: secret,
            encoding: 'base32'
          })
        })
        .end(operation);
      Assert.equal(res.status, 200, operation, ++assert);
      res = yield api
        .get('/me')
        .set({
          authorization: `JWT ${res.body.token}`
        })
        .end(operation);
      Assert.equal(res.status, 200, operation, ++assert);
      Assert.deepEqual(res.body, {username}, operation, ++assert);
    };
    yield _.range(1, 10).map((nr) => {
      return verify(nr % 2 ? api1: api2, nr, USERNAME_TEST + nr, PASSWORD + nr);
    });
  }
};
