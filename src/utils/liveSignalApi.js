const DELETED_QUIZ_STORAGE_KEY = "web3_quiz_deleted_quizzes_v1";

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

function normalizeDeletedQuizKey(quizKey = "") {
    const [sourceAddress = "", quizId = ""] = String(quizKey || "").split(":");
    return `${sourceAddress.toLowerCase()}:${quizId}`;
}

function normalizeDeletedQuizMap(rawMap = {}) {
    const normalized = {};
    Object.entries(rawMap || {}).forEach(([quizKey, value]) => {
        const normalizedKey = normalizeDeletedQuizKey(quizKey);
        if (!normalizedKey || normalizedKey === ":") return;
        normalized[normalizedKey] = {
            ...(value || {}),
            sourceAddress: String(value?.sourceAddress || normalizedKey.split(":")[0] || "").toLowerCase(),
            quizId: value?.quizId ?? Number(normalizedKey.split(":")[1]),
        };
    });
    return normalized;
}

function readDeletedQuizCache() {
    try {
        if (typeof localStorage === "undefined") return {};
        const raw = localStorage.getItem(DELETED_QUIZ_STORAGE_KEY);
        return normalizeDeletedQuizMap(raw ? JSON.parse(raw) : {});
    } catch (error) {
        console.error("Failed to read deleted quiz cache", error);
        return {};
    }
}

function writeDeletedQuizCache(nextMap = {}) {
    try {
        if (typeof localStorage === "undefined") return;
        localStorage.setItem(DELETED_QUIZ_STORAGE_KEY, JSON.stringify(normalizeDeletedQuizMap(nextMap)));
    } catch (error) {
        console.error("Failed to write deleted quiz cache", error);
    }
}

function mergeDeletedQuizMaps(baseMap = {}, nextMap = {}) {
    return normalizeDeletedQuizMap({
        ...normalizeDeletedQuizMap(baseMap),
        ...normalizeDeletedQuizMap(nextMap),
    });
}

function getPendingDeletedQuizMap(rawMap = {}) {
    const pendingMap = {};
    Object.entries(normalizeDeletedQuizMap(rawMap)).forEach(([quizKey, value]) => {
        if (value?.pendingSync) {
            pendingMap[quizKey] = value;
        }
    });
    return pendingMap;
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

async function getDeletedQuizzes() {
    const cachedMap = readDeletedQuizCache();
    try {
        const response = await fetchLiveSignalJson("/deleted-quizzes");
        const mergedMap = mergeDeletedQuizMaps(response?.deletedQuizzes || {}, getPendingDeletedQuizMap(cachedMap));
        writeDeletedQuizCache(mergedMap);
        return mergedMap;
    } catch (error) {
        console.error("Failed to fetch deleted quizzes from server", error);
        return cachedMap;
    }
}

async function saveDeletedQuiz(quizKey, payload = {}) {
    const normalizedKey = normalizeDeletedQuizKey(quizKey);
    const localMap = mergeDeletedQuizMaps(readDeletedQuizCache(), {
        [normalizedKey]: {
            ...payload,
            deletedAt: payload?.deletedAt || new Date().toISOString(),
            pendingSync: true,
        },
    });
    writeDeletedQuizCache(localMap);

    try {
        const response = await fetchLiveSignalJson("/deleted-quizzes", {
            method: "POST",
            body: JSON.stringify({
                quizKey: normalizedKey,
                payload,
            }),
        });
        const mergedMap = mergeDeletedQuizMaps(response?.deletedQuizzes || {}, getPendingDeletedQuizMap(localMap));
        if (mergedMap[normalizedKey]) {
            delete mergedMap[normalizedKey].pendingSync;
        }
        writeDeletedQuizCache(mergedMap);
        return { ...response, deletedQuizzes: mergedMap };
    } catch (error) {
        console.error("Failed to save deleted quiz to server", error);
        return { ok: false, offline: true, deletedQuizzes: localMap };
    }
}

async function removeDeletedQuiz(quizKey) {
    const normalizedKey = normalizeDeletedQuizKey(quizKey);
    const localMap = readDeletedQuizCache();
    delete localMap[normalizedKey];
    writeDeletedQuizCache(localMap);

    try {
        const response = await fetchLiveSignalJson("/deleted-quizzes", {
            method: "POST",
            body: JSON.stringify({
                quizKey: normalizedKey,
                remove: true,
            }),
        });
        const serverMap = mergeDeletedQuizMaps(response?.deletedQuizzes || {}, getPendingDeletedQuizMap(localMap));
        delete serverMap[normalizedKey];
        writeDeletedQuizCache(serverMap);
        return { ...response, deletedQuizzes: serverMap };
    } catch (error) {
        console.error("Failed to remove deleted quiz from server", error);
        return { ok: false, offline: true, deletedQuizzes: localMap };
    }
}

export {
    getLiveSignalApiBaseUrl,
    fetchLiveSignalJson,
    getDeletedQuizzes,
    saveDeletedQuiz,
    removeDeletedQuiz,
    normalizeDeletedQuizKey,
};
