const CORRECT_ANSWER_STORAGE_KEY = "web3_quiz_registered_correct_answers_v1";

function readCorrectAnswerMap() {
    try {
        const raw = localStorage.getItem(CORRECT_ANSWER_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
        return {};
    }
}

function writeCorrectAnswerMap(map) {
    localStorage.setItem(CORRECT_ANSWER_STORAGE_KEY, JSON.stringify(map));
}

function normalizeQuizId(quizId) {
    return String(Number(quizId));
}

function setRegisteredCorrectAnswer(quizId, correctAnswer) {
    const normalizedQuizId = normalizeQuizId(quizId);
    if (!normalizedQuizId || normalizedQuizId === "NaN") return;

    const map = readCorrectAnswerMap();
    map[normalizedQuizId] = String(correctAnswer || "");
    writeCorrectAnswerMap(map);
}

function getRegisteredCorrectAnswer(quizId) {
    const normalizedQuizId = normalizeQuizId(quizId);
    if (!normalizedQuizId || normalizedQuizId === "NaN") return "";

    const map = readCorrectAnswerMap();
    return String(map[normalizedQuizId] || "");
}

export {
    getRegisteredCorrectAnswer,
    setRegisteredCorrectAnswer,
};
