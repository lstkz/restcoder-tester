'use strict';

const exec = require('mz/child_process').exec;
const execCb = require('child_process').exec;
const fork = require('child_process').fork;
const _ = require('underscore');
const ms = require('ms');
const co = require('co');
const config = require('config');
const bash = require('bash');
const Path = require('path');
const helper = require('../common/helper');
const logger = require('../common/logger');
const OperationError = require('../common/errors').OperationError;
const validate = require('../common/validator').validate;
const APIService = require('./APIService');
const LoggerService = require('./LoggerService');

const IDLE_CMD = '/bin/bash -c "while true; do sleep 1; done"';
const MAX_SIZE = 1024 * 1024;

const EXEC_OPTS_10s = { timeout: ms('10s') };
const EXEC_OPTS_1m = { timeout: ms('1m') };
const EXEC_OPTS_3m = { timeout: ms('3m') };

const LIMIT_RUN_OPTS = '--memory=256m --cpu-period=50000 --cpu-quota=35000';
const LIMIT_INSTALL_OPTS = '--memory=1024m --cpu-period=50000 --cpu-quota=35000';

var currentPort = _.random(0, 1000);

// Exports
module.exports = {
  testSubmission
};

function* _setIpTables(cmd) {
  if (config.DISABLE_IP_TABLES) {
    return;
  }
  yield exec('sudo ' + cmd);
}

function* _getContainerIP(containerId) {
  var result = yield exec(`docker inspect --format='{{.NetworkSettings.IPAddress}}' ${containerId}`);
  return result[0].trim();
}

function* _runDockerDaemon(cmd) {
  var result = yield exec(cmd);
  return result[0].trim();// containerId
}

function _getFreePort() {
  currentPort = (currentPort + 1) % 1000;
  return currentPort + 50000;
}

function _getInstallCommand(language) {
  switch (language) {
    case 'nodejs':
      return 'npm install';
    case 'ruby':
      return 'bundler install';
    case 'python':
      return 'pip install -r requirements.txt';
    case 'java':
      return 'mvn install';
    case 'dotnet':
      return 'nuget restore -NonInteractive && xbuild';
  }
  throw new Error('Not supported language: ' + language);
}


function _execCommand(command, name, timeout) {
  var proc = execCb(command);
  return new Promise((resolve, reject) => {
    var isHandled = false;
    var stdoutLogger = LoggerService.createLogger(MAX_SIZE);
    var stderrLog = LoggerService.createLogger(MAX_SIZE);
    proc.stdout.on('data', data => {
      stdoutLogger.log(data);
    });
    proc.stderr.on('data', data => {
      stderrLog.log(data);
    });
    proc.on('error', e => {
      clearTimeout(interval);
      var err = new OperationError(`Process "${name}" returned an error: ${e.message}`);
      complete(err);
    });

    proc.on('exit', (code) => {
      clearTimeout(interval);
      if (!code) {
        complete();
      } else {
        complete(new OperationError('Non zero exit code: ' + code));
      }
    });

    var interval = setTimeout(function () {
      proc.kill();
      complete(new OperationError(`Process "${name}" timeout.`));
    }, timeout);

    function complete(err) {
      if (isHandled) {
        return;
      }
      isHandled = true;
      co(function* () {
        return yield [stdoutLogger.s3Upload(), stderrLog.s3Upload()];
      }).then(logs => {
        var ret = { command, name };
        if (logs[0]) {
          ret.stdout = logs[0];
        }
        if (logs[1]) {
          ret.stderr = logs[1];
        }
        if (err) {
          err.info = ret;
          reject(err);
        } else {
          resolve(ret);
        }
      }).catch(reject);
    }
  });
}

/**
 * Step 1. Validate input and generate a prefix for all docker containers/images
 * @param data
 * @param submissionLogger
 * @returns {String} the prefix
 * @private
 */
function* _prepareStep(data, submissionLogger) {
  validate(data,
    {
      'submissionId': 'ObjectId',
      'language': 'ShortString',
      'notifyKey': 'ShortString',
      'dockerImage': 'ShortString',
      'sourceUrl': 'ShortString',
      'commands': 'AnyObject',
      'testCase': 'ShortString',
      'processes': 'AnyObject',
      'services': {
        type: ['AnyObject'],
        empty: true
      }
    });
  submissionLogger.info('Validation pass');

  yield APIService.notifyProgress(data.notifyKey, { type: 'PREPARING' });

  return `${data.submissionId}_${helper.randomString(5)}`.toLowerCase();
}

