import { useEffect, useState } from "react";
import "./../../contract/wait_Modal.css";

const NETWORK_LABEL = "Polygon Amoy Testnet";
const NETWORK_CONFIG = {
    chainId: "80002",
    rpcUrl: "https://rpc-amoy.polygon.technology/",
    symbol: "POL",
    explorer: "https://amoy.polygonscan.com/",
};

function Modal_change_network(props) {
    const [currentChainId, setCurrentChainId] = useState(props.chain_id);
    const [hasEthereumProvider, setHasEthereumProvider] = useState(Boolean(props.cont?.getEthereumProvider?.()));
    const isVisible = currentChainId !== 80002;

    useEffect(() => {
        setCurrentChainId(props.chain_id);
    }, [props.chain_id]);

    useEffect(() => {
        const syncProviderState = () => {
            setHasEthereumProvider(Boolean(props.cont?.getEthereumProvider?.()));
        };

        syncProviderState();
        window.addEventListener("ethereum#initialized", syncProviderState);
        window.addEventListener("focus", syncProviderState);

        return () => {
            window.removeEventListener("ethereum#initialized", syncProviderState);
            window.removeEventListener("focus", syncProviderState);
        };
    }, [props.cont]);

    useEffect(() => {
        if (!hasEthereumProvider) return undefined;
        const provider = props.cont?.getEthereumProvider?.();
        if (!provider) return undefined;

        const syncChainId = async () => {
            const nextChainId = await props.cont?.get_chain_id?.();
            setCurrentChainId(nextChainId);
        };

        const handleChainChanged = (chainIdHex) => {
            setCurrentChainId(Number(chainIdHex));
        };

        const handleAccountsChanged = () => {
            syncChainId().catch((error) => {
                console.error("Failed to sync chain id", error);
            });
        };

        syncChainId().catch((error) => {
            console.error("Failed to sync chain id", error);
        });

        provider.on?.("chainChanged", handleChainChanged);
        provider.on?.("accountsChanged", handleAccountsChanged);

        return () => {
            provider.removeListener?.("chainChanged", handleChainChanged);
            provider.removeListener?.("accountsChanged", handleAccountsChanged);
        };
    }, [hasEthereumProvider, props.cont]);

    if (!isVisible) {
        return <></>;
    }

    const handleSwitchNetwork = async () => {
        if (!hasEthereumProvider) {
            alert("MetaMask が見つかりません。ブラウザに MetaMask をインストールしてから再度お試しください。");
            return;
        }

        try {
            await props.cont.add_or_switch_amoy_network();
            setCurrentChainId(await props.cont.get_chain_id());
        } catch (error) {
            console.error("Failed to add or switch Polygon Amoy", error);
            if (error?.code === 4001) {
                alert("MetaMask 側で操作がキャンセルされました。");
                return;
            }
            alert("Polygon Amoy への追加または切り替えに失敗しました。MetaMask のポップアップを確認してください。");
        }
    };

    return (
        <div className="network-modal-overlay">
            <div
                className="network-modal-content animate-scaleIn"
                style={{
                    maxWidth: "960px",
                    width: "min(92vw, 960px)",
                    padding: 0,
                    overflowX: "hidden",
                    overflowY: "auto",
                    maxHeight: "calc(100dvh - 24px)",
                    background: "linear-gradient(180deg, #102842 0%, #1ba5c4 100%)",
                    border: "1px solid rgba(255,255,255,0.16)",
                    borderRadius: "28px",
                    boxShadow: "0 24px 80px rgba(0,0,0,0.35)",
                }}
            >
                <div style={{ padding: "48px 40px 24px", color: "#fff", textAlign: "center" }}>
                    <div
                        className="network-modal-icon"
                        style={{
                            background: "rgba(255,255,255,0.14)",
                            color: "#fff",
                            width: "72px",
                            height: "72px",
                            margin: "0 auto 20px",
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 800,
                        }}
                    >
                        P
                    </div>
                    <h2 className="heading-lg" style={{ marginBottom: "16px", textAlign: "center", color: "#fff" }}>
                        まず Polygon Amoy に接続してください
                    </h2>
                    <p style={{ margin: "0 auto", maxWidth: "680px", color: "rgba(255,255,255,0.88)", lineHeight: 1.8 }}>
                        このプラットフォームは Polygon Amoy Testnet を利用します。最初に MetaMask へネットワークを追加し、
                        そのまま Amoy へ切り替えてください。
                    </p>
                </div>

                <div style={{ padding: "0 40px 40px" }}>
                    <div
                        style={{
                            display: "grid",
                            gap: "20px",
                            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                            marginBottom: "24px",
                        }}
                    >
                        <div style={{ background: "rgba(255,255,255,0.94)", borderRadius: "24px", padding: "24px", color: "#10263f" }}>
                            <div style={{ fontSize: "30px", fontWeight: 800, marginBottom: "12px" }}>1</div>
                            <div style={{ fontSize: "24px", fontWeight: 800, lineHeight: 1.5 }}>
                                ネットワークを
                                <br />
                                MetaMask に追加する
                            </div>
                            <div style={{ marginTop: "14px", fontSize: "15px", lineHeight: 1.8 }}>
                                下のボタンを押すと MetaMask が開きます。表示された確認画面で {NETWORK_LABEL} の追加を許可してください。
                            </div>
                        </div>

                        <div style={{ background: "rgba(255,255,255,0.94)", borderRadius: "24px", padding: "24px", color: "#10263f" }}>
                            <div style={{ fontSize: "30px", fontWeight: 800, marginBottom: "12px" }}>2</div>
                            <div style={{ fontSize: "24px", fontWeight: 800, lineHeight: 1.5 }}>
                                MetaMask で
                                <br />
                                ネットワークを切り替える
                            </div>
                            <div style={{ marginTop: "14px", fontSize: "15px", lineHeight: 1.8 }}>
                                続けて表示される画面で「ネットワークを切り替える」を押してください。完了後、この案内は自動で閉じます。
                            </div>
                        </div>
                    </div>

                    <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: "20px", padding: "18px 20px", marginBottom: "20px", color: "#fff" }}>
                        <div style={{ fontWeight: 700, marginBottom: "10px" }}>登録するネットワーク情報</div>
                        <div style={{ display: "grid", gap: "8px", fontSize: "14px", color: "rgba(255,255,255,0.92)" }}>
                            <div>Network Name: {NETWORK_LABEL}</div>
                            <div>RPC URL: {NETWORK_CONFIG.rpcUrl}</div>
                            <div>Chain ID: {NETWORK_CONFIG.chainId}</div>
                            <div>Currency Symbol: {NETWORK_CONFIG.symbol}</div>
                            <div>Block Explorer URL: {NETWORK_CONFIG.explorer}</div>
                        </div>
                    </div>

                    {!hasEthereumProvider && (
                        <div
                            style={{
                                marginBottom: "20px",
                                padding: "14px 16px",
                                borderRadius: "16px",
                                background: "rgba(255,255,255,0.14)",
                                color: "#fff",
                                lineHeight: 1.7,
                            }}
                        >
                            MetaMask がこのブラウザで見つかりません。MetaMask 拡張機能をインストールした後に、ページを再読み込みしてください。
                        </div>
                    )}

                    <button
                        className="btn-primary-custom"
                        style={{
                            width: "100%",
                            padding: "18px 20px",
                            fontSize: "18px",
                            fontWeight: 800,
                            borderRadius: "18px",
                        }}
                        onClick={handleSwitchNetwork}
                    >
                        Polygon Amoy を MetaMask に追加して切り替える
                    </button>
                </div>
            </div>
        </div>
    );
}

export default Modal_change_network;
