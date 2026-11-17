/**
 * Wrapper for client-side TikTok connection over Socket.IO
 * With reconnect functionality.
 */
class TikTokIOConnection {
    constructor(backendUrl, socketOptions) {
        this.backendUrl = backendUrl;
        // forceNew keeps a dedicated Socket.IO manager per wrapper instance, so switching
        // backends (destroy + new) never reuses listeners/handlers from the previous server.
        this.socket = io(backendUrl, Object.assign({ forceNew: true }, socketOptions || {}));
        this.uniqueId = null;
        this.options = null;
        this.isConnected = false;
        this._connectTimeout = null;
        this._pendingSocketConnect = null;
        this._pendingOnConnected = null;
        this._pendingOnDisconnected = null;

        this.socket.on('connect', () => {
            console.info("Socket connected!");

            // Reconnect to streamer only if previously connected (socket.io transport reconnect)
            if (this.uniqueId && this.isConnected) {
                this.socket.emit('setUniqueId', this.uniqueId, this.options);
            }
        });

        this.socket.on('disconnect', () => {
            console.warn("Socket disconnected!");
        });

        this.socket.on('streamEnd', () => {
            console.warn("LIVE has ended!");
            this.uniqueId = null;
            this.isConnected = false;
        });

        this.socket.on('tiktokDisconnected', (errMsg) => {
            this._handleTikTokDisconnected(errMsg);
        });
    }

    _handleTikTokDisconnected(errMsg) {
        console.warn(errMsg);

        // The TikTok connection is gone (failed, ended, or rejected). Clear the state so a
        // later Socket.IO transport reconnect does not blindly re-emit setUniqueId and trigger
        // an endless error loop (e.g. reCAPTCHA rejections or ended LIVE streams).
        this.uniqueId = null;
        this.isConnected = false;
    }

    _clearPendingConnect() {
        if (this._connectTimeout) {
            clearTimeout(this._connectTimeout);
            this._connectTimeout = null;
        }
        if (this._pendingSocketConnect) {
            this.socket.off('connect', this._pendingSocketConnect);
            this._pendingSocketConnect = null;
        }
        if (this._pendingOnConnected) {
            this.socket.off('tiktokConnected', this._pendingOnConnected);
            this._pendingOnConnected = null;
        }
        if (this._pendingOnDisconnected) {
            this.socket.off('tiktokDisconnected', this._pendingOnDisconnected);
            this._pendingOnDisconnected = null;
        }
    }

    /**
     * Upgrade to a WebSocket-only transport. Used when the backend reports that the
     * Socket.IO path is served by a function endpoint (e.g. Vercel) that cannot answer
     * the HTTP long-polling handshake. Reconnect is handled by our own logic.
     */
    useWebSocketOnly() {
        if (this.websocketOnly) return;
        this.websocketOnly = true;

        // Patch both the manager and the Engine.IO client: the engine keeps its own copy of
        // the transport list, so updating opts alone would not stop the polling attempts.
        this.socket.io.opts.transports = ['websocket'];
        this.socket.io.opts.reconnection = false;
        if (this.socket.io.engine) {
            this.socket.io.engine.transports = ['websocket'];
            this.socket.io.engine.opts.transports = ['websocket'];
        }
    }

    connect(uniqueId, options) {
        this._clearPendingConnect();

        this.uniqueId = uniqueId;
        const emitOptions = Object.assign({}, options || {});

        // Keep reusable options (e.g. bypassToken) for transport reconnects,
        // but never resend a single-use recaptchaToken.
        const persistedOptions = Object.assign({}, emitOptions);
        delete persistedOptions.recaptchaToken;
        this.options = persistedOptions;
        this.isConnected = false;

        return new Promise((resolve, reject) => {
            this._pendingOnConnected = (state) => {
                this._clearPendingConnect();
                this.isConnected = true;
                resolve(state);
            };

            this._pendingOnDisconnected = (errMsg) => {
                this._clearPendingConnect();
                this.uniqueId = null;
                this.isConnected = false;
                reject(errMsg);
            };

            this.socket.once('tiktokConnected', this._pendingOnConnected);
            this.socket.once('tiktokDisconnected', this._pendingOnDisconnected);

            this._connectTimeout = setTimeout(() => {
                this._clearPendingConnect();
                if (!this.isConnected) {
                    this.uniqueId = null;
                }
                reject('Connection Timeout');
            }, 15000);

            if (this.socket.connected) {
                this.socket.emit('setUniqueId', this.uniqueId, emitOptions);
            } else {
                this._pendingSocketConnect = () => {
                    this._pendingSocketConnect = null;
                    if (this.uniqueId === uniqueId && !this.isConnected) {
                        this.socket.emit('setUniqueId', this.uniqueId, emitOptions);
                    }
                };
                this.socket.once('connect', this._pendingSocketConnect);
                this.socket.connect();
            }
        });
    }

    disconnect() {
        this._clearPendingConnect();
        this.uniqueId = null;
        this.isConnected = false;
        if (this.socket.connected) {
            this.socket.emit('disconnect_tiktok');
        }
    }

    destroy() {
        this.disconnect();
        this.socket.removeAllListeners();
        this.socket.close();
    }

    on(eventName, eventHandler) {
        this.socket.on(eventName, eventHandler);
    }
}
