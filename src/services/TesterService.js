"use strict";

const exec = require("mz/child_process").exec;
const execCb = require('child_process').exec;
const fork = require('child_process').fork;
const _ = require("underscore");
const ms = require("ms");
const co = require("co");
const config = require("config");
const bash = require("bash");
const Path = require("path");
const helper = require("../common/helper");
const OperationError = require("../common/errors").OperationError;
const validate = require("../common/validator").validate;
const APIService = require("./APIService");
const LoggerService = require("./LoggerService");

const IDLE_CMD = '/bin/bash -c "while true; do sleep 1; done"';
const MAX_SIZE = 1024 * 1024;

const EXEC_OPTS_10s = {timeout: ms("10s")};
const EXEC_OPTS_1m = {timeout: ms("1m")};
const EXEC_OPTS_3m = {timeout: ms("3m")};

var currentPort = _.random(0, 1000);

module.exports = {
    testSubmission
};


function* _getContainerIP(containerId) {
    var result = yield exec(`docker inspect --format='{{.NetworkSettings.IPAddress}}' ${containerId}`);
    return result[0].trim();
}

function* _runDockerDaemon(cmd) {
    var result = yield exec(cmd);
    return result[0].trim();//containerId
}

function _getFreePort() {
    currentPort = (currentPort + 1) % 1000;
    return currentPort + 50000;
}

/**
 * Step 1. Validate input and generate name
 * @param data
 * @param submissionLogger
 * @private
 */
function* _prepareStep(data, submissionLogger) {
    validate(data,
        {
            "submissionId": "ObjectId",
            "notifyKey": "ShortString",
            "dockerImage": "ShortString",
            "sourceUrl": "ShortString",
            "commands": "AnyObject",
            "testCase": "ShortString",
            "processes": "AnyObject",
            "services": {
                type: ["AnyObject"],
                empty: true
            }
        });
    submissionLogger.info("Validation pass");

    yield APIService.notifyProgress(data.notifyKey, {type: "PREPARING"});

    return `${data.submissionId}_${helper.randomString(5)}`.toLowerCase();
}

/**
 * Step 2. Create a container that contains installed dependencies
 * @param data
 * @param cleanUpSteps
 * @param submissionLogger
 * @param dockerName
 * @returns {String} the docker image name
 * @private
 */
function* _initializeContainerStep(data, cleanUpSteps, submissionLogger, dockerName) {
    var steps = {
        ALL: "initializeContainer",
        CREATE_BASE_DOCKER_IMAGE: "initializeContainer | create base docker image",
        DOWNLOAD_SOURCE_CODE: "initializeContainer | download source code",
        INSTALL: "initializeContainer | install dependencies",
        COMMIT: "initializeContainer | commit container",
        REMOVE: "initializeContainer | remove container"
    };

    submissionLogger.profile(steps.ALL);

    //Step 1 - Create docker image
    //run empty container as daemon
    //will be automatically removed on exit
    var containerName = "setup-" + dockerName;
    submissionLogger.profile(steps.CREATE_BASE_DOCKER_IMAGE);
    yield exec(`docker run -d --name ${containerName} ${data.dockerImage} ${IDLE_CMD}`, EXEC_OPTS_10s);
    submissionLogger.profile(steps.CREATE_BASE_DOCKER_IMAGE);
    cleanUpSteps.push({
        type: "REMOVE_CONTAINER",
        data: containerName
    });

    //Step 2 - Download source code
    var zipName = "app.zip";
    submissionLogger.profile(steps.DOWNLOAD_SOURCE_CODE);
    yield exec(`docker exec ${containerName} /bin/bash -c "curl -o ${zipName} ${data.sourceUrl} && unzip ${zipName}"`, EXEC_OPTS_1m);
    submissionLogger.profile(steps.DOWNLOAD_SOURCE_CODE);

    //Step 3 - Install dependencies
    var installCmd = "npm install";
    yield APIService.notifyProgress(data.notifyKey, {type: "INSTALL"});
    submissionLogger.profile(steps.INSTALL);
    var installResult = yield _execCommand(`docker exec ${containerName} /bin/bash -c "${installCmd}"`, "Install Dependencies",  ms("3m"));
    submissionLogger.profile(steps.INSTALL);
    submissionLogger.info("initializeContainer | install dependencies result %j", installResult, {});

    //Step 4 - Commit container (create new image with installed dependencies)
    yield APIService.notifyProgress(data.notifyKey, {type: "INSTALL_OK"});
    yield APIService.notifyProgress(data.notifyKey, {type: "INSTALL_LOG", msg: "installLog"});
    var imageName = `app_${dockerName}`;
    submissionLogger.profile(steps.CREATE_BASE_DOCKER_IMAGE);
    yield exec(`docker commit ${containerName} ${imageName}`, EXEC_OPTS_1m);
    submissionLogger.profile(steps.CREATE_BASE_DOCKER_IMAGE);

    //Step 5 - Remove original container container, we don't need it anymore
    submissionLogger.profile(steps.REMOVE);
    yield exec(`docker rm -f ${containerName}`, EXEC_OPTS_10s);
    submissionLogger.profile(steps.REMOVE);

    //remove, because the container it's already removed
    cleanUpSteps.pop();

    submissionLogger.profile(steps.ALL);

    return imageName;
}

