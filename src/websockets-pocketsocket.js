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

/* global require, NSMutableURLRequest, NSURL, PSWebSocket, module, NSMutableData */

//noinspection JSUnusedGlobalSymbols,JSCheckFunctionSignatures,JSUnresolvedVariable,JSUnusedLocalSymbols

/**
 * This is our extended class that gets the messages back from the Native IOS class
 * We use a thin shell to just facilitate communication from IOS to our JS code
 * We also use this class to try and standardize the messages
 */
const _WebSocket = NSObject.extend({
    wrapper: null,
    debug: false,

    webSocketDidOpen: function(webSocket) {
        if (this.debug) {
            console.log("WebSocket Event: Opened");
        }

        const wrapper = this.wrapper?.get?.();
        if (!wrapper) {
            return;
        }
        wrapper._notify("open", [wrapper]);
    },

    webSocketDidReceiveMessage: function(webSocket, message) {
        if (this.debug) {
            console.log("WebSocket Event: Received Message");
        }
        const wrapper = this.wrapper?.get?.();
        if (!wrapper) {
            return;
        }
        if (Object.prototype.toString.apply(message) === "[object NSConcreteMutableData]" || message instanceof NSMutableData) {
            let buf = new ArrayBuffer(message.length);
            // noinspection JSUnresolvedFunction
            message.getBytes(buf);
            message = buf;
        }

        wrapper._notify("message", [wrapper, message]);
    },

    webSocketDidFailWithError: function(webSocket, err) {
        if (this.debug) {
            console.log("WebSocket Event: Error", err);
        }

        const wrapper = this.wrapper?.get?.();
        if (!wrapper) {
            return;
        }
        wrapper._notify("close", [wrapper, 1006, "", false]);
        if (!err || err.code !== 3 && err.code !== 54) {
            wrapper._notify("error", [wrapper, err]);
        }
    },

    webSocketDidCloseWithCodeReasonWasClean:function(webSocket, code, reason, wasClean)  {
        if (this.debug) {
            console.log("WebSocket Event: Closed", code, reason);
        }

        const wrapper = this.wrapper?.get?.();
        if (!wrapper) {
            return;
        }
        wrapper._notify("close", [wrapper, code, reason, wasClean]);
    }
},{ protocols: [PSWebSocketDelegate] });

// We have to keep a hard ref to the created socket, otherwise the class will disappear mid-use because of GC
const webSockets = [];

// noinspection DuplicatedCode,JSUnusedGlobalSymbols
class NativeWebSockets {
    /**
     * This is the Constructor for creating a WebSocket
     * @param url {String} - url to open, "ws://" or "wss://"
     * @param options {Object} - options
     * @constructor
     */
    constructor(url, options) {
        options = options || {};

        // Instance versions of the connection state
        // noinspection JSUnresolvedVariable
        this.NOT_YET_CONNECTED = -1;
        // noinspection JSUnresolvedVariable
        this.CONNECTING = 0;
        // noinspection JSUnresolvedVariable
        this.OPEN = 1;
        // noinspection JSUnresolvedVariable
        this.CLOSING = 2;
        // noinspection JSUnresolvedVariable
        this.CLOSED = 3;

        webSockets.push(this);

        this._hasOpened = false;
        this._callbacks = {
            open: [],
            close: [],
            message: [],
            error: [],
            ping: [],
            pong: [],
            fragment: [],
            handshake: []
        }; // Ping, Pong, fragment, handshake not supported yet on iOS
        this._queue = [];
        this._queueRunner = null;
        this._debug = !!options.debug;

        if (options.protocols && !Array.isArray(options.protocols)) {
            this._protocols = [options.protocols];
        } else {
            this._protocols = options.protocols || [];
        }
        this._browser = !!options.browser;
        this._timeout = !isNaN(options.timeout) ? options.timeout : -1;
        this._url = url;

        //noinspection JSUnresolvedVariable
        this._proxy = options.proxy;

        //noinspection JSUnresolvedVariable
        this._allowCell = (options.allowCellular !== false);

        this._headers = options.headers || [];
        // Fix an issue: https://github.com/zwopple/PocketSocket/issues/73
        this._headers['Connection'] = "Upgrade";

        this.on("close", () => {
            if (this._browser) {
                this.unref();
            }
        });

        this._reCreate()
    };

    /**
     * Used to remove the Hard Reference, so this instance can be GC'd
     */
    unref() {
        let id = webSockets.indexOf(this);
        if (id >= 0) {
            webSockets.splice(id,1);
        }
    }


