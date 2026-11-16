const DEMO_BACKEND_URL = 'https://tiktok-chat-reader.zerody.one/';

// Replace with your deployed server.js URL (e.g. 'https://tiktok-chat-reader-backend.onrender.com/')
// so static hosts like GitHub Pages connect to your own backend by default without reCAPTCHA.
const DEFAULT_STATIC_BACKEND_URL = DEMO_BACKEND_URL;

function normalizeBackendUrl(raw) {
    if (typeof raw !== 'string') return null;
    let value = raw.trim();
    if (!value) return null;

    if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value)) {
        const isLocal = /^(localhost|127\.0\.0\.1)([:/]|$)/i.test(value);
        value = (isLocal ? 'http://' : 'https://') + value;
    }

    try {
        const parsed = new URL(value);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
            return parsed.origin + '/';
        }
    } catch (_) {
        console.warn('Invalid backend URL ignored:', raw);
    }

    return null;
}

function extractBypassToken(raw) {
    if (typeof raw !== 'string') return '';
    const value = raw.trim();
    if (!value) return '';

    const match = value.match(/[?&]token=([^&#\s]+)/);
    if (match) {
        try {
            return decodeURIComponent(match[1]);
        } catch (_) {
            return match[1];
        }
    }

    return value;
}

function isStaticHost() {
    return location.protocol === 'file:' || location.hostname.endsWith('.github.io');
}

function isDemoBackend(url) {
    if (!url) return false;
    try {
        return new URL(url).hostname === 'tiktok-chat-reader.zerody.one';
    } catch (_) {
        return false;
    }
}

function safeStorageGet(key) {
    try {
        return localStorage.getItem(key);
    } catch (_) {
        return null;
    }
}

function safeStorageSet(key, value) {
    try {
        if (value === null || value === undefined || value === '') {
            localStorage.removeItem(key);
        } else {
            localStorage.setItem(key, value);
        }
    } catch (_) {}
}

// Priority: ?backend= URL param > saved localStorage backendUrl > static host fallback > same-origin server
function resolveBackendUrl() {
    const queryBackend = normalizeBackendUrl(new URLSearchParams(location.search).get('backend'));
    if (queryBackend) return queryBackend;

    const savedBackend = normalizeBackendUrl(safeStorageGet('backendUrl'));
    if (savedBackend) return savedBackend;

    if (isStaticHost()) {
        return normalizeBackendUrl(DEFAULT_STATIC_BACKEND_URL);
    }

    return undefined;
}

// Priority: window.settings.token (obs.html) / ?token= URL param > saved localStorage bypassToken
function resolveBypassToken() {
    if (window.settings && window.settings.token) {
        return extractBypassToken(window.settings.token);
    }
    const queryToken = extractBypassToken(new URLSearchParams(location.search).get('token'));
    if (queryToken) return queryToken;

    return extractBypassToken(safeStorageGet('bypassToken'));
}

// These settings are defined by obs.html
if (!window.settings) window.settings = {};

// Counter
let viewerCount = 0;
let likeCount = 0;
let diamondsCount = 0;
let joinMsgDelay = 0;

// In-memory storage for downloads
let chatHistory = [];
let giftHistory = [];

// Auto-scroll toggles (per container, persisted)
let autoScrollChat = safeStorageGet('autoScrollChat') !== 'false';
let autoScrollGift = safeStorageGet('autoScrollGift') !== 'false';

let isConnected = false;
let backendUrl = resolveBackendUrl();
let connection = null;

function getBackendLabel(url) {
    if (!url) return location.host || 'same-origin';
    try {
        return new URL(url).host;
    } catch (_) {
        return url;
    }
}

function updateServerBadge(socketState) {
    const $badge = $('#serverToggleBtn');
    if (!$badge.length) return;

    const host = getBackendLabel(backendUrl);
    const dotClass = socketState === 'connected'
        ? 'status-dot online'
        : (socketState === 'error' ? 'status-dot error' : 'status-dot');
    $badge.html(`<span class="${dotClass}"></span>Server: ${sanitize(host)}`);
}

function bindConnectionEvents(conn) {
    conn.on('connect', () => updateServerBadge('connected'));
    conn.on('disconnect', () => updateServerBadge('disconnected'));
    conn.on('connect_error', () => updateServerBadge('error'));

    // viewer stats
    conn.on('roomUser', (msg) => {
        if (typeof msg.viewerCount === 'number') {
            viewerCount = msg.viewerCount;
            updateRoomStats();
        }
    });

    // like stats
    conn.on('like', (msg) => {
        if (typeof msg.totalLikeCount === 'number') {
            likeCount = msg.totalLikeCount;
            updateRoomStats();
        }

        if (window.settings.showLikes === "0") return;

        if (typeof msg.likeCount === 'number') {
            let likeLabel = msg.label ? msg.label.replace('{0:user}', '').replace('likes', `${msg.likeCount} likes`) : `${msg.likeCount} likes`;
            addChatItem('#447dd4', msg, likeLabel);
        }
    });

    // Member join
    conn.on('member', (msg) => {
        if (window.settings.showJoins === "0") return;

        let addDelay = 250;
        if (joinMsgDelay > 500) addDelay = 100;
        if (joinMsgDelay > 1000) addDelay = 0;

        joinMsgDelay += addDelay;

        setTimeout(() => {
            joinMsgDelay -= addDelay;
            addChatItem('#21b2c2', msg, 'joined', true);
        }, joinMsgDelay);
    });

    // New chat comment received
    conn.on('chat', (msg) => {
        chatHistory.push({timestamp: Date.now(), uniqueId: msg.uniqueId, comment: msg.comment, userId: msg.userId});

        if (window.settings.showChats === "0") return;

        addChatItem('', msg, msg.comment);
    });

    // New gift received
    conn.on('gift', (data) => {
        giftHistory.push({
            timestamp: Date.now(),
            uniqueId: data.uniqueId,
            userId: data.userId,
            giftId: data.giftId,
            giftName: data.giftName,
            repeatCount: data.repeatCount,
            diamondCount: data.diamondCount,
            repeatEnd: data.repeatEnd
        });

        if (!isPendingStreak(data) && data.diamondCount > 0) {
            diamondsCount += (data.diamondCount * data.repeatCount);
            updateRoomStats();
        }

        if (window.settings.showGifts === "0") return;

        addGiftItem(data);
    });

    // follow
    conn.on('follow', (data) => {
        if (window.settings.showFollows === "0") return;
        addChatItem('#ff005e', data, 'followed');
    });

    // share
    conn.on('share', (data) => {
        if (window.settings.showFollows === "0") return;
        addChatItem('#2fb816', data, 'shared');
    });

    conn.on('streamEnd', () => {
        $('#stateText').text('Stream ended. Reconnecting...');
        setButtonState('idle');

        // schedule next try if obs username set
        if (window.settings.username) {
            setTimeout(() => {
                connect();
            }, 30000);
        }
    });

    // Handle unexpected disconnects after a room connection was active
    conn.on('tiktokDisconnected', (errMsg) => {
        if (isConnected) {
            setButtonState('idle');
            handleConnectError(errMsg);
        }
    });
}

function initConnection(nextBackendUrl) {
    if (connection) {
        connection.destroy();
    }
    isConnected = false;
    setButtonState('idle');
    backendUrl = nextBackendUrl;
    updateServerBadge('connecting');
    connection = new TikTokIOConnection(backendUrl);
    bindConnectionEvents(connection);

    if (typeof loadRecaptchaConfig === 'function') {
        loadRecaptchaConfig();
    }
}

initConnection(backendUrl);

function downloadJSON(data, filename) {
    let blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    let url = URL.createObjectURL(blob);
    let a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function updateAutoScrollButtons() {
    $('#chatAutoScroll').text(autoScrollChat ? 'Auto-scroll: ON' : 'Auto-scroll: OFF');
    $('#giftAutoScroll').text(autoScrollGift ? 'Auto-scroll: ON' : 'Auto-scroll: OFF');
}

function toggleChatAutoScroll() {
    autoScrollChat = !autoScrollChat;
    safeStorageSet('autoScrollChat', String(autoScrollChat));
    updateAutoScrollButtons();
}

function toggleGiftAutoScroll() {
    autoScrollGift = !autoScrollGift;
    safeStorageSet('autoScrollGift', String(autoScrollGift));
    updateAutoScrollButtons();
}

function setButtonState(state) {
    const $connect = $('#connectButton');
    const $disconnect = $('#disconnectButton');
    const $input = $('#uniqueIdInput');

    if (state === 'connecting') {
        $connect.val('Connecting...').prop('disabled', true);
        $disconnect.hide();
        $input.prop('disabled', true);
    } else if (state === 'connected') {
        isConnected = true;
        $connect.hide();
        $disconnect.show();
        $input.prop('disabled', true);
    } else {
        isConnected = false;
        $connect.val('Connect').prop('disabled', false).show();
        $disconnect.hide();
        $input.prop('disabled', false);
    }
}

function handleConnectError(errorMessage) {
    const msg = String(errorMessage || 'Connection failed');
    const isRecaptchaError = msg.toLowerCase().includes('recaptcha');

    if (isRecaptchaError && typeof recaptchaSiteKey !== 'undefined' && recaptchaSiteKey) {
        // Our own backend has reCAPTCHA enabled (e.g. RECAPTCHA_SECRET_KEY set on server.js):
        // show the captcha once and retry automatically.
        $('#stateText').text('Vui lòng xác minh reCAPTCHA để kết nối...');
        showCaptcha((token) => {
            if (token) {
                window._pendingRecaptchaToken = token;
                connect();
            }
        });
        return;
    }

    if (isRecaptchaError && isDemoBackend(backendUrl)) {
        const hasToken = Boolean(resolveBypassToken());
        const detail = hasToken
            ? `${msg} — Bypass token không hợp lệ hoặc đã hết hạn (24h). Hãy nhập Backend URL riêng của bạn hoặc tạo lại Overlay Token.`
            : `${msg} — Demo server (tiktok-chat-reader.zerody.one) yêu cầu reCAPTCHA khoá theo domain riêng. Hãy cấu hình Backend URL riêng của bạn (không cần captcha) hoặc dán Overlay Token ở khung Server bên trên.`;
        $('#stateText').text(detail);
        if (typeof openServerSettings === 'function') {
            openServerSettings();
        }
        return;
    }

    $('#stateText').text(msg);
}

$(document).ready(() => {
    // Pre-fill last connected username
    const lastUser = safeStorageGet('lastUsername');
    if (lastUser && !window.settings.username) {
        $('#uniqueIdInput').val(lastUser);
    }

    updateServerBadge(connection && connection.socket && connection.socket.connected ? 'connected' : 'connecting');

    if (typeof initServerSettingsUI === 'function') {
        initServerSettingsUI();
    }

    $('#connectButton').click(() => {
        if (typeof connectWithCaptcha === 'function') {
            connectWithCaptcha();
        } else {
            connect();
        }
    });
    $('#disconnectButton').click(disconnect);
    $('#uniqueIdInput').on('keyup', function (e) {
        if (e.key === 'Enter') {
            if (typeof connectWithCaptcha === 'function') {
                connectWithCaptcha();
            } else {
                connect();
            }
        }
    });

    updateAutoScrollButtons();

    if (window.settings.username) connect();
});

function connect() {
    let rawId = window.settings.username || $('#uniqueIdInput').val() || '';
    let uniqueId = rawId.trim().replace(/^@+/, '');
    if (uniqueId !== '') {

        $('#stateText').text('');
        setButtonState('connecting');

        let options = {};

        // Attach reCAPTCHA token from captcha popup (index.html)
        if (window._pendingRecaptchaToken) {
            options.recaptchaToken = window._pendingRecaptchaToken;
            window._pendingRecaptchaToken = null;
        }

        // Attach reusable bypass token (obs.html ?token= or saved token for demo backend)
        const bypassToken = resolveBypassToken();
        if (bypassToken) {
            options.bypassToken = bypassToken;
        }

        connection.connect(uniqueId, options).then(state => {
            $('#stateText').text('');
            setButtonState('connected');
            safeStorageSet('lastUsername', uniqueId);

            // reset stats
            viewerCount = 0;
            likeCount = 0;
            diamondsCount = 0;
            updateRoomStats();

        }).catch(errorMessage => {
            handleConnectError(errorMessage);
            setButtonState('idle');

            // schedule next try if obs username set (except unrecoverable reCAPTCHA errors)
            const errStr = String(errorMessage || '').toLowerCase();
            if (window.settings.username && !errStr.includes('recaptcha')) {
                setTimeout(() => {
                    connect();
                }, 30000);
            }
        });

    } else {
        alert('no username entered');
    }
}

function disconnect() {
    connection.disconnect();
    $('#stateText').text('');
    setButtonState('idle');
}

// Prevent Cross site scripting (XSS)
function sanitize(text) {
    return String(text).replace(/</g, '&lt;');
}

function updateRoomStats() {
    $('#roomStats').html(`Viewers: <b>${viewerCount.toLocaleString()}</b> Likes: <b>${likeCount.toLocaleString()}</b> Earned Diamonds: <b>${diamondsCount.toLocaleString()}</b>`);
}

function generateUsernameLink(data) {
    return `<a class="usernamelink" href="https://www.tiktok.com/@${data.uniqueId}" target="_blank">${data.uniqueId}</a>`;
}

function isPendingStreak(data) {
    return data.giftType === 1 && !data.repeatEnd;
}

/**
 * Add a new message to the chat container
 */
function addChatItem(color, data, text, summarize) {
    let container = location.href.includes('obs.html') ? $('.eventcontainer') : $('.chatcontainer');

    if (container.find('div').length > 500) {
        container.find('div').slice(0, 200).remove();
    }

    container.find('.temporary').remove();

    container.append(`
        <div class=${summarize ? 'temporary' : 'static'}>
            <img class="miniprofilepicture" src="${data.profilePictureUrl}">
            <span>
                <b>${generateUsernameLink(data)}:</b>
                <span style="color:${color}">${sanitize(text)}</span>
            </span>
        </div>
    `);

    if (autoScrollChat || location.href.includes('obs.html')) {
        container.stop();
        container.animate({
            scrollTop: container[0].scrollHeight
        }, 400);
    }
}

/**
 * Add a new gift to the gift container
 */
function addGiftItem(data) {
    let container = location.href.includes('obs.html') ? $('.eventcontainer') : $('.giftcontainer');

    if (container.find('div').length > 200) {
        container.find('div').slice(0, 100).remove();
    }

    let streakId = data.userId.toString() + '_' + data.giftId;

    let html = `
        <div data-streakid=${isPendingStreak(data) ? streakId : ''}>
            <img class="miniprofilepicture" src="${data.profilePictureUrl}">
            <span>
                <b>${generateUsernameLink(data)}:</b> <span>${data.describe}</span><br>
                <div>
                    <table>
                        <tr>
                            <td><img class="gifticon" src="${data.giftPictureUrl}"></td>
                            <td>
                                <span>Name: <b>${data.giftName}</b> (ID:${data.giftId})</span><br>
                                <span>Repeat: <b style="${isPendingStreak(data) ? 'color:red' : ''}">x${data.repeatCount.toLocaleString()}</b></span><br>
                                <span>Cost: <b>${(data.diamondCount * data.repeatCount).toLocaleString()} Diamonds</b></span>
                            </td>
                        </tr>
                    </table>
                </div>
            </span>
        </div>
    `;

    let existingStreakItem = container.find(`[data-streakid='${streakId}']`);

    if (existingStreakItem.length) {
        existingStreakItem.replaceWith(html);
    } else {
        container.append(html);
    }

    if (autoScrollGift || location.href.includes('obs.html')) {
        container.stop();
        container.animate({
            scrollTop: container[0].scrollHeight
        }, 800);
    }
}
