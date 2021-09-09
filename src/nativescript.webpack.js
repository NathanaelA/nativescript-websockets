/**************************************************************************************
 * (c) 2021, Master Technology
 * Licensed under the MIT license or contact me for a support, changes, enhancements,
 * and/or if you require a commercial licensing
 *
 * Any questions please feel free to put a issue up on github
 * Nathan@master.technology                                  http://nativescript.tools
 *************************************************************************************/

/* global require, module */
const fs = require('fs');
const path = require('path');

module.exports = webpack => {

    webpack.chainWebpack((config, env) => {
        let hasPocketSocket = false;

        let dirname = path.resolve(__dirname);
        if (fs.existsSync(dirname+"/platforms/ios/Podfile")) {
            hasPocketSocket = true;
            console.warn("Websockets: PocketSocket (ios < 13) support enabled!");
        } else {
            console.warn("Websockets: PocketSocket disabled!");
        }

        // Add TNS_WEBPACK to the defines...
        config.plugin('DefinePlugin').tap(args => {
            args[0]['global.TNS_WEBPACK'] = 5;
            args[0]['global._MT_HAS_POCKETSOCKET'] = hasPocketSocket;
            return args;
        });
    });
}
