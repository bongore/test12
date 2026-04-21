import { quiz_address } from "../contract/config";

const QUIZ_SOURCE_STORAGE_KEY = "web3_quiz_source_map_v1";

function normalizeAddress(value = "") {
    return String(value || "").trim().toLowerCase();
}

function isCurrentQuizSource(sourceAddress = "") {
    const source = normalizeAddress(sourceAddress);
    return !source || source === normalizeAddress(quiz_address);
}

function buildQuizPath(pathPrefix, quizId, sourceAddress = "", searchParams = {}) {
    const params = new URLSearchParams();
    Object.entries(searchParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "" && value !== false) {
            params.set(key, String(value));
        }
    });

    if (!isCurrentQuizSource(sourceAddress)) {
        params.set("c", sourceAddress);
    }

    const query = params.toString();
    return `/${pathPrefix}/${quizId}${query ? `?${query}` : ""}`;
}

function buildAnswerQuizPath(quizId, sourceAddress = "", options = {}) {
    const params = new URLSearchParams();
    if (options.practice) {
        params.set("practice", "1");
    }
    const query = params.toString();
    return `/answer_quiz/${quizId}${query ? `?${query}` : ""}`;
}

function buildAnswerQuizState(sourceAddress = "") {
    return isCurrentQuizSource(sourceAddress) ? undefined : { sourceAddress };
}

function readQuizSourceMap() {
    if (typeof localStorage === "undefined") return {};
    try {
        return JSON.parse(localStorage.getItem(QUIZ_SOURCE_STORAGE_KEY) || "{}");
    } catch (error) {
        return {};
    }
}

function rememberQuizSource(quizId, sourceAddress = "") {
    if (typeof localStorage === "undefined" || isCurrentQuizSource(sourceAddress)) return;
    const map = readQuizSourceMap();
    map[String(quizId)] = sourceAddress;
    localStorage.setItem(QUIZ_SOURCE_STORAGE_KEY, JSON.stringify(map));
}

function getRememberedQuizSource(quizId) {
    if (typeof localStorage === "undefined") return "";
    return readQuizSourceMap()[String(quizId)] || "";
}

function buildEditQuizPath(quizId, sourceAddress = "") {
    return buildQuizPath("edit_quiz", quizId, sourceAddress);
}

function buildInvestmentQuizPath(quizId, sourceAddress = "") {
    return buildQuizPath("investment_page", quizId, sourceAddress);
}

export {
    buildAnswerQuizPath,
    buildAnswerQuizState,
    buildEditQuizPath,
    buildInvestmentQuizPath,
    getRememberedQuizSource,
    rememberQuizSource,
    buildQuizPath,
    isCurrentQuizSource,
};
