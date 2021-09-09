/***********************************************************************************
 * (c) 2015-2021, Nathanael Anderson
 * Licensed under the MIT license
 *
 * Version 2.0.0                                           Nathan@master.technology
 **********************************************************************************/
"use strict";

// Please note this file isn't used by this demo,
// but was described in my NativeScript book, so it is included so
// those with the book will now have the updated class...
// https://www.amazon.com/Getting-Started-NativeScript-Nathanael-Anderson-ebook/dp/B016YFQ82I

class AJAXSocket {
  constructor() {
    this._host = null;
    this._counter = 0;
    this._clientId = Math.floor(Math.random() * 100000);
    this._from = "Unknown_" + this._clientId;
    this._messageHandler = [];

    setInterval(() => {
      this._handleListener();
    }, 250);

  }


  set host(host) {
    this._host = "http://" + host + "/direct/";
  }

  get host() {
    return this._host.replace('http://', '').replace('/direct/', '');
  }

  set name(name) {
    this._from = name;
  };

  get name() {
    return this._from;
  };

  send(msg) {
    if (!this._host) {
      return;
    }
    let url = this._host + "send/";
    if (this._clientId) {
      url += "?clientId=" + this._clientId;
    }
    console.log("Creating Request");
    const request = new XMLHttpRequest();
    request.onload = () => {
      console.log("!-------- Finished Request", request.status);
      try {
        this._handler("send", request.responseText);
      } catch (e) {
        console.log("!------ Error", e);
      }
    };

    request.onerror = () => {
      console.log("!-------- Error", request.status);
    };

    msg.from = this._from;
    request.open("POST", url, true);
    request.send(encodeURI(JSON.stringify({from: this._from, message: msg})));
    console.log("Sending Request", url, msg);
  }

  _handleListener() {
    if (!this._host) {
      return;
    }

    this._counter++;
    if (this._counter > 2) {
      return;
    }

    let url = this._host + "get/";
    if (this._clientId) {
      url += "?clientId=" + this._clientId;
    }

    const request = new XMLHttpRequest();
    request.onload = () => {
      this._counter--;
      this._handler("get", request.responseText);
    }

    request.onerror = () => {
      this._counter--;
      this._handler("error", request.status);
    }


    request.open("GET", url, true);
    request.send();
  };

  _handler(event, result) {
    if (!result) {
      return;
    }
    let data = {};
    if (result.length > 0) {
      try {
        data = JSON.parse(result);
      } catch (e) {
      }
    }

    if (event === "get" || event === "send") {
      if (data && data.clientId && this._clientId !== data.clientId) {
        console.log("Setting our Client Id:", data.clientId);
        this._clientId = data.clientId;
      }
      for (let i = 0; i < data.messages.length; i++) {
        let from = 3;
        if (data.messages[i].from === "ME") {
          continue;
        }
        if (data.messages[i].from === "SERVER") {
          from = 2;
        } else {
          data.messages[i].message = data.messages[i].from + ": " + data.messages[i].message;
        }

        this._handleMessages({from: from, data: data.messages[i].message});
      }
    } else if (event === "abort" || event === "error") {
      this._handleMessages({from: 2, data: event});
    }
  };

  _handleMessages(msg) {
    for (let i = 0; i < this._messageHandler.length; i++) {
      this._messageHandler[i](msg);
    }
  };

  on(eventName, fun) {
    this._messageHandler.push(fun);
  };
}



module.exports = AJAXSocket;
