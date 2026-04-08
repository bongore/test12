function User_card(props) {
    const isCurrentWallet = String(props.connectedAddress || "").toLowerCase() === String(props.address || "").toLowerCase();
    const registrationDate = props.registrationInfo?.addedAt
        ? new Date(Number(props.registrationInfo.addedAt) * 1000).toLocaleString("ja-JP")
        : "";
    const shortAddedBy = props.registrationInfo?.addedBy
        ? `${props.registrationInfo.addedBy.slice(0, 10)}...${props.registrationInfo.addedBy.slice(-6)}`
        : "未記録";

    const hasEthereumProvider = () => Boolean(props.cont?.getEthereumProvider?.());

    const addNetworkHandler = async () => {
        if (!hasEthereumProvider()) {
            alert("MetaMask が見つかりません。MetaMask をインストールしてから再度お試しください。");
            return;
        }

        try {
            const result = await props.cont.add_or_switch_amoy_network();
            if (result?.changed) {
                alert("Polygon Amoy を MetaMask に追加し、自動で切り替えました。");
                return true;
            }
            alert("すでに Polygon Amoy に接続されています。");
            return true;
        } catch (error) {
            console.error("Failed to ensure Polygon Amoy network", error);
            if (error?.code === 4001) {
                alert("MetaMask 側で操作がキャンセルされました。");
                return false;
            }
            alert("Polygon Amoy の追加または切り替えに失敗しました。MetaMask のポップアップを確認してください。");
            return false;
        }
    };

    const addTokenHandler = async () => {
        if (!hasEthereumProvider()) {
            alert("MetaMask が見つかりません。MetaMask をインストールしてから再度お試しください。");
            return;
        }

        try {
            const ensured = await addNetworkHandler();
            if (!ensured) return;
            await props.cont.add_token_wallet();
            alert("TFT を MetaMask に追加しました。");
        } catch (error) {
            console.error("Failed to add token to MetaMask", error);
            alert("TFT の追加に失敗しました。MetaMask の確認画面を確認してください。");
        }
    };

    const addTTTTokenHandler = async () => {
        if (!hasEthereumProvider()) {
            alert("MetaMask が見つかりません。MetaMask をインストールしてから再度お試しください。");
            return;
        }

        try {
            const ensured = await addNetworkHandler();
            if (!ensured) return;
            await props.cont.add_ttt_token_wallet();
            alert("TTT を MetaMask に追加しました。");
        } catch (error) {
            console.error("Failed to add TTT token to MetaMask", error);
            if (error?.message === "ttt_token_address_missing") {
                alert("TTT はまだデプロイ前のため、コントラクトアドレスが未設定です。");
                return;
            }
            alert("TTT の追加に失敗しました。MetaMask の確認画面を確認してください。");
        }
    };

    return (
        <div className="user-card glass-card animate-slideUp">
            <div className="user-address">
                <span className="user-address-label">アドレス</span>
                <span className="user-address-value">
                    {props.address ? `${props.address.slice(0, 10)}...${props.address.slice(-6)}` : ""}
                </span>
            </div>

            <div className="user-stats">
                <div className="user-stat-item">
                    <div className="user-stat-icon">R</div>
                    <div className="user-stat-info">
                        <span className="user-stat-label">利用区分</span>
                        <span className="user-stat-value">{props.roleInfo?.label || "未登録"}</span>
                    </div>
                </div>
                <div className="user-stat-item">
                    <div className="user-stat-icon">T</div>
                    <div className="user-stat-info">
                        <span className="user-stat-label">保有トークン</span>
                        <span className="user-stat-value">{props.token} TFT</span>
                    </div>
                </div>
                <div className="user-stat-item">
                    <div className="user-stat-icon">#</div>
                    <div className="user-stat-info">
                        <span className="user-stat-label">順位</span>
                        <span className="user-stat-value">
                            {props.rank}位 / {props.num_of_student}人
                        </span>
                    </div>
                </div>
                <div className="user-stat-item">
                    <div className="user-stat-icon">C</div>
                    <div className="user-stat-info">
                        <span className="user-stat-label">スーパーチャット残高</span>
                        <span className="user-stat-value">{props.tttBalance || 0} TTT</span>
                    </div>
                </div>
                <div className="user-stat-item">
                    <div className="user-stat-icon">A</div>
                    <div className="user-stat-info">
                        <span className="user-stat-label">登録状態</span>
                        <span className="user-stat-value">{props.registrationInfo?.registered ? "登録済み" : "未登録"}</span>
                    </div>
                </div>
                <div className="user-stat-item">
                    <div className="user-stat-icon">W</div>
                    <div className="user-stat-info">
                        <span className="user-stat-label">現在の接続</span>
                        <span className="user-stat-value">{isCurrentWallet ? "現在接続中" : "別アドレスを表示中"}</span>
                    </div>
                </div>
                <div className="user-stat-item">
                    <div className="user-stat-icon">B</div>
                    <div className="user-stat-info">
                        <span className="user-stat-label">追加した人</span>
                        <span className="user-stat-value">{shortAddedBy}</span>
                    </div>
                </div>
                <div className="user-stat-item">
                    <div className="user-stat-icon">D</div>
                    <div className="user-stat-info">
                        <span className="user-stat-label">登録日時</span>
                        <span className="user-stat-value">{registrationDate || "未記録"}</span>
                    </div>
                </div>
                <div className="user-stat-item">
                    <div className="user-stat-icon">S</div>
                    <div className="user-stat-info">
                        <span className="user-stat-label">獲得点数</span>
                        <span className="user-stat-value">{Number(props.result) / 40}点</span>
                    </div>
                </div>
            </div>

            <div style={{ display: "grid", gap: "12px", marginTop: "var(--space-4)" }}>
                <button type="button" className="btn-ghost" style={{ width: "100%" }} onClick={addNetworkHandler}>
                    Polygon Amoy を MetaMask に追加
                </button>
                <button type="button" className="btn-ghost" style={{ width: "100%" }} onClick={addTokenHandler}>
                    TFT を MetaMask に追加
                </button>
                <button type="button" className="btn-ghost" style={{ width: "100%" }} onClick={addTTTTokenHandler}>
                    TTT を MetaMask に追加
                </button>
            </div>
        </div>
    );
}

export default User_card;
