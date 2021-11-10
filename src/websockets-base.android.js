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


/* jshint node: true, browser: true, unused: false, undef: false, camelcase: false, bitwise: false */
/* global global, android, java, org, require, module */

// IPV6 doesn't work properly on emulators; so we disable it
if (checkForEmulator()) {
    //noinspection JSUnresolvedVariable
    java.lang.System.setProperty("java.net.preferIPv6Addresses", "false");
    //noinspection JSUnresolvedVariable
    java.lang.System.setProperty("java.net.preferIPv4Stack", "true");
}


//noinspection JSUnresolvedVariable,JSUnusedGlobalSymbols
/**
 * This is our extended class that gets the messages back from the Native ANDROID class
 * We use a thin shell to just facilitate communication from ANDROID to our JS code
 * We also use this class to try and standardize the messages
 */
const _WebSocket = org.java_websocket.client.WebSocketClient.extend( {
    fragmentInfo: {type: 0, data: [], sizes: 0},
    wrapper: null,
    debug: false,

    onOpen: function () {
        if (this.debug) {
            console.log("WebSocket Event: OnOpen");
        }
        const wrapper = this.wrapper && this.wrapper.get && this.wrapper.get()
        if (wrapper) {
            wrapper._notify("open", [wrapper]);
        }
    },

    onClose: function (code, reason) {
        if (this.debug) {
            console.log("WebSocket Event: OnClose", code, reason);
        }
        const wrapper = this.wrapper && this.wrapper.get && this.wrapper.get()
        if (wrapper) {
            // org.java_websocket.WebSocketImpl.closeConnection() currently executes this callback prior to updating readystate to CLOSED
            // and as such there are cases when the readystate is still showing as OPEN when this called. In short, the websocket connection
            // still appears to be up when it is not which is makes things like coding auto reconnection logic problematic. This seems like
            // an issue/bug in org.java_websocket.WebSocketImpl.closeConnection(). Regardless, as a workaround we pass control back to
            // closeConnection() prior to passing the notification along so that the readystate gets updated to CLOSED.
            // TODO: remove this when the readystate issue gets resolved.
            setTimeout(() => {
                if (wrapper) {
                    wrapper._notify('close', [wrapper, code, reason])
                }
                this.wrapper = null;  // Clean up memory
            }, 1);
        } else {
            this.wrapper = null;
        }
    },

    onMessage: function (message) {
        if (this.debug) {
            console.log("WebSocket Event: OnMessage", message);
        }
        // Check for Native Java Objects
        if (typeof message === "object" && typeof message.getClass === 'function') {
            this.onMessageBinary(message);
            return;
        }

        const wrapper = this.wrapper && this.wrapper.get && this.wrapper.get()
        // Should be a JavaScript String or ArrayBuffer
        if (wrapper) {
            wrapper._notify("message", [wrapper, message]);
        }
    },

    onMessageBinary: function(binaryMessage) {
        if (this.debug) {
            console.log("WebSocket Event: OnMessageBinary");
        }

        const wrapper = this.wrapper && this.wrapper.get && this.wrapper.get()
        if (wrapper && binaryMessage) {

            // Is a Native JAVA Buffer type
            if (typeof binaryMessage.rewind === 'function') {

                // Make sure binaryMessage is at beginning of buffer
                // noinspection JSUnresolvedFunction
                binaryMessage.rewind();

                // Convert Binary Message into ArrayBuffer/Uint8Array
                // noinspection JSUnresolvedFunction
                const count = binaryMessage.limit();
                const view = new Uint8Array(count);
                for (let i = 0; i < count; i++) {
                    view[i] = binaryMessage.get(i);
                }
                binaryMessage = null;
                wrapper._notify("message", [wrapper, view.buffer]);
            } else {
                // If this is already an a ArrayBuffer
                //console.log("TO:", Object.prototype.toString.call(binaryMessage));
                wrapper._notify("message", [wrapper, binaryMessage]);
            }
        }
    },

    onPong: function(){
        if (this.debug) {
            console.log("WebSocket Event: onPong");
        }
    },

    onError: function (err) {
        if (this.debug) {
            console.log("WebSocket Event: onError", err);
        }

        const wrapper = this.wrapper && this.wrapper.get && this.wrapper.get()
        if (wrapper) {
            wrapper._notify("error", [wrapper, err]);
        }
    },

    onFragment: function (fragment) {
        const optCode = fragment.optcode.toString();
        if (this.debug) {
            console.log("WebSocket Event: onFragment", optCode);
        }

        const wrapper = this.wrapper && this.wrapper.get && this.wrapper.get()
        if (!wrapper) {
            return;
        }
        
        if (optCode !== "CONTINUOUS") {
            if (this.fragmentInfo.type !== 0) {
                console.log("Missing Fragment info, skipped fragment");
            }
            // Reset our buffer size when we have a new fragment chain
            this.fragmentInfo.sizes = 0;
            if (optCode === "TEXT") {
                this.fragmentInfo.type = 1;
            } else if (optCode === "BINARY") {
                this.fragmentInfo.type = 2;
            } else {
                console.log("Unknown Fragment code: ", optCode);
                this.fragmentInfo.type = 0;
            }
        }

        // noinspection JSUnresolvedFunction
        let data = fragment.getPayloadData();
        // noinspection JSUnresolvedFunction
        this.fragmentInfo.sizes += data.limit();
        this.fragmentInfo.data.push(data);
        if (fragment.fin === true) {
            const view = new Uint8Array(this.fragmentInfo.sizes);
            for (let i = 0, dst = 0; i < this.fragmentInfo.data.length; i++) {
                data = this.fragmentInfo.data[i];
                const count = data.limit();
                for (let src = 0; src < count; src++, dst++) {
                    view[dst] = data.get(src);
                }
            }
            data = null;
            this.fragmentInfo.data = [];

            // Do our final message callback
            if (this.fragmentInfo.type === 2) {
                    wrapper._notify("message", [wrapper, view.buffer]);
             } else {
                    wrapper._notify("message", [wrapper, UTF8ArrayToStr(view)]);
             }

            // Reset back to unknown type
            this.fragmentInfo.type = 0;
        }

         wrapper._notify("fragment", [wrapper, fragment]);

    },
    
    onWebsocketHandshakeReceivedAsClient: function (handshake) {
        if (this.debug) {
            console.log("WebSocket Event: Handshake Received", handshake);
        }
        const wrapper = this.wrapper && this.wrapper.get && this.wrapper.get()
        if (wrapper) {
            wrapper._notify("handshake", [wrapper, handshake]);
        }
    },
    
    onSetSSLParameters: function (sslParameters) {
        // https://github.com/TooTallNate/Java-WebSocket/wiki/No-such-method-error-setEndpointIdentificationAlgorithm
        if (global.android.os.Build.VERSION.SDK_INT >= 24) {
            this.super.onSetSSLParameters(sslParameters);
        }
    }
});

