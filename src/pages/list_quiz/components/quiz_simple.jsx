import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { buildQuizStorageKey } from "../../../utils/quizCorrectAnswerStore";
import "./quiz_simple.css";

const QUIZ_STATUS = {
    UNANSWERED: 0,
    INCORRECT: 1,
    CORRECT: 2,
    ANSWERED: 3,
};

function getStatusLabel(status) {
    switch (status) {
        case QUIZ_STATUS.UNANSWERED: return "未解答";
        case QUIZ_STATUS.INCORRECT: return "不正解";
        case QUIZ_STATUS.CORRECT: return "正解";
        case QUIZ_STATUS.ANSWERED: return "解答済み";
        default: return "";
    }
}

function getStatusClass(status) {
    switch (status) {
        case QUIZ_STATUS.UNANSWERED: return "glow-unanswered";
        case QUIZ_STATUS.INCORRECT: return "glow-incorrect";
        case QUIZ_STATUS.CORRECT: return "glow-correct";
        case QUIZ_STATUS.ANSWERED: return "glow-answered";
        default: return "";
    }
}

function getBadgeClass(status) {
    switch (status) {
        case QUIZ_STATUS.UNANSWERED: return "badge-unanswered";
        case QUIZ_STATUS.INCORRECT: return "badge-incorrect";
        case QUIZ_STATUS.CORRECT: return "badge-correct";
        case QUIZ_STATUS.ANSWERED: return "badge-answered";
        default: return "";
    }
}

function Time_diff(props) {
    function convertSecondsToHours(secondsLimit, secondsStart) {
        const now = new Date();
        const deadline = new Date(secondsLimit * 1000);
        const startTime = new Date(secondsStart * 1000);

        const epochNow = Math.floor(now.getTime() / 1000);
        const epochDeadline = Math.floor(deadline.getTime() / 1000);
        const epochStart = Math.floor(startTime.getTime() / 1000);

        let elapsedTime = 0;
        let isBeforeStart = false;

        if (epochNow < epochStart) {
            elapsedTime = new Date(Math.abs(epochStart - epochNow) * 1000);
            isBeforeStart = true;
        } else {
            elapsedTime = new Date(Math.abs(epochDeadline - epochNow) * 1000);
        }

        const labels = ["年", "か月", "日", "時間", "分", "秒"];
        const date = [
            elapsedTime.getUTCFullYear() - 1970,
            elapsedTime.getUTCMonth(),
            elapsedTime.getUTCDate() - 1,
            elapsedTime.getUTCHours(),
            elapsedTime.getUTCMinutes(),
            elapsedTime.getUTCSeconds(),
        ];

        let res = "";
        let i = 0;
        for (i = 0; i < date.length; i++) {
            if (date[i] !== 0) break;
        }
        for (; i < date.length; i++) {
            res += date[i].toString() + labels[i];
        }

        if (isBeforeStart) {
            return { text: `開始まで ${res}`, icon: "⏳", className: "time-pending" };
        } else if (epochDeadline - epochNow > 0) {
            return { text: `残り ${res}`, icon: "⌛", className: "time-active" };
        }
        return { text: "終了済み", icon: "✓", className: "time-ended" };
    }

    const timeInfo = convertSecondsToHours(parseInt(props.limit, 10), parseInt(props.start, 10));
    return (
        <div className={`quiz-time ${timeInfo.className}`}>
            <span className="quiz-time-icon">{timeInfo.icon}</span>
            <span className="quiz-time-text">{timeInfo.text}</span>
        </div>
    );
}

