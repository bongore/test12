import { Contracts_MetaMask } from "../../contract/contracts";
import { useState, useEffect, useRef, useMemo } from "react";
import Simple_quiz from "./components/quiz_simple";
import Quiz_list from "./components/quiz_list";
import { useAccessControl } from "../../utils/accessControl";
import { getDeletedQuizzes, normalizeDeletedQuizKey, removeDeletedQuiz, saveDeletedQuiz } from "../../utils/liveSignalApi";
import "./edit_list_top.css";

function Edit_list_top(props) {
    const cont = useMemo(() => new Contracts_MetaMask(), []);
    const access = useAccessControl(cont);

    const now_numRef = useRef(0);
    const [quiz_sum, Set_quiz_sum] = useState(null);
    const [quiz_list, Set_quiz_list] = useState([]);
    const [add_num, Set_add_num] = useState(7);
    const [loadError, setLoadError] = useState("");
    const [deletedQuizMap, setDeletedQuizMap] = useState({});
    const getQuizCacheKey = (quiz) => normalizeDeletedQuizKey(`${quiz?.sourceAddress || quiz?.[12] || ""}:${Number(quiz?.[0])}`);

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
                setLoadError("管理用クイズ一覧の読み込みに失敗しました。");
            });
    }, [cont]);

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
        if (!window.confirm(`「${title}」を削除対象として一覧から隠します。全ユーザーに反映されます。続けますか。`)) {
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
    };

    const handleRestoreQuiz = async (quiz) => {
        const quizKey = getQuizCacheKey(quiz);
        await removeDeletedQuiz(quizKey);
        setDeletedQuizMap((current) => {
            const next = { ...current };
            delete next[quizKey];
            return next;
        });
    };

    const targetRef = useRef(null);

    if (access.isLoading) {
        return <div className="edit-list-page">権限を確認中です...</div>;
    }

    if (!access.isTeacher) {
        return <div className="edit-list-page">この画面は教員・TAのみ利用できます。</div>;
    }

    if (quiz_sum == null) {
        return <div className="edit-list-page">読み込み中です...</div>;
    }

    return (
        <div className="edit-list-page">
            <div className="page-header">
                <h1 className="page-title">📝 クイズ管理</h1>
                <p className="page-subtitle">作成したクイズの編集・報酬管理</p>
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

            {loadError ? (
                <div className="glass-card" style={{ padding: "var(--space-5)", color: "#fff", marginBottom: "var(--space-4)" }}>
                    <div style={{ fontWeight: 700, marginBottom: "10px" }}>{loadError}</div>
                    <button className="btn-primary-custom" onClick={() => window.location.reload()}>
                        再読み込み
                    </button>
                </div>
            ) : null}

            {quiz_list.some((quiz) => deletedQuizMap[getQuizCacheKey(quiz)]) ? (
                <div className="deleted-quiz-panel glass-card">
                    <div className="deleted-quiz-panel__header">
                        <h2 className="deleted-quiz-panel__title">削除済みクイズ</h2>
                        <span className="deleted-quiz-panel__count">
                            {quiz_list.filter((quiz) => deletedQuizMap[getQuizCacheKey(quiz)]).length} 件
                        </span>
                    </div>
                    <div className="deleted-quiz-panel__list">
                        {quiz_list
                            .filter((quiz) => deletedQuizMap[getQuizCacheKey(quiz)])
                            .map((quiz, index) => {
                                const quizKey = getQuizCacheKey(quiz);
                                const deletedMeta = deletedQuizMap[quizKey] || {};
                                return (
                                    <div
                                        key={`deleted-${quiz?.sourceAddress || quiz?.[12] || "default"}-${Number(quiz?.[0] ?? index)}-${index}`}
                                        className="deleted-quiz-item"
                                    >
                                        <div className="deleted-quiz-item__body">
                                            <div className="deleted-quiz-item__title">{quiz?.[2] || "タイトル未設定"}</div>
                                            <div className="deleted-quiz-item__meta">
                                                削除時刻: {deletedMeta?.deletedAt ? new Date(deletedMeta.deletedAt).toLocaleString("ja-JP") : "-"}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            className="btn-edit"
                                            onClick={() => handleRestoreQuiz(quiz)}
                                        >
                                            再表示
                                        </button>
                                    </div>
                                );
                            })}
                    </div>
                </div>
            ) : null}

            {quiz_list
                .filter((quiz) => !deletedQuizMap[getQuizCacheKey(quiz)])
                .map((quiz, index) => (
                    <Simple_quiz
                        key={`${quiz?.sourceAddress || quiz?.[12] || "default"}-${Number(quiz?.[0] ?? index)}-${index}`}
                        quiz={quiz}
                        onDeleteQuiz={handleDeleteQuiz}
                    />
                ))}

            {!loadError && (
                <div ref={targetRef} className="loading-indicator">
                    <div className="skeleton-card">
                        <div className="skeleton-line" style={{ width: "60%" }}></div>
                        <div className="skeleton-line" style={{ width: "90%" }}></div>
                        <div className="skeleton-line" style={{ width: "40%" }}></div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Edit_list_top;
