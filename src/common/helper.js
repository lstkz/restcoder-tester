"use strict";

var co = require("co");
var crypto = require("crypto");
var config = require("config");

/**
 * Escape special regex characters
 * @param {String} text the text to escape
 * @returns {String} the escaped string
 */
RegExp.escape = function(text) {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
};

/**
 * Random a string
 * @param {Number} length the expected length
 * @returns {String} the string
 */
 function randomString(length) {
    var chars = 'abcdefghijklmnopqrstuwxyzABCDEFGHIJKLMNOPQRSTUWXYZ0123456789',
        randomBytes = crypto.randomBytes(length),
        result = new Array(length),
        cursor = 0,
        i;
    for (i = 0; i < length; i++) {
        cursor += randomBytes[i];
        result[i] = chars[cursor % chars.length];
    }
    return result.join('');
}

function randomUniqueString() {
    return randomString(config.UNIQUE_STRING_LENGTH);
}

module.exports = {
    randomString,
    randomUniqueString
};