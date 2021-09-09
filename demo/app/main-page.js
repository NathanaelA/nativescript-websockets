/***********************************************************************************
 * (c) 2015-2021, Nathanael Anderson
 * Licensed under the MIT license
 *
 * Version 2.0.0                                           Nathan@master.technology
 **********************************************************************************/
"use strict";
/* global require, exports */

// Load the needed Components
const appSettings = require('@nativescript/core/application-settings');
const ObservableArray = require("@nativescript/core/data/observable-array").ObservableArray;

const Socket = require("./WebSocketWrapper");

// Our cool message icons
let messageIcons = ["",String.fromCharCode(0xE0C9),String.fromCharCode(0xE85A),String.fromCharCode(0xE0B9)];

// Track our messages
const messages = new ObservableArray();
messages.on('change', trackMessages);

// Global variables for simplicity
let entry, scrollView, page, trackerCounter = null;

// Sample Messages
messages.push({from: 0, message: "Welcome to Cross Communicator", iconRight: '', iconLeft: ''});
/* More sample messages */
/*
messages.push({from: 2, message: "Testing System Message", iconRight: messageIcons[2]});
messages.push({from: 3, message: "This is a simple message from another user...", iconLeft: messageIcons[3]});
messages.push({from: 1, message: "And this is me responding to it...", iconRight: messageIcons[1]});
*/

// Create our communications socket
const socket = new Socket();

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
			socket.host = appSettings.getString('server');
			socket.name = appSettings.getString('name');
		}, false);
	} else {
		socket.host = appSettings.getString('server');
		socket.name = appSettings.getString('name');
	}
}

/***
 * Track any messages changes
 * @param evt - the event that occurred
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
	const offset = scrollView.scrollableHeight;
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
}

/***
 * The button you press to send a new message
 */
exports.goTap = function() {
	if (entry.text.length > 0) {
		const data = {from: 1, message: entry.text};
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
