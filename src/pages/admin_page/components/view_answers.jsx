import React, { useEffect, useMemo, useState } from "react";
import { Contracts_MetaMask } from "../../../contract/contracts";
import { keccak256, toHex, encodePacked } from "viem";

function downloadTextFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function escapeCsv(value) {
    const normalized = String(value ?? "");
    if (!/[",\n]/.test(normalized)) return normalized;
    return `"${normalized.replace(/"/g, "\"\"")}"`;
}

/**
 * 回答ハッシュ(bytes32)から、選択肢リスト(answer_data)を照合して元の回答文字列を復元する。
 * スマートコントラクト側では keccak256(abi.encodePacked(_answer)) でハッシュを保存しているため、
 * 同じ方式でハッシュを生成して照合する。
 */
function decodeAnswerHash(hash, answerOptions) {
    // ハッシュが空(0x000...000)の場合は未回答
    if (!hash || hash === "0x0000000000000000000000000000000000000000000000000000000000000000") {
        return "";
    }

    // 各選択肢のハッシュを生成して照合
    for (const option of answerOptions) {
        const trimmed = option.trim();
        if (!trimmed) continue;
        try {
            const optionHash = keccak256(encodePacked(["string"], [trimmed]));
            if (optionHash === hash) {
                return trimmed;
            }
        } catch (e) {
            // ignore
        }
    }

    // 記述式の場合はハッシュの先頭8文字を表示
    return `(ハッシュ: ${hash.slice(0, 10)}…)`;
}

function View_answers() {
    const contract = new Contracts_MetaMask();

    const [quizCount, setQuizCount] = useState(0);
    const [selectedQuiz, setSelectedQuiz] = useState(null);
    const [quizList, setQuizList] = useState([]);
    const [answers, setAnswers] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadingAnswers, setLoadingAnswers] = useState(false);

    const selectedQuizTitle = useMemo(() => {
        const selectedRef = quizList.find((item) => `${item.sourceAddress || ""}:${item.id}` === selectedQuiz);
        if (!selectedRef) return "";
        return selectedRef.title || `問題 ${selectedRef.id}`;
    }, [quizList, selectedQuiz]);

    const exportAnswerRows = useMemo(() => (
        (answers || []).map((item, index) => ({
            no: index + 1,
            quizId: selectedQuiz ? selectedQuiz.split(":").slice(-1)[0] : "",
            quizTitle: selectedQuizTitle || "",
            walletAddress: item.address || "",
            answer: item.answer || "未回答",
            answerHash: item.hash || "",
        }))
    ), [answers, selectedQuiz, selectedQuizTitle]);

    const handleExportAnswersJson = () => {
        downloadTextFile(
            `answers_${selectedQuizTitle || "quiz"}.json`,
            JSON.stringify(exportAnswerRows, null, 2),
            "application/json;charset=utf-8"
        );
    };

    const handleExportAnswersCsv = () => {
        const rows = [
            ["No", "Quiz ID", "Quiz Title", "Wallet Address", "Answer", "Answer Hash"],
            ...exportAnswerRows.map((row) => [
                row.no,
                row.quizId,
                row.quizTitle,
                row.walletAddress,
                row.answer,
                row.answerHash,
            ]),
        ];
        const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
        downloadTextFile(
            `answers_${selectedQuizTitle || "quiz"}.csv`,
            csv,
            "text/csv;charset=utf-8"
        );
    };

    // クイズ一覧を取得
    useEffect(() => {
        async function fetchQuizList() {
            try {
                const list = await contract.get_all_quiz_simple_list();
                const normalized = (Array.isArray(list) ? list : []).map((q) => ({
                    id: Number(q?.[0] || 0),
                    title: q?.[2] || `問題 ${q?.[0] || 0}`,
                    respondents: Number(q?.[8]) || 0,
                    sourceAddress: q?.sourceAddress || q?.[12] || "",
                }));
                setQuizCount(normalized.length);
                setQuizList(normalized);
            } catch (e) {
                console.error("Failed to fetch quiz list", e);
            } finally {
                setLoading(false);
            }
        }
        fetchQuizList();
    }, []);

    // 選択されたクイズの回答一覧を取得
    const fetchAnswers = async (quizRef) => {
        const quizId = Number(quizRef?.id || 0);
        const sourceAddress = quizRef?.sourceAddress || "";
        setSelectedQuiz(`${sourceAddress}:${quizId}`);
        setLoadingAnswers(true);
        setAnswers(null);
        try {
            // クイズの詳細を取得（選択肢データ answer_data を含む）
            const quizData = await contract.get_quiz(quizId, sourceAddress);
            // get_quiz の返り値: [id, owner, title, explanation, thumbnail_url, content, answer_data, ...]
            const answerData = quizData[6] || ""; // answer_data (カンマ区切りの選択肢)
            const answerOptions = answerData.split(",");
            const answerType = Number(quizData[13]); // answer_type: 0=選択式, 1=記述式

            // 生徒一覧を取得
            const students = await contract.get_student_list();
            if (students && students.length > 0) {
                // 各生徒の回答ハッシュを取得
                const answerMap = await contract.get_students_answer_hash_list(students, quizId, sourceAddress);
                
                const result = [];
                for (const student of students) {
                    const hash = answerMap[student];
                    const detail = await contract.get_student_answer_detail(student, quizId, sourceAddress);
                    let decodedAnswer = "";

                    if (answerType === 0) {
                        // 選択式: ハッシュを選択肢と照合
                        decodedAnswer = decodeAnswerHash(hash, answerOptions);
                    } else {
                        // 記述式: ハッシュのみ表示（復元不可能）
                        if (hash && hash !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
                            decodedAnswer = `(ハッシュ: ${hash.slice(0, 10)}…)`;
                        }
                    }

                    result.push({
                        address: student,
                        answer: decodedAnswer,
                        hash: hash,
                        state: Number(detail?.state || 0),
                        reward: Number(detail?.reward || 0),
                        result: Boolean(detail?.result),
                    });
                }
                setAnswers(result);
            } else {
                setAnswers([]);
            }
        } catch (e) {
            console.error("Failed to fetch answers", e);
            setAnswers([]);
        } finally {
            setLoadingAnswers(false);
        }
    };

    if (loading) {
        return (
            <div style={{ textAlign: "center", padding: "40px", color: "rgba(255,255,255,0.7)" }}>
                <div className="skeleton skeleton-card" style={{ height: "200px" }}></div>
            </div>
        );
    }

    return (
        <div>
            <h3 className="section-title">📋 問題別 回答一覧</h3>
            <p className="section-desc">各問題に対するユーザーの回答を確認できます（選択式は回答を復元、記述式はハッシュを表示）</p>

            {/* Quiz Selector */}
            <div style={{ marginBottom: "var(--space-6)" }}>
                <label style={{ color: "#ffffff", fontWeight: "600", display: "block", marginBottom: "var(--space-2)" }}>
                    問題を選択してください（全 {quizCount} 問）
                </label>
                <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                    gap: "var(--space-3)",
                    maxHeight: "300px",
                    overflowY: "auto",
                    padding: "var(--space-2)"
                }}>
                    {quizList.map((q) => (
                        <button
                            key={`${q.sourceAddress || "default"}-${q.id}`}
                            onClick={() => fetchAnswers(q)}
                            style={{
                                padding: "12px 16px",
                                borderRadius: "var(--radius-sm)",
                                border: selectedQuiz === `${q.sourceAddress || ""}:${q.id}` ? "2px solid var(--accent-blue)" : "1px solid rgba(255,255,255,0.15)",
                                background: selectedQuiz === `${q.sourceAddress || ""}:${q.id}` ? "rgba(30, 136, 229, 0.2)" : "rgba(255,255,255,0.05)",
                                color: "#ffffff",
                                cursor: "pointer",
                                textAlign: "left",
                                transition: "all 0.2s ease",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                            }}
                        >
                            <span style={{ fontWeight: "500", fontSize: "14px" }}>
                                #{q.id} {String(q.title || "").length > 20 ? String(q.title || "").slice(0, 20) + "…" : String(q.title || "")}
                            </span>
                            <span style={{
                                fontSize: "12px",
                                background: "rgba(255,255,255,0.1)",
                                padding: "2px 8px",
                                borderRadius: "12px",
                                color: "rgba(255,255,255,0.7)"
                            }}>
                                {q.respondents}人回答
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Answer Table */}
            {selectedQuiz !== null && (
                <div>
                    <h4 style={{ color: "#ffffff", fontWeight: "600", marginBottom: "var(--space-3)" }}>
                        📝 {selectedQuizTitle ? `${selectedQuizTitle} の回答一覧` : `問題 ${selectedQuiz || ""} の回答一覧`}
                    </h4>

                    {loadingAnswers ? (
                        <div style={{ textAlign: "center", padding: "30px", color: "rgba(255,255,255,0.6)" }}>
                            読み込み中...
                        </div>
                    ) : answers && answers.length > 0 ? (
                        <div className="results-table-wrap">
                            <div className="csv-download-area" style={{ marginTop: 0, marginBottom: "16px" }}>
                                <button className="btn-action" onClick={handleExportAnswersCsv}>📤 回答一覧を CSV 出力</button>
                                <button className="btn-action" onClick={handleExportAnswersJson}>📤 回答一覧を JSON 出力</button>
                            </div>
                            <table className="results-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: "50px" }}>#</th>
                                        <th>ウォレットアドレス</th>
                                        <th>回答内容</th>
                                        <th>判定</th>
                                        <th>報酬</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {answers.map((item, index) => (
                                        <tr key={index}>
                                            <td>{index + 1}</td>
                                            <td className="address-cell" style={{ fontSize: "13px" }}>
                                                {item.address
                                                    ? item.address.slice(0, 8) + "…" + item.address.slice(-6)
                                                    : "-"}
                                            </td>
                                            <td style={{
                                                color: item.answer ? "#ffffff" : "rgba(255,255,255,0.3)",
                                                fontWeight: item.answer ? "500" : "400",
                                            }}>
                                                {item.answer || "未回答"}
                                            </td>
                                            <td>
                                                {item.state === 2 ? "正解" : item.state === 1 ? "不正解" : item.state === 3 ? "回答済み" : "未回答"}
                                            </td>
                                            <td>{Number(item.reward || 0) / 10 ** 18} TFT</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {/* 統計サマリー */}
                            <div style={{
                                marginTop: "var(--space-4)",
                                padding: "var(--space-3)",
                                background: "rgba(255,255,255,0.05)",
                                borderRadius: "var(--radius-sm)",
                                display: "flex",
                                gap: "var(--space-6)",
                                color: "rgba(255,255,255,0.8)",
                                fontSize: "14px"
                            }}>
                                <span>👥 全生徒: <strong style={{ color: "#fff" }}>{answers.length}人</strong></span>
                                <span>✅ 回答済: <strong style={{ color: "#4caf50" }}>{answers.filter(a => a.answer).length}人</strong></span>
                                <span>⬜ 未回答: <strong style={{ color: "#ff9800" }}>{answers.filter(a => !a.answer).length}人</strong></span>
                            </div>
                        </div>
                    ) : (
                        <div style={{ textAlign: "center", padding: "30px", color: "rgba(255,255,255,0.5)" }}>
                            回答データがありません
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default View_answers;
