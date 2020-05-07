/***********************************************************************************
 * (c) 2015-2018, Nathanael Anderson
 * Licensed under the MIT license
 *
 * Version 0.0.2                                       Nathan@master-technology.com
 **********************************************************************************/
"use strict";
/* global require, exports, module */

// load the web socket library
var WS = require('nativescript-websockets');

/***
 * The websocket wrapper constractor
 * @constructor
 */
var WebSocketWrapper = function() {
    this._host = null;
    this._backoff = 100;
    this._timeoutId = null;
    this._clientId = null;
    this._from = "Unknown_"+Math.floor(Math.random()*100000);
    this._messageHandler = [];
    this._websocket = null;
    this._errorCount = 0;
};

/***
 * Set the host name
 * @param host
 */
WebSocketWrapper.prototype.setHost = function(host) {
    this._host = "ws://"+host;
    if (this._websocket && this._websocket.isOpen()) {
        this._websocket.close();
    }
    this._openSocket();
};

/***
 * get the host
 * @returns {string}
 */
WebSocketWrapper.prototype.getHost = function() {
    return this._host.substr(5);
};

/***
 * Set the name
 * @param name - name to set
 */
WebSocketWrapper.prototype.setName = function(name) {
    this._from = name;
};

/***
 * Get the name we set
 * @returns {string|*}
 */
WebSocketWrapper.prototype.getName = function() {
    return this._from;
};

/***
 * Send messages
 * @param msg - the message to send
 */
WebSocketWrapper.prototype.send = function(msg) {
    if (!this._websocket) { return; }
    var message = {from: this._from, message: msg};

    if (this._clientId) {
        message.clientId = this._clientId;
    }
    this._websocket.send(JSON.stringify(message));
};

/***
 * Adds the ability to add new events for tracking
 * @param eventName - not used.  Used to keep consistancy with the normal on command in nativescript
 * @param fun - the callback listener
 */
WebSocketWrapper.prototype.on = function(eventName, fun) {
    this._messageHandler.push(fun);
};

/***
 * This function opens the socket and deals with reconnecting when connection is lost
 * @private
 */
WebSocketWrapper.prototype._openSocket = function() {
    var self = this;

    // This function does back-off re-connection
    var retryConnection = function() {

        // If we already have one scheduled; then we don't need
        // to do anything more.
        if (self._timeoutId) { return; }

        // The actual function that opens up the websocket
        // that gets scheduled in the future
        self._timeoutId = setTimeout(function() {
            self._timeoutId = null;
            self._websocket.open();
        }, self._backoff);

        // Take our current back off time, and add random amount
        // up to 1 second of time
        self._backoff += Math.floor(Math.random()*1000);

        // set the max back off time to be 10,000 milliseconds.
        if (self._backoff > 10000) {
            self._backoff = 10000;
        }
    };

    // Create a new websocket
    this._websocket = new WS(this._host);

    // Create a handler for any new messages that come in.
    this._websocket.on('message', function(socket, msg) {
        self._handler(msg);
    });

    // This gets called when the websocket is successfully opened
    // We use it to reset the back-off and error counts.
    this._websocket.on('open', function() {
        self._errorCount = 0;
        self._backoff = 100;
    });

    // On any errors, we only want to print the first error.
    this._websocket.on('error', function(socket, msg) {
        console.log("**** ERROR", msg);
        self._errorCount++;
        if (self._errorCount === 1) {
            self._handleMessages({from: 2, data: msg});
        }
    });

    // If the socket is closed, and it isn't a normal close
    // then we need to run reopen the connection
    this._websocket.on('close', function(socket, code, reason) {
        if (self._websocket === socket && code !== 1000) {
            retryConnection();
        }
    });

    // Open our web socket.
    this._websocket.open();
};

/***
 * Handle any incoming messages
 * @param result - the data that came from the socket.
 * @private
 */
WebSocketWrapper.prototype._handler = function (result) {
	if (typeof result === "object") {
		this._websocket.send(result);
		return;
	}
    // If we have no result; then just exit.
    if (!result || !result.length) { return; }


    // Attempt to parse the JSON packet
    var data = {};
    if (result.length > 0) {
        try {
            data = JSON.parse(result);
        }
        catch (e) { }
    }

    // Commands from Server
    if (data && data.command) {
        switch (data.command) {
            case "setClient": this._clientId = data.clientId; break;
        }
        return;
    }

    // Any messages from me, we just ignore since we already
    // Handle it internally before sending it to the server.
    if (data.from === "ME") { return; }

    // Figure out who the message is from.
    var from = 3;
    if (data.from === "SERVER") {
        from = 2;
    } else {
        data.message = data.from +": " + data.message;
    }

    // Now that we have our message all setup, trigger the event
    this._handleMessages({from: from, data: data.message});
};

/***
 * Pass all messages to any event listeners
 * @param msg - Message to pass to event listeners
 * @private
 */
WebSocketWrapper.prototype._handleMessages = function(msg) {
    for (var i=0;i<this._messageHandler.length;i++) {
        this._messageHandler[i](msg);
    }
};

module.exports = WebSocketWrapper;
