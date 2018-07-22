/***********************************************************************************
 * (c) 2015, Nathanael Anderson
 * Licensed under the MIT license
 *
 * Version 0.0.1                                       Nathan@master-technology.com
 **********************************************************************************/
"use strict";
 /* global require, exports */

/* Load the needed components */
var appSettings = require('application-settings');
var Observable = require("data/observable").Observable;
var Dialog = require('ui/dialogs');

/* Setup our page variables */
var page;
var settings = new Observable();
settings.set("name","");
settings.set("server","");

/***
 * Setup our Page information and bindings
 */
exports.loaded = function(args) {
    page = args.object;
    page.bindingContext = settings;
};

/***
 * Load our settings when this page is shown
 */
exports.shownModally= function() {
   if (appSettings.getBoolean("setup")) {
        settings.set("name", appSettings.getString("name"));
        settings.set("server", appSettings.getString("server"));
   }
};

/***
 * Save our settings
 */
exports.save = function() {
    if (!checkFieldValue('name')) return;
    if (!checkFieldValue('server'))return;

    appSettings.setBoolean("setup", true);
    appSettings.setString("name", settings.get('name'));
    appSettings.setString("server", settings.get('server'));
    page.closeModal();
};

/***
 *  Cancel out of our dialog
 */
exports.cancel = function() {
    page.closeModal();
};

/***
 * A simple error checking routine used for each field
 */
function checkFieldValue(field) {
    var fieldValue = settings.get(field);
    var fieldId = page.getViewById(field);
    if (!fieldValue) {
        Dialog.alert("The "+field+" can't be left blank.  Please fill in a value.");
        if (fieldId) {
            fieldId.focus();
        }
        return false;
    }
    return true;
}

