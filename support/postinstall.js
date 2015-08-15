#!/usr/bin/env node
/**********************************************************************************
 * (c) 2015, Master Technology
 * Licensed under the MIT license or contact me for a Support or Commercial License
 *
 * I do contract work in most languages, so let me solve your problems!
 *
 * Any questions please feel free to email me or put a issue up on the github repo
 * Version 0.0.1                                      Nathan@master-technology.com
 *********************************************************************************/
"use strict";

var exec = require('child_process').exec;
var fs = require('fs');
var path = require('path');

var cnt = 0, total = 2;
function completed() {
    cnt++;
    if (cnt === total) {
        process.exit(0);
    }
}

function copyFile(src, dest, forceOverWrite) {
    if (!forceOverWrite && fs.existsSync(dest)) return;
    fs.writeFileSync(dest, fs.readFileSync(src));
}

function updateModuleMap(module, src, dest) {
    if (fs.existsSync(dest)) {
        var buffer = fs.readFileSync(dest);
        // Check to see if this module already exists
        if (buffer.toString().indexOf(module) !== -1) { return; }

        var resultBuffer = Buffer.concat([buffer, new Buffer("\r\r"), fs.readFileSync(src)]);
        // Add our module to the end
        fs.writeFileSync(dest, resultBuffer);
    } else {
        copyFile(src, dest);
    }
}

var currentDirectory = path.normalize(process.cwd());
var newDir = path.normalize(currentDirectory+"/../../");
console.log(currentDirectory, newDir);


if (fs.existsSync(newDir+'platforms/android')) {
    exec(["tns", "library", "add", "android", currentDirectory+"/support/android"].join(' '),{cwd: newDir}, function () {
        console.log("Installed Android WebSocket Library");
        completed();
    });
} else {
    console.log("Skipping Android, no android platform detected.");
    completed();
}

if (fs.existsSync(newDir+'platforms/ios')) {
    if (!fs.existsSync(newDir+"platforms/ios/PocketSocket")) {
        fs.mkdirSync(newDir+"platforms/ios/PocketSocket");
    }
    copyFile("support/ios/PocketSocket/libPocketSocket.a",newDir+"platforms/ios/PocketSocket/libPocketSocket.a", true);
    copyFile("support/ios/PocketSocket/PSWebSocket.h", newDir+"platforms/ios/PocketSocket/PSWebSocket.h", true);
    updateModuleMap('libPocketSocket',"support/ios/module.modulemap", newDir+"platforms/ios/module.modulemap");
    var files = fs.readdirSync(newDir+"platforms/ios/");
    var projName = "";
    for (var i=0;i<files.length;i++) {
        var file = files[i];
        if (file.indexOf(".xcodeproj") > 0) {
            projName = file;
        }
    }
    console.log("Project name is", projName);
    if (projName) {
        exec(["open", "-a", "Xcode", projName].join(' '), {cwd: newDir+'platforms/ios/'}, function () {});
    }
    console.log("You may need to open your .xcodeproj file that exists in the /platforms/ios/ folder.");

    console.log("\n");
    console.log("You need to do the following steps inside the project:");
    console.log("  Scroll to the bottom of the Targets ", projName, " General window, until you find:\n    the 'Linked Frameworks and Libraries' section.");
    console.log("  Click the '+' button, then type 'Security' in the filter and double click on the 'Security.Framework' to add it.");
    console.log("  Click the '+' button again, then type 'CFNetwork' in the filter and double click on the 'CFNetwork.Framework' to add it.");
    console.log("  Click the '+' button again, then type 'System' in the filter and double click on the 'LibSystem.dylib' to add it.");
    console.log("  Click the '+' button again, then click the 'Other' button, then double click on the 'PocketSocket' folder,\n     and double click on the 'libPocketSocket.a' file to add it.");
    console.log("  Save your project and exit XCode.");

    completed();
} else {
    console.log("Skipping IOS, no IOS platform detected.");
    completed();
}
