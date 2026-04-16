import React, { useEffect, useMemo, useState } from "react";
import { Form } from "react-bootstrap";
import { ACTION_TYPES, appendActivityLog } from "../../../utils/activityLog";
import { getAddressGrantStatus, getGrantLedgerEntries, hasGrantedToken, markGrantedToken, persistGrantRecordToServer, syncGrantLedgerFromServer, TOKEN_GRANT_KEYS } from "../../../utils/tokenGrantLedger";

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
    const [grantLedgerEntries, setGrantLedgerEntries] = useState([]);

    const typedAddresses = useMemo(() => normalizeAddressLines(bulkAddresses), [bulkAddresses]);

    async function refreshGrantLedger() {
        try {
            await syncGrantLedgerFromServer();
        } catch (error) {
            console.error("Failed to sync token grant ledger", error);
        }
        setGrantLedgerEntries(getGrantLedgerEntries());
    }

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
        refreshGrantLedger();
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

    function buildGrantPlan(addresses) {
        const normalizedTargets = props.cont.normalizeAddressList(addresses);
        const requestedAmounts = {
            POL: Number(polAmount || 0),
            TFT: Number(tftAmount || 0),
            TTT: Number(tttAmount || 0),
        };

        const plan = normalizedTargets.map((address) => {
            const status = getAddressGrantStatus(address);
            return {
                address,
                status,
                shouldGrant: {
                    POL: requestedAmounts.POL > 0 && !hasGrantedToken(address, TOKEN_GRANT_KEYS.POL),
                    TFT: requestedAmounts.TFT > 0 && !hasGrantedToken(address, TOKEN_GRANT_KEYS.TFT),
                    TTT: requestedAmounts.TTT > 0 && !hasGrantedToken(address, TOKEN_GRANT_KEYS.TTT),
                },
            };
        });

        return {
            requestedAmounts,
            normalizedTargets,
            plan,
        };
    }

    async function grantToAddresses(addresses, sourceLabel) {
        await refreshGrantLedger();
        const { requestedAmounts, normalizedTargets, plan } = buildGrantPlan(addresses);
        if (normalizedTargets.length === 0) {
            alert("付与先アドレスを入力または選択してください。");
            return;
        }

        const grantableTargets = plan.filter((item) => item.shouldGrant.POL || item.shouldGrant.TFT || item.shouldGrant.TTT);
        if (grantableTargets.length === 0) {
            alert("選択した学生には、指定した POL / TFT / TTT はすでに付与済みです。二重送金は行いません。");
            return;
        }

        setIsSubmitting(true);
        try {
            const results = [];

            for (const item of grantableTargets) {
                const recipientResults = await props.cont.grantStudentStarterTokens([item.address], {
                    pol: item.shouldGrant.POL ? requestedAmounts.POL : 0,
                    tft: item.shouldGrant.TFT ? requestedAmounts.TFT : 0,
                    ttt: item.shouldGrant.TTT ? requestedAmounts.TTT : 0,
                });
                results.push(...recipientResults);

                recipientResults.forEach((result) => {
                    const assetKey =
                        result.asset === "POL"
                            ? TOKEN_GRANT_KEYS.POL
                            : result.asset === "TFT"
                                ? TOKEN_GRANT_KEYS.TFT
                                : TOKEN_GRANT_KEYS.TTT;

                    markGrantedToken(item.address, assetKey, {
                        amount: result.amount,
                        txHash: result.hash,
                        source: sourceLabel,
                    });
                    persistGrantRecordToServer(item.address, assetKey, {
                        grantedAt: new Date().toISOString(),
                        amount: result.amount,
                        txHash: result.hash,
                        source: sourceLabel,
                    }).catch((error) => {
                        console.error("Failed to persist token grant record to server", error);
                    });
                });
            }

            appendActivityLog(ACTION_TYPES.ADMIN_GRANT_TOKENS, {
                page: "admin",
                source: sourceLabel,
                recipientCount: grantableTargets.length,
                skippedCount: normalizedTargets.length - grantableTargets.length,
                polAmount: requestedAmounts.POL,
                tftAmount: requestedAmounts.TFT,
                tttAmount: requestedAmounts.TTT,
            });

            await refreshGrantLedger();

            const skippedTargets = plan
                .filter((item) => !item.shouldGrant.POL && !item.shouldGrant.TFT && !item.shouldGrant.TTT)
                .map((item) => item.address);

            alert(
                `${grantableTargets.length}件に付与しました。\n`
                + `POL: ${requestedAmounts.POL}\n`
                + `TFT: ${requestedAmounts.TFT}\n`
                + `TTT: ${requestedAmounts.TTT}\n`
                + `処理件数: ${results.length}`
                + (skippedTargets.length > 0 ? `\n未送金（付与済み）: ${skippedTargets.length}件` : "")
            );
        } catch (error) {
            console.error("Failed to grant tokens", error);
            alert(error?.shortMessage || error?.message || "トークン付与に失敗しました。MetaMask の承認と残高を確認してください。");
        } finally {
            setIsSubmitting(false);
        }
    }

    function renderGrantStatus(address) {
        const status = getAddressGrantStatus(address);
        const labels = [
            { key: TOKEN_GRANT_KEYS.POL, label: "POL" },
            { key: TOKEN_GRANT_KEYS.TFT, label: "TFT" },
            { key: TOKEN_GRANT_KEYS.TTT, label: "TTT" },
        ];

        return (
            <div className="token-grant-status-list">
                {labels.map((item) => {
                    const record = status?.[item.key];
                    return (
                        <div key={item.key} className={`token-grant-status-badge ${record ? "granted" : "pending"}`}>
                            <span>{item.label}</span>
                            <span>{record ? `付与済み${record.amount ? ` ${record.amount}` : ""}` : "未付与"}</span>
                        </div>
                    );
                })}
            </div>
        );
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
                            <div key={`${student}-${index}`} className="token-grant-student-item">
                                <input
                                    type="checkbox"
                                    checked={selectedStudents.includes(student)}
                                    onChange={() => toggleStudent(student)}
                                />
                                <div>
                                    <button
                                        type="button"
                                        className="token-grant-address-btn"
                                        onClick={() => setSingleAddress(student)}
                                    >
                                        {student}
                                    </button>
                                    {renderGrantStatus(student)}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div className="token-grant-card" style={{ marginTop: "var(--space-6)" }}>
                <div className="token-grant-card-title">付与状況の一覧</div>
                <div className="token-grant-card-desc">
                    何を誰に付与済みか、まだ付与していないかをここで確認できます。付与済みのものは次回送金時に自動でスキップします。
                </div>
                <div className="token-grant-ledger-list">
                    {grantLedgerEntries.length === 0 ? (
                        <div className="address-item">まだ付与履歴はありません。</div>
                    ) : (
                        grantLedgerEntries.map((entry) => (
                            <div key={entry.address} className="token-grant-ledger-item">
                                <div className="token-grant-ledger-address">{entry.address}</div>
                                {renderGrantStatus(entry.address)}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

export default Token_grant_panel;