// We have to keep a hard ref to the created socket, otherwise the class will disappear mid-use because of GC
const webSockets = [];

// noinspection JSUnresolvedFunction,DuplicatedCode,JSUnusedGlobalSymbols
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

        this._callbacks = {
            open: [],
            close: [],
            message: [],
            error: [],
            fragment: [],
            handshake: [],
            ping: [],
            pong: []
        }; // Ping/Pong not supported yet

        this._hasOpened = false;
        this._queue = [];
        this._queueRunner = null;
        this._sslSocketFactory = options.sslSocketFactory || null;
        this._debug = (options.debug === true || options.debug > 0);

        // TODO: Replace Hack when we support protocols in Android; we want to "emulate" that the first protocol sent was accepted
        this._protocol = options.protocols && options.protocols[0] || "";

        this._browser = !!options.browser;
        this._url = url.replace(/\s/g, '%20');

        this._proxy = options.proxy;
        this._proxyObject = null;

        this._timeout = options.timeout || 10000;
        this._connectionLostTimeout = options.connectionLostTimeout;

        this._headers = options.headers || [];
        if (this._debug === true) {
            org.java_websocket.WebSocketImpl.DEBUG = true;
        }

        this.on("close", () => {
            if (this._browser) {
                this.unref();
            }
        });

        this._reCreate();
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
        const isWSS = (this._url.indexOf("wss:") === 0);

        const uri = new java.net.URI(this._url);

        if (!this._headers.hasOwnProperty("Origin")) {
            let originScheme = isWSS ? "https" : "http";
            let originHost = uri.getPort() !== -1 ? uri.getHost() + ":" + uri.getPort() : uri.getHost();
            this._headers["Origin"] = originScheme + "://" + originHost;
        }

        // TODO: Add Per-message deflate?
        const knownExtensions = new java.util.ArrayList();

        // Must have a protocol, even if it is blank
        const knownProtocols = new java.util.ArrayList();
        if (this._protocol) {
            knownProtocols.add(new org.java_websocket.protocols.Protocol(this._protocol));
        } else {
            knownProtocols.add(new org.java_websocket.protocols.Protocol(""));
        }

        // Clear old memory if used...
        if (this._socket && this._socket.wrapper) {
            this._socket.wrapper = null;
            this._socket = null;
        }

        //noinspection JSUnresolvedVariable,JSUnresolvedFunction
        this._socket = new _WebSocket(uri, new org.java_websocket.drafts.Draft_6455(knownExtensions, knownProtocols), toHashMap(this._headers), this._timeout);

        // Create linking and values for the socket controller.
        this._socket.wrapper = new WeakRef(this);
        this._socket.debug = this._debug;

        // check for Proxy
        this._proxyObject = null;
        if (this._proxy) {
            if (String.isString(this._proxy)) {
                //noinspection JSUnresolvedVariable,JSUnresolvedFunction
                this._proxyObject = new java.net.Proxy(java.net.Proxy.Type.HTTP, new java.net.InetSocketAddress(this._proxy, 80));
            } else {
                //noinspection JSUnresolvedVariable,JSUnresolvedFunction
                this._proxyObject = new java.net.Proxy(java.net.Proxy.Type.HTTP, new java.net.InetSocketAddress(this._proxy.address, this._proxy.port || 80));
            }
        }

        if (this._proxyObject) {
            //noinspection JSUnresolvedFunction
            this._socket.setProxy(this._proxyObject);
        }

        if (this._connectionLostTimeout) {
            this._socket.setConnectionLostTimeout(this._connectionLostTimeout);
        }

        // Check for SSL/TLS
        if (isWSS) {
            let socketFactory;
            if (this._sslSocketFactory) {
                socketFactory = this._sslSocketFactory;
            } else {
                //noinspection JSUnresolvedFunction,JSUnresolvedVariable
                const sslContext = javax.net.ssl.SSLContext.getInstance("TLS");
                sslContext.init(null, null, null);
                socketFactory = sslContext.getSocketFactory();
            }
            //noinspection JSUnresolvedFunction
            this._socket.setSocket(socketFactory.createSocket());
        }
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
            this._callEventCallbacks(eventCallbacks[i].t, eventCallbacks[i].c, data);
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
        callback.apply(self, data);
    }

    /**
     * Attach an event to this webSocket
     * @param event {String} - Event Type ("message", "open", "close", "error")
     * @param callback {Function} - the function to run on the event
     * @param thisArg? {Object} - the "this" to use for calling your function, defaults to this current webSocket "this"
     */
    on(event, callback, thisArg) {
        this.addEventListener(event, callback, thisArg);
    };

    /**
     * Detaches an event from this websocket
     * If no callback is provided all events are cleared of that type.
     * @param event {String} - Event to detach from
     * @param callback? {Function} - the function you registered
     */
    off(event, callback) {
        this.removeEventListener(event, callback);
    };

    /**
     * Attach an event to this webSocket
     * @param event {String} - Event Type ("message", "open", "close", "error")
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
     * @param event {String} - Event to detach from
     * @param callback? {Function} - the function you registered
     */
    removeEventListener(event, callback) {
        if (!Array.isArray(this._callbacks[event])) {
            throw new Error("Invalid event type in removeEventListener " + event);
        }
        if (callback) {
            const eventCallbacks = this._callbacks[event];
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

            if (this.state() >= 3) {
                this._socket.wrapper = null;
                this._socket = null;
                this._reCreate();
            } else {
                return;
            }
        }
        this._hasOpened = true;
        //noinspection JSUnresolvedFunction
        this._socket.connect();
    }

    /**
     * This closes your webSocket
     * @param code {Number} - The value to send as the close reason
     * @param message {String} - The message as to why you are closing
     */
    close(code, message) {
        if (arguments.length) {
            this._socket.close(code, message || "");
        } else {
            this._socket.close();
        }
    }

    /**
     * This sends a Text or Binary Message (Allows Buffering of messages if this is an advanced WebSocket)
     * @param message {string|Array|ArrayBuffer} - Message to send
     * @returns {boolean} - returns false if it is unable to send the message at this time, it will queue them up and try later...
     */
    send (message) {
        const state = this.state();

        // If we have a queue, we need to start processing it...
        if (this._queue.length && state === this.OPEN) {
            let sendSuccess = true;
            while (this._queue.length && sendSuccess) {
                let oldMessage = this._queue.pop();
                sendSuccess = this._send(oldMessage);
            }
            if (sendSuccess) {
                if (this._queueRunner) {
                    clearTimeout(this._queueRunner);
                    this._queueRunner = null;
                }
            } else {
                if (message != null && !this._browser) {
                    this._queue.push(message.slice(0));
                    this._startQueueRunner();
                }
                return false;
            }
        }

        // You shouldn't be sending null/undefined messages; but if you do -- we won't error out.
        if (message === null || message === undefined) {
            this._startQueueRunner();
            return false;
        }

        // If the socket isn't open, or we have a queue length; we are
        if (state !== this.OPEN || this._queue.length) {
            if (this._browser) {
                return false;
            }
            this._queue.push(message.slice(0));
            this._startQueueRunner();
            return false;
        }

        return this._send(message);
    }

    /**
     * Internal function to start the Queue Runner timer
     * @private
     */
    _startQueueRunner() {
        if (!this._queueRunner && this.state() !== this.OPEN && this._queue.length) {
            this._queueRunner = setTimeout( () => {
                this._queueRunner = null;
                this.send(null);
            }, 250);
        }
    };

    /**
     * Internal function that actually sends the message
     * @param message {String|ArrayBuffer} - Message to send
     * @private
     */
    _send(message) {
        try {
            if (message instanceof ArrayBuffer || message instanceof Uint8Array || Array.isArray(message)) {
                let view;
                if (message instanceof ArrayBuffer) {
                    view = new Uint8Array(message);
                } else {
                    view = message;
                }
                //noinspection JSUnresolvedFunction,JSUnresolvedVariable
                let buffer = java.lang.reflect.Array.newInstance(java.lang.Byte.class.getField("TYPE").get(null), view.length);
                for (let i = 0; i < view.length; i++) {
                    //noinspection JSUnresolvedFunction,JSUnresolvedVariable
                    java.lang.reflect.Array.setByte(buffer, i, byte(view[i]));
                }
                this._socket.send(buffer);
            } else {
                this._socket.send(message);
            }
        } catch (err) {
            // Websocket is probably disconnected; so put the back at the top of the message queue...
            if (this._browser) {
                return false;
            }

            this._queue.unshift(message);
            this._startQueueRunner();

            return false;
        }
        return true;
    };

    /**
     * Returns the state of the Connection
     * @returns {Number} - returns this.NOT_YET_CONNECTED, .OPEN, .CLOSING or .CLOSED
     */
    state() {
        //noinspection JSUnresolvedFunction
        switch (this._socket.getReadyState()) {
            case org.java_websocket.enums.ReadyState.NOT_YET_CONNECTED:
                return this.NOT_YET_CONNECTED;
            case org.java_websocket.enums.ReadyState.OPEN:
                return this.OPEN;
            case org.java_websocket.enums.ReadyState.CLOSING:
                return this.CLOSING;
            case org.java_websocket.enums.ReadyState.CLOSED:
                return this.CLOSED;
            default:
                throw new Error("getReadyState returned invalid value");
        }
    }

    /**
     * Is the connection open
     * @returns {boolean} - true if the connection is open
     */
    isOpen() {
        return this._socket.isOpen();
    };

    /**
     * Is the connection closed
     * @returns {boolean} - true if the connection is closed
     */
    isClosed() {
        return this._socket.isClosed();
    };

    /**
     * Is the connection is in the process of closing
     * @returns {boolean} - true if closing
     */
    isClosing() {
        return this._socket.isClosing();
    };

    /**
     * Returns the Remote address
     * @returns {String} - the address
     */
    getRemoteSocketAddress() {
        return this._socket.getRemoteSocketAddress();
    };


    /**
     * This returns the current protocol
     */
    get protocol() {
        return this._protocol;
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
     * This returns true because it is on the ANDROID platform
     */
    get android() {
        return true;
    }

    // /**
    //  * This is a list standardized Close Codes
    //  */
    // static CLOSE_CODE = {NORMAL: 1000, GOING_AWAY: 1001, PROTOCOL_ERROR: 1002, REFUSE: 1003, NOCODE: 1005, ABNORMAL_CLOSE:1006, NO_UTF8: 1007, POLICY_VALIDATION: 1008, TOOBIG: 1009, EXTENSION: 1010, UNEXPECTED_CONDITION: 1011, SERVICE_RESTART: 1012, TRY_AGAIN_LATER: 1013, BAD_GATEWAY: 1014, TLS_ERROR: 1015, NEVER_CONNECTED: -1, BUGGYCLOSE: -2, FLASHPOLICY: -3};
    //
    // /**
    //  * Standard Connection values
    //  * @type {number}
    //  */
    // static NOT_YET_CONNECTED = -1;
    // static CONNECTING = 0;
    // static OPEN = 1;
    // static CLOSING = 2;
    // static CLOSED = 3;
}
NativeWebSockets.CLOSE_CODE = {NORMAL: 1000, GOING_AWAY: 1001, PROTOCOL_ERROR: 1002, REFUSE: 1003, NOCODE: 1005, ABNORMAL_CLOSE:1006, NO_UTF8: 1007, POLICY_VALIDATION: 1008, TOOBIG: 1009, EXTENSION: 1010, UNEXPECTED_CONDITION: 1011, SERVICE_RESTART: 1012, TRY_AGAIN_LATER: 1013, BAD_GATEWAY: 1014, TLS_ERROR: 1015, NEVER_CONNECTED: -1, BUGGYCLOSE: -2, FLASHPOLICY: -3};
NativeWebSockets.NOT_YET_CONNECTED = -1;
NativeWebSockets.CONNECTING = 0;
NativeWebSockets.OPEN = 1;
NativeWebSockets.CLOSING = 2;
NativeWebSockets.CLOSED = 3;

