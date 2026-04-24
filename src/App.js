import { Component, Suspense, lazy, useEffect } from "react";
import "./styles/design-tokens.css";
import "./styles/animations.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import Nav_menu from "./pages/navbar/navbar";
import { Contracts_MetaMask } from "./contract/contracts";
import { ACTION_TYPES, appendActivityLog, logPageView } from "./utils/activityLog";
import "bootstrap/dist/css/bootstrap.min.css";

const routerBasename = (() => {
    try {
        const publicUrl = process.env.PUBLIC_URL || "";
        if (!publicUrl) return "/";
        return new URL(publicUrl, window.location.origin).pathname.replace(/\/$/, "") || "/";
    } catch (error) {
        return "/";
    }
})();

function normalizeLegacyHashUrl() {
    if (typeof window === "undefined") return;
    const { hash, origin } = window.location;
    if (!hash || !hash.startsWith("#/")) return;

    const nextPath = hash.slice(1);
    const base = routerBasename === "/" ? "" : routerBasename;
    window.history.replaceState(null, "", `${origin}${base}${nextPath}`);
}

normalizeLegacyHashUrl();

const Login = lazy(() => import("./contract/login"));
const User_page = lazy(() => import("./pages/user_page/user_page"));
const Create_quiz = lazy(() => import("./pages/create_quiz/create_quiz"));
const List_quiz = lazy(() => import("./pages/list_quiz/list_quiz_top"));
const Answer_quiz = lazy(() => import("./pages/answer_quiz/answer_quiz"));
const Admin_page = lazy(() => import("./pages/admin_page/admin"));
const Edit_list = lazy(() => import("./pages/edit_list/edit_list_top"));
const Edit_quiz = lazy(() => import("./pages/edit_quiz/edit_quiz"));
const Investment_page = lazy(() => import("./pages/investment_page/investment_page"));
const Dashboard = lazy(() => import("./pages/dashboard/dashboard"));
const Ranking = lazy(() => import("./pages/ranking/ranking"));
const Notifications = lazy(() => import("./pages/notifications/notifications"));
const Live_page = lazy(() => import("./pages/live/live"));

function RouteFallback() {
    useEffect(() => {
        appendActivityLog(ACTION_TYPES.ROUTE_FALLBACK_SHOWN, { page: "route_fallback" });
    }, []);

    return (
        <div className="main-content">
            <div className="glass-card animate-fadeIn" style={{ padding: "var(--space-8)", marginTop: "var(--space-6)" }}>
                <h2 className="heading-lg" style={{ marginBottom: "var(--space-2)" }}>ページを読み込み中</h2>
                <p style={{ margin: 0, color: "var(--text-secondary)" }}>
                    初回表示の通信量を減らすため、必要な画面だけ順次読み込んでいます。
                </p>
            </div>
        </div>
    );
}

function RouteLogger() {
    const location = useLocation();

    useEffect(() => {
        logPageView("route", {
            pathname: location.pathname,
            hash: location.hash,
            search: location.search,
        });
    }, [location]);

    return null;
}

class RouteErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, errorMessage: "" };
    }

    static getDerivedStateFromError(error) {
        return {
            hasError: true,
            errorMessage: error?.message || "画面の描画中にエラーが発生しました。",
        };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Route rendering failed", error, errorInfo);
        appendActivityLog(ACTION_TYPES.ROUTE_RENDER_FAILED, {
            page: "route_error_boundary",
            error: error?.message || "unknown_error",
        });
    }

    render() {
        if (this.state.hasError) {
            return (
                <main className="main-content">
                    <div className="glass-card animate-fadeIn" style={{ padding: "var(--space-8)", marginTop: "var(--space-6)" }}>
                        <h2 className="heading-lg" style={{ marginBottom: "var(--space-2)" }}>画面の表示に失敗しました</h2>
                        <p style={{ marginBottom: "var(--space-4)", color: "var(--text-secondary)" }}>
                            一時的な描画エラーを検知しました。再読み込みで復旧できるようにしています。
                        </p>
                        <p style={{ marginBottom: "var(--space-4)", color: "var(--text-secondary)" }}>
                            詳細: {this.state.errorMessage}
                        </p>
                        <button className="btn-primary-custom" onClick={() => window.location.reload()}>
                            再読み込み
                        </button>
                    </div>
                </main>
            );
        }

        return this.props.children;
    }
}

function AppRoutes({ cont }) {
    return (
        <>
            <RouteLogger />
            <Nav_menu cont={cont} home={process.env.PUBLIC_URL} />
            <RouteErrorBoundary>
                <Suspense fallback={<RouteFallback />}>
                    <main className="main-content">
                        <Routes>
                            <Route path="/login" element={<Login url="login" cont={cont} />} />
                            <Route path="/dashboard" element={<Dashboard />} />
                            <Route path="/ranking" element={<Ranking />} />
                            <Route path="/notifications" element={<Notifications />} />
                            <Route path="/user_page/:address" element={<User_page url="user_page" cont={cont} />} />
                            <Route path="/create_quiz" element={<Create_quiz url="create_quiz" cont={cont} />} />
                            <Route path="/list_quiz" element={<List_quiz url="list_quiz" cont={cont} />} />
                            <Route path="/answer_quiz/:id" element={<Answer_quiz url="answer_quiz" cont={cont} />} />
                            <Route path="/admin" element={<Admin_page url="admin" cont={cont} />} />
                            <Route path="/edit_list" element={<Edit_list url="edit_list" cont={cont} />} />
                            <Route path="/edit_quiz/:id" element={<Edit_quiz url="edit_quiz" cont={cont} />} />
                            <Route path="/investment_page/:id" element={<Investment_page url="investment_page" cont={cont} />} />
                            <Route path="/live" element={<Live_page url="live" cont={cont} />} />
                            <Route path="/" element={<Navigate replace to="/dashboard" />} />
                        </Routes>
                    </main>
                </Suspense>
            </RouteErrorBoundary>
        </>
    );
}

function App() {
    const cont = new Contracts_MetaMask();

    useEffect(() => {
        appendActivityLog(ACTION_TYPES.APP_SESSION_STARTED, { page: "app" });
    }, []);

    return (
        <div className="App">
            <BrowserRouter
                basename={routerBasename}
                future={{
                    v7_startTransition: true,
                    v7_relativeSplatPath: true,
                }}
            >
                <AppRoutes cont={cont} />
            </BrowserRouter>
        </div>
    );
}

export default App;
