const http = require("http");
const WebSocket = require("ws");

const PORT = Number(process.env.PORT || process.env.LIVE_SIGNAL_PORT || 3001);

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
const HEARTBEAT_TIMEOUT_MS = 90 * 1000;

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
        broadcasterRole: activeBroadcast.broadcasterRole,
        outputType: activeBroadcast.outputType,
        startedAt: activeBroadcast.startedAt,
        viewerCount: activeBroadcast.viewerIds.size,
    };
}

function sendPresence(clientId) {
    const client = clients.get(clientId);
    if (!client) return;

    safeSend(client.ws, {
        type: "presence",
        clientId,
        activeBroadcast: getBroadcastSnapshot(),
    });
}

function notifyBroadcastUpdate() {
    broadcast({
        type: "broadcast-state",
        activeBroadcast: getBroadcastSnapshot(),
    });
}

function getDisplayName(client) {
    if (!client) return "viewer";
    if (client.address) {
        return `${client.address.slice(0, 6)}...${client.address.slice(-4)}`;
    }
    return client.role === "staff" ? "teacher" : "guest";
}

function handleDisconnect(clientId) {
    const client = clients.get(clientId);
    if (!client) return;

    clients.delete(clientId);

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
        canBroadcast: false,
        lastHeartbeatAt: Date.now(),
    });

    safeSend(ws, {
        type: "welcome",
        clientId,
        activeBroadcast: getBroadcastSnapshot(),
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
            client.canBroadcast = Boolean(message.canBroadcast);
            client.lastHeartbeatAt = Date.now();
            sendPresence(clientId);
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
            const broadcaster = clients.get(activeBroadcast.broadcasterId);
            if (broadcaster) {
                safeSend(broadcaster.ws, {
                    type: "viewer-joined",
                    viewerId: clientId,
                });
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

        case "chat-message":
            broadcast({
                type: "chat-message",
                message: {
                    id: message.id || `${Date.now()}_${clientId}`,
                    text: message.text || "",
                    amount: Number(message.amount || 0),
                    chatType: message.chatType || "normal",
                    timestamp: message.timestamp || new Date().toLocaleTimeString("ja-JP"),
                    user: message.user || getDisplayName(client),
                    senderId: clientId,
                },
            });
            client.lastHeartbeatAt = Date.now();
            break;

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