    /**
     * This function is used to open and re-open sockets so that you don't have to re-create a whole new websocket class
     * @private
     */
    _reCreate() {

        //noinspection JSUnresolvedFunction
        const urlRequest = NSMutableURLRequest.requestWithURL(NSURL.URLWithString(this._url));
        urlRequest.allowsCellularAccess = this._allowCell;
        if (this._protocols.length) {
            //noinspection JSUnresolvedFunction
            urlRequest.addValueForHTTPHeaderField(this._protocols.join(" "), "Sec-WebSocket-Protocol");
        }
        for (let name in this._headers) {
            if (!this._headers.hasOwnProperty(name)) continue;
            const value = this._headers[name];
            //noinspection JSUnresolvedFunction
            urlRequest.addValueForHTTPHeaderField(value, name);
        }
        if (this._timeout !== -1) {
            urlRequest.timeoutInterval = this._timeout;
        }

        //noinspection JSUnresolvedFunction
        this._socketWrapper = _WebSocket.alloc().init();
        this._socketWrapper.wrapper = new WeakRef(this);
        this._socketWrapper.debug = this._debug;

        //noinspection JSUnresolvedFunction
        this._socket = PSWebSocket.clientSocketWithRequest(urlRequest);
        if (this._protocols.length) {
            this._socket.protocol = this._protocols.join(" ");
        }

        this._socket.delegate = this._socketWrapper;
    }

    /**
     * This function is used to send the notifications back to the user code in the Advanced webSocket mode
     * @param event {String} - event name ("message", "open", "close", "error")
     * @param data {String|Array|ArrayBuffer}
     * @private
     */
    _notify(event, data) {
        const eventCallbacks = this._callbacks[event];
        for (let i = 0; i < eventCallbacks.length; i++) {
            this._callEventCallbacks(eventCallbacks[i].t, eventCallbacks[i].c, data)
        }
    }

    /**
     * Used to send values back to application on Primary Thread
     * @param self - this value
     * @param callback
     * @param data
     * @private
     */
    _callEventCallbacks(self, callback, data) {
        // https://github.com/NativeScript/NativeScript/issues/1673#issuecomment-190658780
        Promise.resolve().then(() => {
            callback.apply(self, data);
        });
    }


    /**
     * Attach an event to this webSocket
     * @param event {String} - Event Type ("message", "open", "close", "error")
     * @param callback {Function} - the function to run on the event
     * @param thisArg? {Object} - the "this" to use for calling your function, defaults to this current webSocket "this"
     */
    on(event, callback, thisArg) {
        this.addEventListener(event, callback, thisArg);
    }

    /**
     * Detaches an event from this websocket
     * If no callback is provided all events are cleared of that type.
     * @param event {String} - Event to detach from
     * @param callback? {Function} - the function you registered
     */
    off(event, callback) {
        this.removeEventListener(event, callback);
    }

    /**
     * Attach an event to this websocket
     * @param event {string} - Event Type ("message", "open", "close", "error")
     * @param callback {Function} - the function to run on the event
     * @param thisArg? {Object} - the "this" to use for calling your function, defaults to this current webSocket "this"
     */
    addEventListener(event, callback, thisArg) {
        if (!Array.isArray(this._callbacks[event])) {
            throw new Error("addEventListener passed an invalid event type " + event);
        }
        this._callbacks[event].push({c: callback, t: thisArg || this});
    }

    /**
     * Detaches an event from this webSocket
     * If no callback is provided all events are cleared of that type.
     * @param event {string} - Event to detach from
     * @param callback? {Function} - the function you registered
     */
    removeEventListener(event, callback) {
        if (!Array.isArray(this._callbacks[event])) {
            throw new Error("Invalid event type in removeEventListener " + event);
        }
        if (callback) {
            let eventCallbacks = this._callbacks[event];
            for (let i = eventCallbacks.length - 1; i >= 0; i--) {
                if (eventCallbacks[i].c === callback) {
                    eventCallbacks.splice(i, 1);
                }
            }
        } else {
            this._callbacks[event] = [];
        }
    }

    /**
     This opens or re-opens a webSocket.
     */
    open() {
        if (this._hasOpened) {
            // Browser WebSockets aren't allowed to re-open
            if (this._browser) {
                return;
            }
            // noinspection JSUnresolvedVariable
            if (this.state() >= this.CLOSING) {
                this._socket.delegate = null;
                this._socketWrapper.wrapper = null;
                this._socketWrapper = null;
                this._socket = null;
                this._reCreate();
            } else {
                return;
            }
        }
        this._hasOpened = true;
        this._socket.open();
    }

    /**
     * This closes your webSocket
     * @param code {Number} - The value to send as the close reason
     * @param message {String} - The message as to why you are closing
     */
    close(code, message) {
        if (arguments.length) {
            //noinspection JSUnresolvedFunction
            this._socket.closeWithCodeReason(code, message || "");
        } else {
            this._socket.close();
        }
    }

