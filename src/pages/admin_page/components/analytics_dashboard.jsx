import React, { useEffect, useMemo, useState } from "react";
import {
    ACTION_TYPES,
    clearActivityLogs,
    exportLogsAsCsv,
    exportLogsAsJson,
    formatActionLabel,
    formatDateTime,
    getActivityLogs,
} from "../../../utils/activityLog";
import "./activity_logs.css";

function average(values) {
    if (!values.length) return 0;
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function normalizeAddress(value) {
    return String(value || "").trim().toLowerCase();
}

function makeInternalId(prefix, index) {
    return `${prefix}-${String(index + 1).padStart(3, "0")}`;
}

function buildActorDirectory(students, staffs) {
    const directory = {};

    staffs.forEach((address, index) => {
        directory[normalizeAddress(address)] = {
            role: "staff",
            roleLabel: "先生 / TA",
            internalId: makeInternalId("STAFF", index),
            address,
        };
    });

    students.forEach((address, index) => {
        const key = normalizeAddress(address);
        if (!directory[key]) {
            directory[key] = {
                role: "user",
                roleLabel: "ユーザー",
                internalId: makeInternalId("USER", index),
                address,
            };
        }
    });

    return directory;
}

function resolveActorMeta(log, directory) {
    const candidate = normalizeAddress(log.actor && !String(log.actor).startsWith("guest:") ? log.actor : (log.address || ""));
    if (candidate && directory[candidate]) {
        return directory[candidate];
    }

    if (candidate) {
        return {
            role: "user",
            roleLabel: "ユーザー",
            internalId: `USER-TEMP-${candidate.slice(-4).toUpperCase()}`,
            address: log.actor || log.address || "",
        };
    }

    const guestSource = String(log.actor || log.sessionId || "guest");
    const suffix = guestSource.replace("guest:", "").slice(-6).toUpperCase();
    return {
        role: "guest",
        roleLabel: "未接続",
        internalId: `GUEST-${suffix || "LOCAL"}`,
        address: "-",
    };
}

function stringifyDetails(log) {
    const ignored = new Set([
        "id", "action", "actor", "createdAt", "sessionId", "route", "url", "referrer",
        "online", "userAgent", "viewportWidth", "viewportHeight", "language", "timezone",
        "actorMeta", "category",
    ]);

    return Object.entries(log)
        .filter(([key, value]) => !ignored.has(key) && value !== "" && value != null)
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join(" | ");
}

function deriveCategory(action) {
    if (!action) return "other";
    if (action.startsWith("login_") || action.startsWith("wallet_")) return "login";
    if (action.startsWith("answer_") || action.startsWith("quiz_")) return "answer";
    if (action.startsWith("live_")) return "live";
    if (action.startsWith("route_") || action.startsWith("app_")) return "system";
    if (action.startsWith("performance_") || action.startsWith("export_")) return "ops";
    return "other";
}

function formatCategoryLabel(category) {
    switch (category) {
        case "login": return "ログイン";
        case "answer": return "解答";
        case "live": return "ライブ";
        case "system": return "画面遷移";
        case "ops": return "運用";
        default: return "その他";
    }
}

function groupActorActivity(logs) {
    const map = new Map();

    logs.forEach((log) => {
        const key = log.actorMeta.internalId;
        const current = map.get(key) || {
            internalId: log.actorMeta.internalId,
            roleLabel: log.actorMeta.roleLabel,
            address: log.actorMeta.address,
            count: 0,
            lastSeenAt: log.createdAt,
            categories: new Set(),
        };

        current.count += 1;
        current.lastSeenAt = log.createdAt > current.lastSeenAt ? log.createdAt : current.lastSeenAt;
        current.categories.add(log.category);
        map.set(key, current);
    });

    return [...map.values()]
        .map((item) => ({
            ...item,
            categories: [...item.categories].map(formatCategoryLabel).join(" / "),
        }))
        .sort((a, b) => b.count - a.count);
}

function Analytics_dashboard({ cont }) {
    const [refreshKey, setRefreshKey] = useState(0);
    const [actionFilter, setActionFilter] = useState("all");
    const [pageFilter, setPageFilter] = useState("all");
    const [roleFilter, setRoleFilter] = useState("all");
    const [actorFilter, setActorFilter] = useState("all");
    const [categoryFilter, setCategoryFilter] = useState("all");
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedLogId, setSelectedLogId] = useState("");
    const [students, setStudents] = useState([]);
    const [staffs, setStaffs] = useState([]);
    const logs = getActivityLogs();

    useEffect(() => {
        let mounted = true;

        const loadActors = async () => {
            try {
                const [studentList, staffList] = await Promise.all([
                    cont?.get_student_list?.(),
                    cont?.get_teachers?.(),
                ]);
                if (!mounted) return;
                setStudents(Array.isArray(studentList) ? studentList : []);
                setStaffs(Array.isArray(staffList) ? staffList : []);
            } catch (error) {
                console.error("Failed to load actor directory", error);
                if (!mounted) return;
                setStudents([]);
                setStaffs([]);
            }
        };

        loadActors();
        return () => {
            mounted = false;
        };
    }, [cont]);

    const actorDirectory = useMemo(() => buildActorDirectory(students, staffs), [students, staffs]);

    const enrichedLogs = useMemo(() => logs.map((log) => ({
        ...log,
        actorMeta: resolveActorMeta(log, actorDirectory),
        category: deriveCategory(log.action),
    })), [logs, actorDirectory]);

    const summary = useMemo(() => {
        const loginSuccess = enrichedLogs.filter((log) => log.action === ACTION_TYPES.LOGIN_SUCCESS).length;
        const answerSubmitted = enrichedLogs.filter((log) => log.action === ACTION_TYPES.ANSWER_SUBMITTED).length;
        const liveMessages = enrichedLogs.filter((log) => (
            log.action === ACTION_TYPES.LIVE_MESSAGE_SENT
            || log.action === ACTION_TYPES.LIVE_SUPERCHAT_SENT
            || log.action === ACTION_TYPES.LIVE_DUMMY_MESSAGE_EMITTED
        )).length;
        const quizLoads = enrichedLogs
            .filter((log) => log.action === ACTION_TYPES.QUIZ_LOAD_SUCCESS && typeof log.durationMs === "number")
            .map((log) => log.durationMs);
        const submissions = enrichedLogs
            .filter((log) => log.action === ACTION_TYPES.ANSWER_SUBMITTED && typeof log.submitDurationMs === "number")
            .map((log) => log.submitDurationMs);

        return {
            totalLogs: enrichedLogs.length,
            loginSuccess,
            answerSubmitted,
            liveMessages,
            avgQuizLoadMs: average(quizLoads),
            avgSubmitMs: average(submissions),
        };
    }, [enrichedLogs]);

    const actionSummary = useMemo(() => {
        const counts = new Map();
        enrichedLogs.forEach((log) => {
            counts.set(log.action, (counts.get(log.action) || 0) + 1);
        });
        return [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([action, count]) => ({
                action,
                label: formatActionLabel(action),
                count,
            }));
    }, [enrichedLogs]);

    const categorySummary = useMemo(() => {
        const counts = new Map();
        enrichedLogs.forEach((log) => {
            counts.set(log.category, (counts.get(log.category) || 0) + 1);
        });
        return [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([category, count]) => ({
                category,
                label: formatCategoryLabel(category),
                count,
            }));
    }, [enrichedLogs]);

    const pageOptions = useMemo(
        () => [...new Set(enrichedLogs.map((log) => log.page).filter(Boolean))].sort(),
        [enrichedLogs]
    );

    const actorOptions = useMemo(
        () => [...new Set(enrichedLogs.map((log) => log.actorMeta.internalId).filter(Boolean))].sort(),
        [enrichedLogs]
    );

    const filteredLogs = useMemo(() => {
        const normalizedSearch = searchTerm.trim().toLowerCase();

        return enrichedLogs.filter((log) => {
            const searchable = [
                stringifyDetails(log),
                log.action,
                formatActionLabel(log.action),
                log.page || "",
                log.quizId || "",
                log.actorMeta.internalId,
                log.actorMeta.roleLabel,
                log.actorMeta.address,
                formatCategoryLabel(log.category),
            ].join(" ").toLowerCase();

            if (categoryFilter !== "all" && log.category !== categoryFilter) return false;
            if (actionFilter !== "all" && log.action !== actionFilter) return false;
            if (pageFilter !== "all" && log.page !== pageFilter) return false;
            if (roleFilter !== "all" && log.actorMeta.role !== roleFilter) return false;
            if (actorFilter !== "all" && log.actorMeta.internalId !== actorFilter) return false;
            if (!normalizedSearch) return true;
            return searchable.includes(normalizedSearch);
        });
    }, [enrichedLogs, categoryFilter, actionFilter, pageFilter, roleFilter, actorFilter, searchTerm]);

    const actorSummary = useMemo(() => groupActorActivity(filteredLogs), [filteredLogs]);

    useEffect(() => {
        if (!filteredLogs.length) {
            setSelectedLogId("");
            return;
        }

        const selectedExists = filteredLogs.some((log) => log.id === selectedLogId);
        if (!selectedExists) {
            setSelectedLogId(filteredLogs[0].id);
        }
    }, [filteredLogs, selectedLogId]);

    const selectedLog = useMemo(
        () => filteredLogs.find((log) => log.id === selectedLogId) || null,
        [filteredLogs, selectedLogId]
    );

    const handleClear = () => {
        clearActivityLogs();
        setRefreshKey((current) => current + 1);
        setActionFilter("all");
        setPageFilter("all");
        setRoleFilter("all");
        setActorFilter("all");
        setCategoryFilter("all");
        setSearchTerm("");
        setSelectedLogId("");
    };

    return (
        <div key={refreshKey}>
            <h3 className="section-title">分析ログ</h3>
            <p className="section-desc">
                分析ログをカテゴリ別に分け、識別番号・ページ・行動・詳細から横断検索できます。
            </p>

            <div className="analytics-grid">
                <div className="analytics-card"><div className="analytics-label">総ログ件数</div><div className="analytics-value">{summary.totalLogs}</div></div>
                <div className="analytics-card"><div className="analytics-label">ログイン成功</div><div className="analytics-value">{summary.loginSuccess}</div></div>
                <div className="analytics-card"><div className="analytics-label">回答送信</div><div className="analytics-value">{summary.answerSubmitted}</div></div>
                <div className="analytics-card"><div className="analytics-label">ライブ送信</div><div className="analytics-value">{summary.liveMessages}</div></div>
                <div className="analytics-card"><div className="analytics-label">平均読込時間</div><div className="analytics-value">{summary.avgQuizLoadMs}ms</div></div>
                <div className="analytics-card"><div className="analytics-label">平均送信待ち</div><div className="analytics-value">{summary.avgSubmitMs}ms</div></div>
            </div>

            <div className="analytics-actions">
                <button className="btn-action" onClick={exportLogsAsCsv}>CSV を出力</button>
                <button className="btn-action" onClick={exportLogsAsJson}>JSON を出力</button>
                <button className="btn-action" onClick={handleClear}>ログを初期化</button>
            </div>

            <div className="analytics-filters analytics-filters--wide">
                <input
                    className="form-control"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="識別番号、権限、カテゴリ、行動、詳細、クイズIDで検索"
                />
                <select className="form-control" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                    <option value="all">すべてのカテゴリ</option>
                    {categorySummary.map((item) => (
                        <option key={item.category} value={item.category}>{item.label}</option>
                    ))}
                </select>
                <select className="form-control" value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
                    <option value="all">すべての行動</option>
                    {actionSummary.map((item) => (
                        <option key={item.action} value={item.action}>{item.label}</option>
                    ))}
                </select>
                <select className="form-control" value={pageFilter} onChange={(event) => setPageFilter(event.target.value)}>
                    <option value="all">すべてのページ</option>
                    {pageOptions.map((page) => (
                        <option key={page} value={page}>{page}</option>
                    ))}
                </select>
                <select className="form-control" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
                    <option value="all">すべての権限</option>
                    <option value="user">ユーザー</option>
                    <option value="staff">先生 / TA</option>
                    <option value="guest">未接続</option>
                </select>
                <select className="form-control" value={actorFilter} onChange={(event) => setActorFilter(event.target.value)}>
                    <option value="all">すべての識別番号</option>
                    {actorOptions.map((actor) => (
                        <option key={actor} value={actor}>{actor}</option>
                    ))}
                </select>
            </div>

            <div className="analytics-category-row">
                {categorySummary.map((item) => (
                    <button
                        key={item.category}
                        className={`analytics-category-chip ${categoryFilter === item.category ? "active" : ""}`}
                        onClick={() => setCategoryFilter((current) => (current === item.category ? "all" : item.category))}
                    >
                        <span>{item.label}</span>
                        <strong>{item.count}</strong>
                    </button>
                ))}
            </div>

            {actorSummary.length > 0 && (
                <div className="analytics-actor-grid">
                    {actorSummary.slice(0, 8).map((item) => (
                        <button
                            key={item.internalId}
                            className={`analytics-actor-card ${actorFilter === item.internalId ? "active" : ""}`}
                            onClick={() => setActorFilter((current) => (current === item.internalId ? "all" : item.internalId))}
                        >
                            <div className="analytics-actor-title">{item.internalId}</div>
                            <div className="analytics-actor-meta">{item.roleLabel} / {item.count} 件</div>
                            <div className="analytics-actor-meta">{item.categories}</div>
                            <div className="analytics-actor-meta">{formatDateTime(item.lastSeenAt)}</div>
                        </button>
                    ))}
                </div>
            )}

            {filteredLogs.length === 0 ? (
                <div className="analytics-empty">対象に一致するログがありません。</div>
            ) : (
                <div className="analytics-workspace">
                    <div className="analytics-log-list glass-card">
                        <div className="analytics-panel-header">
                            <strong>ログ一覧</strong>
                            <span>表示中 {filteredLogs.length} 件 / 全体 {logs.length} 件</span>
                        </div>
                        <div className="analytics-log-items">
                            {filteredLogs.map((log) => (
                                <button
                                    key={log.id}
                                    className={`analytics-log-item ${selectedLogId === log.id ? "active" : ""}`}
                                    onClick={() => setSelectedLogId(log.id)}
                                >
                                    <div className="analytics-log-top">
                                        <span className="analytics-log-category">{formatCategoryLabel(log.category)}</span>
                                        <span className="analytics-log-time">{formatDateTime(log.createdAt)}</span>
                                    </div>
                                    <div className="analytics-log-title">{formatActionLabel(log.action)}</div>
                                    <div className="analytics-log-meta">
                                        <span>{log.actorMeta.internalId}</span>
                                        <span>{log.page || "-"}</span>
                                        <span>{log.quizId || "-"}</span>
                                    </div>
                                    <div className="analytics-log-preview">{stringifyDetails(log) || "詳細なし"}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="analytics-log-detail glass-card">
                        <div className="analytics-panel-header">
                            <strong>個別詳細</strong>
                            <span>{selectedLog ? formatActionLabel(selectedLog.action) : "-"}</span>
                        </div>

                        {selectedLog ? (
                            <div className="analytics-detail-grid">
                                <div className="analytics-detail-card"><div className="analytics-label">時刻</div><div className="analytics-detail-value">{formatDateTime(selectedLog.createdAt)}</div></div>
                                <div className="analytics-detail-card"><div className="analytics-label">カテゴリ</div><div className="analytics-detail-value">{formatCategoryLabel(selectedLog.category)}</div></div>
                                <div className="analytics-detail-card"><div className="analytics-label">行動</div><div className="analytics-detail-value">{formatActionLabel(selectedLog.action)}</div></div>
                                <div className="analytics-detail-card"><div className="analytics-label">識別番号</div><div className="analytics-detail-value">{selectedLog.actorMeta.internalId}</div></div>
                                <div className="analytics-detail-card"><div className="analytics-label">権限</div><div className="analytics-detail-value">{selectedLog.actorMeta.roleLabel}</div></div>
                                <div className="analytics-detail-card"><div className="analytics-label">ウォレット</div><div className="analytics-detail-value analytics-text">{selectedLog.actorMeta.address}</div></div>
                                <div className="analytics-detail-card"><div className="analytics-label">ページ</div><div className="analytics-detail-value">{selectedLog.page || "-"}</div></div>
                                <div className="analytics-detail-card"><div className="analytics-label">対象ID</div><div className="analytics-detail-value">{selectedLog.quizId || "-"}</div></div>
                                <div className="analytics-detail-card"><div className="analytics-label">経過時間</div><div className="analytics-detail-value">{selectedLog.durationMs || selectedLog.submitDurationMs || "-"}</div></div>
                            </div>
                        ) : (
                            <div className="analytics-empty">ログを選択してください。</div>
                        )}

                        {selectedLog && (
                            <div className="analytics-detail-block">
                                <div className="analytics-label">詳細データ</div>
                                <div className="analytics-detail-pre">{stringifyDetails(selectedLog) || "詳細なし"}</div>
                            </div>
                        )}

                        {actionSummary.length > 0 && (
                            <div className="analytics-detail-block">
                                <div className="analytics-label">行動別件数</div>
                                <div className="analytics-mini-table">
                                    {actionSummary.slice(0, 10).map((item) => (
                                        <div key={item.action} className="analytics-mini-row">
                                            <span>{item.label}</span>
                                            <strong>{item.count}</strong>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default Analytics_dashboard;
