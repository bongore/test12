import React, { useEffect, useMemo, useState } from "react";
import { Form } from "react-bootstrap";
import { ACTION_TYPES, appendActivityLog } from "../../../utils/activityLog";
import {
    clearGrantedToken,
    getAddressGrantStatus,
    getGrantLedgerEntries,
    hasGrantedToken,
    isGrantActive,
    markGrantedToken,
    normalizeGrantRecord,
    persistGrantRecordToServer,
    removeGrantRecordFromServer,
    syncGrantLedgerFromServer,
    TOKEN_GRANT_KEYS,
} from "../../../utils/tokenGrantLedger";

const AMOY_EXPLORER_TX_BASE = "https://amoy.polygonscan.com/tx/";
const AMOY_EXPLORER_ADDRESS_BASE = "https://amoy.polygonscan.com/address/";

function formatInternalId(prefix, index) {
    return `${prefix}-${String(index + 1).padStart(3, "0")}`;
}

function normalizeAddressLines(rawValue) {
    return rawValue
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);
}

function formatDateTime(value) {
    if (!value) return "-";
    try {
        return new Date(value).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
    } catch (error) {
        return String(value);
    }
}

function shortenHash(value = "") {
    if (!value || value.length < 14) return value || "-";
    return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

function downloadTextFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

function getSelectedAssetTargets(polAmount, tftAmount, tttAmount) {
    return [
        { enabled: Number(polAmount || 0) > 0, assetKey: TOKEN_GRANT_KEYS.POL, amount: Number(polAmount || 0), label: "POL" },
        { enabled: Number(tftAmount || 0) > 0, assetKey: TOKEN_GRANT_KEYS.TFT, amount: Number(tftAmount || 0), label: "TFT" },
        { enabled: Number(tttAmount || 0) > 0, assetKey: TOKEN_GRANT_KEYS.TTT, amount: Number(tttAmount || 0), label: "TTT" },
    ];
}

const ASSET_LABELS = [
    { key: TOKEN_GRANT_KEYS.POL, label: "POL" },
    { key: TOKEN_GRANT_KEYS.TFT, label: "TFT" },
    { key: TOKEN_GRANT_KEYS.TTT, label: "TTT" },
];

function isManualMarkedRecord(record) {
    return String(record?.source || "").includes("manual_mark");
}

function hasManualMarkHistory(record) {
    return (record?.history || []).some((entry) => entry?.type === "manual_mark");
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
    const [grantSyncError, setGrantSyncError] = useState("");

    const typedAddresses = useMemo(() => normalizeAddressLines(bulkAddresses), [bulkAddresses]);
    const manualGrantEntries = useMemo(
        () => grantLedgerEntries.filter((entry) => ASSET_LABELS.some((item) => {
            const record = normalizeGrantRecord(entry?.status?.[item.key]);
            return isGrantActive(record) && hasManualMarkHistory(record);
        })),
        [grantLedgerEntries]
    );
    const studentIndexMap = useMemo(
        () => new Map((students || []).map((address, index) => [props.cont.normalizeAddress(address), formatInternalId("USER", index)])),
        [students, props.cont]
    );
    const tokenGrantExportRows = useMemo(() => (
        grantLedgerEntries.flatMap((entry) => (
            ASSET_LABELS.flatMap((asset) => {
                const record = normalizeGrantRecord(entry?.status?.[asset.key]);
                const history = Array.isArray(record?.history) ? record.history : [];
                return history.map((historyEntry, index) => ({
                    address: entry.address,
                    student_id: studentIndexMap.get(props.cont.normalizeAddress(entry.address)) || "",
                    asset: asset.label,
                    current_status: record ? (isGrantActive(record) ? (isManualMarkedRecord(record) ? "既付与登録" : "付与済み") : "未付与") : "未付与",
                    current_amount: record?.amount ?? "",
                    history_index: index + 1,
                    history_type: historyEntry?.type === "manual_mark" ? "既付与登録" : historyEntry?.type === "clear" ? "既付与解除" : "送金確認",
                    amount: historyEntry?.amount ?? "",
                    timestamp: historyEntry?.at || "",
                    tx_hash: historyEntry?.txHash || "",
                    tx_url: historyEntry?.txHash ? `${AMOY_EXPLORER_TX_BASE}${historyEntry.txHash}` : "",
                    address_url: `${AMOY_EXPLORER_ADDRESS_BASE}${entry.address}`,
                    source: historyEntry?.source || "",
                    confirmed: historyEntry?.confirmed !== false ? "true" : "false",
                    active: historyEntry?.active !== false ? "true" : "false",
                }));
            })
        ))
    ), [grantLedgerEntries, studentIndexMap, props.cont]);

    async function refreshGrantLedger() {
        try {
            await syncGrantLedgerFromServer();
            setGrantSyncError("");
            setGrantLedgerEntries(getGrantLedgerEntries());
            return true;
        } catch (error) {
            console.error("Failed to sync token grant ledger", error);
            setGrantSyncError("付与履歴の共有同期に失敗しました。二重送金防止のため、同期が戻るまで付与を停止しています。");
            setGrantLedgerEntries(getGrantLedgerEntries());
            return false;
        }
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

        const plan = normalizedTargets.map((address) => ({
            address,
            shouldGrant: {
                POL: requestedAmounts.POL > 0 && !hasGrantedToken(address, TOKEN_GRANT_KEYS.POL),
                TFT: requestedAmounts.TFT > 0 && !hasGrantedToken(address, TOKEN_GRANT_KEYS.TFT),
                TTT: requestedAmounts.TTT > 0 && !hasGrantedToken(address, TOKEN_GRANT_KEYS.TTT),
            },
        }));

        return {
            requestedAmounts,
            normalizedTargets,
            plan,
        };
    }

    async function markAddressesAsAlreadyGranted(addresses, sourceLabel) {
        const synced = await refreshGrantLedger();
        if (!synced) {
            alert("付与履歴を同期できないため、既付与登録も停止しました。少し待ってから再試行してください。");
            return;
        }

        const normalizedTargets = props.cont.normalizeAddressList(addresses);
        if (normalizedTargets.length === 0) {
            alert("対象アドレスを入力または選択してください。");
            return;
        }

        setIsSubmitting(true);
        try {
            for (const address of normalizedTargets) {
                const targets = getSelectedAssetTargets(polAmount, tftAmount, tttAmount);

                for (const target of targets) {
                    if (!target.enabled || hasGrantedToken(address, target.assetKey)) continue;

                    const payload = {
                        grantedAt: new Date().toISOString(),
                        amount: target.amount,
                        txHash: "",
                        source: `${sourceLabel}_manual_mark`,
                        confirmed: true,
                    };
                    markGrantedToken(address, target.assetKey, payload);
                    await persistGrantRecordToServer(address, target.assetKey, payload);
                }
            }

            await refreshGrantLedger();
            alert(`${normalizedTargets.length}件を既付与として登録しました。今後は二重送金対象から外れます。`);
        } catch (error) {
            console.error("Failed to mark addresses as granted", error);
            alert("既付与登録に失敗しました。");
        } finally {
            setIsSubmitting(false);
        }
    }

    async function clearAlreadyGrantedMarks(addresses, sourceLabel) {
        const synced = await refreshGrantLedger();
        if (!synced) {
            alert("付与履歴を同期できないため、既付与解除も停止しました。少し待ってから再試行してください。");
            return;
        }

        const normalizedTargets = props.cont.normalizeAddressList(addresses);
        if (normalizedTargets.length === 0) {
            alert("対象アドレスを入力または選択してください。");
            return;
        }

        const targets = getSelectedAssetTargets(polAmount, tftAmount, tttAmount).filter((target) => target.enabled);
        if (targets.length === 0) {
            alert("解除したい資産の数量を 0 より大きくしてください。");
            return;
        }

        setIsSubmitting(true);
        try {
            let removedCount = 0;

            for (const address of normalizedTargets) {
                const status = getAddressGrantStatus(address);
                for (const target of targets) {
                    const currentRecord = status?.[target.assetKey];
                    if (!currentRecord) continue;

                    const clearPayload = {
                        grantedAt: new Date().toISOString(),
                        amount: currentRecord?.amount ?? target.amount,
                        source: `${sourceLabel}_clear_manual_mark`,
                    };
                    clearGrantedToken(address, target.assetKey, clearPayload);
                    await removeGrantRecordFromServer(address, target.assetKey, clearPayload);
                    removedCount += 1;
                }
            }

            await refreshGrantLedger();
            alert(
                removedCount > 0
                    ? `${removedCount}件の既付与登録を解除しました。必要ならこのあと改めて送金できます。`
                    : "解除できる既付与登録はありませんでした。"
            );

            appendActivityLog(ACTION_TYPES.ADMIN_GRANT_TOKENS, {
                page: "admin",
                source: `${sourceLabel}_clear_manual_mark`,
                recipientCount: normalizedTargets.length,
                polAmount: Number(polAmount || 0),
                tftAmount: Number(tftAmount || 0),
                tttAmount: Number(tttAmount || 0),
            });
        } catch (error) {
            console.error("Failed to clear already granted marks", error);
            alert("既付与登録の解除に失敗しました。");
        } finally {
            setIsSubmitting(false);
        }
    }

    async function grantToAddresses(addresses, sourceLabel) {
        const synced = await refreshGrantLedger();
        if (!synced) {
            alert("付与履歴をサーバーと同期できなかったため、二重送金防止のため送金を止めました。少し待ってから再試行してください。");
            return;
        }
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

                for (const result of recipientResults) {
                    const assetKey =
                        result.asset === "POL"
                            ? TOKEN_GRANT_KEYS.POL
                            : result.asset === "TFT"
                                ? TOKEN_GRANT_KEYS.TFT
                                : TOKEN_GRANT_KEYS.TTT;

                    const payload = {
                        grantedAt: new Date().toISOString(),
                        amount: result.amount,
                        txHash: result.hash,
                        source: sourceLabel,
                        confirmed: result.confirmed !== false,
                    };

                    if (result.confirmed !== false) {
                        markGrantedToken(item.address, assetKey, payload);
                        await persistGrantRecordToServer(item.address, assetKey, payload);
                    }
                }
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

    function renderAddressMeta(address) {
        if (!address) return null;
        return (
            <div className="token-grant-address-meta">
                <a
                    href={`${AMOY_EXPLORER_ADDRESS_BASE}${address}`}
                    target="_blank"
                    rel="noreferrer"
                    className="token-grant-link"
                >
                    Polygonscan でアドレス確認
                </a>
            </div>
        );
    }

    function renderGrantStatusSummary(address) {
        const status = getAddressGrantStatus(address);

        return (
            <div className="token-grant-status-list">
                {ASSET_LABELS.map((item) => {
                    const record = status?.[item.key];
                    return (
                        <div key={item.key} className={`token-grant-status-badge ${record ? "granted" : "pending"}`}>
                            <span>{item.label}</span>
                            <span>
                                {record && isGrantActive(record)
                                    ? `${isManualMarkedRecord(record) ? "既付与登録" : "付与済み"}${record.amount ? ` ${record.amount}` : ""}`
                                    : "未付与"}
                            </span>
                        </div>
                    );
                })}
            </div>
        );
    }

    function renderGrantStatusDetails(address) {
        const status = getAddressGrantStatus(address);

        return (
            <div className="token-grant-status-list detailed">
                {ASSET_LABELS.map((item) => {
                    const record = normalizeGrantRecord(status?.[item.key]);
                    const history = [...(record?.history || [])].sort((left, right) => String(right.at).localeCompare(String(left.at)));
                    return (
                        <div key={item.key} className={`token-grant-status-badge ${record ? "granted" : "pending"} detailed`}>
                            <div className="token-grant-status-heading">
                                <span>{item.label}</span>
                                <span>
                                    {record && isGrantActive(record)
                                        ? `${isManualMarkedRecord(record) ? "既付与登録" : "付与済み"}${record.amount ? ` ${record.amount}` : ""}`
                                        : "未付与"}
                                </span>
                            </div>
                            {record ? (
                                <div className="token-grant-status-meta">
                                    <div>状態: {isGrantActive(record) ? (isManualMarkedRecord(record) ? "過去配布済みとして登録（送金なし）" : "送金確認済み") : "現在は未付与"}</div>
                                    <div>現在状態の時刻: {formatDateTime(record.grantedAt)}</div>
                                    <div>
                                        現在状態の Tx:
                                        {" "}
                                        {record.txHash ? (
                                            <a
                                                href={`${AMOY_EXPLORER_TX_BASE}${record.txHash}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="token-grant-link"
                                            >
                                                {shortenHash(record.txHash)}
                                            </a>
                                        ) : (
                                            isManualMarkedRecord(record) ? "既付与登録のため送金なし" : "-"
                                        )}
                                    </div>
                                    {history.length > 0 && (
                                        <div style={{ marginTop: "var(--space-2)" }}>
                                            <div style={{ fontWeight: 600, color: "#fff3cd" }}>履歴</div>
                                            {history.map((entry, index) => (
                                                <div key={`${item.key}-${index}-${entry.at}`} style={{ marginTop: "0.25rem" }}>
                                                    {formatDateTime(entry.at)}
                                                    {" / "}
                                                    {entry.type === "manual_mark" ? "既付与登録" : entry.type === "clear" ? "既付与解除" : "送金確認"}
                                                    {" / "}
                                                    {entry.txHash ? (
                                                        <a
                                                            href={`${AMOY_EXPLORER_TX_BASE}${entry.txHash}`}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="token-grant-link"
                                                        >
                                                            {shortenHash(entry.txHash)}
                                                        </a>
                                                    ) : (
                                                        "送金なし"
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="token-grant-status-meta">
                                    <div>まだ送っていません</div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    }

    function renderManualGrantAssets(address) {
        const status = getAddressGrantStatus(address);
        const manualAssets = ASSET_LABELS
            .filter((item) => {
                const record = normalizeGrantRecord(status?.[item.key]);
                return isGrantActive(record) && hasManualMarkHistory(record);
            })
            .map((item) => {
                const record = normalizeGrantRecord(status?.[item.key]);
                return `${item.label}${record?.amount ? ` ${record.amount}` : ""}`;
            });
        return manualAssets.join(" / ");
    }

    function renderLedgerSummary(entry, summaryLabel = "") {
        return (
            <summary className="token-grant-ledger-summary">
                <div className="token-grant-ledger-summary-main">
                    <div className="token-grant-ledger-address">{entry.address}</div>
                    {summaryLabel ? (
                        <div className="token-grant-card-desc token-grant-summary-label">{summaryLabel}</div>
                    ) : null}
                </div>
                <div className="token-grant-ledger-summary-side">
                    {renderGrantStatusSummary(entry.address)}
                    <span className="token-grant-ledger-toggle-text">開閉</span>
                </div>
            </summary>
        );
    }

    function renderLedgerDetails(entry, summaryLabel = "") {
        return (
            <details className="token-grant-ledger-collapsible">
                {renderLedgerSummary(entry, summaryLabel)}
                <div className="token-grant-ledger-body">
                    {summaryLabel ? (
                        <div className="token-grant-card-desc" style={{ marginBottom: "var(--space-2)" }}>
                            {summaryLabel}
                        </div>
                    ) : null}
                    {renderAddressMeta(entry.address)}
                    {renderGrantStatusDetails(entry.address)}
                </div>
            </details>
        );
    }

    function handleExportTokenGrantJson() {
        downloadTextFile(
            `token_grant_history_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`,
            JSON.stringify(tokenGrantExportRows, null, 2),
            "application/json;charset=utf-8"
        );
    }

    function handleExportTokenGrantCsv() {
        const header = [
            "address",
            "student_id",
            "asset",
            "current_status",
            "current_amount",
            "history_index",
            "history_type",
            "amount",
            "timestamp",
            "tx_hash",
            "tx_url",
            "address_url",
            "source",
            "confirmed",
            "active",
        ];
        const escapeCsv = (value) => `"${String(value ?? "").replace(/"/g, "\"\"")}"`;
        const rows = [
            header.join(","),
            ...tokenGrantExportRows.map((row) => header.map((key) => escapeCsv(row[key])).join(",")),
        ];
        downloadTextFile(
            `token_grant_history_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`,
            rows.join("\n"),
            "text/csv;charset=utf-8"
        );
    }

    return (
        <div>
            <h3 className="section-title">学生へのトークン付与</h3>
            <p className="section-desc">
                公開アドレスを提出した学生に、回答用 POL、回答お礼の TFT、掲示板用 TTT を個別またはまとめて配布できます。
            </p>
            <div className="csv-download-area" style={{ marginTop: 0, marginBottom: "16px" }}>
                <button className="btn-action" onClick={handleExportTokenGrantCsv}>📤 トークン付与履歴を CSV 出力</button>
                <button className="btn-action" onClick={handleExportTokenGrantJson}>📤 トークン付与履歴を JSON 出力</button>
            </div>
            {grantSyncError && (
                <div className="address-item" style={{ borderLeftColor: "#ff9800", color: "#ffe0a3", marginBottom: "var(--space-4)" }}>
                    {grantSyncError}
                </div>
            )}

            <div className="token-grant-grid">
                <div className="token-grant-card">
                    <div className="token-grant-card-title">付与レート</div>
                    <div className="token-grant-card-desc">
                        初期値は 1 POL / 50 TFT / 1000 TTT です。必要に応じて数を変更できます。
                    </div>
                    <div className="token-grant-card-desc" style={{ color: "#ffd8a8" }}>
                        「既付与登録」は送金ではなく、過去にすでに配布済みだった学生を二重送金対象から外すための印です。間違えた場合はあとで解除できます。
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
                    {singleAddress && (
                        <>
                            {renderAddressMeta(singleAddress)}
                            {renderGrantStatusDetails(singleAddress)}
                        </>
                    )}
                    <div className="token-grant-actions">
                        <button className="btn-action" type="button" disabled={isSubmitting} onClick={() => grantToAddresses([singleAddress], "single")}>
                            1件に付与
                        </button>
                        <button className="btn-action token-grant-secondary-btn" type="button" disabled={isSubmitting} onClick={() => markAddressesAsAlreadyGranted([singleAddress], "single")}>
                            既付与として登録
                        </button>
                        <button className="btn-action token-grant-secondary-btn" type="button" disabled={isSubmitting} onClick={() => clearAlreadyGrantedMarks([singleAddress], "single")}>
                            既付与登録を解除
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
                    <button className="btn-action token-grant-secondary-btn" type="button" disabled={isSubmitting} onClick={() => markAddressesAsAlreadyGranted(typedAddresses, "bulk_input")}>
                        入力済みアドレスを既付与登録
                    </button>
                    <button className="btn-action token-grant-secondary-btn" type="button" disabled={isSubmitting} onClick={() => clearAlreadyGrantedMarks(typedAddresses, "bulk_input")}>
                        入力済みアドレスの既付与解除
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
                    <button className="btn-action token-grant-secondary-btn" type="button" disabled={isSubmitting} onClick={() => markAddressesAsAlreadyGranted(selectedStudents, "bulk_selected")}>
                        選択した学生を既付与登録
                    </button>
                    <button className="btn-action token-grant-secondary-btn" type="button" disabled={isSubmitting} onClick={() => clearAlreadyGrantedMarks(selectedStudents, "bulk_selected")}>
                        選択した学生の既付与解除
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
                                    {renderGrantStatusSummary(student)}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div className="token-grant-card" style={{ marginTop: "var(--space-6)" }}>
                <div className="token-grant-card-title">既付与登録した学生一覧</div>
                <div className="token-grant-card-desc">
                    過去にすでに配布済みとして送金せず印だけ付けた学生をここで確認できます。解除したいときは上の各解除ボタンを使ってください。
                </div>
                <div className="token-grant-ledger-list">
                    {manualGrantEntries.length === 0 ? (
                        <div className="address-item">既付与登録した学生はまだありません。</div>
                    ) : (
                        manualGrantEntries.map((entry) => (
                            <div key={`manual-${entry.address}`} className="token-grant-ledger-item manual-mark">
                                {renderLedgerDetails(entry, `既付与登録: ${renderManualGrantAssets(entry.address)}`)}
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div className="token-grant-card" style={{ marginTop: "var(--space-6)" }}>
                <div className="token-grant-card-title">付与状況の一覧</div>
                <div className="token-grant-card-desc">
                    何を誰に付与済みか、まだ付与していないかをここで確認できます。Tx ハッシュから実際の送金も確認できます。
                </div>
                <div className="token-grant-ledger-list">
                    {grantLedgerEntries.length === 0 ? (
                        <div className="address-item">まだ付与履歴はありません。</div>
                    ) : (
                        grantLedgerEntries.map((entry) => (
                            <div key={entry.address} className="token-grant-ledger-item">
                                {renderLedgerDetails(entry)}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

export default Token_grant_panel;
