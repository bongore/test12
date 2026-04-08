import React from "react";
import "./chat.css";

function Chat_feed({ messages, onQuestionLike, likedQuestionIds, canModerate = false, onDeleteMessage }) {
    // 金額に応じたスーパーチャットのカラークラスを取得
    const getSuperchatColorClass = (amount) => {
        if (amount >= 1000) return "superchat-red";
        if (amount >= 500) return "superchat-magenta";
        if (amount >= 100) return "superchat-orange";
        if (amount >= 50) return "superchat-green";
        return "superchat-blue";
    };

    return (
        <div className="chat-feed" style={{ overflowY: "auto", height: "100%", paddingRight: "12px" }}>
            {messages.map((msg) => (
                <div
                    key={msg.id}
                    className={`chat-message ${msg.type === "superchat" ? `chat-superchat ${getSuperchatColorClass(msg.amount)}` : ""} ${msg.messageKind === "question" ? "chat-question" : ""}`}
                >
                    {canModerate ? (
                        <div className="chat-message-tools">
                            <button
                                type="button"
                                className="chat-message-delete"
                                onClick={() => onDeleteMessage?.(msg.id)}
                            >
                                削除
                            </button>
                        </div>
                    ) : null}
                    {msg.messageKind === "question" && (
                        <div className="chat-question-header">
                            <span className="chat-question-badge">質問</span>
                            <button
                                type="button"
                                className={`chat-question-like ${likedQuestionIds?.includes(msg.id) ? "is-liked" : ""}`}
                                onClick={() => onQuestionLike?.(msg.id)}
                                disabled={!onQuestionLike || likedQuestionIds?.includes(msg.id)}
                            >
                                {likedQuestionIds?.includes(msg.id) ? "支持済み" : "支持する"} {msg.likeCount || 0}
                            </button>
                        </div>
                    )}
                    {msg.type === "superchat" && (
                        <div className="superchat-header">
                            <span className="superchat-amount">{msg.amount} TTT</span>
                            <span className="superchat-user">{msg.user}</span>
                            {msg.recipientLabel ? (
                                <span className="superchat-user">→ {msg.recipientLabel}</span>
                            ) : null}
                        </div>
                    )}
                    <div className="chat-message-content">
                        {msg.type !== "superchat" && (
                            <span className="chat-user text-muted">{msg.user}: </span>
                        )}
                        <span className="chat-text" style={{ color: "#ffffff", opacity: 0.9 }}>{msg.text}</span>
                    </div>
                </div>
            ))}
        </div>
    );
}

export default Chat_feed;
