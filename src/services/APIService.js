"use strict";

const config = require("config");
const request = require('superagent-promise')(require('superagent'), Promise);

module.exports = {
    notifyProgress
};

function* notifyProgress(notifyKey, data) {
    yield request.post(`${config.API_URL}/api/v1/notify-progress/${notifyKey}`).send(data);
}