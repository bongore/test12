const http = require("http");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || process.env.LIVE_SIGNAL_PORT || 3001);
const HEARTBEAT_TIMEOUT_MS = 180 * 1000;
const MAX_BOARD_MESSAGES = 200;
const MAX_REACTION_HISTORY = 20;
const BLOCKED_MESSAGE_PATTERNS = [/ばか/i, /あほ/i, /死ね/i, /殺す/i, /くそ/i, /fuck/i, /shit/i, /bitch/i, /(.)\1{7,}/];
const REACTION_KEYS = ["understood", "repeat", "slow", "fast"];
const STATE_FILE_PATH = path.join(__dirname, ".live-board-state.json");

const server = http.createServer((req, res) => {
    res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify({ ok: true, service: "live-signal-server" }));
});

const wss = new WebSocket.Server({ server });

let nextClientId = 1;
const clients = new Map();
let activeBroadcast = null;
let pinnedNotice = null;
let reactionSessionHistory = [];
let boardSessionHistory = [];

function createDefaultReactions() {
    return {
        understood: 0,
        repeat: 0,
        slow: 0,
        fast: 0,
    };
}

function createReactionSession(label = "") {
    return {
        id: `reaction_session_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        label: String(label || "").trim() || `授業 ${reactionSessionHistory.length + 1}`,
        startedAt: new Date().toISOString(),
        endedAt: "",
        clientReactions: new Map(),
        messages: [],
    };
}

let currentReactionSession = createReactionSession("現在の授業");

function createBoardSession(label = "") {
    return {
        id: `board_session_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        label: String(label || "").trim() || `共有コメント ${boardSessionHistory.length + 1}`,
        startedAt: new Date().toISOString(),
        endedAt: "",
        messages: [],
    };
}

let currentBoardSession = createBoardSession("現在の授業");

function serializeReactionSessionForStorage(session) {
    if (!session) return null;
    return {
        ...session,
        clientReactions: Array.from((session.clientReactions || new Map()).entries()),
        messages: Array.isArray(session.messages) ? session.messages : [],
    };
}

function reviveReactionSession(session, fallbackLabel = "現在の授業") {
    if (!session) return createReactionSession(fallbackLabel);
    return {
        id: session.id || `reaction_session_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        label: String(session.label || "").trim() || fallbackLabel,
        startedAt: session.startedAt || new Date().toISOString(),
        endedAt: session.endedAt || "",
        clientReactions: new Map(Array.isArray(session.clientReactions) ? session.clientReactions : []),
        messages: Array.isArray(session.messages) ? session.messages : [],
    };
}

function serializeBoardSessionForStorage(session) {
    if (!session) return null;
    return {
        ...session,
        messages: Array.isArray(session.messages)
            ? session.messages.map((message) => ({
                ...message,
                likedBy: Array.from(message.likedBy || []),
            }))
            : [],
    };
}

function reviveBoardSession(session, fallbackLabel = "現在の授業") {
    if (!session) return createBoardSession(fallbackLabel);
    return {
        id: session.id || `board_session_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        label: String(session.label || "").trim() || fallbackLabel,
        startedAt: session.startedAt || new Date().toISOString(),
        endedAt: session.endedAt || "",
        messages: Array.isArray(session.messages)
            ? session.messages.map((message) => ({
                ...message,
                likedBy: new Set(Array.isArray(message.likedBy) ? message.likedBy : []),
            }))
            : [],
    };
}

function persistState() {
    try {
        const payload = {
            pinnedNotice,
            reactionSessionHistory: reactionSessionHistory.map((session) => serializeReactionSessionForStorage(session)),
            boardSessionHistory: boardSessionHistory.map((session) => serializeBoardSessionForStorage(session)),
            currentReactionSession: serializeReactionSessionForStorage(currentReactionSession),
            currentBoardSession: serializeBoardSessionForStorage(currentBoardSession),
        };
        fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(payload, null, 2), "utf8");
    } catch (error) {
        console.error("Failed to persist live board state", error);
    }
}