    /**
     * This sends a Text or Binary Message (Allows Buffering of messages if this is an advanced WebSocket)
     * @param message {string|Array|ArrayBuffer} - Message to send
     * @returns {boolean} - returns false if it is unable to send the message at this time, it will queue them up and try later...
     */
    send(message) {
        const state = this.state();

        // If we have a queue, we need to start processing it...
        // noinspection JSUnresolvedVariable
        if (this._queue.length && state === this.OPEN) {
            for (let i = 0; i < this._queue.length; i++) {
                this._send(this._queue[i]);
            }
            this._queue = [];
            if (this._queueRunner) {
                clearTimeout(this._queueRunner);
                this._queueRunner = null;
            }
        }

        // You shouldn't be sending null/undefined messages; but if you do -- we won't error out.
        if (message === null || message === undefined) {
            this._startQueueRunner();
            return false;
        }

        // If the socket isn't open, or we have a queue length; we are just going to queue this message also
        // noinspection JSUnresolvedVariable
        if (state !== this.OPEN || this._queue.length) {
            if (this._browser) {
                return false;
            }
            this._queue.push(message.slice(0));
            this._startQueueRunner();
            return false;
        }

        this._send(message);
        return true;
    }

    /**
     * Internal function to start the Queue Runner timer
     * @private
     */
    _startQueueRunner() {
        // noinspection JSUnresolvedVariable
        if (!this._queueRunner && this.state() !== this.OPEN && this._queue.length) {
            this._queueRunner = setTimeout( () => {
                this._queueRunner = null;
                this.send(null);
            }, 250);
        }
    }

    /**
     * Internal function that actually sends the message
     * @param message {String|ArrayBuffer} - Message to send
     * @private
     */
    _send(message) {
        this._socket.send(message);
    }

    /**
     * Returns the state of the Connection
     * @returns {Number} - returns this.NOT_YET_CONNECTED, .CONNECTING, .OPEN, .CLOSING or .CLOSED
     */
    state() {
        if (!this._hasOpened) {
            // noinspection JSUnresolvedVariable
            return this.NOT_YET_CONNECTED;
        }
        return (this._socket.readyState);
    }

    /**
     * Is the connection open
     * @returns {boolean} - true if the connection is open
     */
    isOpen() {
        // noinspection JSUnresolvedVariable
        return this._socket.readyState === this.OPEN;
    }

    /**
     * Is the connection closed
     * @returns {boolean} - true if the connection is closed
     */
    isClosed() {
        // noinspection JSUnresolvedVariable
        return this._socket.readyState === this.CLOSED;
    }

    /**
     * Is the connection is in the process of closing
     * @returns {boolean} - true if closing
     */
    isClosing() {
        // noinspection JSUnresolvedVariable
        return this._socket.readyState === this.CLOSING;
    }

    /**
     * Is the connection currently connecting
     * @returns {boolean} - true if connecting
     */
    isConnecting() {
        // noinspection JSUnresolvedVariable
        return this._socket.readyState === this.CONNECTING;
    }

    /**
     * Returns the Remote address
     * @returns {String} - the address
     */
    getRemoteSocketAddress() {
        //noinspection JSUnresolvedVariable
        return this._socket.remoteHost;
    }

    /**
     * This returns the current protocol
     */
    get protocol() {
        if (!this._socket) {
            return "";
        }
        return this._socket.protocol;
    }

    /**
     * This returns the current readyState
     */
    get readyState() {
        const s = this.state();
        // No such -1 in the web spec
        if (s === -1) { return 0; }
        return s;
    }

    /**
     * This returns the URL you connected too
     */
    get url() {
        return this._url;
    }

    /**
     * This returns the amount of data buffered
     */
    get bufferedAmount() {
        // Technically I should return the actual amount of data; but as an optimization we are just returning the number of entries
        // as this will allow the developer to know there is still data in the queue.
        return this._queue.length;
    }

    /**
     * This returns any extensions running.
     */
    get extensions() {
        return "";
    }

    /**
     * This returns true because it is on the IOS platform
     */
    get ios() {
        return true;
    }


    /**
     * This is a list standardized Close Codes
     */
    static CLOSE_CODE = {NORMAL: 1000, GOING_AWAY: 1001, PROTOCOL_ERROR: 1002, REFUSE: 1003, NOCODE: 1005, ABNORMAL_CLOSE:1006, NO_UTF8: 1007, POLICY_VALIDATION: 1008, TOOBIG: 1009, EXTENSION: 1010, UNEXPECTED_CONDITION: 1011, SERVICE_RESTART: 1012, TRY_AGAIN_LATER: 1013, BAD_GATEWAY: 1014, TLS_ERROR: 1015, NEVER_CONNECTED: -1, BUGGYCLOSE: -2, FLASHPOLICY: -3};

    /** Standard states */
    static NOT_YET_CONNECTED = -1;
    static CONNECTING =  0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
}



module.exports = NativeWebSockets;