/**
 * Step 2. Create a container that contains installed dependencies
 * @param data
 * @param cleanUpSteps
 * @param submissionLogger
 * @param namePrefix
 * @returns {String} the docker image name
 * @private
 */
function* _initializeContainerStep(data, cleanUpSteps, submissionLogger, namePrefix) {
  var steps = {
    ALL: 'initializeContainer',
    CREATE_BASE_DOCKER_IMAGE: 'initializeContainer | create base docker image',
    DOWNLOAD_SOURCE_CODE: 'initializeContainer | download source code',
    INSTALL: 'initializeContainer | install dependencies',
    COMMIT: 'initializeContainer | commit container',
    REMOVE: 'initializeContainer | remove container'
  };

  submissionLogger.profile(steps.ALL);

    // Step 1 - Create docker image
    // run empty container as daemon
    // will be automatically removed on exit
  var containerName = 'setup-' + namePrefix;
  submissionLogger.profile(steps.CREATE_BASE_DOCKER_IMAGE);
  yield exec(`docker run ${LIMIT_INSTALL_OPTS} -d --name ${containerName} ${data.dockerImage} ${IDLE_CMD}`, EXEC_OPTS_10s);
  submissionLogger.profile(steps.CREATE_BASE_DOCKER_IMAGE);
  cleanUpSteps.push({
    type: 'REMOVE_CONTAINER',
    data: containerName
  });

    // Step 2 - Download source code
  var zipName = 'app.zip';
  submissionLogger.profile(steps.DOWNLOAD_SOURCE_CODE);
  yield exec(`docker exec ${containerName} /bin/bash -c "curl -o ${zipName} ${data.sourceUrl} && unzip ${zipName}"`, EXEC_OPTS_1m);
  submissionLogger.profile(steps.DOWNLOAD_SOURCE_CODE);

    // Step 3 - Install dependencies
  var installCmd = _getInstallCommand(data.language);
  yield APIService.notifyProgress(data.notifyKey, { type: 'INSTALL' });
  submissionLogger.profile(steps.INSTALL);
  var installResult = yield _execCommand(`docker exec ${containerName} /bin/bash -c "${installCmd}"`, 'Install Dependencies', ms('3m'));
  submissionLogger.profile(steps.INSTALL);
  submissionLogger.info('initializeContainer | install dependencies result %j', installResult, {});

    // Step 4 - Commit container (create new image with installed dependencies)
  yield APIService.notifyProgress(data.notifyKey, { type: 'INSTALL_OK' });
  yield APIService.notifyProgress(data.notifyKey, { type: 'INSTALL_LOG', msg: 'installLog' });
  var imageName = `app_${namePrefix}`;
  submissionLogger.profile(steps.CREATE_BASE_DOCKER_IMAGE);
  yield exec(`docker commit ${containerName} ${imageName}`, EXEC_OPTS_1m);
  submissionLogger.profile(steps.CREATE_BASE_DOCKER_IMAGE);

    // Step 5 - Remove original container container, we don't need it anymore
  submissionLogger.profile(steps.REMOVE);
  yield exec(`docker rm -f ${containerName}`, EXEC_OPTS_10s);
  submissionLogger.profile(steps.REMOVE);

    // remove, because the container it's already removed
  cleanUpSteps.pop();

  cleanUpSteps.push({
    type: 'REMOVE_IMAGE',
    data: imageName
  });

  submissionLogger.profile(steps.ALL);

  return imageName;
}

/**
 * Step 3. Start services
 * @param data
 * @param cleanUpSteps
 * @param submissionLogger
 * @param namePrefix
 * @private
 */
function* _startServicesStep(data, cleanUpSteps, submissionLogger, namePrefix, testEnv) {
  var steps = {
    ALL: 'startServices',
    START: 'startServices | start: '
  };
  submissionLogger.profile(steps.ALL);
  yield data.services.map(service => function* () {
    var serviceName = `service-${namePrefix}-${helper.randomString(5)}`.toLowerCase();
    submissionLogger.profile(steps.START + serviceName);

    var hostPort = _getFreePort();
    var ports = `-p ${hostPort}:${service.port}`;
    var proc;
    if (service.doneText) {
      proc = execCb(`docker run  ${ports} --name ${serviceName} ${service.dockerImage}`);
    } else {
      yield exec(`docker run -d ${ports} --name ${serviceName} ${service.dockerImage}`, EXEC_OPTS_10s);
    }
    submissionLogger.profile(steps.START + serviceName);
    cleanUpSteps.push({
      type: 'REMOVE_CONTAINER',
      data: serviceName
    });
    yield new Promise((resolve, reject) => {
      if (!service.doneText) {
        resolve();
        return;
      }
      var interval;
      const complete = (err) => {
        clearTimeout(interval);
        if (!err) {
          resolve();
        } else {
          reject(err);
        }
      };

      interval = setTimeout(function () {
        proc.kill();
        complete(new Error(`Service "${service.id}" timeout.`));
      }, 5000);

      proc.stdout.on('data', data => {
        if (data.toString().indexOf(service.doneText) !== -1) {
          complete();
        }
      });

      proc.on('error', e => {
        complete(new OperationError(`Service "${service.id}" returned an error: ${e.message}`));
      });
    });
    var ip = yield _getContainerIP(serviceName);
    testEnv[service.envName] = service.url.replace('{{ip}}', config.HOST_IP).replace('{{port}}', hostPort);
    service.url = service.url.replace('{{ip}}', ip).replace('{{port}}', service.port);
    service.ip = ip;
  });
  submissionLogger.profile(steps.ALL);
}