function loadPersistedState() {
    try {
        if (!fs.existsSync(STATE_FILE_PATH)) return;
        const raw = fs.readFileSync(STATE_FILE_PATH, "utf8");
        if (!raw) return;
        const payload = JSON.parse(raw);
        pinnedNotice = payload?.pinnedNotice || null;
        reactionSessionHistory = Array.isArray(payload?.reactionSessionHistory)
            ? payload.reactionSessionHistory.map((session) => reviveReactionSession(session, "過去の授業"))
            : [];
        boardSessionHistory = Array.isArray(payload?.boardSessionHistory)
            ? payload.boardSessionHistory.map((session) => reviveBoardSession(session, "過去の授業"))
            : [];
        currentReactionSession = reviveReactionSession(payload?.currentReactionSession, "現在の授業");
        currentBoardSession = reviveBoardSession(payload?.currentBoardSession, "現在の授業");
    } catch (error) {
        console.error("Failed to load persisted live board state", error);
    }
}

function safeSend(ws, payload) {
    if (ws.readyState === 1) {
        ws.send(JSON.stringify(payload));
    }
}

function broadcast(payload, excludeClientId = null) {
    for (const [clientId, client] of clients.entries()) {
        if (clientId === excludeClientId) continue;
        safeSend(client.ws, payload);
    }
}

function getBroadcastSnapshot() {
    if (!activeBroadcast) return null;
    return {
        broadcasterId: activeBroadcast.broadcasterId,
        broadcasterAddress: activeBroadcast.broadcasterAddress,
        broadcasterName: activeBroadcast.broadcasterName,
        broadcasterRole: activeBroadcast.broadcasterRole,
        outputType: activeBroadcast.outputType,
        startedAt: activeBroadcast.startedAt,
        viewerCount: activeBroadcast.viewerIds.size,
    };
}

function getDisplayName(client) {
    if (!client) return "viewer";
    if (client.displayName) return client.displayName;
    if (client.address) {
        return `${client.address.slice(0, 6)}...${client.address.slice(-4)}`;
    }
    return client.role === "staff" ? "teacher" : "guest";
}

function moderateMessage(text) {
    const normalized = String(text || "").trim();
    if (!normalized) {
        return { blocked: true, reason: "empty" };
    }
    if (BLOCKED_MESSAGE_PATTERNS.some((pattern) => pattern.test(normalized))) {
        return { blocked: true, reason: "unsafe" };
    }
    if (/(https?:\/\/|www\.)/i.test(normalized)) {
        return { blocked: true, reason: "link" };
    }
    return { blocked: false, reason: "" };
}

function serializeBoardMessage(message) {
    return {
        id: message.id,
        text: message.text,
        amount: message.amount,
        chatType: message.chatType,
        timestamp: message.timestamp,
        user: message.user,
        messageKind: message.messageKind,
        isQuestion: message.isQuestion,
        isAnonymous: message.isAnonymous,
        likeCount: message.likedBy.size,
        senderAddress: message.senderAddress || "",
    };
}

function getReactionTotals(source = currentReactionSession?.clientReactions) {
    const totals = createDefaultReactions();
    for (const reaction of (source || new Map()).values()) {
        if (REACTION_KEYS.includes(reaction)) {
            totals[reaction] += 1;
        }
    }
    return totals;
}

function serializeReactionSession(session, clientId = "") {
    if (!session) return null;
    return {
        id: session.id,
        label: session.label,
        startedAt: session.startedAt,
        endedAt: session.endedAt || "",
        reactions: getReactionTotals(session.clientReactions),
        currentReaction: clientId ? (session.clientReactions.get(clientId) || "") : "",
        messageCount: Array.isArray(session.messages) ? session.messages.length : 0,
    };
}

function serializeBoardSession(session) {
    if (!session) return null;
    return {
        id: session.id,
        label: session.label,
        startedAt: session.startedAt,
        endedAt: session.endedAt || "",
        messageCount: Array.isArray(session.messages) ? session.messages.length : 0,
    };
}

function archiveCurrentReactionSession() {
    if (!currentReactionSession) return;
    reactionSessionHistory.unshift({
        ...currentReactionSession,
        endedAt: new Date().toISOString(),
    });
    if (reactionSessionHistory.length > MAX_REACTION_HISTORY) {
        reactionSessionHistory.splice(MAX_REACTION_HISTORY);
    }
    persistState();
}

function archiveCurrentBoardSession() {
    if (!currentBoardSession) return;
    boardSessionHistory.unshift({
        ...currentBoardSession,
        endedAt: new Date().toISOString(),
    });
    if (boardSessionHistory.length > MAX_REACTION_HISTORY) {
        boardSessionHistory.splice(MAX_REACTION_HISTORY);
    }
    persistState();
}

