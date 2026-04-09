/**
 * Contract Clients - Shared viem client initialization
 *
 * viemのclient初期化とコントラクトインスタンスの共通設定を一元管理。
 * 各モジュールからimportして利用する。
 */
import { createPublicClient, createWalletClient, http, getContract, custom } from "viem";
import token_contract from "./token_abi.json";
import quiz_contract from "./quiz_abi.json";
import { class_room_address, quiz_address, token_address, ttt_token_address, bootstrap_teacher_addresses } from "./config";
import { amoy } from "./network";

/* eslint-disable no-restricted-globals */

const WALLET_PROVIDER_CHANGED_EVENT = "wallet-provider-changed";
let ethereum = null;
let walletClient = null;
let tokenContract = null;
let tttTokenContract = null;
let quizContract = null;

/* ── Public Client (RPC) ── */
const publicClient = createPublicClient({
    chain: amoy,
    transport: http(),
});

/* ── ABI ── */
const token_abi = token_contract.abi;
const quiz_abi = quiz_contract.abi;

function detectEthereumProvider() {
    if (typeof window === "undefined") return null;

    const injected = window.ethereum || null;
    if (!injected) return null;

    if (Array.isArray(injected.providers) && injected.providers.length > 0) {
        return (
            injected.providers.find((provider) => provider?.isMetaMask)
            || injected.providers.find((provider) => provider?.isBraveWallet)
            || injected.providers[0]
            || injected
        );
    }

    return injected;
}

function syncInjectedClients() {
    ethereum = detectEthereumProvider();
    walletClient = ethereum
        ? createWalletClient({
              chain: amoy,
              transport: custom(ethereum),
          })
        : null;

    const clientConfig = walletClient
        ? { walletClient, publicClient }
        : { publicClient };

    tokenContract = getContract({
        address: token_address,
        abi: token_abi,
        ...clientConfig,
    });

    tttTokenContract = getContract({
        address: ttt_token_address,
        abi: token_abi,
        ...clientConfig,
    });

    quizContract = getContract({
        address: quiz_address,
        abi: quiz_abi,
        ...clientConfig,
    });

    return ethereum;
}

function getEthereumProvider() {
    return syncInjectedClients();
}

function bindWalletProviderEvents() {
    if (typeof window === "undefined" || window.__web3QuizWalletEventsBound) return;

    const provider = syncInjectedClients();
    if (!provider) return;

    const notifyWalletProviderChanged = (detail) => {
        syncInjectedClients();
        window.dispatchEvent(new CustomEvent(WALLET_PROVIDER_CHANGED_EVENT, { detail }));
    };

    provider.on?.("chainChanged", (chainIdHex) => {
        notifyWalletProviderChanged({ type: "chainChanged", chainIdHex });
    });

    provider.on?.("accountsChanged", (accounts) => {
        notifyWalletProviderChanged({ type: "accountsChanged", accounts });
    });

    window.__web3QuizWalletEventsBound = true;
}

syncInjectedClients();

if (typeof window !== "undefined") {
    bindWalletProviderEvents();
    window.addEventListener("ethereum#initialized", bindWalletProviderEvents, { once: false });
    window.addEventListener("load", bindWalletProviderEvents, { once: true });
}

/* ── Utility Functions ── */

/** 配列を指定サイズで分割 */
const sliceByNumber = (array, number) => {
    const length = Math.ceil(array.length / number);
    return new Array(length)
        .fill()
        .map((_, i) => array.slice(i * number, (i + 1) * number));
};

/** 全角数字→半角数字 変換 */
const convertFullWidthNumbersToHalf = (() => {
    const diff = "０".charCodeAt(0) - "0".charCodeAt(0);
    return (text) =>
        text.replace(/[０-９]/g, (m) =>
            String.fromCharCode(m.charCodeAt(0) - diff)
        );
})();

/** MetaMaskのアドレスを取得 */
async function getAddress() {
    try {
        syncInjectedClients();
        if (ethereum && walletClient) {
            return (await walletClient.requestAddresses())[0];
        } else {
            console.log("Ethereum object does not exist");
        }
    } catch (err) {
        console.log(err);
    }
}

export {
    ethereum,
    walletClient,
    publicClient,
    token_abi,
    quiz_abi,
    token_address,
    ttt_token_address,
    bootstrap_teacher_addresses,
    class_room_address,
    quiz_address,
    tokenContract,
    tttTokenContract,
    quizContract,
    amoy,
    sliceByNumber,
    convertFullWidthNumbersToHalf,
    getAddress,
    getEthereumProvider,
    WALLET_PROVIDER_CHANGED_EVENT,
};