/**
 * Step 4. Prepare user containers (exec with empty bash command)
 * @param data
 * @param cleanUpSteps
 * @param submissionLogger
 * @param namePrefix
 * @param imageName
 * @param testEnv
 * @returns {Array} the array of created containers
 * @private
 */
function* _prepareUserContainersStep(data, cleanUpSteps, submissionLogger, namePrefix, imageName, testEnv) {
  var steps = {
    ALL: 'prepareContainers',
    START: 'prepareContainers | start: '
  };
  submissionLogger.profile(steps.ALL);

  var containers = yield _.map(data.processes, function (conf, procName) {
    let cmd = data.commands[procName];
    if (!cmd) {
            // shouldn't happen, it's pre-validated in the submission API
      throw new Error(`Command ${procName} is missing in Procfile`);
    }

    return _.map(_.range(0, conf.instances), n => function* () {
      var name = `app-${namePrefix}-${procName}-${n}`;
      var hostPort = _getFreePort();
      var containerPort = config.APP_DEFAULTS.HTTP_PORT;
      var ports = `-p ${hostPort}:${containerPort}`;
      submissionLogger.profile(steps.START + name);
      yield exec(`docker run ${LIMIT_RUN_OPTS} -d ${ports} --name ${name} ${imageName} ${IDLE_CMD}`, EXEC_OPTS_10s);
      submissionLogger.profile(steps.START + name);
      cleanUpSteps.push({
        type: 'REMOVE_CONTAINER',
        data: name
      });
      var ip = yield _getContainerIP(name);
      var envVariables = {};
      if (procName === 'web') {
        envVariables.PORT = containerPort;
        testEnv['API_URL_' + n] = `http://${config.HOST_IP}:${hostPort}`;
      }
      var ret = {
        instanceNr: n,
        procName,
        containerName: name,
        cmd,
        ip,
        envVariables
      };
      submissionLogger.info('prepareContainers | created instance ', ret);
      return ret;
    });
  });
  submissionLogger.profile(steps.ALL);

  return _.flatten(containers);
}


/**
 * Step 5. Disable internet access in user's containers
 * @param data
 * @param cleanUpSteps
 * @param submissionLogger
 * @param containers
 * @private
 */
function* _disableInternetConnectionStep(data, cleanUpSteps, submissionLogger, containers) {
  var steps = {
    ALL: 'disableInternetConnection',
    EXEC: 'disableInternetConnection | exec: '
  };
  submissionLogger.profile(steps.ALL);
  yield containers.map(container => function* () {
    var cmd = ` iptables -w -I FORWARD -s ${container.ip} -j REJECT`;
    submissionLogger.profile(steps.EXEC + cmd);
    yield _setIpTables(cmd);
    submissionLogger.profile(steps.EXEC + cmd);
    cleanUpSteps.push({
      type: 'IPTABLES',
      data: ` iptables -w -D FORWARD -s ${container.ip} -j REJECT`
    });
  });
  submissionLogger.profile(steps.ALL);
}

/**
 * Step 6. Link containers and service (enable access via iptables)
 * @param data
 * @param cleanUpSteps
 * @param submissionLogger
 * @param containers
 * @private
 */
