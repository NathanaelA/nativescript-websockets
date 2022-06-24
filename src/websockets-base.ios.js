// noinspection JSUnresolvedVariable

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

/* global require, NSMutableURLRequest, NSURL, module, NSURLSession, NSObject, NSURLSessionWebSocketMessage,
   NSData, NSURLSessionWebSocketTask, NSURLSessionWebSocketMessageType, NSURLSessionTaskState */
// noinspection JSUnusedGlobalSymbols,JSCheckFunctionSignatures,JSUnresolvedVariable,JSUnusedLocalSymbols

// If we are using Older version if iOS, then we have to use the PocketSocket shim..
if (parseFloat(UIDevice.currentDevice.systemVersion) < 13.0) {
    module.exports = require("./websockets-pocketsocket");
    return;
}

/**
 * This is our extended class that gets the messages back from the Native IOS class
 * We use a thin shell to just facilitate communication from IOS to our JS code
 * We also use this class to try and standardize the messages
 */
const WebSocketDelegate = NSObject.extend({
    wrapper: null,
    debug: false,

    URLSessionWebSocketTaskDidOpenWithProtocol: function (session, webSocketTask, protocol) {
        if (this.debug) {
            console.log("WebSocket Event: URLSessionWebSocketTaskDidOpenWithProtocol");
        }
        const webSocketInstance = this.wrapper?.get?.();
        if (!webSocketInstance) {
            return;
        }
        webSocketInstance._notify("open", [webSocketInstance]);
    },

    URLSessionDidCompleteWithError: function(session ,error) {
        if (this.debug) {
            console.log("WebSocket Event: URLSessionDidCompleteWithError", error);
        }
    },

    URLSessionDidBecomeInvalidWithError: function(session, error) {
        if (this.debug) {
            console.log("WebSocket Event: URLSessionDidBecomeInvalidWithError", error);
        }
    },

    URLSessionWebSocketTaskDidCloseWithCodeReason: function (session, webSocketTask, closeCode, reason) {
        if (this.debug) {
            console.log("WebSocket Event: URLSessionWebSocketTaskDidCloseWithCodeReason", closeCode, reason);
        }
        const webSocketInstance = this.wrapper?.get?.();
        if (!webSocketInstance) {
            return;
        }
        webSocketInstance._notify("close", [webSocketInstance, closeCode, reason, true]);
    },

}, {
    name: "WebSocketDelegate",
    protocols: [NSURLSessionWebSocketDelegate, NSURLSessionDelegate]
});

// We have to keep a hard ref to the created socket, otherwise the class will disappear mid-use because of GC
const webSockets = [];

