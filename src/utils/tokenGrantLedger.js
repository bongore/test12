import { fetchLiveSignalJson } from "./liveSignalApi";

const STORAGE_KEY = "web3_quiz_token_grant_ledger_v1";

const TOKEN_GRANT_KEYS = {
    POL: "answer_pol",
    TFT: "answer_thanks_tft",
    TTT: "board_ttt",
};

function readGrantLedger() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
        console.error("Failed to read token grant ledger", error);
        return {};
    }
}

function writeGrantLedger(nextLedger) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextLedger));
}

function normalizeAddress(address) {
    return String(address || "").toLowerCase();
}

function getAddressGrantStatus(address) {
    const ledger = readGrantLedger();
    return ledger[normalizeAddress(address)] || {};
}

function mergeGrantLedger(baseLedger = {}, nextLedger = {}) {
    const merged = { ...(baseLedger || {}) };

    Object.entries(nextLedger || {}).forEach(([address, status]) => {
        const normalizedAddress = normalizeAddress(address);
        const currentStatus = merged[normalizedAddress] || {};
        const nextStatus = status && typeof status === "object" ? status : {};

        merged[normalizedAddress] = {
            ...currentStatus,
            ...nextStatus,
            [TOKEN_GRANT_KEYS.POL]: nextStatus[TOKEN_GRANT_KEYS.POL] || currentStatus[TOKEN_GRANT_KEYS.POL] || null,
            [TOKEN_GRANT_KEYS.TFT]: nextStatus[TOKEN_GRANT_KEYS.TFT] || currentStatus[TOKEN_GRANT_KEYS.TFT] || null,
            [TOKEN_GRANT_KEYS.TTT]: nextStatus[TOKEN_GRANT_KEYS.TTT] || currentStatus[TOKEN_GRANT_KEYS.TTT] || null,
        };
    });

    return merged;
}

async function syncGrantLedgerFromServer() {
    const localLedger = readGrantLedger();
    const response = await fetchLiveSignalJson("/token-grants", { method: "GET" });
    const serverLedger = response?.ledger && typeof response.ledger === "object" ? response.ledger : {};
    const ledger = mergeGrantLedger(localLedger, serverLedger);
    writeGrantLedger(ledger);
    return ledger;
}

async function persistGrantRecordToServer(address, assetKey, payload = {}) {
    const response = await fetchLiveSignalJson("/token-grants", {
        method: "POST",
        body: JSON.stringify({
            address: normalizeAddress(address),
            assetKey,
            payload,
        }),
    });
    const serverLedger = response?.ledger && typeof response.ledger === "object" ? response.ledger : {};
    const ledger = mergeGrantLedger(readGrantLedger(), serverLedger);
    writeGrantLedger(ledger);
    return ledger;
}

function hasGrantedToken(address, assetKey) {
    const status = getAddressGrantStatus(address);
    return Boolean(status?.[assetKey]?.confirmed && status?.[assetKey]?.grantedAt);
}

function markGrantedToken(address, assetKey, payload = {}) {
    const ledger = readGrantLedger();
    const normalizedAddress = normalizeAddress(address);
    const current = ledger[normalizedAddress] || {};

    ledger[normalizedAddress] = {
        ...current,
        [assetKey]: {
            grantedAt: new Date().toISOString(),
            amount: payload.amount ?? null,
            txHash: payload.txHash || "",
            source: payload.source || "",
            confirmed: payload.confirmed !== false,
        },
    };

    writeGrantLedger(ledger);
    return ledger[normalizedAddress];
}

function getGrantLedgerEntries() {
    const ledger = readGrantLedger();
    return Object.entries(ledger).map(([address, status]) => ({
        address,
        status: status || {},
    }));
}

export {
    TOKEN_GRANT_KEYS,
    readGrantLedger,
    getAddressGrantStatus,
    hasGrantedToken,
    markGrantedToken,
    getGrantLedgerEntries,
    syncGrantLedgerFromServer,
    persistGrantRecordToServer,
    mergeGrantLedger,
};