function* _linkContainersStep(data, cleanUpSteps, submissionLogger, containers) {
  var steps = {
    ALL: 'linkContainers',
    EXEC: 'linkContainers | exec: '
  };
  submissionLogger.profile(steps.ALL);
  var containerIndex = _.groupBy(containers, 'procName');
  const cmds = [];
  data.services.forEach(service => {
    service.link.forEach(procName => {
      var containers = containerIndex[procName];
      if (!containers) {
        return;
      }
      containers.forEach(container => {
        var cmd = ` iptables -w -I FORWARD -s ${container.ip} -d ${service.ip} -j ACCEPT`;
        cmds.push(cmd);
        container.envVariables[service.envName] = service.url;
        cleanUpSteps.push({
          type: 'IPTABLES',
          data: ` iptables -w -D FORWARD -s ${container.ip} -d ${service.ip} -j ACCEPT`
        });
      });
    });
  });
  yield cmds.map((cmd) => function* () {
    submissionLogger.profile(steps.EXEC + cmd);
    yield _setIpTables(cmd);
    submissionLogger.profile(steps.EXEC + cmd);
  });
  submissionLogger.profile(steps.ALL);
}


/**
 * Step 7. Start user's containers and wait for READY
 * @param data
 * @param submissionLogger
 * @param containers
 * @private
 */
function* _startContainersStep(data, submissionLogger, containers) {
  var steps = {
    ALL: 'startContainers',
    READY: 'startContainers | ready: '
  };
  submissionLogger.profile(steps.ALL);
  yield APIService.notifyProgress(data.notifyKey, { type: 'READY' });

  yield containers.map(container => {
    return new Promise((resolve, reject) => {
      var stdoutLogger = LoggerService.createLogger(MAX_SIZE);
      var stderrLog = LoggerService.createLogger(MAX_SIZE);
      var command = '';
      var isHandled = false;
      var name = container.procName;

      _.each(container.envVariables, (value, key) => {
        command += `export ${key}=${value}; `;
      });
      command += `export INSTANCE_NR=${container.instanceNr}; `;
      command += container.cmd;
      command = '/bin/bash -c ' + bash.escape(command);

      submissionLogger.profile(steps.READY + command);
      var proc = execCb(`docker exec ${container.containerName} ${command}`);

      var interval = setTimeout(function () {
        proc.kill();
        complete(new OperationError(`Process "${name}" timeout. Your application must output "READY" within 3s.`));
      }, 3000);

      proc.stdout.on('data', data => {
        stdoutLogger.log(data);
        if (data.toString().trim() === 'READY') {
          submissionLogger.profile(steps.READY + command);
          complete();
        }
      });
      proc.stderr.on('data', data => {
        stderrLog.log(data);
      });

      proc.on('error', e => {
        var err = new OperationError(`Process "${name}" returned an error: ${e.message}`);
        complete(err);
      });

      proc.on('exit', (code) => {
        complete(new OperationError(`Process "${name}" exited with code: ${code}`));
      });

      function complete(err) {
        if (isHandled) {
          return;
        }
        clearTimeout(interval);
        isHandled = true;
        co(function* () {
          return yield [stdoutLogger.s3Upload(), stderrLog.s3Upload()];
        }).then(logs => {
          var ret = { command, name };
          if (logs[0]) {
            ret.stdout = logs[0];
          }
          if (logs[1]) {
            ret.stderr = logs[1];
          }
          if (err) {
            err.info = ret;
            submissionLogger.logFullError(err, 'startContainers');
            err.isLogged = true;
            reject(err);
          } else {
            submissionLogger.info('startContainers | result %j', ret, {});
            resolve(ret);
          }
        }).catch(reject);
      }
    });
  });

  yield APIService.notifyProgress(data.notifyKey, { type: 'READY_OK' });

  submissionLogger.profile(steps.ALL);
}

/**
 * Step 8. Start unit tests
 * @param data
 * @param submissionLogger
 * @param testEnv
 * @returns {*} the unit test result
 * @private
 */
function* _startUniTestsStep(data, submissionLogger, testEnv) {
  var steps = {
    ALL: 'startUniTests'
  };
  submissionLogger.profile(steps.ALL);

  yield APIService.notifyProgress(data.notifyKey, { type: 'BEFORE_START' });

  var child = fork(__dirname + '/../mocha-child.js');
  var files = [
    Path.join(__dirname, '../../test-cases/', data.testCase, 'test.js')
  ];
  child.send({ files: files, testEnv: testEnv });
  let queue = Promise.resolve();
  const notify = (msg) => {
    queue = queue.then(() => {
      return co(APIService.notifyProgress(data.notifyKey, msg))
        .catch((e) => {
          throw e;
        });
    });
  };

  var testResult = yield new Promise(function (resolve, reject) {
    child.on('message', function (msg) {
      co(function* () {
        switch (msg.type) {
          case 'START':
            submissionLogger.info('TEST START | %j', msg, {});
            notify(msg);
            break;
          case 'TEST_RESULT':
            submissionLogger.info('TEST | %j', msg, {});
            notify(msg);
            break;
          case 'END':
            submissionLogger.info('TEST END | %j', msg, {});
            notify({ type: 'END', passed: msg.result.passed });
            resolve(msg.result);
            break;
          case 'ERROR':
            reject(msg.data);
            break;
        }
      }).catch(reject);
    });
  });
  submissionLogger.profile(steps.ALL);

  return testResult;
}

