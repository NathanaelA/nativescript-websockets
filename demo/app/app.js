/***********************************************************************************
 * (c) 2015-2018, Nathanael Anderson
 * Licensed under the MIT license
 *
 * Version 0.0.1                                       Nathan@master-technology.com
 **********************************************************************************/
"use strict";
/* global require, exports */

require("./bundle-config");
var application = require("application");
//application.mainModule = "main-page";
//application.cssFile = "app.css";

if (application.ios) {
	var fontModule = require("ui/styling/font");
	fontModule.ios.registerFont("MaterialIcons-Regular.ttf");
}

application.start({ moduleName: "main-page" });

/*
Do not place any code after the application has been started as it will not
be executed on iOS.
*/
