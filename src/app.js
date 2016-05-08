'use strict';

const amqp = require('amqplib');
const config = require('config');
const co = require('co');
const TesterService = require('./services/TesterService');
const logger = require('./common/logger');

var connection;
process.once('SIGINT', function () {
  try {
    connection.close();
  } catch (ignore) {
  }
  process.exit();
});

co(function* () {
  connection = yield amqp.connect(config.AMQP_URL);
  var channel = yield connection.createConfirmChannel();
  channel.assertQueue(config.SUBMISSION_QUEUE_NAME, { durable: true });
  channel.prefetch(config.MAX_PARALLEL_TESTS);
  channel.consume(config.SUBMISSION_QUEUE_NAME, function (msg) {
    co(function* () {
      var submission;
      if (!msg) {
        return;
      }
      try {
        submission = JSON.parse(msg.content.toString());
      } catch (ignore) {
        logger.error('Invalid message. Ignoring');
        channel.ack(msg);
        return;
      }
      logger.debug('Processing message %j', submission, {});
      yield new Promise(resolve => setTimeout(resolve, 1000));
      try {
        yield TesterService.testSubmission(submission);
      } catch (err) {
        logger.logFullError(err, 'TesterService#testSubmission');
      }

      channel.ack(msg);
    }).catch(e => {
           // TODO
      console.log(e);
      console.log(e.stack);
    });
  });
}).catch(e => {
  console.log(e);
  console.log(e.stack);
  process.exit(1);
});
