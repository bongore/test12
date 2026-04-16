import React, { useEffect, useMemo, useState } from "react";
import { Form } from "react-bootstrap";
import { ACTION_TYPES, appendActivityLog } from "../../../utils/activityLog";

function normalizeAddressLines(rawValue) {
    return rawValue
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);
}

function Token_grant_panel(props) {
    const [singleAddress, setSingleAddress] = useState("");
    const [bulkAddresses, setBulkAddresses] = useState("");
    const [students, setStudents] = useState([]);
    const [selectedStudents, setSelectedStudents] = useState([]);
    const [polAmount, setPolAmount] = useState("1");
    const [tftAmount, setTftAmount] = useState("50");
    const [tttAmount, setTttAmount] = useState("1000");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const typedAddresses = useMemo(() => normalizeAddressLines(bulkAddresses), [bulkAddresses]);

    async function loadStudents() {
        try {
            const result = await props.cont.get_student_list();
            setStudents(Array.isArray(result) ? result : []);
        } catch (error) {
            console.error("Failed to load students for token grant panel", error);
            setStudents([]);
        }
    }

    useEffect(() => {
        loadStudents();
    }, [props.cont]);

    function toggleStudent(address) {
        setSelectedStudents((current) => (
            current.includes(address)
                ? current.filter((item) => item !== address)
                : [...current, address]
        ));
    }

    function applyPreset() {
        setPolAmount("1");
        setTftAmount("50");
        setTttAmount("1000");
    }

    async function grantToAddresses(addresses, sourceLabel) {
        const normalizedTargets = props.cont.normalizeAddressList(addresses);
        if (normalizedTargets.length === 0) {
            alert("付与先アドレスを入力または選択してください。");
            return;
        }

        setIsSubmitting(true);
        try {
            const result = await props.cont.grantStudentStarterTokens(normalizedTargets, {
                pol: polAmount,
                tft: tftAmount,
                ttt: tttAmount,
            });

            appendActivityLog(ACTION_TYPES.ADMIN_GRANT_TOKENS, {
                page: "admin",
                source: sourceLabel,
                recipientCount: normalizedTargets.length,
                polAmount: Number(polAmount || 0),
                tftAmount: Number(tftAmount || 0),
                tttAmount: Number(tttAmount || 0),
            });

            alert(
                `${normalizedTargets.length}件に付与しました。\n`
                + `POL: ${polAmount || 0}\n`
                + `TFT: ${tftAmount || 0}\n`
                + `TTT: ${tttAmount || 0}\n`
                + `処理件数: ${result.length}`
            );
        } catch (error) {
            console.error("Failed to grant tokens", error);
            alert(error?.shortMessage || error?.message || "トークン付与に失敗しました。MetaMask の承認と残高を確認してください。");
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div>
            <h3 className="section-title">学生へのトークン付与</h3>
            <p className="section-desc">
                公開アドレスを提出した学生に、回答用 POL、回答お礼の TFT、掲示板用 TTT を個別またはまとめて配布できます。
            </p>

            <div className="token-grant-grid">
                <div className="token-grant-card">
                    <div className="token-grant-card-title">付与レート</div>
                    <div className="token-grant-card-desc">
                        初期値は 1 POL / 50 TFT / 1000 TTT です。必要に応じて数を変更できます。
                    </div>
                    <div className="token-grant-inputs">
                        <Form.Group style={{ textAlign: "left" }}>
                            <Form.Label>POL</Form.Label>
                            <Form.Control type="number" min="0" step="0.01" value={polAmount} onChange={(event) => setPolAmount(event.target.value)} />
                        </Form.Group>
                        <Form.Group style={{ textAlign: "left" }}>
                            <Form.Label>TFT</Form.Label>
                            <Form.Control type="number" min="0" step="1" value={tftAmount} onChange={(event) => setTftAmount(event.target.value)} />
                        </Form.Group>
                        <Form.Group style={{ textAlign: "left" }}>
                            <Form.Label>TTT</Form.Label>
                            <Form.Control type="number" min="0" step="1" value={tttAmount} onChange={(event) => setTttAmount(event.target.value)} />
                        </Form.Group>
                    </div>
                    <div className="token-grant-actions">
                        <button className="btn-action" type="button" onClick={applyPreset}>
                            標準値に戻す
                        </button>
                    </div>
                </div>

                <div className="token-grant-card">
                    <div className="token-grant-card-title">個別に付与</div>
                    <Form.Group style={{ textAlign: "left" }}>
                        <Form.Label>対象のウォレットアドレス</Form.Label>
                        <Form.Control
                            type="text"
                            value={singleAddress}
                            onChange={(event) => setSingleAddress(event.target.value)}
                            placeholder="0x1234..."
                        />
                    </Form.Group>
                    <div className="token-grant-actions">
                        <button className="btn-action" type="button" disabled={isSubmitting} onClick={() => grantToAddresses([singleAddress], "single")}>
                            1件に付与
                        </button>
                    </div>
                </div>
            </div>

            <div className="token-grant-card" style={{ marginTop: "var(--space-6)" }}>
                <div className="token-grant-card-title">入力したアドレスへまとめて付与</div>
                <div className="token-grant-card-desc">改行区切りで複数アドレスを貼り付けると、一括で送れます。</div>
                <Form.Group style={{ textAlign: "left" }}>
                    <Form.Label>付与先アドレス一覧</Form.Label>
                    <Form.Control
                        as="textarea"
                        rows={Math.max(typedAddresses.length + 3, 6)}
                        value={bulkAddresses}
                        onChange={(event) => setBulkAddresses(event.target.value)}
                        placeholder={"0x1234...\n0x5678..."}
                    />
                </Form.Group>
                <div className="token-grant-actions">
                    <button className="btn-action" type="button" disabled={isSubmitting} onClick={() => grantToAddresses(typedAddresses, "bulk_input")}>
                        入力済みアドレスへ一括付与
                    </button>
                </div>
            </div>

            <div className="token-grant-card" style={{ marginTop: "var(--space-6)" }}>
                <div className="token-grant-card-title">登録済み学生から選んで付与</div>
                <div className="token-grant-card-desc">
                    提出済みアドレスの学生を選んでまとめて付与できます。上の個別入力にもクリックで反映できます。
                </div>
                <div className="token-grant-actions" style={{ marginBottom: "var(--space-4)" }}>
                    <button className="btn-action" type="button" onClick={() => setSelectedStudents(students)}>
                        全員選択
                    </button>
                    <button className="btn-action token-grant-secondary-btn" type="button" onClick={() => setSelectedStudents([])}>
                        選択解除
                    </button>
                    <button className="btn-action" type="button" disabled={isSubmitting} onClick={() => grantToAddresses(selectedStudents, "bulk_selected")}>
                        選択した学生へ一括付与
                    </button>
                </div>
                <div className="token-grant-student-list">
                    {students.length === 0 ? (
                        <div className="address-item">登録済み学生はまだありません。</div>
                    ) : (
                        students.map((student, index) => (
                            <label key={`${student}-${index}`} className="token-grant-student-item">
                                <input
                                    type="checkbox"
                                    checked={selectedStudents.includes(student)}
                                    onChange={() => toggleStudent(student)}
                                />
                                <button
                                    type="button"
                                    className="token-grant-address-btn"
                                    onClick={() => setSingleAddress(student)}
                                >
                                    {student}
                                </button>
                            </label>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

export default Token_grant_panel;
