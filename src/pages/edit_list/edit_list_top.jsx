import { Contracts_MetaMask } from "../../contract/contracts";
import { useState, useEffect, useRef, useMemo } from "react";
import Simple_quiz from "./components/quiz_simple";
import Quiz_list from "./components/quiz_list";
import { useAccessControl } from "../../utils/accessControl";
import "./edit_list_top.css";

function Edit_list_top(props) {
    const cont = useMemo(() => new Contracts_MetaMask(), []);
    const access = useAccessControl(cont);

    const now_numRef = useRef(0);
    const [quiz_sum, Set_quiz_sum] = useState(null);
    const [quiz_list, Set_quiz_list] = useState([]);
    const [add_num, Set_add_num] = useState(7);
    const [loadError, setLoadError] = useState("");

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

            {quiz_list.map((quiz, index) => (
                <Simple_quiz key={`${quiz?.sourceAddress || quiz?.[12] || "default"}-${Number(quiz?.[0] ?? index)}-${index}`} quiz={quiz} />
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
