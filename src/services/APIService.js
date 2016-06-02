'use strict';

const request = require('superagent-promise')(require('superagent'), Promise);

module.exports = {
  notifyProgress,
  submitTestResult
};

function* notifyProgress(apiBaseUrl, notifyKey, data) {
  yield request.post(`${apiBaseUrl}/api/v1/submissions/${notifyKey}/progress`).send(data);
}

function* submitTestResult(apiBaseUrl, notifyKey, data) {
  yield request.post(`${apiBaseUrl}/api/v1/submissions/${notifyKey}/result`).send(data);
}