function getBoardState(clientId = "") {
    return {
        messages: (currentBoardSession?.messages || []).map(serializeBoardMessage),
        pinnedNotice,
        reactionSession: serializeReactionSession(currentReactionSession, clientId),
        reactionHistory: reactionSessionHistory.map((session) => serializeReactionSession(session)),
        boardSession: serializeBoardSession(currentBoardSession),
        boardSessionHistory: boardSessionHistory.map((session) => serializeBoardSession(session)),
    };
}

function getSessionMessages(sessionId = "") {
    const normalizedId = String(sessionId || "");
    if (!normalizedId) return [];
    if (String(currentBoardSession?.id || "") === normalizedId) {
        return currentBoardSession?.messages || [];
    }
    const archivedSession = boardSessionHistory.find((session) => String(session.id) === normalizedId);
    return archivedSession?.messages || [];
}

function sendPresence(clientId) {
    const client = clients.get(clientId);
    if (!client) return;

    safeSend(client.ws, {
        type: "presence",
        clientId,
        activeBroadcast: getBroadcastSnapshot(),
        boardState: getBoardState(clientId),
    });
}

function notifyBroadcastUpdate() {
    broadcast({
        type: "broadcast-state",
        activeBroadcast: getBroadcastSnapshot(),
    });
}

function notifyPinnedNotice() {
    broadcast({
        type: "board-pinned-notice",
        notice: pinnedNotice,
    });
}

function notifyReactions(clientId = "") {
    if (clientId) {
        const client = clients.get(clientId);
        if (client) {
            safeSend(client.ws, {
                type: "board-reactions",
                reactionSession: serializeReactionSession(currentReactionSession, clientId),
                reactionHistory: reactionSessionHistory.map((session) => serializeReactionSession(session)),
            });
        }
    }

    broadcast({
        type: "board-reactions",
        reactionSession: serializeReactionSession(currentReactionSession),
        reactionHistory: reactionSessionHistory.map((session) => serializeReactionSession(session)),
    }, clientId || null);
}

function deleteReactionHistoryByIds(ids) {
    const targetIds = new Set((Array.isArray(ids) ? ids : []).map((id) => String(id)));
    if (targetIds.size === 0) return;
    reactionSessionHistory = reactionSessionHistory.filter((session) => !targetIds.has(String(session.id)));
    persistState();
}

function deleteBoardHistoryByIds(ids) {
    const targetIds = new Set((Array.isArray(ids) ? ids : []).map((id) => String(id)));
    if (targetIds.size === 0) return;
    boardSessionHistory = boardSessionHistory.filter((session) => !targetIds.has(String(session.id)));
    persistState();
}

function deleteBoardMessage(sessionId, messageId) {
    const normalizedSessionId = String(sessionId || "");
    const normalizedMessageId = String(messageId || "");
    if (!normalizedSessionId || !normalizedMessageId) return false;

    if (String(currentBoardSession?.id || "") === normalizedSessionId) {
        const beforeCount = currentBoardSession.messages.length;
        currentBoardSession.messages = currentBoardSession.messages.filter((item) => String(item.id) !== normalizedMessageId);
        if (currentBoardSession.messages.length !== beforeCount) persistState();
        return currentBoardSession.messages.length !== beforeCount;
    }

    const session = boardSessionHistory.find((item) => String(item.id) === normalizedSessionId);
    if (!session) return false;
    const beforeCount = session.messages.length;
    session.messages = session.messages.filter((item) => String(item.id) !== normalizedMessageId);
    if (session.messages.length !== beforeCount) persistState();
    return session.messages.length !== beforeCount;
}

loadPersistedState();

function handleDisconnect(clientId) {
    const client = clients.get(clientId);
    if (!client) return;

    clients.delete(clientId);
    if (currentReactionSession?.clientReactions.has(clientId)) {
        currentReactionSession.clientReactions.delete(clientId);
        notifyReactions();
    }

    if (activeBroadcast?.broadcasterId === clientId) {
        broadcast({
            type: "broadcast-ended",
            reason: "broadcaster_disconnected",
        }, clientId);
        activeBroadcast = null;
        notifyBroadcastUpdate();
        return;
    }

    if (activeBroadcast?.viewerIds.has(clientId)) {
        activeBroadcast.viewerIds.delete(clientId);
        const broadcaster = clients.get(activeBroadcast.broadcasterId);
        if (broadcaster) {
            safeSend(broadcaster.ws, {
                type: "viewer-left",
                viewerId: clientId,
            });
        }
        notifyBroadcastUpdate();
    }
}

