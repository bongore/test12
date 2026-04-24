import { Contracts_MetaMask } from "../../contract/contracts";
import Form from "react-bootstrap/Form";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import MDEditor from "@uiw/react-md-editor";
import Answer_select from "./components/answer_select";
import Wait_Modal from "../../contract/wait_Modal";
import { ACTION_TYPES, appendActivityLog } from "../../utils/activityLog";
import { setRegisteredCorrectAnswer } from "../../utils/quizCorrectAnswerStore";
import { quiz_address } from "../../contract/config";
import { MAX_TFT_PER_LECTURE, MAX_TFT_TOTAL, QUIZ_RATE_OPTIONS, TOTAL_LECTURE_COUNT, convertTftToPoint, TFT_PER_POINT } from "../../utils/quizRewardRate";
import { buildAnswerQuizPath } from "../../utils/quizLinks";
import { createDefaultQuizContentMeta, withQuizContentMeta } from "../../utils/quizContentMeta";
import { appendColoredText } from "../../utils/quizEditorHelpers";
import "./create_quiz.css";

function Create_quiz() {
    const navigate = useNavigate();
    const [useing_address, Set_useing_address] = useState(null);
    const [title, setTitle] = useState("");
    const [explanation, setExplanation] = useState("");
    const [thumbnail_url, setThumbnail_url] = useState("");
    const [content, setContent] = useState("");
    const [allowMultipleAnswers, setAllowMultipleAnswers] = useState(createDefaultQuizContentMeta().allowMultipleAnswers);
    const [highlightText, setHighlightText] = useState("");
    const [answer_type, setAnswer_type] = useState(0);
    const [answer_data, setAnswer_data] = useState([]);
    const [correct, setCorrect] = useState("");
    const [scoreTier, setScoreTier] = useState(QUIZ_RATE_OPTIONS[0].id);
    const [isManualReward, setIsManualReward] = useState(false);
    const [reply_startline, setReply_startline] = useState(
        new Date()
            .toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })
            .replace(/[/]/g, "-")
            .replace(/\s(\d):/, " 0$1:"),
    );
    const [reply_deadline, setReply_deadline] = useState(getLocalizedDateTimeString(addDays(new Date(), 1)));
    const [reward, setReward] = useState(QUIZ_RATE_OPTIONS[0].reward);

    let Contract = new Contracts_MetaMask();

    const [correct_limit, setCorrect_limit] = useState(null);
    const [state, setState] = useState("Null");
    const [now, setnow] = useState(null);
    const [show, setShow] = useState(false);

    const convertFullWidthNumbersToHalf = (() => {
        const diff = "０".charCodeAt(0) - "0".charCodeAt(0);
        return text => text.replace(
            /[０-９]/g
            , m => String.fromCharCode(m.charCodeAt(0) - diff)
        );
    })();

    const create_quiz = async () => {
        if (correct !== "") {
            try {
                const previousLength = Number(await Contract.get_quiz_lenght(quiz_address));
                const receipt = await Contract.create_quiz(
                    title,
                    explanation,
                    thumbnail_url,
                    withQuizContentMeta(content, { allowMultipleAnswers }),
                    answer_type,
                    answer_data,
                    convertFullWidthNumbersToHalf(correct),
                    reply_startline,
                    reply_deadline,
                    reward,
                    correct_limit,
                    setShow,
                );
                appendActivityLog(ACTION_TYPES.ADMIN_CREATE_QUIZ, {
                    page: "create_quiz",
                    title,
                    answerType: answer_type,
                    reward,
                    allowMultipleAnswers,
                });

                let createdQuizId = receipt?.logs?.[2]?.topics?.[2];
                if (!createdQuizId) {
                    const latestLength = Number(await Contract.get_quiz_lenght(quiz_address));
                    if (latestLength > previousLength) {
                        createdQuizId = String(latestLength - 1);
                    }
                }

                if (createdQuizId) {
                    const normalizedQuizId = BigInt(createdQuizId).toString();
                    setRegisteredCorrectAnswer(normalizedQuizId, convertFullWidthNumbersToHalf(correct), quiz_address);
                    navigate(buildAnswerQuizPath(normalizedQuizId, quiz_address));
                    return;
                }
            } catch (error) {
                console.error("Failed to create quiz", error);
                alert(error?.shortMessage || error?.message || "問題作成に失敗しました。MetaMask の承認状態と教員権限を確認してください。");
                return;
            }
            navigate("/list_quiz");
        } else {
            alert("正解を入力してください");
        }
    };

    function getLocalizedDateTimeString(now = new Date()) {
        const formatter = new Intl.DateTimeFormat("ja-JP", {
            timeZone: "Asia/Tokyo",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        });

        const localizedDateTimeString = formatter
            .format(now)
            .replace(/\u200E|\u200F/g, "")
            .replace(/\//g, "-")
            .replace(/ /, "T");

        return localizedDateTimeString;
    }

    function addDays(date, days) {
        date.setDate(date.getDate() + days);
        return date;
    }

    useEffect(() => {
        async function get_contract() {
            const studentCount = await Contract.get_num_of_students();
            setCorrect_limit(Math.max(Number(studentCount || 0) + 30, 30));
        }
        get_contract();
        setnow(getLocalizedDateTimeString());
    }, []);

    const selectedRate = QUIZ_RATE_OPTIONS.find((item) => item.id === scoreTier) || QUIZ_RATE_OPTIONS[0];

    const handleRateChange = (nextTier) => {
        const nextRate = QUIZ_RATE_OPTIONS.find((item) => item.id === nextTier) || QUIZ_RATE_OPTIONS[0];
        setScoreTier(nextRate.id);
        setReward(nextRate.reward);
        setIsManualReward(false);
    };

    const handleManualModeToggle = (checked) => {
        setIsManualReward(checked);
        if (!checked) {
            const nextRate = QUIZ_RATE_OPTIONS.find((item) => item.id === scoreTier) || QUIZ_RATE_OPTIONS[0];
            setScoreTier(nextRate.id);
            setReward(nextRate.reward);
        }
    };

    const handleManualRewardChange = (value) => {
        const normalizedValue = Number(String(value || "").replace(/[^\d.]/g, ""));
        const nextReward = Number.isFinite(normalizedValue) ? normalizedValue : 0;
        setReward(nextReward);
        setIsManualReward(true);

        const matchedRate = QUIZ_RATE_OPTIONS.find((item) => Number(item.reward) === Number(nextReward));
        setScoreTier(matchedRate ? matchedRate.id : "custom");
    };

    const handleAddHighlight = (color) => {
        if (!highlightText.trim()) {
            alert("色を付けたい文字を入力してください");
            return;
        }
        setContent((current) => appendColoredText(current, highlightText, color));
        setHighlightText("");
    };

    return (
        <div className="quiz-form-page">
            <div className="page-header">
                <h1 className="page-title">📝 クイズを作成</h1>
                <p className="page-subtitle">新しいクイズを作成して、学生に出題しましょう</p>
            </div>

            <div className="quiz-form-card">
                <div className="quiz-form-group">
                    <div
                        className="glass-card"
                        style={{
                            padding: "16px",
                            display: "grid",
                            gap: "12px",
                            color: "#fff",
                            background: "rgba(255,255,255,0.04)",
                        }}
                    >
                        <div style={{ fontWeight: 700 }}>Web3小テストの配点ルール</div>
                        <div style={{ color: "rgba(255,255,255,0.82)", lineHeight: 1.7 }}>
                            0.3点 × 2問、0.6点 × 2問、1.2点 × 1問
                            <br />
                            1講義あたり最大 {MAX_TFT_PER_LECTURE}TFT、全{TOTAL_LECTURE_COUNT}回で最大 {MAX_TFT_TOTAL}TFT
                        </div>
                    </div>
                </div>

                {/* タイトル */}
                <div className="quiz-form-group">
                    <Form.Group controlId="form_titile" style={{ textAlign: "left" }}>
                        <Form.Label>📌 タイトル</Form.Label>
                        <Form.Control 
                            type="text" 
                            placeholder="クイズのタイトルを入力" 
                            value={title} 
                            onChange={(event) => setTitle(event.target.value)} 
                        />
                    </Form.Group>
                </div>

                {/* 説明 */}
                <div className="quiz-form-group">
                    <Form.Group style={{ textAlign: "left" }}>
                        <Form.Label>📄 説明</Form.Label>
                        <Form.Control 
                            as="textarea" 
                            rows={explanation.split("\n").length + 3} 
                            value={explanation} 
                            onChange={(event) => setExplanation(event.target.value)} 
                        />
                    </Form.Group>
                </div>

                {/* サムネイル */}
                <div className="quiz-form-group">
                    <Form.Group style={{ textAlign: "left" }}>
                        <Form.Label>🖼️ サムネイル URL</Form.Label>
                        <Form.Control 
                            type="url" 
                            value={thumbnail_url} 
                            placeholder="https://example.com/image.png"
                            onChange={(event) => setThumbnail_url(event.target.value)} 
                        />
                    </Form.Group>
                    {thumbnail_url && (
                        <div className="thumbnail-preview">
                            <img src={thumbnail_url} alt="サムネイルプレビュー" />
                        </div>
                    )}
                </div>

                {/* 内容（Markdown） */}
                <div className="quiz-form-group">
                    <Form.Group data-color-mode="dark" style={{ textAlign: "left" }}>
                        <Form.Label>📋 内容</Form.Label>
                        <div className="content-helper-card">
                            <div className="content-helper-title">重要箇所の色付け</div>
                            <div className="content-helper-row">
                                <Form.Control
                                    type="text"
                                    value={highlightText}
                                    placeholder="色を付けたい文字を入力"
                                    onChange={(event) => setHighlightText(event.target.value)}
                                />
                                <button type="button" className="content-color-btn red" onClick={() => handleAddHighlight("#ef4444")}>赤</button>
                                <button type="button" className="content-color-btn blue" onClick={() => handleAddHighlight("#3b82f6")}>青</button>
                                <button type="button" className="content-color-btn yellow" onClick={() => handleAddHighlight("#facc15")}>黄</button>
                                <button type="button" className="content-color-btn green" onClick={() => handleAddHighlight("#22c55e")}>緑</button>
                            </div>
                            <div className="content-helper-note">入力した文字を選んだ色で本文末尾に追加します。</div>
                        </div>
                        <MDEditor height={500} value={content} onChange={setContent} />
                    </Form.Group>
                </div>

                <div className="quiz-form-group">
                    <Form.Group style={{ textAlign: "left" }}>
                        <Form.Label>🔁 回答回数の設定</Form.Label>
                        <div className="answer-policy-row">
                            <label className={`answer-policy-option ${allowMultipleAnswers ? "" : "selected"}`}>
                                <input
                                    type="radio"
                                    name="answer_policy"
                                    checked={!allowMultipleAnswers}
                                    onChange={() => setAllowMultipleAnswers(false)}
                                />
                                初回のみ回答可
                            </label>
                            <label className={`answer-policy-option ${allowMultipleAnswers ? "selected" : ""}`}>
                                <input
                                    type="radio"
                                    name="answer_policy"
                                    checked={allowMultipleAnswers}
                                    onChange={() => setAllowMultipleAnswers(true)}
                                />
                                締切まで複数回回答可
                            </label>
                        </div>
                        <div className="content-helper-note">
                            複数回回答可を選ぶと、支払い確定前かつ締切前であれば回答内容を更新できます。
                        </div>
                    </Form.Group>
                </div>

                {/* 回答選択肢 */}
                <div className="quiz-form-group">
                    <Answer_select 
                        name={"回答の追加"} 
                        variable={answer_data} 
                        variable1={correct} 
                        set={setAnswer_data} 
                        set1={setCorrect} 
                        setAnswer_type={setAnswer_type} 
                        answer_type={answer_type} 
                    />
                </div>

                <div className="quiz-form-group">
                    <Form.Group style={{ textAlign: "left" }}>
                        <Form.Label>🎯 配点とTFTレート</Form.Label>
                        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "8px" }}>
                            {QUIZ_RATE_OPTIONS.map((option) => {
                                const selected = !isManualReward && option.id === scoreTier;
                                return (
                                    <button
                                        key={option.id}
                                        type="button"
                                        onClick={() => handleRateChange(option.id)}
                                        style={{
                                            border: selected ? "2px solid rgba(56, 189, 248, 0.9)" : "1px solid rgba(255,255,255,0.18)",
                                            background: selected ? "rgba(56, 189, 248, 0.18)" : "rgba(255,255,255,0.04)",
                                            color: "#fff",
                                            borderRadius: "12px",
                                            padding: "12px 16px",
                                            minWidth: "160px",
                                            textAlign: "left",
                                            fontWeight: 600,
                                        }}
                                    >
                                        <div>{option.label}</div>
                                        <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.74)", marginTop: "4px" }}>
                                            1問あたり {option.reward} TFT
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                        <div style={{ marginTop: "16px" }}>
                            <Form.Check
                                type="switch"
                                id="manual-reward-switch"
                                label="TFT報酬を手動で入力する"
                                checked={isManualReward}
                                onChange={(event) => handleManualModeToggle(event.target.checked)}
                                style={{ color: "#fff", marginBottom: "12px" }}
                            />
                            {isManualReward && (
                                <Form.Group style={{ maxWidth: "320px" }}>
                                    <Form.Label style={{ color: "#fff" }}>手動入力の報酬（TFT）</Form.Label>
                                    <Form.Control
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={reward}
                                        onChange={(event) => handleManualRewardChange(event.target.value)}
                                        placeholder="例: 45"
                                    />
                                    <div style={{ marginTop: "8px", fontSize: "13px", color: "rgba(255,255,255,0.72)" }}>
                                        現在の換算目安: {convertTftToPoint(reward).toFixed(2)} 点（1点 = {TFT_PER_POINT} TFT）
                                    </div>
                                </Form.Group>
                            )}
                        </div>
                    </Form.Group>

                    <div
                        className="glass-card"
                        style={{
                            marginTop: "12px",
                            padding: "14px 16px",
                            color: "#fff",
                            display: "flex",
                            gap: "20px",
                            flexWrap: "wrap",
                            background: "rgba(255,255,255,0.04)",
                        }}
                    >
                        <div>
                            <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.72)" }}>今回の配点</div>
                            <div style={{ fontWeight: 700 }}>{(isManualReward ? convertTftToPoint(reward) : selectedRate.point).toFixed(2)} 点</div>
                        </div>
                        <div>
                            <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.72)" }}>今回の報酬</div>
                            <div style={{ fontWeight: 700 }}>{reward} TFT</div>
                        </div>
                    </div>
                </div>

                {/* 日時設定 */}
                <div className="quiz-form-group">
                    <div className="date-row">
                        <Form.Group style={{ textAlign: "left" }}>
                            <Form.Label>🕐 回答開始日時</Form.Label>
                            <Form.Control
                                type="datetime-local"
                                defaultValue={now}
                                min={now}
                                onChange={(event) => setReply_startline(new Date(event.target.value))}
                            />
                        </Form.Group>

                        <Form.Group style={{ textAlign: "left" }}>
                            <Form.Label>⏰ 回答締切日時</Form.Label>
                            <Form.Control
                                type="datetime-local"
                                defaultValue={reply_deadline}
                                min={now}
                                onChange={(event) => setReply_deadline(new Date(event.target.value))}
                            />
                        </Form.Group>
                    </div>
                </div>

                {/* 送信ボタン */}
                <div className="submit-area">
                    <button className="btn-submit-quiz" onClick={() => create_quiz()}>
                        🚀 クイズを作成
                    </button>
                </div>
            </div>

            <Wait_Modal showFlag={show} />
        </div>
    );
}

export default Create_quiz;
