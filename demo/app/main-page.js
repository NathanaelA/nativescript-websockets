/***********************************************************************************
 * (c) 2015-2018, Nathanael Anderson
 * Licensed under the MIT license
 *
 * Version 0.0.2                                       Nathan@master-technology.com
 **********************************************************************************/
"use strict";
/* global require, exports */

// Load the needed Components
var appSettings = require('application-settings');
var ObservableArray = require("data/observable-array").ObservableArray;
var vibrate = require('nativescript-vibrate');
var Socket = require("./WebSocketWrapper.js");

// Our cool message icons
var messageIcons = ["",String.fromCharCode(0xE0C9),String.fromCharCode(0xE85A),String.fromCharCode(0xE0B9)];

// Track our messages
var messages = new ObservableArray();
messages.on('change', trackMessages);

// Global variables for simplicity
var entry, scrollView, server, page, trackerCounter = null;

// Sample Messages
messages.push({from: 0, message: "Welcome to Cross Communicator", iconRight: '', iconLeft: ''});
/* More sample messages */
/*
messages.push({from: 2, message: "Testing System Message", iconRight: messageIcons[2]});
messages.push({from: 3, message: "This is a simple message from another user...", iconLeft: messageIcons[3]});
messages.push({from: 1, message: "And this is me responding to it...", iconRight: messageIcons[1]});
*/

// Create our communications socket
var socket = new Socket();

/***
 * Attach to the message listener
 */
socket.on('message', function(evt) {
	newMessage({from: evt.from, message: evt.data});
});

/***
 * Send a message to the server
 * @param msg - message
 */
function sendMessage(msg) {
	socket.send(msg);
}

/***
 * Used to show the dialog
 * @param force - true to force the dialog open even if the settings are present
 */
function showDialog(force) {

	if (!appSettings.getBoolean('setup', false) || force === true) {
		page.showModal('settings', '', function() {
			socket.setHost(appSettings.getString('server'));
			socket.setName(appSettings.getString('name'));
		}, false);
	} else {
		socket.setHost(appSettings.getString('server'));
		socket.setName(appSettings.getString('name'));
	}

}

/***
 * Track any messages changes
 * @param evt - the event that occured
 */
function trackMessages(evt) {
	if (evt && evt.action && evt.action !== "add") { return; }
	while (messages.length > 40) {
		messages.shift();
	}
	if (trackerCounter || !scrollView) { return; }
	trackerCounter = setTimeout(resetMessageDisplay,1);
}

/***
 * Resets the message display to the bottom.
 */
function resetMessageDisplay() {
	trackerCounter = null;
	var offset = scrollView.scrollableHeight;
	scrollView.scrollToVerticalOffset(offset, false);
}

/***
 * Used to figure out which icon to build the entry for display
 * @param msg - incoming message
 */
function newMessage(msg) {
	if (msg.from < 3) {
		msg.iconRight = messageIcons[msg.from];
		msg.iconLeft = '';
	} else {
		msg.iconLeft = messageIcons[msg.from];
		msg.iconRight = '';
	}
	messages.push(msg);

	// Vibrate on new messages
	if (msg.from !== 1) {
		//   vibrate.vibration(100);
	}
}

/***
 * The button you press to send a new message
 */
exports.goTap = function() {
	if (entry.text.length > 0) {
		var data = {from: 1, message: entry.text};
		entry.text = "";
		newMessage(data);
		sendMessage(data.message);
	}
};

/***
 * The button you press to open the settings screen
 */
exports.settingsTap = function() {
	showDialog(true);
};

/***
 * The Page Loaded event
 * @param args
 */
exports.pageLoaded = function(args) {
	page = args.object;
	entry = page.getViewById("entry");
	scrollView = page.getViewById("scroller");
	page.bindingContext = {messages: messages};
};

/***
 * The navigated to event
 * @param args
 */
exports.navigatedTo = function(args) {
	if (!page) {page =  args.object; }
	showDialog();
	trackerCounter = setTimeout(resetMessageDisplay,10);
};
