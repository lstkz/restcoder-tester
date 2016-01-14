"use strict";

const helper = require("../helper");
const request = require('supertest');
const assert = helper.assert;

var api;

var testCount = 0;

module.exports = {
    before: function () {
        api = request(helper.assertEnv("API_URL_0"));
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
