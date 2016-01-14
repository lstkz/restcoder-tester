"use strict";

const exec = require("mz/child_process").exec;
const execCb = require('child_process').exec;
const _ = require("underscore");
const config = require("config");

const IDLE_CMD = '/bin/bash -c "while true; do sleep 1; done"';

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

    //setup services
    //var serviceMapping = {};
    yield services.map(service => function* () {
        var serviceName = `service-${dockerName}`;
        yield exec(`docker run -d --name ${serviceName} ${service.dockerImage}`);
        var ip = yield _getContainerIP(serviceName);
        var url = service.url.replace("{{ip}}", ip);
        service.env = `${service.envName}=${url}`;
        service.ip = ip;
    }); 
    
    //start all process from user's submissions
    var containers = yield _.map(problem.testSpec.processes, function (conf, procName) {
        let cmd = submission.commands[procName];
        if (!cmd) {
            throw new Error(`Command ${procName} is missing in Procfile`);
        }
        return  _.map(_.range(0, conf.instances), n => new Promise(function (resolve, reject) {
            var name = `app-${dockerName}-${procName}-${n}`;
            exec(`docker run -d --name ${name} ${imageName} ${IDLE_CMD}`).then(function () {
                var proc = execCb(`docker exec ${name} ${cmd}`);
                var interval = setTimeout(function () {
                    reject(new Error(`Process "${procName}" timeout.`));
                }, 3000);
                proc.stdout.on('data', data => {
                    if (data.toString().trim() === "READY") {
                        clearTimeout(interval);
                        resolve({
                            instanceNr: n,
                            procName: procName,
                            containerName: name
                        });
                    }
                });
                proc.on('error', e => {
                    clearTimeout(interval);
                    var err = new Error(`Couldn't start the process "${procName}"`);
                    err.orgError = e;
                    reject(err);
                });
            });
        }));
    });
    containers = _.flatten(containers);
    //
    yield _.map(containers, container => function* () {
        container.ip =  yield _getContainerIP(container.containerName);
    });
    
    
    console.log('ok');
}