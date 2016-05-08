'use strict';

var validator = require('rox').validator;
var _ = require('underscore');

/**
 * Define a global function used for validation.
 * @param {Object} input the object to validate
 * @param {Object} definition the definition object. Refer to rox module for more details.
 * @param {String} [prefix] the prefix for error message.
 * @throws {Error} error if validation failed.
 */
function validate(input, definition, prefix) {
  var error = validator.validate(prefix || 'prefix-to-remove', input, definition);
  if (!error) {
    return;
  }
    // remove prefix in error message
  error.message = error.message.replace('prefix-to-remove.', '');
    // if input is invalid then change the name to input
  error.message = error.message.replace('prefix-to-remove', 'input');
  error.httpStatus = 400;
  throw error;
}

validator.registerAlias('Number?', { type: 'Number', required: false, nullable: true });
validator.registerAlias('Integer?', { type: 'Integer', required: false, nullable: true });

validator.registerAlias('IntegerId', { type: 'Integer', required: false, nullable: true, min: 1, castString: true });

validator.registerAlias('ShortString', { type: 'String', maxLength: 255 });
validator.registerAliasWithExtend('ShortString', 'ShortString?', { required: false, empty: true, nullable: true });

validator.registerAlias('LongString', { type: 'String', maxLength: 16e3 });
validator.registerAliasWithExtend('LongString', 'LongString?', { required: false, empty: true, nullable: true });

validator.registerAlias('ObjectId?', { type: 'ObjectId', required: false, nullable: true });

// MongoDB id
validator.registerType({
  name: 'ObjectId',
    /**
     *
     * Validate if value is valid ObjectId
     * @param {String} name the property name
     * @param {*} value the value to check
     * @returns {Error|Null} null if value is valid or error if invalid
     */
  validate: function (name, value) {
    if (value && value.toHexString) {
      value = value.toHexString();
    }
    var notString = validator.validate(name, value, 'string');
    if (notString || !/^[a-fA-F0-9]{24}$/.test(value)) {
      return new Error(name + ' should be a valid ObjectId (24 hex characters)');
    }
    return null;
  }
});

// Date type
validator.registerType({
  name: 'date',
    /**
     * Validate if value is a date type and is valid
     * @param {String} name the property name
     * @param {*} value the value to check
     * @returns {Error|Null} null if type is correct or error if incorrect
     */
  validate: function (name, value) {
    if (_.isString(value)) {
      value = new Date(value);
    }
    if (value instanceof Date && value.toString() !== 'Invalid Date') {
      return null;
    }
    return new Error(name + ' must be a valid date');
  }
});


// Any literal object
validator.registerType({
  name: 'AnyObject',
    /**
     *
     * Validate if value is valid ObjectId
     * @param {String} name the property name
     * @param {*} value the value to check
     * @returns {Error|Null} null if value is valid or error if invalid
     */
  validate: function (name, value) {
    if (!_.isArray(value) && _.isObject(value)) {
      return null;
    }
    return new Error(name + ' must be an object');
  }
});


module.exports = {
  validate: validate
};