wss.on("connection", (ws) => {
    const clientId = String(nextClientId++);
    clients.set(clientId, {
        ws,
        role: "viewer",
        address: "",
        displayName: "",
        canBroadcast: false,
        lastHeartbeatAt: Date.now(),
    });

    safeSend(ws, {
        type: "welcome",
        clientId,
        activeBroadcast: getBroadcastSnapshot(),
        boardState: getBoardState(clientId),
    });

    ws.on("message", (raw) => {
        let message;

        try {
            message = JSON.parse(raw.toString());
        } catch (error) {
            safeSend(ws, {
                type: "error",
                code: "bad_json",
            });
            return;
        }

        const client = clients.get(clientId);
        if (!client) return;

        switch (message.type) {
        case "register":
            client.role = message.role || "viewer";
            client.address = message.address || "";
            client.displayName = message.displayName || "";
            client.canBroadcast = Boolean(message.canBroadcast);
            client.lastHeartbeatAt = Date.now();
            sendPresence(clientId);
            break;

        case "chat-message": {
            const moderation = moderateMessage(message.text);
            if (moderation.blocked) {
                safeSend(ws, {
                    type: "message-blocked",
                    reason: moderation.reason,
                });
                return;
            }

            const nextMessage = {
                id: message.id || `${Date.now()}_${clientId}`,
                text: message.text || "",
                amount: Number(message.amount || 0),
                chatType: message.chatType || "normal",
                timestamp: message.timestamp || new Date().toLocaleTimeString("ja-JP"),
                user: message.isAnonymous ? "匿名質問" : (message.user || client.displayName || getDisplayName(client)),
                messageKind: message.messageKind || (message.isQuestion ? "question" : "comment"),
                isQuestion: Boolean(message.isQuestion),
                isAnonymous: Boolean(message.isAnonymous),
                likedBy: new Set(),
                senderAddress: message.senderAddress || client.address || "",
            };

            currentBoardSession.messages.push(nextMessage);
            if (currentBoardSession.messages.length > MAX_BOARD_MESSAGES) {
                currentBoardSession.messages.splice(0, currentBoardSession.messages.length - MAX_BOARD_MESSAGES);
            }
            persistState();

            broadcast({
                type: "chat-message",
                message: serializeBoardMessage(nextMessage),
            });
            client.lastHeartbeatAt = Date.now();
            break;
        }

        case "board-question-like": {
            const target = currentBoardSession.messages.find((item) => item.id === message.messageId && item.isQuestion);
            if (!target) return;
            if (target.likedBy.has(clientId)) return;
            target.likedBy.add(clientId);
            broadcast({
                type: "board-message-updated",
                message: serializeBoardMessage(target),
            });
            client.lastHeartbeatAt = Date.now();
            break;
        }

        case "board-reaction":
            if (!REACTION_KEYS.includes(message.reaction)) return;
            currentReactionSession.clientReactions.set(clientId, message.reaction);
            persistState();
            notifyReactions(clientId);
            client.lastHeartbeatAt = Date.now();
            break;

        case "board-reset-reactions":
            if (client.role !== "staff") return;
            currentReactionSession.clientReactions.clear();
            persistState();
            notifyReactions();
            client.lastHeartbeatAt = Date.now();
            break;

        case "board-start-reaction-session":
            if (client.role !== "staff") return;
            archiveCurrentReactionSession();
            currentReactionSession = createReactionSession(message.label || "");
            persistState();
            notifyReactions();
            client.lastHeartbeatAt = Date.now();
            break;

        case "board-start-chat-session":
            if (client.role !== "staff") return;
            archiveCurrentBoardSession();
            currentBoardSession = createBoardSession(message.label || "");
            persistState();
            broadcast({
                type: "board-session-updated",
                boardSession: serializeBoardSession(currentBoardSession),
                boardSessionHistory: boardSessionHistory.map((session) => serializeBoardSession(session)),
                messages: [],
            });
            client.lastHeartbeatAt = Date.now();
            break;

        case "board-delete-reaction-history":
            if (client.role !== "staff") return;
            deleteReactionHistoryByIds(message.sessionIds);
            notifyReactions();
            client.lastHeartbeatAt = Date.now();
            break;

        case "board-delete-chat-history":
            if (client.role !== "staff") return;
            deleteBoardHistoryByIds(message.sessionIds);
            broadcast({
                type: "board-session-updated",
                boardSession: serializeBoardSession(currentBoardSession),
                boardSessionHistory: boardSessionHistory.map((session) => serializeBoardSession(session)),
            });
            client.lastHeartbeatAt = Date.now();
            break;

        case "board-delete-message":
            if (client.role !== "staff") return;
            if (!deleteBoardMessage(message.sessionId, message.messageId)) return;
            broadcast({
                type: "board-message-deleted",
                sessionId: String(message.sessionId || ""),
                messageId: String(message.messageId || ""),
            });
            client.lastHeartbeatAt = Date.now();
            break;

        case "board-view-session":
            safeSend(ws, {
                type: "board-session-messages",
                sessionId: String(message.sessionId || ""),
                messages: getSessionMessages(message.sessionId).map(serializeBoardMessage),
            });
            client.lastHeartbeatAt = Date.now();
            break;

        case "board-pin-notice":
            if (client.role !== "staff") return;
            pinnedNotice = {
                id: `notice_${Date.now()}`,
                text: String(message.text || "").trim(),
                user: client.displayName || getDisplayName(client),
                timestamp: new Date().toLocaleTimeString("ja-JP"),
            };
            persistState();
            notifyPinnedNotice();
            client.lastHeartbeatAt = Date.now();
            break;

        case "board-clear-pinned-notice":
            if (client.role !== "staff") return;
            pinnedNotice = null;
            persistState();
            notifyPinnedNotice();
            client.lastHeartbeatAt = Date.now();
            break;

        case "start-broadcast":
            if (!client.canBroadcast) {
                safeSend(ws, {
                    type: "error",
                    code: "forbidden_broadcast",
                });
                return;
            }
            if (activeBroadcast && activeBroadcast.broadcasterId !== clientId) {
                safeSend(ws, {
                    type: "broadcast-rejected",
                    reason: "already_active",
                    activeBroadcast: getBroadcastSnapshot(),
                });
                return;
            }

            activeBroadcast = {
                broadcasterId: clientId,
                broadcasterAddress: client.address,
                broadcasterName: message.broadcasterName || client.displayName || getDisplayName(client),
                broadcasterRole: message.broadcasterRole || "Teacher / TA",
                outputType: message.outputType || "camera",
                startedAt: message.startedAt || new Date().toISOString(),
                viewerIds: new Set(),
            };
            notifyBroadcastUpdate();
            break;

        case "stop-broadcast":
            if (activeBroadcast?.broadcasterId !== clientId) return;
            broadcast({
                type: "broadcast-ended",
                reason: "stopped",
            }, clientId);
            activeBroadcast = null;
            notifyBroadcastUpdate();
            break;

        case "viewer-ready":
            if (!activeBroadcast) {
                safeSend(ws, {
                    type: "broadcast-ended",
                    reason: "no_active_broadcast",
                });
                return;
            }
            if (activeBroadcast.broadcasterId === clientId) return;
            activeBroadcast.viewerIds.add(clientId);
            client.lastHeartbeatAt = Date.now();
            {
                const broadcaster = clients.get(activeBroadcast.broadcasterId);
                if (broadcaster) {
                    safeSend(broadcaster.ws, {
                        type: "viewer-joined",
                        viewerId: clientId,
                    });
                }
            }
            notifyBroadcastUpdate();
            break;

        case "signal-offer":
        case "signal-answer":
        case "signal-ice": {
            const target = clients.get(message.targetId);
            if (!target) return;
            safeSend(target.ws, {
                ...message,
                fromId: clientId,
            });
            break;
        }

        case "heartbeat":
            client.lastHeartbeatAt = Date.now();
            safeSend(ws, {
                type: "heartbeat-ack",
                now: client.lastHeartbeatAt,
            });
            break;

        default:
            safeSend(ws, {
                type: "error",
                code: "unknown_message_type",
            });
        }
    });

    ws.on("close", () => {
        handleDisconnect(clientId);
    });

    ws.on("error", () => {
        handleDisconnect(clientId);
    });
});

server.listen(PORT, () => {
    console.log(`Live signal server listening on http://localhost:${PORT}`);
});

setInterval(() => {
    const now = Date.now();
    for (const [clientId, client] of clients.entries()) {
        if (now - (client.lastHeartbeatAt || 0) <= HEARTBEAT_TIMEOUT_MS) continue;
        try {
            client.ws.terminate();
        } catch (error) {
            handleDisconnect(clientId);
        }
    }
}, 30 * 1000);
