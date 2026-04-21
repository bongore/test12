import { Contracts_MetaMask } from "../../contract/contracts";
import Form from "react-bootstrap/Form";
import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import MDEditor from "@uiw/react-md-editor";
import Wait_Modal from "../../contract/wait_Modal";
import { ACTION_TYPES, appendActivityLog } from "../../utils/activityLog";
import { useAccessControl } from "../../utils/accessControl";
import "../create_quiz/create_quiz.css";

function Edit_quiz() {
    const navigate = useNavigate();
    const location = useLocation();
    const id = useParams()["id"];
    const sourceAddress = new URLSearchParams(location.search).get("c") || "";
    const [owner, setOwner] = useState(null);

    const [title, setTitle] = useState("");
    const [explanation, setExplanation] = useState("");
    const [thumbnail_url, setThumbnail_url] = useState("");
    const [content, setContent] = useState("");
    const [reward, setReward] = useState("");
    const [originalReward, setOriginalReward] = useState(0);
    const [respondentLimit, setRespondentLimit] = useState(0);
    const [reply_startline, setReply_startline] = useState(
        new Date()
            .toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })
            .replace(/[/]/g, "-")
            .replace(/\s(\d):/, " 0$1:"),
    );
    const [reply_deadline, setReply_deadline] = useState(getLocalizedDateTimeString(addDays(new Date(), 0)));
    const Contract = useMemo(() => new Contracts_MetaMask(), []);
    const access = useAccessControl(Contract);

    const [now, setnow] = useState(null);
    const [show, setShow] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const nextReward = Number(reward || 0);
    const rewardDelta = Number.isFinite(nextReward) ? Math.max(nextReward - originalReward, 0) : 0;
    const rewardDepositPreview = rewardDelta * respondentLimit;
    const isRewardDecrease = Number.isFinite(nextReward) && nextReward < originalReward;

    const edit_quiz = async () => {
        console.log(id, owner, title, explanation, thumbnail_url, content, reply_startline, reply_deadline);
        const rewardValue = Number(reward || 0);
        if (!Number.isFinite(rewardValue) || rewardValue < 0) {
            alert("回答報酬は0以上の数値で入力してください");
            return;
        }
        if (rewardValue < originalReward) {
            alert("既に預託済みのTFTと実際の送金量がずれるため、報酬の減額はできません。増額のみ可能です。");
            return;
        }
        if (new Date(reply_startline).getTime() < new Date(reply_deadline).getTime()) {
            const editReceipt = await Contract.edit_quiz(id, owner, title, explanation, thumbnail_url, content, reply_startline, reply_deadline, setShow, sourceAddress);
            if (!editReceipt || editReceipt.status !== "success") {
                alert("クイズ編集のトランザクションが完了していません。報酬は変更していません。");
                return;
            }

            const delta = rewardValue - originalReward;
            if (delta > 0) {
                await Contract.add_quiz_reward_delta(id, delta.toString(), respondentLimit, setShow, sourceAddress);
            }
            appendActivityLog(ACTION_TYPES.ADMIN_EDIT_QUIZ, {
                page: "edit_quiz",
                quizId: id,
                title,
                rewardBefore: originalReward,
                rewardAfter: rewardValue,
                rewardDelta: delta,
                respondentLimit,
            });
            navigate("/edit_list");
        } else {
            alert("回答開始日時を回答締切日時より前に設定してください");
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
        let active = true;

        async function loadQuiz() {
            try {
                const quiz = await Contract.get_quiz(id, sourceAddress);
                if (!active || !quiz) return;
                setOwner(quiz[1]);
                setTitle(quiz[2] || "");
                setExplanation(quiz[3] || "");
                setThumbnail_url(quiz[4] || "");
                setContent(quiz[5] || "");
                setReply_startline(getLocalizedDateTimeString(new Date(Number(quiz[8]) * 1000)));
                setReply_deadline(getLocalizedDateTimeString(new Date(Number(quiz[9]) * 1000)));
                const currentReward = Number(quiz[10] || 0) / 10 ** 18;
                setReward(String(currentReward));
                setOriginalReward(currentReward);
                setRespondentLimit(Number(quiz[12] || 0));
                setnow(getLocalizedDateTimeString());
                setIsReady(true);
            } catch (error) {
                console.error("Failed to load quiz for edit", error);
                setIsReady(false);
            }
        }

        loadQuiz();

        return () => {
            active = false;
        };
    }, [Contract, id, sourceAddress]);

    if (access.isLoading || !isReady) {
        return <div className="quiz-form-page">読み込み中です...</div>;
    }

    if (access.isTeacher) {
        return (
            <div className="quiz-form-page">
                <div className="page-header">
                    <h1 className="page-title">✏️ クイズを編集</h1>
                    <p className="page-subtitle">クイズID: {id} の内容を編集します</p>
                </div>

                <div className="quiz-form-card">
                    {/* タイトル */}
                    <div className="quiz-form-group">
                        <Form.Group controlId="form_titile" style={{ textAlign: "left" }}>
                            <Form.Label>📌 タイトル</Form.Label>
                            <Form.Control 
                                type="text" 
                                placeholder="Enter Title" 
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
                            <Form.Label>🖼️ サムネイル</Form.Label>
                            <Form.Control 
                                type="url" 
                                value={thumbnail_url} 
                                onChange={(event) => setThumbnail_url(event.target.value)} 
                            />
                        </Form.Group>
                        {thumbnail_url && (
                            <div className="thumbnail-preview">
                                <img src={thumbnail_url} alt="サムネイルプレビュー" />
                            </div>
                        )}
                    </div>

                    {/* 内容 */}
                    <div className="quiz-form-group">
                        <Form.Group data-color-mode="dark" style={{ textAlign: "left" }}>
                            <Form.Label>📋 内容</Form.Label>
                            <MDEditor height={500} value={content} onChange={setContent} />
                        </Form.Group>
                    </div>

                    {/* 日時設定 */}
                    <div className="quiz-form-group">
                        <div className="date-row">
                            <Form.Group style={{ textAlign: "left" }}>
                                <Form.Label>🕐 回答開始日時</Form.Label>
                                <Form.Control
                                    type="datetime-local"
                                    defaultValue={reply_startline}
                                    onChange={(event) => setReply_startline(new Date(event.target.value))}
                                />
                            </Form.Group>

                            <Form.Group style={{ textAlign: "left" }}>
                                <Form.Label>⏰ 回答締切日時</Form.Label>
                                <Form.Control
                                    type="datetime-local"
                                    defaultValue={reply_deadline}
                                    onChange={(event) => setReply_deadline(new Date(event.target.value))}
                                />
                            </Form.Group>
                        </div>
                    </div>

                    {/* 報酬設定 */}
                    <div className="quiz-form-group">
                        <Form.Group style={{ textAlign: "left" }}>
                            <Form.Label>💎 回答報酬 TFT</Form.Label>
                            <Form.Control
                                type="number"
                                min={originalReward}
                                step="0.000001"
                                value={reward}
                                onChange={(event) => setReward(event.target.value)}
                            />
                            <div className="reward-edit-summary">
                                <span>現在の報酬: {originalReward.toLocaleString()} TFT / 人</span>
                                <span>回答上限: {respondentLimit.toLocaleString()} 人</span>
                                <span>追加預託: {rewardDepositPreview.toLocaleString()} TFT</span>
                            </div>
                            {isRewardDecrease ? (
                                <p className="reward-edit-warning">
                                    減額はできません。既に預託されたTFTと実際の送金量がずれるため、増額のみ対応しています。
                                </p>
                            ) : rewardDelta > 0 ? (
                                <p className="reward-edit-note">
                                    保存時に差額 {rewardDelta.toLocaleString()} TFT × {respondentLimit.toLocaleString()} 人分だけ追加で預託します。
                                </p>
                            ) : (
                                <p className="reward-edit-note">報酬額は変更されません。</p>
                            )}
                        </Form.Group>
                    </div>

                    {/* 送信ボタン */}
                    <div className="submit-area">
                        <button className="btn-submit-quiz" onClick={() => edit_quiz()}>
                            💾 編集を保存
                        </button>
                    </div>
                </div>

                <Wait_Modal showFlag={show} />
            </div>
        );
    } else {
        return (<div className="quiz-form-page">この画面は教員・TAのみ利用できます。</div>);
    }
}

export default Edit_quiz;
