import React, { useEffect, useRef, useState } from "react";
import { FaComment, FaCommentSlash } from "react-icons/fa";
import Chat_feed from "./components/chat_feed";
import Chat_input from "./components/chat_input";
import "./live.css";
import { ACTION_TYPES, appendActivityLog, logPageView } from "../../utils/activityLog";
import { useAccessControl } from "../../utils/accessControl";
import {
    appendLiveBroadcastHistory,
    clearLiveBroadcastState,
    setLiveBroadcastState,
} from "../../utils/liveBroadcast";

const DUMMY_COMMENTS = [
    "この説明、かなり分かりやすいです。",
    "もう一度その手順を見せてください。",
    "配信が見えています。",
    "接続できました。",
    "ありがとうございます。",
    "音声も確認できています。",
];

const ICE_SERVERS = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
    ],
};

function getSignalServerUrl() {
    if (process.env.REACT_APP_LIVE_SIGNAL_URL) {
        return process.env.REACT_APP_LIVE_SIGNAL_URL;
    }
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const hostname = window.location.hostname || "localhost";
    return `${protocol}//${hostname}:3001`;
}

function getSignalHealthUrl() {
    const wsUrl = getSignalServerUrl();
    if (wsUrl.startsWith("wss://")) {
        return wsUrl.replace("wss://", "https://");
    }
    if (wsUrl.startsWith("ws://")) {
        return wsUrl.replace("ws://", "http://");
    }
    return wsUrl;
}

function wait(ms) {
    return new Promise((resolve) => {
        window.setTimeout(resolve, ms);
    });
}

async function wakeSignalServer() {
    const healthUrl = getSignalHealthUrl();
    let lastError = null;

    for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
            const response = await fetch(healthUrl, {
                method: "GET",
                cache: "no-store",
                mode: "cors",
            });
            if (response.ok) {
                return true;
            }
            lastError = new Error(`healthcheck_failed_${response.status}`);
        } catch (error) {
            lastError = error;
        }

        await wait(4000);
    }

    throw lastError || new Error("signal_server_unavailable");
}

function toStoredLiveState(snapshot) {
    if (!snapshot) return null;
    return {
        sessionId: snapshot.broadcasterId,
        isActive: true,
        startedAt: snapshot.startedAt,
        heartbeatAt: new Date().toISOString(),
        broadcasterAddress: snapshot.broadcasterAddress,
        broadcasterRole: snapshot.broadcasterRole,
        outputType: snapshot.outputType,
        viewerCount: snapshot.viewerCount || 0,
    };
}

