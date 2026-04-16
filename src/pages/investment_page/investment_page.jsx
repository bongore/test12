import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { Contracts_MetaMask } from "../../contract/contracts";
import { useAccessControl } from "../../utils/accessControl";
import "./investment_page.css";

const GRADE_LABEL = {
    correct: "正解",
    incorrect: "不正解",
    pending: "未判定",
};

function formatAnswerState(state) {
    if (state === 2) return "正解済み";
    if (state === 1) return "不正解済み";
    if (state === 3) return "回答済み";
    return "未回答";
}

function formatTxHash(hash) {
    if (!hash) return "";
    return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

function Investment_to_quiz() {
    const navigate = useNavigate();
    const location = useLocation();
    const { id } = useParams();
    const sourceAddress = new URLSearchParams(location.search).get("c") || "";

    const [amount, setAmount] = useState(0);
    const [isNotPayingOut, setIsNotPayingOut] = useState("true");
    const [autoAnswer, setAutoAnswer] = useState("");
    const [confirmAnswer, setConfirmAnswer] = useState("");
    const [isNotAddingReward, setIsNotAddingReward] = useState("true");
    const [gradingMode, setGradingMode] = useState("manual");
    const [studentRows, setStudentRows] = useState([]);
    const [gradingMap, setGradingMap] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [executionSummary, setExecutionSummary] = useState(null);

    const Contract = useMemo(() => new Contracts_MetaMask(), []);
    const access = useAccessControl(Contract);

    const convertFullWidthNumbersToHalf = (() => {
        const diff = "０".charCodeAt(0) - "0".charCodeAt(0);
        return (text) => String(text || "").replace(
            /[０-９]/g,
            (m) => String.fromCharCode(m.charCodeAt(0) - diff)
        );
    })();

    const loadStudentSubmissions = async () => {
        setIsLoadingSubmissions(true);
        setLoadError("");
        try {
            const students = await Contract.get_student_list();
            const rows = await Promise.all(
                (Array.isArray(students) ? students : []).map(async (student) => {
                    const [userName] = await Contract.get_user_data(student);
                    const answerDetail = await Contract.get_student_answer_detail(student, id, sourceAddress);
                    return {
                        address: student,
                        name: userName || "",
                        answerText: answerDetail?.answerText || "",
                        submitted: Boolean(answerDetail?.submitted),
                        state: Number(answerDetail?.state || 0),
                        answerTime: Number(answerDetail?.answerTime || 0),
                        reward: Number(answerDetail?.reward || 0),
                        result: Boolean(answerDetail?.result),
                    };
                })
            );

            const nextGradingMap = {};
            rows.forEach((row) => {
                if (row.state === 2) {
                    nextGradingMap[row.address] = "correct";
                } else if (row.state === 1) {
                    nextGradingMap[row.address] = "incorrect";
                } else {
                    nextGradingMap[row.address] = "pending";
                }
            });

            setStudentRows(rows);
            setGradingMap(nextGradingMap);
        } catch (error) {
            console.error(error);
            setLoadError("学生の回答一覧の取得に失敗しました。");
        } finally {
            setIsLoadingSubmissions(false);
        }
    };

    const handleExecute = async () => {
        setIsSubmitting(true);
        try {
            const submittedStudentAddresses = studentRows
                .filter((row) => row.submitted)
                .map((row) => row.address);

            let executionResult = null;
            if (gradingMode === "auto") {
                if (isNotPayingOut === "false" && !autoAnswer.trim()) {
                    alert("自動判定で払い出しを行う場合は正解を入力してください。");
                    return;
                }

                executionResult = await Contract.investment_to_quiz(
                    id,
                    amount,
                    convertFullWidthNumbersToHalf(autoAnswer),
                    isNotPayingOut,
                    submittedStudentAddresses.length || studentRows.length,
                    isNotAddingReward,
                        submittedStudentAddresses,
                        sourceAddress
                    );
            } else {
                const correctStudents = studentRows
                    .filter((row) => row.submitted && gradingMap[row.address] === "correct")
                    .map((row) => row.address);
                const incorrectStudents = studentRows
                    .filter((row) => row.submitted && gradingMap[row.address] === "incorrect")
                    .map((row) => row.address);

                if (isNotPayingOut === "false" && correctStudents.length === 0 && incorrectStudents.length === 0) {
                    alert("手動判定で払い出しを行う場合は、少なくとも1件を正解または不正解に判定してください。");
                    return;
                }

                if (isNotPayingOut === "true") {
                    if (Number(amount || 0) > 0) {
                        await Contract.investment_to_quiz(
                            id,
                            amount,
                            "",
                            "true",
                            studentRows.length,
                            isNotAddingReward,
                            [],
                            sourceAddress
                        );
                    }
                } else {
                    executionResult = await Contract.settle_quiz_rewards_manually(
                        id,
                        amount,
                        confirmAnswer,
                        correctStudents,
                        incorrectStudents,
                        isNotAddingReward,
                        sourceAddress
                    );
                }
            }
            await loadStudentSubmissions();
            setExecutionSummary({
                executedAt: new Date().toISOString(),
                gradingMode,
                rewardAmount: Number(amount || 0),
                correctCount,
                incorrectCount,
                submittedCount,
                approvalTx: executionResult?.res?.transactionHash || executionResult?.res?.hash || "",
                payoutTxs: Array.isArray(executionResult?.payoutReceipts)
                    ? executionResult.payoutReceipts.map((item) => item?.transactionHash || item?.hash).filter(Boolean)
                    : [],
                bonusTx: executionResult?.hash || "",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    useEffect(() => {
        loadStudentSubmissions();
        // quiz id changes when another quiz is selected.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, sourceAddress]);

    if (access.isLoading) {
        return <div className="investment-page">権限を確認中です...</div>;
    }

    if (!access.isTeacher) {
        return (<div className="investment-page">この画面は教員・TAのみ利用できます。</div>);
    }

    const submittedCount = studentRows.filter((row) => row.submitted).length;
    const correctCount = studentRows.filter((row) => gradingMap[row.address] === "correct").length;
    const incorrectCount = studentRows.filter((row) => gradingMap[row.address] === "incorrect").length;

    return (
        <div className="investment-page">
            <div className="page-header">
                <h1 className="page-title">💰 採点と報酬管理</h1>
                <p className="page-subtitle">自動判定と手動判定のどちらでも、採点結果に応じて報酬を支払えます</p>
            </div>

            <div className="investment-card">
                <div className="quiz-id-badge">📋 クイズID: {id}</div>

                <div className="invest-section">
                    <div className="invest-section-title">判定モード</div>
                    <div className="invest-section-desc">これまでの自動判定も残しつつ、教員による手動判定も使えます</div>
                    <div className="radio-group">
                        <label className={`radio-option ${gradingMode === "manual" ? "selected" : ""}`}>
                            <input type="radio" value="manual" checked={gradingMode === "manual"} onChange={() => setGradingMode("manual")} />
                            ✍ 手動で採点する
                        </label>
                        <label className={`radio-option ${gradingMode === "auto" ? "selected" : ""}`}>
                            <input type="radio" value="auto" checked={gradingMode === "auto"} onChange={() => setGradingMode("auto")} />
                            ⚙ 正解文字列で自動判定する
                        </label>
                    </div>
                </div>

                <div className="invest-section">
                    <div className="invest-section-title">報酬額の設定</div>
                    <div className="invest-section-desc">正解と判定した学生1人あたりの報酬額です</div>
                    <input
                        type="text"
                        className="form-control"
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                        placeholder="1人あたりの報酬額を入力"
                    />
                    <div className="token-info">
                        <div className="token-info-item">
                            <div className="token-info-label">回答済み学生</div>
                            <div className="token-info-value">{submittedCount}人</div>
                        </div>
                        <div className="token-info-item">
                            <div className="token-info-label">手動で正解判定</div>
                            <div className="token-info-value">{correctCount}人</div>
                        </div>
                        <div className="token-info-item">
                            <div className="token-info-label">手動で不正解判定</div>
                            <div className="token-info-value">{incorrectCount}人</div>
                        </div>
                    </div>
                </div>

                {gradingMode === "auto" ? (
                    <div className="invest-section">
                        <div className="invest-section-title">自動判定用の正解</div>
                        <div className="invest-section-desc">入力した正解と学生の回答を自動照合して、正解者へ報酬を支払います</div>
                        <input
                            type="text"
                            className="form-control"
                            value={autoAnswer}
                            onChange={(event) => setAutoAnswer(event.target.value)}
                            placeholder="正解を入力"
                        />
                    </div>
                ) : (
                    <div className="invest-section">
                        <div className="invest-section-title">手動採点メモ</div>
                        <div className="invest-section-desc">採点後に記録しておきたい正解やメモがあれば入力してください</div>
                        <input
                            type="text"
                            className="form-control"
                            value={confirmAnswer}
                            onChange={(event) => setConfirmAnswer(event.target.value)}
                            placeholder="例: 教員判定済み / 正解は別紙参照"
                        />
                    </div>
                )}

                <div className="invest-section">
                    <div className="invest-section-title">報酬の払い出し</div>
                    <div className="invest-section-desc">採点だけ行うか、このまま報酬まで払い出すかを選択してください</div>
                    <div className="radio-group">
                        <label className={`radio-option ${isNotPayingOut === "true" ? "selected" : ""}`}>
                            <input type="radio" value="true" onChange={(event) => setIsNotPayingOut(event.target.value)} checked={isNotPayingOut === "true"} />
                            ⏳ まだ報酬の払い出しを行わない
                        </label>
                        <label className={`radio-option ${isNotPayingOut === "false" ? "selected" : ""}`}>
                            <input type="radio" value="false" onChange={(event) => setIsNotPayingOut(event.target.value)} checked={isNotPayingOut === "false"} />
                            ✅ 採点結果を確定して報酬を払い出す
                        </label>
                    </div>
                </div>

                <div className="invest-section">
                    <div className="invest-section-title">発表者ボーナス</div>
                    <div className="invest-section-desc">必要なら出題者への追加報酬もこの画面から実行できます</div>
                    <div className="radio-group">
                        <label className={`radio-option ${isNotAddingReward === "true" ? "selected" : ""}`}>
                            <input type="radio" value="true" onChange={(event) => setIsNotAddingReward(event.target.value)} checked={isNotAddingReward === "true"} />
                            ❌ 発表者ボーナスは追加しない
                        </label>
                        <label className={`radio-option ${isNotAddingReward === "false" ? "selected" : ""}`}>
                            <input type="radio" value="false" onChange={(event) => setIsNotAddingReward(event.target.value)} checked={isNotAddingReward === "false"} />
                            🎤 発表者ボーナスを追加する
                        </label>
                    </div>
                </div>

                <div className="invest-section">
                    <div className="invest-section-title">学生ごとの回答一覧</div>
                    <div className="invest-section-desc">手動判定では、この一覧で学生ごとに正解・不正解を付けられます</div>

                    {isLoadingSubmissions ? (
                        <div style={{ color: "white" }}>回答一覧を読み込み中です...</div>
                    ) : loadError ? (
                        <div style={{ color: "#ffd2d2" }}>{loadError}</div>
                    ) : (
                        <div style={{ display: "grid", gap: "12px" }}>
                            {studentRows.map((row) => (
                                <div
                                    key={row.address}
                                    className="glass-card"
                                    style={{ padding: "16px", display: "grid", gap: "10px" }}
                                >
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                                        <div>
                                            <div style={{ color: "#fff", fontWeight: 700 }}>
                                                {row.name || "ユーザー未設定"}
                                            </div>
                                            <div style={{ color: "rgba(255,255,255,0.72)", fontSize: "13px", wordBreak: "break-all" }}>
                                                {row.address}
                                            </div>
                                        </div>
                                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                            <span className="quiz-indicator" style={{ background: "rgba(255,255,255,0.08)", color: "#fff" }}>
                                                {formatAnswerState(row.state)}
                                            </span>
                                            <span className="quiz-indicator" style={{ background: "rgba(255,255,255,0.08)", color: "#fff" }}>
                                                {GRADE_LABEL[gradingMap[row.address] || "pending"]}
                                            </span>
                                        </div>
                                    </div>

                                    <div style={{ color: "#fff", background: "rgba(255,255,255,0.05)", borderRadius: "12px", padding: "12px", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                                        {row.submitted ? (row.answerText || "回答内容を取得できませんでした。") : "まだ回答していません。"}
                                    </div>

                                    {gradingMode === "manual" ? (
                                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                            <button
                                                type="button"
                                                className="btn btn-secondary"
                                                disabled={!row.submitted}
                                                onClick={() => setGradingMap((current) => ({ ...current, [row.address]: "correct" }))}
                                            >
                                                正解にする
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-secondary"
                                                disabled={!row.submitted}
                                                onClick={() => setGradingMap((current) => ({ ...current, [row.address]: "incorrect" }))}
                                            >
                                                不正解にする
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-secondary"
                                                disabled={!row.submitted}
                                                onClick={() => setGradingMap((current) => ({ ...current, [row.address]: "pending" }))}
                                            >
                                                判定を保留
                                            </button>
                                        </div>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="invest-submit-area">
                    <button className="btn-invest-submit" onClick={handleExecute} disabled={isSubmitting}>
                        {isSubmitting ? "処理中..." : "🚀 採点結果を反映する"}
                    </button>
                    <button className="btn btn-secondary" type="button" onClick={() => navigate("/edit_list")} style={{ marginLeft: "12px" }}>
                        一覧へ戻る
                    </button>
                </div>

                {executionSummary && (
                    <div className="invest-section">
                        <div className="invest-section-title">反映結果の確認</div>
                        <div className="invest-section-desc">採点結果と報酬反映の結果をその場で確認できます</div>
                        <div className="glass-card" style={{ padding: "16px", display: "grid", gap: "10px", color: "#fff" }}>
                            <div>実行時刻: {new Date(executionSummary.executedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</div>
                            <div>判定モード: {executionSummary.gradingMode === "auto" ? "自動判定" : "手動判定"}</div>
                            <div>報酬額: {executionSummary.rewardAmount} TFT / 人</div>
                            <div>正解: {executionSummary.correctCount}人 / 不正解: {executionSummary.incorrectCount}人 / 回答済み: {executionSummary.submittedCount}人</div>
                            {executionSummary.approvalTx && (
                                <div>
                                    承認・準備Tx:
                                    {" "}
                                    <a href={`https://amoy.polygonscan.com/tx/${executionSummary.approvalTx}`} target="_blank" rel="noreferrer">
                                        {formatTxHash(executionSummary.approvalTx)}
                                    </a>
                                </div>
                            )}
                            {executionSummary.payoutTxs.length > 0 && (
                                <div>
                                    報酬反映Tx:
                                    <div style={{ display: "grid", gap: "6px", marginTop: "6px" }}>
                                        {executionSummary.payoutTxs.map((hash) => (
                                            <a key={hash} href={`https://amoy.polygonscan.com/tx/${hash}`} target="_blank" rel="noreferrer">
                                                {formatTxHash(hash)}
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {executionSummary.bonusTx && (
                                <div>
                                    発表者ボーナスTx:
                                    {" "}
                                    <a href={`https://amoy.polygonscan.com/tx/${executionSummary.bonusTx}`} target="_blank" rel="noreferrer">
                                        {formatTxHash(executionSummary.bonusTx)}
                                    </a>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default Investment_to_quiz;
