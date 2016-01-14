"use strict";

const exec = require("mz/child_process").exec;
const execCb = require('child_process').exec;
const fork = require('child_process').fork;
const _ = require("underscore");
const config = require("config");
const bash = require("bash");
const Path = require("path");

const IDLE_CMD = '/bin/bash -c "while true; do sleep 1; done"';

var currentPort = 0;

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


function* testSubmission(submissionUrl, problemId) {
    
    var submission = {
        id: 1234,
        dockerImage: "docker.restcoder.com/lang_nodejs:4.2.4",
        sourceUrl: "http://192.168.0.21:3400/001-starter-hello-nodejs.zip",
        commands: {
            web: "node app"
        }
    };
    
    var services = [
        {
            name: "mongodb",
            dockerImage: "docker.restcoder.com/service_mongodb",
            url: "mongodb://{{ip}}:27017/mydb",
            envName: "MONGODB_URL",
            link: ["web"]
        }
    ];
    
    var problem = {
        id: 1,
        testSpec: {
            testCase: "001-starter-hello",
            processes: {
                web: {
                    instances: 1
                }
            }
        }
    };
    var testEnv = {};
    var dockerName = submission.id +"_xyz";
    
    //run empty container as daemon
    //will be automatically removed on exit
    var containerName = "setup-" + dockerName;
    yield exec(`docker run -d --name ${containerName} ${submission.dockerImage} ${IDLE_CMD}`);
    var zipName = "app.zip";
    
    //download source code
    yield exec(`docker exec ${containerName} /bin/bash -c "curl -o ${zipName} ${submission.sourceUrl} && unzip ${zipName}"`);
    var installCmd = "npm install";
    //install dependencies
    var installLog = yield exec(`docker exec ${containerName} /bin/bash -c "${installCmd}"`);
    //create new image based on current container
    var imageName = "app_image-1234";
    yield exec(`docker commit ${containerName} ${imageName}`);
    //remove container, we don't need it anymore
    yield exec(`docker stop -t=0 ${containerName} && docker rm ${containerName}`);

    //start services
    yield services.map(service => function* () {
        var serviceName = `service-${dockerName}`;
        yield exec(`docker run -d --name ${serviceName} ${service.dockerImage}`);
        var ip = yield _getContainerIP(serviceName);
        service.url = service.url.replace("{{ip}}", ip);
        service.ip = ip;
    }); 
    
    //start user's containers (empty command)
    var containers = yield _.map(problem.testSpec.processes, function (conf, procName) {
        let cmd = submission.commands[procName];
        if (!cmd) {
            throw new Error(`Command ${procName} is missing in Procfile`);
        }
        
        return  _.map(_.range(0, conf.instances), n => function* () {
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
    services.forEach(service => {
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
    
    
    
    //start containers (real command)
    yield containers.map(container => new Promise((resolve, reject) => {
        var cmd = "";
        
        _.each(container.envVariables, (value, key) => {
            cmd += `export ${key}=${value}; `;
        });
        cmd += container.cmd;
        cmd = "/bin/bash -c " + bash.escape(cmd);
        console.log(cmd);
        var proc = execCb(`docker exec ${container.containerName} ${cmd}`);
        var interval = setTimeout(function () {
            reject(new Error(`Process "${container.procName}" timeout.`));
        }, 3000);
        proc.stdout.on('data', data => {
            if (data.toString().trim() === "READY") {
                clearTimeout(interval);
                resolve();
            }
        });
        //proc.stderr.on('data', data => {
        //    console.log(data.toString());
        //});
        proc.on('error', e => {
            clearTimeout(interval);
            var err = new Error(`Couldn't start the process "${container.procName}"`);
            err.orgError = e;
            reject(err);
        });
    }));
    
    //start unit tests


    var child = fork(__dirname + '/../mocha-child.js');
    var files = [
        Path.join(__dirname, "../../test-cases/", problem.testSpec.testCase, "test.js")
    ];
    child.send({ files: files, testEnv: testEnv });
    
    var testResult = yield new Promise(function (resolve, reject) {
        child.on('message', function (msg) {
            if (msg.type === "progress") {
                //TODO
            }
            if (msg.type === "end") {
                resolve(msg);
            }
        });
    });
    console.log(testResult);
    console.log('ok');
}