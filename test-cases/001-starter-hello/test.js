"use strict";

const helper = require("../helper");
const request = require('supertest');
const assert = helper.assert;

var API_URL;
var api;

var testCount = 0;

module.exports = {
    before: function () {
        API_URL = helper.assertEnv("API_URL");
        api = request(API_URL);
        this.totalTests = testCount;
    },

    [`TEST ${++testCount}`]: function* () {
        this.action = "GET /hello";
        this.operation = 0;
        this.assert = 0;

        let res = yield api
            .get('/hello')
            .end(++this.operation);
        
        assert.equal(res.status, 200, this.operation, ++this.assert);
        assert.equal(res.text, "world", this.operation, ++this.assert);
    }
};