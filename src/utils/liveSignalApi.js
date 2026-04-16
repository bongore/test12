function getLiveSignalApiBaseUrl() {
    const configuredUrl = process.env.REACT_APP_LIVE_SIGNAL_URL || "";
    if (configuredUrl.startsWith("wss://")) return configuredUrl.replace("wss://", "https://");
    if (configuredUrl.startsWith("ws://")) return configuredUrl.replace("ws://", "http://");

    if (typeof window !== "undefined") {
        const protocol = window.location.protocol === "https:" ? "https:" : "http:";
        const hostname = window.location.hostname || "localhost";
        return `${protocol}//${hostname}:3001`;
    }

    return "http://localhost:3001";
}

async function fetchLiveSignalJson(path, options = {}) {
    const response = await fetch(`${getLiveSignalApiBaseUrl()}${path}`, {
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {}),
        },
        ...options,
    });

    if (!response.ok) {
        throw new Error(`live_signal_http_${response.status}`);
    }

    return await response.json();
}

export { getLiveSignalApiBaseUrl, fetchLiveSignalJson };
