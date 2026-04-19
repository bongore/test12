import { Contracts_MetaMask } from "../../contract/contracts";
import { useState, useEffect, useMemo, useRef } from "react";
import Simple_quiz from "./components/quiz_simple";
import Quiz_list from "./components/quiz_list";
import { useAccessControl } from "../../utils/accessControl";
import { getRegisteredCorrectAnswer } from "../../utils/quizCorrectAnswerStore";
import { getDeletedQuizzes, normalizeDeletedQuizKey, saveDeletedQuiz } from "../../utils/liveSignalApi";
import "./list_quiz_top.css";

function List_quiz_top(props) {
    const cont = useMemo(() => new Contracts_MetaMask(), []);
    const access = useAccessControl(cont);

    const now_numRef = useRef(0);
    const [quiz_sum, Set_quiz_sum] = useState(null);
    const [quiz_list, Set_quiz_list] = useState([]);
    const [add_num, Set_add_num] = useState(7);
    const [currentEpoch, setCurrentEpoch] = useState(() => Math.floor(Date.now() / 1000));
    const [correctAnswerMap, setCorrectAnswerMap] = useState({});
    const [loadError, setLoadError] = useState("");
    const [deletedQuizMap, setDeletedQuizMap] = useState({});
    const containerRef = useRef(null);
    const targetRef = useRef(null);
    const getQuizCacheKey = (quiz) => normalizeDeletedQuizKey(`${quiz?.sourceAddress || quiz?.[12] || ""}:${Number(quiz?.[0])}`);

    useEffect(() => {
        let mounted = true;
        const syncDeletedQuizzes = async () => {
            try {
                const nextDeleted = await getDeletedQuizzes();
                if (mounted) {
                    setDeletedQuizMap(nextDeleted || {});
                }
            } catch (error) {
                console.error("Failed to load deleted quizzes", error);
            }
        };

        syncDeletedQuizzes();
        const timer = window.setInterval(syncDeletedQuizzes, 15000);
        return () => {
            mounted = false;
            window.clearInterval(timer);
        };
    }, []);

    const handleDeleteQuiz = async (quiz) => {
        const quizKey = getQuizCacheKey(quiz);
        const title = quiz?.[2] || "このクイズ";
        if (!window.confirm(`「${title}」を一覧から非表示にします。全ユーザーのクイズ一覧に反映されます。続けますか。`)) {
            return;
        }

        const address = await cont.get_address();
        const deletedByLabel = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "teacher";
        await saveDeletedQuiz(quizKey, {
            deletedAt: new Date().toISOString(),
            deletedBy: address || "",
            deletedByLabel,
            sourceAddress: quiz?.sourceAddress || quiz?.[12] || "",
            quizId: Number(quiz?.[0]),
        });

        setDeletedQuizMap((current) => ({
            ...current,
            [quizKey]: {
                deletedAt: new Date().toISOString(),
                deletedBy: address || "",
                deletedByLabel,
                sourceAddress: quiz?.sourceAddress || quiz?.[12] || "",
                quizId: Number(quiz?.[0]),
            },
        }));
        Set_quiz_list((current) => current.filter((entry) => getQuizCacheKey(entry) !== quizKey));
    };

    useEffect(() => {
        cont.get_quiz_lenght()
            .then((data) => {
                let now = parseInt(Number(data));
                Set_quiz_sum(now);
                now_numRef.current = now;
                setLoadError("");
            })
            .catch((error) => {
                console.error("Failed to load quiz length", error);
                Set_quiz_sum(0);
                now_numRef.current = 0;
                setLoadError("問題一覧の読み込みに失敗しました。");
            });
    }, [cont]);

    useEffect(() => {
        const timer = window.setInterval(() => {
            setCurrentEpoch(Math.floor(Date.now() / 1000));
        }, 30000);

        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        const expiredWithoutAnswer = quiz_list.filter((quiz) => {
            const quizKey = getQuizCacheKey(quiz);
            const deadline = Number(quiz?.[6] || 0);
            return deadline > 0 && currentEpoch > deadline && !correctAnswerMap[quizKey];
        });

        if (!expiredWithoutAnswer.length) return;

        let cancelled = false;

        (async () => {
            const nextEntries = await Promise.all(
                expiredWithoutAnswer.map(async (quiz) => {
                    const quizId = Number(quiz?.[0]);
                    const sourceAddress = quiz?.sourceAddress || quiz?.[12] || "";
                    const quizKey = getQuizCacheKey(quiz);
                    const localAnswer = getRegisteredCorrectAnswer(quizId, sourceAddress);
                    if (localAnswer) {
                        return [quizKey, localAnswer];
                    }

                    const answer = await cont.get_revealed_correct_answer(quizId, sourceAddress);
                    return [quizKey, answer];
                })
            );

            if (cancelled) return;

            setCorrectAnswerMap((current) => {
                const next = { ...current };
                nextEntries.forEach(([quizId, answer]) => {
                    if (answer) {
                        next[quizId] = answer;
                    }
                });
                return next;
            });
        })();

        return () => {
            cancelled = true;
        };
    }, [cont, correctAnswerMap, currentEpoch, quiz_list]);

    if (quiz_sum != null) {
        return (
            <div className="quiz-list-page animate-fadeIn">
                <div className="quiz-list-header">
                    <h1 className="heading-xl">クイズ一覧</h1>
                    <p style={{ color: "#ffffff", opacity: 0.9 }}>出題されたクイズに回答してトークンを獲得しよう</p>
                </div>

                <Quiz_list
                    cont={cont}
                    add_num={add_num}
                    Set_add_num={Set_add_num}
                    quiz_sum={quiz_sum}
                    Set_quiz_sum={Set_quiz_sum}
                    quiz_list={quiz_list}
                    Set_quiz_list={Set_quiz_list}
                    targetRef={targetRef}
                    now_numRef={now_numRef}
                    setLoadError={setLoadError}
                />

                <div className="quiz-list-items">
                    {loadError ? (
                        <div className="glass-card" style={{ padding: "var(--space-5)", color: "#fff" }}>
                            <div style={{ fontWeight: 700, marginBottom: "10px" }}>{loadError}</div>
                            <button
                                className="btn-primary-custom"
                                onClick={() => window.location.reload()}
                            >
                                再読み込み
                            </button>
                        </div>
                    ) : null}
                    {quiz_list
                        .filter((quiz) => !deletedQuizMap[getQuizCacheKey(quiz)])
                        .map((quiz, index) => (
                        <div key={`${quiz?.sourceAddress || quiz?.[12] || "default"}-${Number(quiz?.[0] ?? index)}-${index}`}>
                            <Simple_quiz
                                quiz={quiz}
                                canAnswerQuiz={access.canAnswerQuiz}
                                isTeacher={access.isTeacher}
                                currentEpoch={currentEpoch}
                                correctAnswer={correctAnswerMap[getQuizCacheKey(quiz)] || ""}
                                onDeleteQuiz={handleDeleteQuiz}
                            />
                        </div>
                    ))}
                </div>

                {!loadError && (
                    <div ref={targetRef} className="quiz-loading">
                        <div className="skeleton skeleton-card"></div>
                        <div className="skeleton skeleton-card"></div>
                    </div>
                )}
            </div>
        );
    } else {
        return (
            <div className="quiz-list-page">
                <div className="skeleton skeleton-card"></div>
                <div className="skeleton skeleton-card"></div>
                <div className="skeleton skeleton-card"></div>
            </div>
        );
    }
}
export default List_quiz_top;