// noinspection JSUnusedGlobalSymbols,JSCheckFunctionSignatures,JSUnresolvedFunction
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
        this.NOT_YET_CONNECTED = -1;
        this.CONNECTING = 0;
        this.OPEN = 1;
        this.CLOSING = 2;
        this.CLOSED = 3;

        webSockets.push(this);

        this._debug = !!options.debug;
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

        if (options.protocols && !Array.isArray(options.protocols)) {
            this._protocols = [options.protocols];
        } else {
            this._protocols = options.protocols || [];
        }
        this._browser = !!options.browser;
        this._timeout = !isNaN(options.timeout) ? options.timeout : -1;
        this._url = url;

        this._allowCell = (options.allowCellular !== false);

        this._headers = options.headers || [];

        this.on("close", () => {
            if (this._browser) {
                this.unref();
            }
        });

        this._reCreate()
    }

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

        const urlRequest = NSMutableURLRequest.requestWithURL(NSURL.URLWithString(this._url));
        urlRequest.allowsCellularAccess = this._allowCell;
        if (this._protocols.length) {
            urlRequest.addValueForHTTPHeaderField(this._protocols.join(" "), "Sec-WebSocket-Protocol");
        }
        for (let name in this._headers) {
            if (!this._headers.hasOwnProperty(name)) continue;
            const value = this._headers[name];
            urlRequest.addValueForHTTPHeaderField(value, name);
        }

        if (this._timeout !== -1) {
            urlRequest.timeoutInterval = this._timeout / 1000; // Convert to seconds for NSURLRequest. This honors the API spec for timeout cross-platform.
        }

        this._webSocketDelegate = WebSocketDelegate.alloc().init();
        this._webSocketDelegate.wrapper = new WeakRef(this);
        this._webSocketDelegate.debug = this._debug;
        
        const queue = NSOperationQueue.mainQueue;
        const urlSess = NSURLSession.sessionWithConfigurationDelegateDelegateQueue(NSURLSessionConfiguration.defaultSessionConfiguration, this._webSocketDelegate, queue);
        this._nsWebSocketTask = urlSess.webSocketTaskWithRequest(urlRequest);
    }

    /**
     * Used to handle errors in sending and receiving functions
     * @param err {String} - the error given by ios
     * @private
     */
    _notifyErrors(err) {
        this._notify("close", [this, 1006, "", false]);
        this._notify("error", [this, err]);
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
            callback.apply(self, [data]);
        });
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
    addEventListener(event, callback, thisArg ) {
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
            if (this.state() >= this.CLOSING) {
                this._nsWebSocketTask.delegate = null;
                this._webSocketDelegate.wrapper = null;
                this._webSocketDelegate = null;
                this._nsWebSocketTask = null;
                this._reCreate();
            } else {
                // We already have a websocket in a valid state
                return;
            }
        }
        this._hasOpened = true;
        this._nsWebSocketTask.resume();
        this._receive();
    }

    /**
     * This closes your webSocket
     * @param code {Number} - The value to send as the close reason
     * @param message {String} - The message as to why you are closing
     */
    close(code, message) {
        if (arguments.length) {
            const nsData = NSData.alloc().initWithBase64Encoding(message || "");
            this._nsWebSocketTask.cancelWithCloseCodeReason(code, nsData);
        } else {
            this._nsWebSocketTask.cancel();
        }
    }

    /**
     * This sends a Text or Binary Message (Allows Buffering of messages if this is an advanced WebSocket)
     * @param message {string|Array|ArrayBuffer} - Message to send
     * @returns {boolean} - returns false if it is unable to send the message at this time, it will queue them up and try later...
     */
    send(message) {
        const state = this.state();

        // If we have a queue, we need to start processing it first...
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
        if (!this._queueRunner && this.state() !== this.OPEN && this._queue.length) {
            this._queueRunner = setTimeout(() => {
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
        const nsMsg = message instanceof ArrayBuffer ? NSURLSessionWebSocketMessage.alloc().initWithData(message) : NSURLSessionWebSocketMessage.alloc().initWithString(message);

        // this._nsWebSocketTask
        NSURLSessionWebSocketTask.prototype.sendMessageCompletionHandler.apply(this._nsWebSocketTask, [
            nsMsg, (err) => {
                if (err) {
                    if (this._debug) {
                        console.log("WebSocket: send message, error:", err);
                    }
                    this._notifyErrors(err);
                }
            }]
        );
    }

    _receive() {
        if (this.state() !== this.OPEN) { return; }
        // this._nsWebSocketTask.receiveMessageWithCompletionHandler(
        NSURLSessionWebSocketTask.prototype.receiveMessageWithCompletionHandler.call(this._nsWebSocketTask,
            (nsURLWebSocketMsg, err) => {
                if (this._debug) {
                    console.log("WebSocket: Got Message");
                }
                if (err) {
                    this._notifyErrors(err);
                } else {
                    if (nsURLWebSocketMsg.type === NSURLSessionWebSocketMessageType.Data) {
                        this._notify("message", [this, interop.bufferFromData(nsURLWebSocketMsg.data)]);
                    } else if (nsURLWebSocketMsg.type === NSURLSessionWebSocketMessageType.String) {
                        this._notify("message", [this, nsURLWebSocketMsg.string]);
                    }
                    this._receive();
                }
            }
        )
    }

    /**
     * Returns the state of the Connection
     * @returns {Number} - returns this.NOT_YET_CONNECTED, .CONNECTING, .OPEN, .CLOSING or .CLOSED
     */
    state() {
        if (!this._hasOpened) {
            return this.NOT_YET_CONNECTED;
        }
        return (this._getConvertedNSWebsocketState());
    }

    /**
     * Internal function wrapping ios-states to
     * states of NativeWebSockets
     */
    _getConvertedNSWebsocketState() {
        if (!this._nsWebSocketTask) {
            return this.CLOSED;
        }
        switch (this._nsWebSocketTask.state) {
            case NSURLSessionTaskState.Running:
                return this.OPEN;
            case NSURLSessionTaskState.Suspended:
                return this.OPEN;
            case NSURLSessionTaskState.Canceling:
                return this.CLOSING;
            case NSURLSessionTaskState.Completed:
                return this.CLOSED;
        }
    }

    /**
     * Is the connection open
     * @returns {boolean} - true if the connection is open
     */
    isOpen() {
        return this._getConvertedNSWebsocketState() === this.OPEN;
    }

    /**
     * Is the connection closed
     * @returns {boolean} - true if the connection is closed
     */
    isClosed() {
        return this._getConvertedNSWebsocketState() === this.CLOSED;
    }

    /**
     * Is the connection is in the process of closing
     * @returns {boolean} - true if closing
     */
    isClosing() {
        return this._getConvertedNSWebsocketState() === this.CLOSING;
    }

    /**
     * Is the connection currently connecting
     * @returns {boolean} - true if connecting
     */
    isConnecting() {
        return this.this._getConvertedNSWebsocketState() === this.CONNECTING;
    }

    /**
     * Returns the Remote address
     * @returns {String} - the address
     */
    getRemoteSocketAddress() {
        return this._nsWebSocketTask.remoteHost;
    }

    /**
     * This returns the current protocol
     */
    get protocol() {
        if (!this._nsWebSocketTask) {
            return "";
        }
        return this._protocols;
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

    static NOT_YET_CONNECTED = -1;
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    /**
     * This is a list standardized Close Codes
     */
    static CLOSE_CODE = { NORMAL: 1000, GOING_AWAY: 1001, PROTOCOL_ERROR: 1002, REFUSE: 1003, NOCODE: 1005, ABNORMAL_CLOSE: 1006, NO_UTF8: 1007, POLICY_VALIDATION: 1008, TOOBIG: 1009, EXTENSION: 1010, UNEXPECTED_CONDITION: 1011, SERVICE_RESTART: 1012, TRY_AGAIN_LATER: 1013, BAD_GATEWAY: 1014, TLS_ERROR: 1015, NEVER_CONNECTED: -1, BUGGYCLOSE: -2, FLASHPOLICY: -3 };
}

module.exports = NativeWebSockets;
