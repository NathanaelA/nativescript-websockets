/*****************************************************************************************
* (c) 2015-2017, Master Technology
* Licensed under the MIT license or contact me for a support, changes, enhancements,
* and/or if you require a commercial licensing
*
* Any questions please feel free to email me or put a issue up on github
*
* Version 1.5.2                                             Nathan@master-technology.com
****************************************************************************************/
"use strict";

/* global require, NSMutableURLRequest, NSURL, PSWebSocket, module */


var platformModule = require("tns-core-modules/platform");

if (parseFloat(platformModule.device.osVersion) < 13.0) {
    module.exports= require("./websockets.ios-ps.js");
} else {
    module.exports= require("./websockets.ios-nativesock.js");
}
