/***********************************************************************************
 * (c) 2015, Nathanael Anderson
 * Licensed under the MIT license
 *
 * Version 0.0.1                                       Nathan@master-technology.com
 **********************************************************************************/
"use strict";

var AJAXSocket = function() {
    this._host = null;
    this._counter = 0;
    this._clientId = Math.floor(Math.random()*100000);
    this._from = "Unknown_"+this._clientId;
    this._messageHandler = [];

    var self = this;
    setInterval(function () {
        self._handleListener();
    }, 250);

};

AJAXSocket.prototype.setHost = function(host) {
   this._host = "http://"+host + "/direct/";
};

AJAXSocket.prototype.getHost = function() {
    return this._host.replace('http://','').replace('/direct/','');
};

AJAXSocket.prototype.setName = function(name) {
    this._from = name;
};

AJAXSocket.prototype.getName = function() {
    return this._from;
};

AJAXSocket.prototype.send = function(msg) {
    if (!this._host) { return; }
    var url = this._host + "send/";
    if (this._clientId) {
        url += "?clientId="+this._clientId;
    }
    var self = this;
    console.log("Creating Request");
    var request = new XMLHttpRequest();
    request.onload = function() {
        console.log("!-------- Finished Request", request.status);
        try {
            self._handler("send", request.responseText);
        } catch (e) {
            console.log("!------ Error", e);
        }
    };
    request.onerror = function() {
        console.log("!-------- Error", request.status);
    };
    msg.from = this._from;
    request.open("POST", url, true);
    request.send(encodeURI(JSON.stringify({from: this._from, message: msg})));
    console.log("Sending Request",url, msg);
};

AJAXSocket.prototype._handleListener = function() {
    if (!this._host) { return; }

    var self = this;
    this._counter++;
    if (this._counter > 2) { return; }

    var url = this._host + "get/";
    if (this._clientId) {
        url += "?clientId="+this._clientId;
    }

    var request = new XMLHttpRequest();
    request.onload = function() {
        self._counter--;
        self._handler("get", request.responseText);
    };
    request.onerror = function() {
        self._counter--;
        self._handler("error", request.status);
    };

    request.open("GET", url, true);
    request.send();
};

AJAXSocket.prototype._handler = function (event, result) {
    if (!result) { return; }
    var data = {};
    if (result.length > 0) {
        try {
            data = JSON.parse(result);
        }
        catch (e) { }
    }
    
    if (event === "get" || event === "send") {
        if (data && data.clientId && this._clientId !== data.clientId) {
            console.log("Setting our Client Id:", data.clientId);
            this._clientId = data.clientId;
        }
        for (var i=0;i<data.messages.length;i++) {
            var from = 3;
            if (data.messages[i].from === "ME") { continue; }
            if (data.messages[i].from === "SERVER") {
                from = 2;
            } else {
                data.messages[i].message = data.messages[i].from +": " + data.messages[i].message;
            }

            this._handleMessages({from: from, data: data.messages[i].message});
        }
    } else if (event === "abort" || event === "error") {
        this._handleMessages({from: 2, data: event});
    }
};

AJAXSocket.prototype._handleMessages = function(msg) {
    for (var i=0;i<this._messageHandler.length;i++) {
        this._messageHandler[i](msg);
    }
};

AJAXSocket.prototype.on = function(eventName, fun) {
    this._messageHandler.push(fun);
};
AJAXSocket.prototype.readyState = 1;


module.exports = AJAXSocket;