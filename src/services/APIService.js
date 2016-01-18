"use strict";

const config = require("config");
const request = require('superagent-promise')(require('superagent'), Promise);

module.exports = {
    notifyProgress,
    submitTestResult
};

function* notifyProgress(notifyKey, data) {
    yield request.post(`${config.API_URL}/api/v1/submissions/${notifyKey}/progress`).send(data);
}

function* submitTestResult(notifyKey, data) {
    yield request.post(`${config.API_URL}/api/v1/submissions/${notifyKey}/result`).send(data);
}