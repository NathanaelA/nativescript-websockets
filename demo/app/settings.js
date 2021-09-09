/***********************************************************************************
 * (c) 2015-2021, Nathanael Anderson
 * Licensed under the MIT license
 *
 * Version 2.0.0                                           Nathan@master.technology
 **********************************************************************************/
"use strict";
 /* global require, exports */

/* Load the needed components */
const appSettings = require('@nativescript/core/application-settings');
const Observable = require("@nativescript/core/data/observable").Observable;
const Dialog = require('@nativescript/core/ui/dialogs');

/* Setup our page variables */
let page;
const settings = new Observable();
settings.set("name","Your Name");
settings.set("server","nativescript.rocks:3000");

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
    if (!checkFieldValue('server')) return;

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
    const fieldValue = settings.get(field);
    const fieldId = page.getViewById(field);
    if (!fieldValue) {
        Dialog.alert("The "+field+" can't be left blank.  Please fill in a value.");
        if (fieldId) {
            fieldId.focus();
        }
        return false;
    }
    return true;
}

