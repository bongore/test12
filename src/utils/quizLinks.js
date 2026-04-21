import { quiz_address } from "../contract/config";

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
    return buildQuizPath("answer_quiz", quizId, sourceAddress, {
        practice: options.practice ? "1" : "",
    });
}

function buildEditQuizPath(quizId, sourceAddress = "") {
    return buildQuizPath("edit_quiz", quizId, sourceAddress);
}

function buildInvestmentQuizPath(quizId, sourceAddress = "") {
    return buildQuizPath("investment_page", quizId, sourceAddress);
}

export {
    buildAnswerQuizPath,
    buildEditQuizPath,
    buildInvestmentQuizPath,
    buildQuizPath,
    isCurrentQuizSource,
};
