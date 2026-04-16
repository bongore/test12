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

function hasGrantedToken(address, assetKey) {
    const status = getAddressGrantStatus(address);
    return Boolean(status?.[assetKey]?.grantedAt);
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
};