function Simple_quiz(props) {
    const [isreward, setIsreward] = useState(true);
    const [ispayment, setIspayment] = useState(false);

    const quizId = Number(props.quiz[0]);
    const title = props.quiz[2];
    const description = props.quiz[3];
    const thumbnail = props.quiz[4];
    const startTime = Number(props.quiz[5]);
    const deadline = Number(props.quiz[6]);
    const reward = Number(props.quiz[7]) / (10 ** 18);
    const respondents = Number(props.quiz[8]);
    const limit = Number(props.quiz[9]);
    const status = Number(props.quiz[10]);
    const isPaid = props.quiz[11];
    const sourceAddress = props.quiz.sourceAddress || props.quiz[12] || "";
    const answerStorageKey = buildQuizStorageKey(quizId, sourceAddress);
    const currentEpoch = props.currentEpoch ?? Math.floor(Date.now() / 1000);
    const correctAnswer = props.correctAnswer || "";
    const scheduleLabel = currentEpoch < startTime ? "公開予約" : (currentEpoch > deadline ? "締切済み" : "公開中");

    useEffect(() => {
        if (reward === 0) setIsreward(false);
        if (isPaid) {
            setIspayment(true);
            setIsreward(false);
        }
    }, [isPaid, reward]);

    useEffect(() => {
        if (status === QUIZ_STATUS.UNANSWERED) {
            localStorage.removeItem(answerStorageKey);
        }
    }, [answerStorageKey, quizId, status]);

    const statusClass = getStatusClass(status);
    const statusLabel = getStatusLabel(status);
    const badgeClass = getBadgeClass(status);
    const savedAnswer = localStorage.getItem(answerStorageKey);

    const card = (
        <div className={`quiz-card glass-card ${statusClass} animate-slideUp`}>
            <div className="quiz-card-inner">
                {thumbnail && (
                    <div className="quiz-thumbnail">
                        <img src={thumbnail} alt="" />
                    </div>
                )}

                <div className="quiz-content">
                    <div className="quiz-header">
                        <h3 className="quiz-title">{title}</h3>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
                            {ispayment && (
                                <span className="quiz-indicator quiz-indicator--paid">
                                    報酬配布済み
                                </span>
                            )}
                            {!ispayment && isreward && (
                                <span className="quiz-indicator quiz-indicator--reward">
                                    報酬あり
                                </span>
                            )}
                            <span className={`badge-status ${badgeClass}`}>
                                {statusLabel}
                            </span>
                            <span className="quiz-indicator" style={{ background: "rgba(255,255,255,0.1)", color: "#fff" }}>
                                {scheduleLabel}
                            </span>
                        </div>
                    </div>

                    {description && (
                        <p className="quiz-description" style={{ color: "#ffffff", opacity: 0.9 }}>{description}</p>
                    )}

                    <Time_diff start={startTime} limit={deadline} />

                    <div className="quiz-meta">
                        <div className="quiz-meta-item">
                            <span className="quiz-meta-label">報酬</span>
                            <span className="quiz-meta-value">
                                {reward > 0 ? `${reward} TFT` : "-"}
                            </span>
                        </div>
                        <div className="quiz-meta-item">
                            <span className="quiz-meta-label">解答数</span>
                            <span className="quiz-meta-value">{respondents}</span>
                        </div>
                        <div className="quiz-meta-item">
                            <span className="quiz-meta-label">上限</span>
                            <span className="quiz-meta-value">{limit}</span>
                        </div>
                    </div>

                    {status !== QUIZ_STATUS.UNANSWERED && savedAnswer && (
                        <div className="quiz-user-answer" style={{ marginTop: "var(--space-3)", fontSize: "var(--font-size-sm)", padding: "var(--space-2)", background: "rgba(255,255,255,0.05)", borderRadius: "var(--radius-sm)" }}>
                            <span style={{ fontSize: "12px", color: "#ffffff", opacity: 0.9 }}>あなたの解答 </span>
                            <strong style={{ color: "#ffffff" }}>{savedAnswer}</strong>
                        </div>
                    )}

                    {currentEpoch > deadline && correctAnswer && (
                        <div className="quiz-user-answer" style={{ marginTop: "var(--space-3)", fontSize: "var(--font-size-sm)", padding: "var(--space-2)", background: "rgba(76, 175, 80, 0.12)", borderRadius: "var(--radius-sm)" }}>
                            <span style={{ fontSize: "12px", color: "#ffffff", opacity: 0.9 }}>締切後の正解 </span>
                            <strong style={{ color: "#ffffff" }}>{correctAnswer}</strong>
                        </div>
                    )}

                    {!props.canAnswerQuiz && (
                        <div className="quiz-user-answer" style={{ marginTop: "var(--space-3)", padding: "var(--space-2)", background: "rgba(255, 120, 120, 0.12)", borderRadius: "var(--radius-sm)", color: "#ffd0d0" }}>
                            MetaMask を接続すると解答できます。
                        </div>
                    )}

                    {props.canAnswerQuiz && (
                        <div style={{ display: "flex", gap: "8px", marginTop: "var(--space-3)", flexWrap: "wrap" }}>
                            <Link
                                to={`/answer_quiz/${quizId}?c=${encodeURIComponent(sourceAddress)}`}
                                className="btn-primary-custom"
                                style={{ textDecoration: "none", flex: 1, minWidth: "140px", textAlign: "center", padding: "10px 14px" }}
                            >
                                本番で回答
                            </Link>
                            <Link
                                to={`/answer_quiz/${quizId}?practice=1&c=${encodeURIComponent(sourceAddress)}`}
                                className="btn-secondary-custom"
                                style={{ textDecoration: "none", flex: 1, minWidth: "140px", textAlign: "center", padding: "10px 14px" }}
                            >
                                練習モード
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    if (!props.canAnswerQuiz) {
        return <div className="quiz-card-link" style={{ cursor: "not-allowed" }}>{card}</div>;
    }

    return <div className="quiz-card-link">{card}</div>;
}

export default Simple_quiz;
