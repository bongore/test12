const STORAGE_KEY = "web3_quiz_batch_answer_queue_v1";
const UPDATE_EVENT = "web3-quiz-batch-answer-queue-updated";

function normalizeAddress(value = "") {
    return String(value || "").trim().toLowerCase();
}

function buildBatchAnswerKey(quizId, sourceAddress = "") {
    return `${normalizeAddress(sourceAddress)}:${Number(quizId)}`;
}

function normalizeQueueItem(item = {}) {
    return {
        key: String(item.key || buildBatchAnswerKey(item.quizId, item.sourceAddress)),
        quizId: Number(item.quizId || 0),
        sourceAddress: String(item.sourceAddress || ""),
        title: String(item.title || ""),
        answer: String(item.answer || ""),
        answerType: Number(item.answerType || 0),
        savedAt: String(item.savedAt || new Date().toISOString()),
    };
}

function readBatchAnswerQueue() {
    if (typeof localStorage === "undefined") return [];
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        return Array.isArray(parsed) ? parsed.map(normalizeQueueItem) : [];
    } catch (error) {
        return [];
    }
}

function writeBatchAnswerQueue(nextQueue) {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify((Array.isArray(nextQueue) ? nextQueue : []).map(normalizeQueueItem)));
    window.dispatchEvent(new Event(UPDATE_EVENT));
}

function getBatchAnswerQueue() {
    return readBatchAnswerQueue();
}

function saveBatchAnswerQueueItem(item) {
    const normalizedItem = normalizeQueueItem(item);
    const current = readBatchAnswerQueue();
    const next = current.filter((entry) => entry.key !== normalizedItem.key);
    next.push(normalizedItem);
    writeBatchAnswerQueue(next);
    return normalizedItem;
}

function updateBatchAnswerQueueItem(key, patch = {}) {
    const current = readBatchAnswerQueue();
    const next = current.map((entry) => (
        entry.key === key
            ? normalizeQueueItem({
                ...entry,
                ...patch,
                key,
                savedAt: new Date().toISOString(),
            })
            : entry
    ));
    writeBatchAnswerQueue(next);
    return next.find((entry) => entry.key === key) || null;
}

function removeBatchAnswerQueueItem(key) {
    const current = readBatchAnswerQueue();
    const next = current.filter((entry) => entry.key !== key);
    writeBatchAnswerQueue(next);
}

function clearBatchAnswerQueue() {
    writeBatchAnswerQueue([]);
}

function subscribeBatchAnswerQueue(handler) {
    const onStorage = (event) => {
        if (event.key === STORAGE_KEY) {
            handler(getBatchAnswerQueue());
        }
    };
    const onUpdate = () => handler(getBatchAnswerQueue());
    window.addEventListener("storage", onStorage);
    window.addEventListener(UPDATE_EVENT, onUpdate);
    return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(UPDATE_EVENT, onUpdate);
    };
}

export {
    buildBatchAnswerKey,
    clearBatchAnswerQueue,
    getBatchAnswerQueue,
    removeBatchAnswerQueueItem,
    saveBatchAnswerQueueItem,
    subscribeBatchAnswerQueue,
    updateBatchAnswerQueueItem,
};