function* testSubmission(data) {
    var cleanUp = [];
    var testEnv = {};

    var submissionLogger = LoggerService.createWinstonLogger(10 * MAX_SIZE);
    submissionLogger.profile("testSubmission");
    
    //step 1
    var dockerName = yield _prepareStep(data, submissionLogger);

    //step 2
    var imageName = yield _initializeContainerStep(data, cleanUp, submissionLogger, dockerName);

    ////run empty container as daemon
    ////will be automatically removed on exit
    //var containerName = "setup-" + dockerName;
    //yield exec(`docker run -d --name ${containerName} ${data.dockerImage} ${IDLE_CMD}`);
    //cleanUp.push({
    //    type: "container",
    //    data: containerName
    //});
    //logSteps.push({
    //    name: "Initialize container"
    //});
    //var zipName = "app.zip";
    //
    ////download source code
    //yield exec(`docker exec ${containerName} /bin/bash -c "curl -o ${zipName} ${data.sourceUrl} && unzip ${zipName}"`);
    //var installCmd = "npm install";
    ////install dependencies
    //yield APIService.notifyProgress(data.notifyKey, {type: "INSTALL"});
    //
    //var installResult = yield _execCommand(`docker exec ${containerName} /bin/bash -c "${installCmd}"`, "Install Dependencies", ms('3m'));
    //logSteps.push(installResult);
    //
    //yield APIService.notifyProgress(data.notifyKey, {type: "INSTALL_OK"});
    //yield APIService.notifyProgress(data.notifyKey, {type: "INSTALL_LOG", msg: "installLog"});
    ////create new image based on current container
    //var imageName = `app_${dockerName}`;
    //yield exec(`docker commit ${containerName} ${imageName}`);
    ////remove container, we don't need it anymore
    //yield exec(`docker stop -t=0 ${containerName} && docker rm ${containerName}`);

    //start services
    yield data.services.map(service => function* () {
        var serviceName = `service-${dockerName}`;
        yield exec(`docker run -d --name ${serviceName} ${service.dockerImage}`);
        var ip = yield _getContainerIP(serviceName);
        service.url = service.url.replace("{{ip}}", ip);
        service.ip = ip;
    });

    //start user's containers (empty command)
    var containers = yield _.map(data.processes, function (conf, procName) {
        let cmd = data.commands[procName];
        if (!cmd) {
            throw new Error(`Command ${procName} is missing in Procfile`);
        }

        return _.map(_.range(0, conf.instances), n => function* () {
            var name = `app-${dockerName}-${procName}-${n}`;
            var hostPort = _getFreePort();
            var containerPort = config.APP_DEFAULTS.HTTP_PORT;
            var ports = `-p ${hostPort}:${containerPort}`;
            yield exec(`docker run -d ${ports} --name ${name} ${imageName} ${IDLE_CMD}`);
            var ip = yield _getContainerIP(name);
            var envVariables = {};
            if (procName === "web") {
                envVariables.PORT = containerPort;
                testEnv["API_URL_" + n] = `http://${config.HOST_IP}:${hostPort}`;
            }
            return {
                instanceNr: n,
                procName,
                containerName: name,
                cmd,
                ip,
                envVariables
            };
        });
    });
    containers = _.flatten(containers);

    //disable internet connection
    containers.forEach(container => {
        var cmd = ` iptables -I FORWARD -s ${container.ip} -j REJECT`;
        console.log(cmd); //TODO
    });

    //link container and services
    var containerIndex = _.groupBy(containers, "procName");
    data.services.forEach(service => {
        service.link.forEach(procName => {
            var containers = containerIndex[procName];
            if (!containers) {
                return;
            }
            containers.forEach(container => {
                var cmd = ` iptables -I FORWARD -s ${container.ip} -d ${service.ip} -j ACCEPT`;
                console.log(cmd); //TODO
                container.envVariables[service.envName] = service.url;
            });
        });
    });


    yield APIService.notifyProgress(data.notifyKey, {type: "READY"});


    //start containers (real command)
    yield containers.map(container => _startContainer(container, data.notifyKey));

    yield APIService.notifyProgress(data.notifyKey, {type: "READY_OK"});

    //start unit tests
    yield APIService.notifyProgress(data.notifyKey, {type: "BEFORE_START"});

    var child = fork(__dirname + '/../mocha-child.js');
    var files = [
        Path.join(__dirname, "../../test-cases/", data.testCase, "test.js")
    ];
    child.send({files: files, testEnv: testEnv});

    var testResult = yield new Promise(function (resolve, reject) {
        child.on('message', function (msg) {
            co(function* () {
                switch (msg.type) {
                    case "START":
                    case "TEST_RESULT":
                        yield APIService.notifyProgress(data.notifyKey, msg);
                        break;
                    case "END":
                        yield APIService.notifyProgress(data.notifyKey, {type: "END", passed: msg.result.passed});
                        resolve(msg);
                }
            }).catch(reject);
        });
    });
    console.log(testResult);
    console.log(yield submissionLogger.s3Upload());
    console.log('ok');
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
                complete(new OperationError("Non zero exit code: " + code));
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
                var ret = {command, name};
                if (logs[0]) {
                    ret.stdout = logs[0];
                }
                if (logs[0]) {
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

function _startContainer(container, notifyKey) {
    return new Promise((resolve, reject) => {
        var stdoutLogger = LoggerService.createLogger(MAX_SIZE);
        var stderrLog = LoggerService.createLogger(MAX_SIZE);
        var cmd = "";

        _.each(container.envVariables, (value, key) => {
            cmd += `export ${key}=${value}; `;
        });
        cmd += container.cmd;
        cmd = "/bin/bash -c " + bash.escape(cmd);
        console.log(cmd);
        var proc = execCb(`docker exec ${container.containerName} ${cmd}`);
        var interval = setTimeout(function () {
            co(APIService.notifyProgress(notifyKey, {type: "READY_TIMEOUT"}));
            co(function* () {
                return yield [stdoutLogger.s3Upload(), stderrLog.s3Upload()];
            }).then(logs => {
                console.log(logs);
                reject(new Error(`Process "${container.procName}" timeout.`));
            }).catch(reject);
        }, 3000);
        proc.stdout.on('data', data => {
            stdoutLogger.log(data);
            if (data.toString().trim() === "READY") {
                clearTimeout(interval);
                resolve();
            }
        });
        proc.stderr.on('data', data => {
            stderrLog.log(data);
        });
        proc.on('error', e => {
            clearTimeout(interval);
            var err = new Error(`Couldn't start the process "${container.procName}"`);
            err.orgError = e;
            reject(err);
        });
    });
}