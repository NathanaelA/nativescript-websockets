/*****************************************************************************************
 * (c) 2015-2021, Master Technology
 * Licensed under the MIT license or contact me for a support, changes, enhancements,
 * and/or if you require a commercial licensing
 *
 * Any questions please feel free to email me or put a issue up on github
 *
 * Version 2.0.0                                                 Nathan@master.technology
 ****************************************************************************************/
"use strict";
const NativeWebSockets = require("./websockets-base");


/* global require, module, global */

// noinspection JSUnusedGlobalSymbols
/**
 * This creates an "Browser" based Event for the Browser based WebSockets
 * @param values {Object} - Object list of additional key items
 * @constructor
 */
class BrowserWebSocketsEvent {
    get bubbles() {
        return false;
    }

    get cancelBubble() {
        return false;
    }

    get cancelable() {
        return false;
    }

    get defaultPrevented() {
        return false;
    }

    get eventPhase() {
        return false;
    }

    get path() {
        return [];
    }

    get returnValue() {
        return true;
    }

    constructor(values) {
        this.timestamp = Date.now();

        for (let key in values) {
            if (values.hasOwnProperty(key)) {
                this[key] = values[key];
            }
        }
    }

    /**
     * This is the dummy preventDefault Function
     * @returns {boolean}
     */
    preventDefault() {
        return false;
    }

    /**
     * This is the dummy stopImmediatePropagation event
     * @returns {boolean}
     */
    stopImmediatePropagation() {
        return false;
    }

    /**
     * This is the dummy stopPropagation event
     * @returns {boolean}
     */
    stopPropagation() {
        return false;
    }

}


// noinspection DuplicatedCode
/**
 * This is the Browser Based WebSocket creation factory
 * @param url {string} - URL to connect to
 * @param protocols {Array|String} - Protocols supported
 * @returns {*} - WebSocket
 * @constructor
 */
class BrowserWebSockets extends NativeWebSockets {
    constructor(url, protocols) {
        const options = {browser: true}
        if (protocols != null) {
            if (!Array.isArray(protocols)) {
                options.protocols = [protocols];
            } else {
                options.protocols = protocols;
            }
        }
        super(url, options);

        this.binaryType = "arraybuffer";
        this.onclose = null;
        this.onerror = null;
        this.onmessage = null;
        this.onopen = null;

        // We have to open this WS automatically, BUT we want this to fire after the rest of the users code does so that the user can attach his events
        setTimeout( () => {
            this.open();
        }, 250);
    }

    /**
     * This function is used to send the notifications back to the user code in the Browser webSocket mode
     * @param event {String} - Event name ("message", "open", "close", "error")
     * @param data {String|Array|ArrayBuffer} - The event Data
     * @private
     */
    _notify(event, data) {
        let eventResult;
        switch (event) {
            case 'open':
                eventResult = new BrowserWebSocketsEvent({
                    currentTarget: this,
                    srcElement: this,
                    target: this,
                    type: event
                });
                if (typeof this.onopen === "function") {
                    this.onopen.call(this, eventResult);
                }
                break;

            case 'close':
                eventResult = new BrowserWebSocketsEvent({
                    currentTarget: this,
                    srcElement: this,
                    target: this,
                    type: event,
                    code: data[1],
                    reason: data[2],
                    wasClean: data[3]
                });
                if (typeof this.onclose === "function") {
                    this.onclose.call(this, eventResult);
                }
                break;

            case 'message':
                eventResult = new BrowserWebSocketsEvent({
                    currentTarget: this,
                    srcElement: this,
                    target: this,
                    type: event,
                    data: data[1],
                    ports: null,
                    source: null,
                    lastEventId: ""
                });
                if (typeof this.onmessage === "function") {
                    this.onmessage.call(this, eventResult);
                }
                break;

            case 'error':
                eventResult = new BrowserWebSocketsEvent({
                    currentTarget: this,
                    srcElement: this,
                    target: this,
                    type: event,
                    error: data[1],
                    filename: "",
                    lineno: 0
                });
                if (typeof this.onerror === "function") {
                    this.onerror.call(this, eventResult);
                }
                break;
            default:
                return;
        }

        const eventCallbacks = this._callbacks[event];
        for (let i = 0; i < eventCallbacks.length; i++) {
            // noinspection JSUnresolvedFunction
            this._callEventCallbacks(eventCallbacks[i].t || this, eventCallbacks[i].c, eventResult)
        }
    }
}

module.exports = NativeWebSockets;

// We attach to the GLOBAL object, so this is now available everywhere.
global.WebSocket = BrowserWebSockets;