module.exports = NativeWebSockets;


/**
 * Converts UTF8Data to a JS String
 * @param data
 * @returns {string}
 * @constructor
 */
function UTF8ArrayToStr(data) {
    let result='', count=data.length;
    let i=0, c1, c2, c3;

    while(i < count) {
        c1 = data[i++];
        switch(c1 >> 4)
        {
            case 12: // 10xx xxxx
            case 13: // 110x xxxx
                c2 = (data[i++] & 0x3F);
                result += String.fromCharCode(((c1 & 0x1F) << 6) | c2);
                break;

            case 14: // 1110 xxxx
                c2 = (data[i++] & 0x3F) << 6;
                c3 = (data[i++] & 0x3F);
                result += String.fromCharCode(((c1 & 0x0F) << 12) | c2 | c3);
                break;

            default: // 0xxxxxxx
                result += String.fromCharCode(c1);
                break;
        }
    }

    return result;
}

/**
 * Creates a Java Hash map
 * @param obj
 * @returns {java.util.HashMap}
 */
function toHashMap(obj) {
    const map = new java.util.HashMap();

    for (let property in obj) {
        if (!obj.hasOwnProperty) continue;
        if (obj[property] === null) continue;

        let val = obj[property];
        switch (typeof val) {
            case 'object':
                map.put(property, toHashMap(val, map));
                break;

            case 'boolean':
                map.put(property, java.lang.Boolean.valueOf(String(val)));
                break;

            case 'number':
                if (Number(val) === val && val % 1 === 0) {
                    map.put(property, java.lang.Long.valueOf(String(val)));
                } else {
                    map.put(property, java.lang.Double.valueOf(String(val)));
                }
                break;

            case 'string':
                map.put(property, String(val));
                break;
        }
    }

    return map;
}


/**
 * Checks for running on a emulator
 * @returns {boolean}
 */
function checkForEmulator() {
    //noinspection JSUnresolvedVariable
    const res = android.os.Build.FINGERPRINT;
    return res.indexOf("generic") !== -1;
}
