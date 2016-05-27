'use strict';

const helper = require("../helper");
const fs = require('fs');
const pg = require('pg');

pg.connect(helper.assertEnv("POSTGRES_URL"), function (err, client, done) {
  if (err) {
    throw err;
  }
  client.query(fs.readFileSync(__dirname + "/data/init.sql", 'utf8'), function (err) {
    if (err) {
      throw err;
    }
    done();
    process.exit();
  });
});
