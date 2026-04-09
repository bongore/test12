import { Contracts_MetaMask } from "../../contract/contracts";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useParams } from "react-router-dom";
import "./user_page.css";
import History_list from "./component/history_list";
import User_card from "./component/user_card";
import { useRef } from "react";
import { buildBadgeSet, buildReviewList, getCourseEnhancementSnapshot } from "../../utils/courseEnhancements";
import { bootstrap_teacher_addresses } from "../../contract/config";

function normalizeAddress(address) {
    return String(address || "").toLowerCase();
}

function isBootstrapTeacherAddress(address) {
    const normalizedTarget = normalizeAddress(address);
    if (!normalizedTarget) return false;
    return (bootstrap_teacher_addresses || []).some(
        (teacherAddress) => normalizeAddress(teacherAddress) === normalizedTarget
    );
}

function User_page(props) {
    const { address } = useParams();

    const [icons, SetIcons] = useState(null);
    const [user_name, Setuser_name] = useState(null);
    const [result, SetResult] = useState(null);
    const [token, Set_token] = useState(null);
    const [state, Set_state] = useState(null);
    const [rank, setRank] = useState(null);
    const [num_of_student, setNum_of_student] = useState(null);
    const [history_sum, Set_history_sum] = useState(null);
    const [tttBalance, setTttBalance] = useState(0);
    const [roleInfo, setRoleInfo] = useState({ key: "guest", label: "未登録" });
    const [registrationInfo, setRegistrationInfo] = useState({ registered: false, addedBy: "", addedAt: 0 });
    const [connectedAddress, setConnectedAddress] = useState("");
    const [reviewItems, setReviewItems] = useState([]);
    const [badges, setBadges] = useState([]);
    const now_numRef = useRef(0);
    const targetRef = useRef(null);

    const cont = props.cont || new Contracts_MetaMask();
    const [history_list, Set_history_list] = useState([]);

    const get_variable = async () => {
        Set_token(await cont.get_token_balance(address));
        let [user_name, image, result, state] = await cont.get_user_data(address);
        const nextRoleInfo = await cont.getUserRole(address);
        const nextRegistrationInfo = await cont.getRegistrationDetails(address);
        const nextConnectedAddress = await cont.get_address();
        const bootstrapTeacher = isBootstrapTeacherAddress(address);
        Setuser_name(user_name);
        SetIcons(image);
        SetResult(result / 10 ** 18);
        setRank(await cont.get_rank(result));
        setNum_of_student(await cont.get_num_of_students());
        Set_state(state);
        setTttBalance(await cont.get_ttt_balance(address));
        setRoleInfo(
            bootstrapTeacher
                ? { key: "teacher", label: "教員" }
                : (nextRoleInfo || { key: "guest", label: "未登録" })
        );
        setRegistrationInfo(
            bootstrapTeacher
                ? { registered: true, addedBy: address, addedAt: 0 }
                : (nextRegistrationInfo || { registered: false, addedBy: "", addedAt: 0 })
        );
        setConnectedAddress(nextConnectedAddress || "");

        cont.get_user_history_len(address).then((data) => {
            Set_history_sum(Number(data));
            now_numRef.current = Number(data);
        });

        const quizLength = Number(await cont.get_quiz_lenght());
        const quizData = [];
        for (let i = 0; i < quizLength; i += 1) {
            try {
                quizData.push(await cont.get_quiz_simple(i));
            } catch (error) {
                console.error("Failed to load quiz for review list", error);
            }
        }

        const snapshot = getCourseEnhancementSnapshot();
        const ownLogs = snapshot.activityLogs.filter((log) => String(log.actor || log.address || "").toLowerCase() === String(address || "").toLowerCase());
        const ownPractice = snapshot.practiceAttempts.filter((item) => String(item.address || "").toLowerCase() === String(address || "").toLowerCase());

        setReviewItems(buildReviewList({ quizzes: quizData, address, practiceAttempts: ownPractice }));
        setBadges(buildBadgeSet({ logs: ownLogs, boardLogs: snapshot.boardLogs, practiceAttempts: ownPractice }));
    };

    useEffect(() => {
        get_variable();
        // address changes when another profile page is opened.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [address]);

    if (history_sum != null) {
        return (
            <div className="user-page animate-fadeIn">
                <div className="user-page-header">
                    <h1 className="heading-xl">マイページ</h1>
                </div>

                <User_card
                    address={address}
                    icons={icons}
                    user_name={user_name}
                    token={token}
                    result={result}
                    state={state}
                    rank={rank}
                    num_of_student={num_of_student}
                    tttBalance={tttBalance}
                    roleInfo={roleInfo}
                    registrationInfo={registrationInfo}
                    connectedAddress={connectedAddress}
                    cont={cont}
                />

                <div className="glass-card" style={{ padding: "var(--space-5)", marginBottom: "var(--space-5)" }}>
                    <h2 className="heading-md" style={{ marginBottom: "var(--space-3)" }}>実績バッジ</h2>
                    {badges.length === 0 ? (
                        <div style={{ color: "rgba(255,255,255,0.7)" }}>まだバッジはありません。解答、質問、練習を進めると表示されます。</div>
                    ) : (
                        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                            {badges.map((badge) => (
                                <div key={badge.id} className="badge-status" style={{ padding: "8px 12px" }}>
                                    {badge.label}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="glass-card" style={{ padding: "var(--space-5)", marginBottom: "var(--space-5)" }}>
                    <h2 className="heading-md" style={{ marginBottom: "var(--space-3)" }}>復習リスト</h2>
                    {reviewItems.length === 0 ? (
                        <div style={{ color: "rgba(255,255,255,0.7)" }}>いまのところ復習候補はありません。</div>
                    ) : (
                        <div style={{ display: "grid", gap: "12px" }}>
                            {reviewItems.map((item) => (
                                <Link
                                    key={item.quizId}
                                    to={`/answer_quiz/${item.quizId}?practice=1`}
                                    className="glass-card"
                                    style={{ padding: "12px 16px", textDecoration: "none", color: "#fff" }}
                                >
                                    <div style={{ fontWeight: 700 }}>{item.title}</div>
                                    <div style={{ color: "rgba(255,255,255,0.75)", marginTop: "4px" }}>{item.reason}</div>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>

                <History_list
                    cont={cont}
                    history_sum={history_sum}
                    Set_history_sum={Set_history_sum}
                    history_list={history_list}
                    Set_history_list={Set_history_list}
                    targetRef={targetRef}
                    now_numRef={now_numRef}
                    address={address}
                />

                <div className="token-history">
                    <h2 className="heading-md" style={{ marginBottom: "var(--space-4)" }}>
                        📊 トークン履歴
                    </h2>
                    <div className="timeline stagger-children">
                        {history_list.map((history, index) => {
                            return <div key={index}>{history}</div>;
                        })}
                    </div>
                    <div ref={targetRef} className="quiz-loading">
                        <div className="skeleton skeleton-card"></div>
                    </div>
                </div>
            </div>
        );
    } else {
        return (
            <div className="user-page">
                <div className="skeleton skeleton-card" style={{ height: "200px" }}></div>
                <div className="skeleton skeleton-card"></div>
                <div className="skeleton skeleton-card"></div>
            </div>
        );
    }
}

export default User_page;