/**
 * Clean up containers and ip rules
 * @param cleanUpSteps
 * @param submissionLogger
 * @private
 */
function* _cleanUp(cleanUpSteps, submissionLogger) {
  var steps = {
    ALL: 'cleanUp',
    IPTABLES: 'cleanUp | iptables: ',
    REMOVE_CONTAINER: 'cleanUp | remove container: ',
    REMOVE_IMAGE: 'cleanUp | remove image: '
  };
  submissionLogger.profile(steps.all);
  yield cleanUpSteps.filter((step) => step.type !== 'REMOVE_IMAGE').map(step => function* () {
    switch (step.type) {
      case 'IPTABLES':
        submissionLogger.profile(steps.IPTABLES + step.data);
        yield _setIpTables(step.data);
        submissionLogger.profile(steps.IPTABLES + step.data);
        return;
      case 'REMOVE_CONTAINER':
        submissionLogger.profile(steps.REMOVE_CONTAINER + step.data);
        yield exec(`docker rm -f ${step.data}`, EXEC_OPTS_10s);
        submissionLogger.profile(steps.REMOVE_CONTAINER + step.data);
        return;
      default:
        throw new Error('Unknown clean up type: ' + step.type);
    }
  });

  yield cleanUpSteps.filter((step) => step.type === 'REMOVE_IMAGE').map(step => function* () {
    submissionLogger.profile(steps.REMOVE_IMAGE + step.data);
    yield exec(`docker rmi -f ${step.data}`, EXEC_OPTS_10s);
    submissionLogger.profile(steps.REMOVE_IMAGE + step.data);
  });
  submissionLogger.profile(steps.all);
}

/**
 * Main function to test the submission
 * @param data
 */
function* testSubmission(data) {
  var cleanUpSteps = [];
  var testEnv = {};

  var submissionLogger = LoggerService.createWinstonLogger(10 * MAX_SIZE);
  submissionLogger.info('submission data %j', data, {});
  submissionLogger.profile('testSubmission');
  var unitTestResult, error;
  try {
        // step 1
    var namePrefix = yield _prepareStep(data, submissionLogger);

        // step 2
    var imageName = yield _initializeContainerStep(data, cleanUpSteps, submissionLogger, namePrefix);

        // step 3
        // TODO:
    yield _startServicesStep(data, cleanUpSteps, submissionLogger, namePrefix, testEnv);

        // step 4
    var containers = yield _prepareUserContainersStep(data, cleanUpSteps, submissionLogger, namePrefix, imageName, testEnv);

    // step 5
    yield _disableInternetConnectionStep(data, cleanUpSteps, submissionLogger, containers);

        // step 6
    yield _linkContainersStep(data, cleanUpSteps, submissionLogger, containers);

        // step 7
    yield _startContainersStep(data, submissionLogger, containers);

        // step 8
    unitTestResult = yield _startUniTestsStep(data, submissionLogger, testEnv);

  } catch (err) {
    error = err;
  }
  var result, errorMessage;
  if (error) {
    if (!error.isLogged) {
      submissionLogger.logFullError(error, 'testSubmission');
    }
    if (error instanceof OperationError) {
      errorMessage = error.message;
      yield APIService.notifyProgress(data.notifyKey, {
        type: 'OPERATION_ERROR',
        msg: error.message,
        stdout: error.info && error.info.stdout,
        stderr: error.info && error.info.stderr,
        referId: data.submissionId
      });
    } else {
      errorMessage = 'Internal Error';
      yield APIService.notifyProgress(data.notifyKey, {
        type: 'ERROR',
        referId: data.submissionId
      });
    }
    result = 'ERROR';
  } else {
    result = unitTestResult.passed ? 'PASS' : 'FAIL';
  }
  try {
    yield _cleanUp(cleanUpSteps, submissionLogger);
  } catch (e) {
    submissionLogger.logFullError(e, '_cleanUp');
  }

  submissionLogger.profile('testSubmission');
  var testResult = {
    result,
    errorMessage,
    testLogUrl: yield submissionLogger.s3Upload(),
    unitTestResult: unitTestResult || {}
  };
  logger.info('submissionResult', testResult);
  yield APIService.submitTestResult(data.notifyKey, testResult);
}
