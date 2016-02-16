"use strict";

const helper = require("../helper");
const request = require('supertest');
const fs = require('fs');
const _ = require('underscore');
const pg = require('pg');
const Assert = helper.assert;

var api;
var testCount = 0;
var client;
var expected;

//noinspection JSDuplicatedDeclaration
module.exports = {
    before: function* () {
        api = request(helper.assertEnv("API_URL_0"));
        client = new pg.Client(helper.assertEnv("POSTGRES_URL"));
        yield client.connect.bind(client);
        yield client.query.bind(client, fs.readFileSync(__dirname + "/data/init.sql", 'utf8'));
        expected = require("./data/expected.json");
    },

    [`TEST ${++testCount}`]: function* () {
        this.timeout(1000);
        var operation = 0;
        var assert = 0;

        let res = yield api
            .get('/products')
            .end(++operation);

        Assert.equal(res.status, 200, operation, ++assert);
        Assert.deepEqual(res.body, expected, operation, ++assert);
    },

    [`TEST ${++testCount}`]: function* () {
        this.timeout(1000);
        yield _.range(1, 20).map((operation) => function* () {
            var assert = 0;
            let res = yield api
                .get('/products')
                .end(operation);

            Assert.equal(res.status, 200, operation, ++assert);
            Assert.deepEqual(res.body, expected, operation, ++assert);
        });
    }
};