function Live_page(props) {
    const [messages, setMessages] = useState([]);
    const [dummyCommentsEnabled, setDummyCommentsEnabled] = useState(false);
    const [isChatVisible, setIsChatVisible] = useState(true);
    const [pinnedSuperchat, setPinnedSuperchat] = useState(null);
    const [liveState, setLiveState] = useState(null);
    const [isBroadcasting, setIsBroadcasting] = useState(false);
    const [signalStatus, setSignalStatus] = useState("connecting");
    const [liveNotice, setLiveNotice] = useState("");
    const [cameraFacingMode, setCameraFacingMode] = useState("user");
    const [cameraDevices, setCameraDevices] = useState([]);
    const [activeCameraId, setActiveCameraId] = useState("");
    const [remoteConnected, setRemoteConnected] = useState(false);
    const [outputMode] = useState("camera");
    const videoRef = useRef(null);
    const localStreamRef = useRef(null);
    const remoteStreamRef = useRef(null);
    const wsRef = useRef(null);
    const peersRef = useRef({});
    const viewerPeerRef = useRef(null);
    const pinTimeoutRef = useRef(null);
    const currentSessionRef = useRef(null);
    const isBroadcastingRef = useRef(false);
    const clientIdRef = useRef("");
    const subscribedBroadcastIdRef = useRef("");
    const access = useAccessControl(props.cont);

    const activeBroadcaster = liveState && liveState.isActive ? liveState : null;
    const canViewLive = access.canViewLive;
    const canPostChat = access.canJoinLive;
    const isAdmin = access.isTeacher;
    const isLockedByOtherStaff = Boolean(
        activeBroadcaster
        && access.address
        && activeBroadcaster.broadcasterAddress?.toLowerCase() !== access.address.toLowerCase()
    );

    const setDisplayedStream = (stream) => {
        if (!videoRef.current) return;

        const videoElement = videoRef.current;
        videoElement.srcObject = stream || null;

        if (!stream) return;

        const tryPlay = () => {
            videoElement.play?.().catch((error) => {
                console.warn("Live video playback was blocked", error);
            });
        };

        videoElement.onloadedmetadata = tryPlay;
        tryPlay();
    };

    const createChatMessage = (text, type = "normal", amount = 0, user = "viewer") => ({
        id: Date.now(),
        text,
        type,
        amount,
        timestamp: new Date().toLocaleTimeString(),
        user,
    });

    const sendSocketMessage = (payload) => {
        const socket = wsRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) return false;
        socket.send(JSON.stringify(payload));
        return true;
    };

    const closePeer = (peer) => {
        if (!peer) return;
        peer.onicecandidate = null;
        peer.ontrack = null;
        peer.onconnectionstatechange = null;
        peer.close();
    };

    const closeBroadcasterPeers = () => {
        Object.values(peersRef.current).forEach(closePeer);
        peersRef.current = {};
    };

    const closeViewerPeer = () => {
        if (viewerPeerRef.current) {
            closePeer(viewerPeerRef.current);
            viewerPeerRef.current = null;
        }
        if (remoteStreamRef.current) {
            remoteStreamRef.current.getTracks().forEach((track) => track.stop());
            remoteStreamRef.current = null;
        }
        setRemoteConnected(false);
    };

    const refreshCameraDevices = async () => {
        if (!navigator.mediaDevices?.enumerateDevices) return [];
        const devices = await navigator.mediaDevices.enumerateDevices();
        const list = devices.filter((device) => device.kind === "videoinput");
        setCameraDevices(list);
        return list;
    };

    const getCameraStream = async (facingMode, preferredCameraId = "") => {
        const attempts = [];

        if (preferredCameraId) {
            attempts.push({
                video: { deviceId: { exact: preferredCameraId } },
                audio: true,
            });
        }

        attempts.push({
            video: { facingMode: { ideal: facingMode } },
            audio: true,
        });
        attempts.push({ video: true, audio: true });
        attempts.push({ video: true, audio: false });

        let lastError = null;
        for (const constraints of attempts) {
            try {
                return await navigator.mediaDevices.getUserMedia(constraints);
            } catch (error) {
                lastError = error;
            }
        }
        throw lastError || new Error("camera_stream_unavailable");
    };

    const syncBroadcastSnapshot = (snapshot) => {
        if (!snapshot) {
            setLiveState(null);
            clearLiveBroadcastState();
            return;
        }
        const nextState = toStoredLiveState(snapshot);
        setLiveState(nextState);
        setLiveBroadcastState(nextState);
    };

    const finalizeBroadcast = () => {
        const session = currentSessionRef.current;
        if (!session) return;

        const endedAt = new Date().toISOString();
        const durationMs = Date.now() - new Date(session.startedAt).getTime();
        appendLiveBroadcastHistory({
            id: session.sessionId,
            broadcasterAddress: session.broadcasterAddress,
            broadcasterRole: session.broadcasterRole,
            startedAt: session.startedAt,
            endedAt,
            durationMs,
            outputType: session.outputType,
        });

        clearLiveBroadcastState();
        currentSessionRef.current = null;
        setLiveState(null);
        setIsBroadcasting(false);
        setLiveNotice("");
        appendActivityLog(ACTION_TYPES.LIVE_CAMERA_STOPPED, {
            page: "live",
            sessionId: session.sessionId,
            durationMs,
        });
    };

    const stopBroadcast = (reason = "stopped") => {
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach((track) => track.stop());
            localStreamRef.current = null;
        }
        closeBroadcasterPeers();
        closeViewerPeer();
        setDisplayedStream(null);
        if (currentSessionRef.current) {
            sendSocketMessage({ type: "stop-broadcast", reason });
        }
        finalizeBroadcast();
    };

    const createPeerForViewer = async (viewerId) => {
        if (!localStreamRef.current) return;
        const peer = new RTCPeerConnection(ICE_SERVERS);
        peersRef.current[viewerId] = peer;

        localStreamRef.current.getTracks().forEach((track) => {
            peer.addTrack(track, localStreamRef.current);
        });

        peer.onicecandidate = (event) => {
            if (!event.candidate) return;
            sendSocketMessage({ type: "signal-ice", targetId: viewerId, candidate: event.candidate });
        };

        peer.onconnectionstatechange = () => {
            if (["failed", "closed", "disconnected"].includes(peer.connectionState)) {
                closePeer(peer);
                delete peersRef.current[viewerId];
            }
        };

        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        sendSocketMessage({
            type: "signal-offer",
            targetId: viewerId,
            description: peer.localDescription,
        });
    };

    const handleIncomingOffer = async (message) => {
        if (isBroadcastingRef.current) return;

        closeViewerPeer();
        const peer = new RTCPeerConnection(ICE_SERVERS);
        viewerPeerRef.current = peer;
        const inboundStream = new MediaStream();
        remoteStreamRef.current = inboundStream;
        setDisplayedStream(inboundStream);

        peer.ontrack = (event) => {
            event.streams[0].getTracks().forEach((track) => inboundStream.addTrack(track));
            setRemoteConnected(true);
        };

        peer.onicecandidate = (event) => {
            if (!event.candidate) return;
            sendSocketMessage({ type: "signal-ice", targetId: message.fromId, candidate: event.candidate });
        };

        peer.onconnectionstatechange = () => {
            if (peer.connectionState === "connected") {
                setRemoteConnected(true);
                setLiveNotice("配信中の映像を受信しています。");
            }
            if (["failed", "closed", "disconnected"].includes(peer.connectionState)) {
                setRemoteConnected(false);
            }
        };

        await peer.setRemoteDescription(new RTCSessionDescription(message.description));
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        sendSocketMessage({
            type: "signal-answer",
            targetId: message.fromId,
            description: peer.localDescription,
        });
    };

    const startBroadcast = async () => {
        appendActivityLog(ACTION_TYPES.LIVE_CAMERA_TOGGLE_CLICKED, {
            page: "live",
            currentState: isBroadcasting ? "on" : "off",
            outputType: "camera",
        });

        if (!isAdmin) {
            alert("配信開始は先生またはTAのみ実行できます。");
            return;
        }
        if (isLockedByOtherStaff) {
            alert("現在は別の先生またはTAが配信中です。配信終了後に開始してください。");
            return;
        }
        if (!navigator.mediaDevices) {
            alert("このブラウザはライブ配信に必要なメディアAPIに対応していません。");
            return;
        }
        if (signalStatus !== "connected") {
            alert("ライブ配信サーバーに接続できていません。少し待ってから再度お試しください。");
            return;
        }

        try {
            closeBroadcasterPeers();
            closeViewerPeer();

            const stream = await getCameraStream(cameraFacingMode, activeCameraId);
            const startedAt = new Date().toISOString();
            const session = {
                sessionId: `live_${Date.now()}`,
                startedAt,
                broadcasterAddress: access.address,
                broadcasterRole: "Teacher / TA",
                outputType: "camera",
            };

            localStreamRef.current = stream;
            currentSessionRef.current = session;
            setDisplayedStream(stream);
            setIsBroadcasting(true);
            setLiveNotice("カメラ映像を配信中です。");
            setRemoteConnected(false);

            const videoTrack = stream.getVideoTracks()[0];
            const selectedSettings = videoTrack?.getSettings?.() || {};
            if (selectedSettings.deviceId) {
                setActiveCameraId(selectedSettings.deviceId);
            }
            await refreshCameraDevices();

            stream.getVideoTracks().forEach((track) => {
                track.onended = () => stopBroadcast("track_ended");
            });

            sendSocketMessage({
                type: "start-broadcast",
                startedAt,
                broadcasterRole: session.broadcasterRole,
                outputType: "camera",
            });

            syncBroadcastSnapshot({
                broadcasterId: clientIdRef.current || session.sessionId,
                broadcasterAddress: access.address,
                broadcasterRole: session.broadcasterRole,
                outputType: "camera",
                startedAt,
                viewerCount: 0,
            });
        } catch (error) {
            console.error("Failed to start live output", error);
            appendActivityLog(ACTION_TYPES.LIVE_CAMERA_FAILED, {
                page: "live",
                reason: error?.name || "stream_start_failed",
                errorMessage: error?.message || "",
            });
            alert(`配信の開始に失敗しました。詳細: ${error?.name || "UnknownError"}${error?.message ? ` / ${error.message}` : ""}`);
        }
    };

    const switchCamera = async () => {
        const nextFacingMode = cameraFacingMode === "user" ? "environment" : "user";
        if (!isBroadcasting || !localStreamRef.current) {
            setCameraFacingMode(nextFacingMode);
            return;
        }

        try {
            const knownDevices = cameraDevices.length ? cameraDevices : await refreshCameraDevices();
            const currentIndex = knownDevices.findIndex((device) => device.deviceId === activeCameraId);
            const nextDevice = knownDevices.length > 1
                ? knownDevices[(currentIndex + 1 + knownDevices.length) % knownDevices.length]
                : null;

            const nextStream = await getCameraStream(nextFacingMode, nextDevice?.deviceId || "");
            const previousStream = localStreamRef.current;
            const nextVideoTrack = nextStream.getVideoTracks()[0];
            const nextAudioTrack = nextStream.getAudioTracks()[0];

            Object.values(peersRef.current).forEach((peer) => {
                peer.getSenders().forEach((sender) => {
                    if (sender.track?.kind === "video" && nextVideoTrack) sender.replaceTrack(nextVideoTrack);
                    if (sender.track?.kind === "audio" && nextAudioTrack) sender.replaceTrack(nextAudioTrack);
                });
            });

            nextStream.getVideoTracks().forEach((track) => {
                track.onended = () => stopBroadcast("track_ended");
            });

            localStreamRef.current = nextStream;
            setDisplayedStream(nextStream);
            setCameraFacingMode(nextFacingMode);
            setLiveNotice(nextFacingMode === "user" ? "内カメラに切り替えました。" : "外カメラに切り替えました。");

            const selectedSettings = nextVideoTrack?.getSettings?.() || {};
            setActiveCameraId(selectedSettings.deviceId || nextDevice?.deviceId || "");
            await refreshCameraDevices();
            previousStream.getTracks().forEach((track) => track.stop());
        } catch (error) {
            console.error("Failed to switch camera", error);
            alert(`カメラの切り替えに失敗しました。詳細: ${error?.name || "UnknownError"}${error?.message ? ` / ${error.message}` : ""}`);
        }
    };

    const handleToggleDummyComments = () => setDummyCommentsEnabled((current) => !current);

    const publishChatMessage = (text, type = "normal", amount = 0, userLabel = "") => {
        const fallbackMessage = createChatMessage(
            text,
            type,
            amount,
            userLabel || (access.address ? `${access.address.slice(0, 6)}...${access.address.slice(-4)}` : "guest")
        );

        const sent = sendSocketMessage({
            type: "chat-message",
            id: fallbackMessage.id,
            text,
            amount,
            chatType: type,
            timestamp: fallbackMessage.timestamp,
            user: fallbackMessage.user,
        });

        if (!sent) {
            setMessages((prev) => [...prev.slice(-119), fallbackMessage]);
            if (type === "superchat") {
                if (pinTimeoutRef.current) clearTimeout(pinTimeoutRef.current);
                setPinnedSuperchat(fallbackMessage);
                pinTimeoutRef.current = setTimeout(() => setPinnedSuperchat(null), 15000);
            }
        }
    };

    const handleSendMessage = (text, type = "normal", amount = 0) => {
        publishChatMessage(text, type, amount);
    };

    const getSuperchatGradient = (amount) => {
        if (amount >= 1000) return "linear-gradient(135deg, rgba(211,47,47,0.9), rgba(198,40,40,0.95))";
        if (amount >= 500) return "linear-gradient(135deg, rgba(194,24,91,0.9), rgba(173,20,87,0.95))";
        if (amount >= 100) return "linear-gradient(135deg, rgba(230,139,0,0.9), rgba(251,140,0,0.95))";
        if (amount >= 50) return "linear-gradient(135deg, rgba(56,142,60,0.9), rgba(46,125,50,0.95))";
        return "linear-gradient(135deg, rgba(25,118,210,0.9), rgba(21,101,192,0.95))";
    };

    useEffect(() => {
        isBroadcastingRef.current = isBroadcasting;
    }, [isBroadcasting]);

    useEffect(() => {
        logPageView("live", { action: ACTION_TYPES.LIVE_PAGE_VIEWED });
        appendActivityLog(ACTION_TYPES.LIVE_PAGE_VIEWED, { page: "live" });
        let socket = null;
        let heartbeatTimer = null;
        let cancelled = false;

        const initializeSocket = async () => {
            try {
                setSignalStatus("connecting");
                setLiveNotice("ライブ配信サーバーを起動しています。少しお待ちください。");
                await wakeSignalServer();
                if (cancelled) return;

                socket = new WebSocket(getSignalServerUrl());
                wsRef.current = socket;

                socket.onopen = () => {
                    setSignalStatus("connected");
                    setLiveNotice("ライブ配信サーバーに接続しました。");
                    if (!access.isLoading) {
                        socket.send(JSON.stringify({
                            type: "register",
                            address: access.address,
                            role: isAdmin ? "staff" : "viewer",
                            canBroadcast: isAdmin,
                        }));
                    }
                    heartbeatTimer = window.setInterval(() => {
                        if (socket.readyState === WebSocket.OPEN) {
                            socket.send(JSON.stringify({ type: "heartbeat" }));
                        }
                    }, 20000);
                };

                socket.onclose = () => {
                    setSignalStatus("disconnected");
                    setLiveNotice("ライブ配信サーバーとの接続が切れました。");
                    syncBroadcastSnapshot(null);
                    closeViewerPeer();
                    if (currentSessionRef.current) stopBroadcast("signal_disconnected");
                };

                socket.onerror = () => {
                    setSignalStatus("error");
                    setLiveNotice("ライブ配信サーバーに接続できていません。少し待ってから再度お試しください。");
                };

                socket.onmessage = async (event) => {
                    const message = JSON.parse(event.data);

                    switch (message.type) {
            case "welcome":
            case "presence":
                clientIdRef.current = message.clientId;
                syncBroadcastSnapshot(message.activeBroadcast);
                break;
            case "broadcast-state":
                syncBroadcastSnapshot(message.activeBroadcast);
                if (!message.activeBroadcast) {
                    setLiveNotice("現在配信はありません。");
                    closeViewerPeer();
                    if (!isBroadcastingRef.current) setDisplayedStream(null);
                } else if (!isBroadcastingRef.current) {
                    setLiveNotice(`${message.activeBroadcast.broadcasterRole} がカメラ配信を開始しました。`);
                }
                break;
            case "broadcast-ended":
                syncBroadcastSnapshot(null);
                closeViewerPeer();
                if (!isBroadcastingRef.current) {
                    setDisplayedStream(null);
                    setLiveNotice("配信が終了しました。");
                }
                break;
            case "broadcast-rejected":
                syncBroadcastSnapshot(message.activeBroadcast);
                alert("現在は別の先生またはTAが配信中です。");
                break;
            case "viewer-joined":
                if (isBroadcastingRef.current) await createPeerForViewer(message.viewerId);
                break;
            case "viewer-left":
                if (peersRef.current[message.viewerId]) {
                    closePeer(peersRef.current[message.viewerId]);
                    delete peersRef.current[message.viewerId];
                }
                break;
            case "signal-offer":
                await handleIncomingOffer(message);
                break;
            case "signal-answer":
                if (peersRef.current[message.fromId]) {
                    await peersRef.current[message.fromId].setRemoteDescription(new RTCSessionDescription(message.description));
                }
                break;
            case "signal-ice":
                if (message.fromId && peersRef.current[message.fromId]) {
                    await peersRef.current[message.fromId].addIceCandidate(new RTCIceCandidate(message.candidate));
                } else if (viewerPeerRef.current) {
                    await viewerPeerRef.current.addIceCandidate(new RTCIceCandidate(message.candidate));
                }
                break;
            case "chat-message": {
                const nextMessage = {
                    id: message.message.id,
                    text: message.message.text,
                    type: message.message.chatType || "normal",
                    amount: message.message.amount || 0,
                    timestamp: message.message.timestamp,
                    user: message.message.user || "viewer",
                };
                setMessages((prev) => [...prev.slice(-119), nextMessage]);
                if (nextMessage.type === "superchat") {
                    if (pinTimeoutRef.current) clearTimeout(pinTimeoutRef.current);
                    setPinnedSuperchat(nextMessage);
                    pinTimeoutRef.current = setTimeout(() => setPinnedSuperchat(null), 15000);
                }
                break;
            }
            case "heartbeat-ack":
                break;
            default:
                break;
            }
                };
            } catch (error) {
                console.error("Failed to wake live signal server", error);
                if (cancelled) return;
                setSignalStatus("error");
                setLiveNotice("ライブ配信サーバーに接続できていません。少し待ってから再度お試しください。");
            }
        };

        initializeSocket();

        return () => {
            cancelled = true;
            if (heartbeatTimer) window.clearInterval(heartbeatTimer);
            if (pinTimeoutRef.current) clearTimeout(pinTimeoutRef.current);
            stopBroadcast("page_unmount");
            closeBroadcasterPeers();
            closeViewerPeer();
            socket?.close();
            wsRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [access.address, access.isLoading, isAdmin]);

    useEffect(() => {
        if (isBroadcasting && localStreamRef.current) {
            setDisplayedStream(localStreamRef.current);
            return;
        }
        if (remoteConnected && remoteStreamRef.current) {
            setDisplayedStream(remoteStreamRef.current);
        }
    }, [isBroadcasting, remoteConnected]);

    useEffect(() => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || access.isLoading) return;
        sendSocketMessage({
            type: "register",
            address: access.address,
            role: isAdmin ? "staff" : "viewer",
            canBroadcast: isAdmin,
        });
    }, [access.address, access.isLoading, isAdmin]);

    useEffect(() => {
        if (!activeBroadcaster || isBroadcasting || !canViewLive || signalStatus !== "connected") {
            subscribedBroadcastIdRef.current = "";
            return;
        }
        if (activeBroadcaster.sessionId === subscribedBroadcastIdRef.current) return;
        subscribedBroadcastIdRef.current = activeBroadcaster.sessionId;
        sendSocketMessage({ type: "viewer-ready" });
    }, [activeBroadcaster, canViewLive, isBroadcasting, signalStatus]);

    useEffect(() => {
        if (!isAdmin || !dummyCommentsEnabled) return undefined;
        const interval = setInterval(() => {
            const randomComment = DUMMY_COMMENTS[Math.floor(Math.random() * DUMMY_COMMENTS.length)];
            publishChatMessage(
                randomComment,
                "normal",
                0,
                `Dummy_${Math.floor(Math.random() * 1000)}`
            );
        }, 3000);
        return () => clearInterval(interval);
    }, [dummyCommentsEnabled, isAdmin]);

    if (access.isLoading) {
        return <div className="admin-not-authorized">権限を確認しています...</div>;
    }

    if (!canViewLive) {
        return <div className="admin-not-authorized">ライブ機能を表示できません。</div>;
    }

    return (
        <div className="live-page animate-fadeIn">
            <div className="live-container">
                <div className="video-section glass-card">
                    <div className="video-wrapper">
                        {isBroadcasting || remoteConnected ? (
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                muted
                                style={{ width: "100%", height: "100%", objectFit: "cover", backgroundColor: "#000" }}
                            />
                        ) : (
                            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#000", color: "var(--text-tertiary)" }}>
                                <div style={{ textAlign: "center", padding: "24px", maxWidth: "720px" }}>
                                    <h3>{activeBroadcaster ? "配信への接続を待っています" : "現在ライブ配信はありません"}</h3>
                                    <p style={{ marginTop: "12px", color: "rgba(255,255,255,0.85)", lineHeight: 1.8 }}>
                                        {liveNotice || "先生またはTAが配信を開始すると、ここに同じ映像が表示されます。"}
                                    </p>
                                </div>
                            </div>
                        )}

                        {activeBroadcaster && (
                            <div style={{ position: "absolute", left: "16px", top: "16px", zIndex: 10, padding: "10px 14px", borderRadius: "999px", background: "rgba(0,0,0,0.55)", color: "#fff", border: "1px solid rgba(255,255,255,0.18)" }}>
                                配信者: {activeBroadcaster.broadcasterAddress} / 視聴者 {activeBroadcaster.viewerCount || 0} 人
                            </div>
                        )}

                        <div style={{ position: "absolute", left: "16px", bottom: "16px", zIndex: 10, padding: "10px 14px", borderRadius: "16px", background: "rgba(0,0,0,0.45)", color: "#fff", border: "1px solid rgba(255,255,255,0.12)", maxWidth: "min(80vw, 460px)" }}>
                            <div style={{ fontWeight: 700, marginBottom: "4px" }}>
                                接続状態: {signalStatus === "connected" ? "ライブサーバー接続中" : "未接続"}
                            </div>
                            <div style={{ fontSize: "14px", color: "rgba(255,255,255,0.88)" }}>
                                {liveNotice || "配信待機中"}
                            </div>
                        </div>

                        {isAdmin && (
                            <div style={{ position: "absolute", top: "16px", right: "16px", zIndex: 10, display: "flex", gap: "12px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                                <button onClick={handleToggleDummyComments} className={`btn ${dummyCommentsEnabled ? "btn-secondary" : "btn-primary"}`} style={{ padding: "8px 16px", borderRadius: "var(--radius-md)", fontWeight: "bold", boxShadow: "var(--glass-shadow)" }}>
                                    {dummyCommentsEnabled ? "ダミーコメント停止" : "ダミーコメント開始"}
                                </button>
                                <button onClick={startBroadcast} disabled={isBroadcasting || isLockedByOtherStaff} className="btn btn-primary" style={{ padding: "8px 16px", borderRadius: "var(--radius-md)", fontWeight: "bold", boxShadow: "var(--glass-shadow)", opacity: isBroadcasting || isLockedByOtherStaff ? 0.6 : 1 }}>
                                    カメラ配信
                                </button>
                                <button onClick={switchCamera} className="btn btn-secondary" style={{ padding: "8px 16px", borderRadius: "var(--radius-md)", fontWeight: "bold", boxShadow: "var(--glass-shadow)" }}>
                                    {cameraFacingMode === "user" ? "外カメラへ切替" : "内カメラへ切替"}
                                </button>
                                <button onClick={() => stopBroadcast("manual_stop")} disabled={!isBroadcasting} className="btn btn-danger" style={{ padding: "8px 16px", borderRadius: "var(--radius-md)", fontWeight: "bold", boxShadow: "var(--glass-shadow)", opacity: !isBroadcasting ? 0.6 : 1 }}>
                                    配信停止
                                </button>
                            </div>
                        )}

                        <div className="danmaku-container">
                            {messages.map((msg) => (
                                <div
                                    key={`danmaku-${msg.id}`}
                                    className={`danmaku-item ${msg.type === "superchat" ? "superchat-danmaku" : "normal-danmaku"}`}
                                    style={{ top: `${Math.random() * 80}%`, animationDuration: `${msg.type === "superchat" ? 8 : Math.random() * 5 + 4}s` }}
                                >
                                    {msg.text}
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={() => setIsChatVisible((current) => !current)}
                            className="btn glass-card"
                            style={{ position: "absolute", bottom: isChatVisible ? "auto" : "24px", top: isChatVisible ? "64px" : "auto", right: "16px", zIndex: 100, padding: "8px 16px", borderRadius: "var(--radius-full)", background: "rgba(0,0,0,0.5)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", cursor: "pointer", backdropFilter: "blur(10px)", fontSize: "14px", display: "flex", alignItems: "center", gap: "8px", boxShadow: "0 4px 6px rgba(0,0,0,0.3)" }}
                            title="チャット表示を切り替える"
                        >
                            {isChatVisible ? <><FaCommentSlash /> チャットを閉じる</> : <><FaComment /> チャットを開く</>}
                        </button>
                    </div>
                </div>

                {isChatVisible && (
                    <div className="chat-section glass-card">
                        <div className="chat-header">
                            <h3 className="heading-md" style={{ margin: 0 }}>ライブチャット</h3>
                        </div>

                        {pinnedSuperchat && (
                            <div className="pinned-superchat animate-fadeIn" style={{ padding: "12px 16px", margin: "8px 16px 0", borderRadius: "var(--radius-md)", background: getSuperchatGradient(pinnedSuperchat.amount), border: "1px solid rgba(255,255,255,0.4)", color: "#fff", boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)", zIndex: 10, position: "relative" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px", fontWeight: "bold" }}>
                                    <span style={{ fontSize: "14px", color: "rgba(255,255,255,0.9)" }}>{pinnedSuperchat.user}</span>
                                    <span style={{ fontSize: "18px", color: "#FFF" }}>{pinnedSuperchat.amount} TFT</span>
                                </div>
                                <div style={{ fontSize: "15px", fontWeight: "600", textShadow: "1px 1px 2px rgba(0,0,0,0.5)" }}>
                                    {pinnedSuperchat.text}
                                </div>
                            </div>
                        )}

                        <div className="chat-body">
                            <div className="chat-feed-container">
                                <Chat_feed messages={messages} />
                            </div>
                            <div className="chat-input-container">
                                <Chat_input onSendMessage={handleSendMessage} cont={props.cont} isRegistered={canPostChat} isLoadingAuth={access.isLoading} />
                            </div>
                        </div>
                    </div>
                )}
            </div>
            {isBroadcasting && (
                <div style={{ marginTop: "12px", color: "var(--text-secondary)", fontSize: "14px" }}>
                    配信モード: カメラ配信 / {cameraFacingMode === "user" ? "内カメラ" : "外カメラ"}
                </div>
            )}
        </div>
    );
}

export default Live_page;
