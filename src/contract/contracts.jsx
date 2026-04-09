/**
 * Contracts_MetaMask - Main contract interaction class
 *
 * viem client initialization and shared utilities are imported from contractClients.js
 * This file contains the Contracts_MetaMask class with all blockchain interaction methods.
 */
/* global BigInt */
import { getAddress as checksumAddress } from "viem";
import {
    ethereum,
    walletClient,
    publicClient,
    token_abi,
    quiz_abi,
    token_address,
    ttt_token_address,
    class_room_address,
    quiz_address,
    tokenContract as token,
    tttTokenContract as tttToken,
    quizContract as quiz,
    amoy,
    sliceByNumber,
    getEthereumProvider as resolveEthereumProvider,
} from "./contractClients";
import { getRegisteredCorrectAnswer } from "../utils/quizCorrectAnswerStore";

const IS_TEACHER_NO_ARG_ABI = quiz_abi.find(
    (item) => item?.type === "function" && item?.name === "_isTeacher" && (item?.inputs?.length || 0) === 0
);
const IS_TEACHER_WITH_ADDRESS_ABI = quiz_abi.find(
    (item) => item?.type === "function" && item?.name === "_isTeacher" && (item?.inputs?.length || 0) === 1
);
const IS_STUDENT_NO_ARG_ABI = quiz_abi.find(
    (item) => item?.type === "function" && item?.name === "_isStudent" && (item?.inputs?.length || 0) === 0
);
const IS_STUDENT_WITH_ADDRESS_ABI = quiz_abi.find(
    (item) => item?.type === "function" && item?.name === "_isStudent" && (item?.inputs?.length || 0) === 1
);
const GET_USER_ROLE_WITH_ADDRESS_ABI = {
    type: "function",
    name: "get_user_role",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "role", type: "uint8" }],
};
const GET_USER_ROLE_NO_ARG_ABI = {
    type: "function",
    name: "get_user_role",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "role", type: "uint8" }],
};
const GET_USER_ROLE_LABEL_WITH_ADDRESS_ABI = {
    type: "function",
    name: "get_user_role_label",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "role_label", type: "string" }],
};
const IS_REGISTERED_WITH_ADDRESS_ABI = {
    type: "function",
    name: "isRegistered",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "registered", type: "bool" }],
};
const IS_REGISTERED_NO_ARG_ABI = {
    type: "function",
    name: "isRegistered",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "registered", type: "bool" }],
};
const GET_ROLE_SUMMARY_WITH_ADDRESS_ABI = {
    type: "function",
    name: "getRoleSummary",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
        { name: "registered", type: "bool" },
        { name: "is_teacher", type: "bool" },
        { name: "is_student", type: "bool" },
        { name: "role", type: "uint8" },
        { name: "role_label", type: "string" },
    ],
};
const GET_REGISTRATION_DETAILS_WITH_ADDRESS_ABI = {
    type: "function",
    name: "getRegistrationDetails",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
        { name: "registered", type: "bool" },
        { name: "is_teacher", type: "bool" },
        { name: "is_student", type: "bool" },
        { name: "role", type: "uint8" },
        { name: "role_label", type: "string" },
        { name: "added_by", type: "address" },
        { name: "added_at", type: "uint256" },
    ],
};
const GET_REGISTRATION_DETAILS_NO_ARG_ABI = {
    type: "function",
    name: "getRegistrationDetails",
    stateMutability: "view",
    inputs: [],
    outputs: [
        { name: "registered", type: "bool" },
        { name: "is_teacher", type: "bool" },
        { name: "is_student", type: "bool" },
        { name: "role", type: "uint8" },
        { name: "role_label", type: "string" },
        { name: "added_by", type: "address" },
        { name: "added_at", type: "uint256" },
    ],
};
const GET_QUIZ_STATISTICS_ABI = {
    type: "function",
    name: "get_quiz_statistics",
    stateMutability: "view",
    inputs: [{ name: "_quiz_id", type: "uint256" }],
    outputs: [
        { name: "respondent_count", type: "uint256" },
        { name: "respondent_limit", type: "uint256" },
        { name: "correct_count", type: "uint256" },
        { name: "incorrect_count", type: "uint256" },
        { name: "pending_count", type: "uint256" },
        { name: "lifecycle", type: "uint8" },
        { name: "is_payment", type: "bool" },
    ],
};
const GET_QUIZ_LIFECYCLE_LABEL_ABI = {
    type: "function",
    name: "get_quiz_lifecycle_label",
    stateMutability: "view",
    inputs: [{ name: "quiz_id", type: "uint256" }],
    outputs: [{ name: "lifecycle_label", type: "string" }],
};
const GET_REVIEW_REQUIRED_ABI = {
    type: "function",
    name: "get_review_required",
    stateMutability: "view",
    inputs: [{ name: "_quiz_id", type: "uint256" }, { name: "student", type: "address" }],
    outputs: [{ name: "required", type: "bool" }],
};
const GET_REVIEW_QUIZ_IDS_ABI = {
    type: "function",
    name: "get_review_quiz_ids",
    stateMutability: "view",
    inputs: [{ name: "student", type: "address" }],
    outputs: [{ name: "quiz_ids", type: "uint256[]" }],
};
const CREATE_ATTENDANCE_SESSION_ABI = {
    type: "function",
    name: "create_attendance_session",
    stateMutability: "nonpayable",
    inputs: [{ name: "label", type: "string" }, { name: "attendance_code", type: "string" }],
    outputs: [{ name: "session_id", type: "uint256" }],
};
const CLOSE_ATTENDANCE_SESSION_ABI = {
    type: "function",
    name: "close_attendance_session",
    stateMutability: "nonpayable",
    inputs: [{ name: "session_id", type: "uint256" }],
    outputs: [{ name: "closed", type: "bool" }],
};
const MARK_ATTENDANCE_ABI = {
    type: "function",
    name: "mark_attendance",
    stateMutability: "nonpayable",
    inputs: [{ name: "session_id", type: "uint256" }, { name: "attendance_code", type: "string" }],
    outputs: [{ name: "marked", type: "bool" }],
};
const GET_ATTENDANCE_SESSION_COUNT_ABI = {
    type: "function",
    name: "get_attendance_session_count",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "count", type: "uint256" }],
};
const GET_ATTENDANCE_SESSION_ABI = {
    type: "function",
    name: "get_attendance_session",
    stateMutability: "view",
    inputs: [{ name: "session_id", type: "uint256" }],
    outputs: [
        { name: "id", type: "uint256" },
        { name: "label", type: "string" },
        { name: "created_at", type: "uint256" },
        { name: "closed_at", type: "uint256" },
        { name: "is_active", type: "bool" },
        { name: "attendee_count", type: "uint256" },
    ],
};
const HAS_ATTENDED_ABI = {
    type: "function",
    name: "has_attended",
    stateMutability: "view",
    inputs: [{ name: "session_id", type: "uint256" }, { name: "attendee", type: "address" }],
    outputs: [{ name: "attended", type: "bool" }],
};
const GET_ATTENDANCE_ATTENDEES_ABI = {
    type: "function",
    name: "get_attendance_attendees",
    stateMutability: "view",
    inputs: [{ name: "session_id", type: "uint256" }],
    outputs: [{ name: "attendees", type: "address[]" }],
};
const RECORD_ANNOUNCEMENT_HASH_ABI = {
    type: "function",
    name: "record_announcement_hash",
    stateMutability: "nonpayable",
    inputs: [{ name: "content_hash", type: "bytes32" }, { name: "tag", type: "string" }],
    outputs: [{ name: "record_id", type: "uint256" }],
};
const RECORD_SUPERCHAT_ABI = {
    type: "function",
    name: "record_superchat",
    stateMutability: "nonpayable",
    inputs: [
        { name: "message_id", type: "string" },
        { name: "message_hash", type: "bytes32" },
        { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "record_id", type: "uint256" }],
};
const AWARD_BADGE_ABI = {
    type: "function",
    name: "award_badge",
    stateMutability: "nonpayable",
    inputs: [{ name: "user", type: "address" }, { name: "badge_key", type: "bytes32" }],
    outputs: [{ name: "awarded", type: "bool" }],
};
const HAS_BADGE_ABI = {
    type: "function",
    name: "has_badge",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }, { name: "badge_key", type: "bytes32" }],
    outputs: [{ name: "granted", type: "bool" }],
};

const ROLE_CODE = {
    NONE: 0,
    STUDENT: 1,
    TEACHER: 2,
};

function normalizeRole(roleCode, roleLabel = "") {
    const numericRole = Number(roleCode);
    if (numericRole === ROLE_CODE.TEACHER || String(roleLabel).toLowerCase() === "teacher") {
        return { code: ROLE_CODE.TEACHER, key: "teacher", label: "教員" };
    }
    if (numericRole === ROLE_CODE.STUDENT || String(roleLabel).toLowerCase() === "student") {
        return { code: ROLE_CODE.STUDENT, key: "student", label: "学生" };
    }
    return { code: ROLE_CODE.NONE, key: "guest", label: "未登録" };
}

function isObjectLike(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toQuizAllDataArray(result) {
    if (Array.isArray(result)) return result;
    if (!isObjectLike(result)) return result;
    return [
        Number(result.id),
        result.owner,
        result.title,
        result.explanation,
        result.thumbnail_url,
        result.content,
        Number(result.answer_type),
        result.answer_data,
        Number(result.start_time_epoch),
        Number(result.time_limit_epoch),
        Number(result.reward),
        Number(result.respondent_count),
        Number(result.respondent_limit),
        Number(result.state),
    ];
}

function toQuizArray(result) {
    if (Array.isArray(result)) return result;
    if (!isObjectLike(result)) return result;
    return [
        Number(result.id),
        result.owner,
        result.title,
        result.explanation,
        result.thumbnail_url,
        result.content,
        result.answer_data,
        Number(result.create_time_epoch),
        Number(result.start_time_epoch),
        Number(result.time_limit_epoch),
        Number(result.reward),
        Number(result.respondent_count),
        Number(result.respondent_limit),
    ];
}

function toQuizSimpleArray(result) {
    if (Array.isArray(result)) return result;
    if (!isObjectLike(result)) return result;
    return [
        Number(result.id),
        result.owner,
        result.title,
        result.explanation,
        result.thumbnail_url,
        Number(result.start_time_epoch),
        Number(result.time_limit_epoch),
        Number(result.reward),
        Number(result.respondent_count),
        Number(result.respondent_limit),
        Number(result.state),
        Boolean(result.is_payment),
    ];
}

class Contracts_MetaMask {
    getAccessControlAddress() {
        return class_room_address || quiz_address;
    }

    normalizeAddress(address) {
        return String(address || "").toLowerCase();
    }

    formatShortAddress(address) {
        const normalized = String(address || "");
        if (normalized.length < 10) return normalized;
        return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
    }

    getEthereumProvider() {
        return resolveEthereumProvider() || ethereum || null;
    }

    async add_watch_asset(address, symbol, decimals = 18) {
        const provider = this.getEthereumProvider();
        if (!provider || !address) return false;
        try {
            await this.ensure_amoy_network();
            return await provider.request({
                method: "wallet_watchAsset",
                params: {
                    type: "ERC20",
                    options: {
                        address,
                        symbol,
                        decimals,
                    },
                },
            });
        } catch (error) {
            console.error("Failed to add watch asset", error);
            throw error;
        }
    }

    getAmoyAddChainParams() {
        return {
            chainId: `0x${amoy.id.toString(16)}`,
            chainName: amoy.name,
            nativeCurrency: amoy.nativeCurrency,
            rpcUrls: amoy.rpcUrls?.default?.http || [],
            blockExplorerUrls: amoy.blockExplorers?.default?.url ? [amoy.blockExplorers.default.url] : [],
        };
    }

    async get_chain_id() {
        const provider = this.getEthereumProvider();
        if (!provider) return null;
        try {
            const chainIdHex = await provider.request({ method: "eth_chainId" });
            return Number(chainIdHex);
        } catch (error) {
            console.error("Failed to get chain id", error);
            return null;
        }
    }

    async request_wallet_access() {
        const provider = this.getEthereumProvider();
        if (!provider) return [];
        try {
            return await provider.request({ method: "eth_requestAccounts" });
        } catch (error) {
            console.error("Failed to request wallet access", error);
            throw error;
        }
    }
    async add_token_wallet() {
        if (!this.getEthereumProvider()) return;
        try {
            const tokenSymbol = await this.get_token_symbol();
            await this.add_watch_asset(token_address, tokenSymbol || "TOKEN", 18);
        } catch (error) {
            console.error("Failed to add token to wallet", error);
        }
    }

    async add_ttt_token_wallet() {
        if (!ttt_token_address) {
            throw new Error("ttt_token_address_missing");
        }
        return this.add_watch_asset(ttt_token_address, "TTT", 18);
    }

    async get_token_symbol() {
        try {
            if (this.getEthereumProvider()) {
                return await token.read.symbol();
            }
        } catch (err) {
            console.log(err);
        }
        return "TOKEN";
    }

    async change_network() {
        const provider = this.getEthereumProvider();
        if (!provider) return false;
        try {
            await provider.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: `0x${amoy.id.toString(16)}` }],
            });
            return true;
        } catch (e) {
            //userがrejectした場合
            console.log(e);
            throw e;
        }
    }
    async add_network() {
        const provider = this.getEthereumProvider();
        if (!provider) return false;
        try {
            await provider.request({
                method: "wallet_addEthereumChain",
                params: [this.getAmoyAddChainParams()],
            });
            return true;
        } catch (e) {
            console.log(e);
            throw e;
        }
    }

    async ensure_amoy_network() {
        const provider = this.getEthereumProvider();
        if (!provider) return false;

        await this.request_wallet_access();

        try {
            return await this.change_network();
        } catch (error) {
            if (error?.code === 4902 || String(error?.message || "").includes("4902")) {
                await this.add_network();
                return await this.change_network();
            }
            if (error?.code === 4001) {
                return false;
            }
            throw error;
        }
    }

    async add_or_switch_amoy_network() {
        const provider = this.getEthereumProvider();
        if (!provider) {
            throw new Error("metamask_not_found");
        }

        await this.request_wallet_access();

        const currentChainId = await this.get_chain_id();
        if (currentChainId === amoy.id) {
            return { changed: false, chainId: currentChainId };
        }

        try {
            await this.change_network();
        } catch (error) {
            if (error?.code === 4001) {
                throw error;
            }

            const shouldAddNetwork =
                error?.code === 4902
                || String(error?.message || "").includes("4902")
                || String(error?.message || "").toLowerCase().includes("unrecognized chain");

            if (!shouldAddNetwork) {
                throw error;
            }

            await this.add_network();
            await this.change_network();
        }

        const nextChainId = await this.get_chain_id();
        if (nextChainId !== amoy.id) {
            throw new Error("amoy_network_switch_failed");
        }

        return { changed: true, chainId: nextChainId };
    }

    async get_token_balance(address) {
        try {
            if (this.getEthereumProvider()) {
                console.log(token_address);
                const balance = await token.read.balanceOf({ args: [address] });
                console.log(balance);
                console.log(Number(balance) / 10 ** 18);
                //16進数を10進数に変換
                return Number(balance) / 10 ** 18;
            } else {
                console.log("Ethereum object does not exist");
            }
        } catch (err) {
            console.log(err);
        }
    }

    async get_ttt_balance(address) {
        try {
            if (this.getEthereumProvider() && ttt_token_address) {
                const balance = await tttToken.read.balanceOf({ args: [address] });
                return Number(balance) / 10 ** 18;
            }
        } catch (err) {
            console.log(err);
        }
        return 0;
    }

    async get_address() {
        try {
            const provider = this.getEthereumProvider();
            if (!provider || !walletClient) {
                console.log("Ethereum object does not exist");
                return "";
            }

            const accounts = await provider.request({ method: "eth_accounts" });
            if (accounts?.[0]) return accounts[0];

            const requestedAccounts = await walletClient.requestAddresses();
            return requestedAccounts?.[0] || "";
        } catch (err) {
            console.log(err);
            return "";
        }
    }

    async get_token_history(address, start, end) {
        console.log(address, start, end);
        let account = await this.get_address();
        try {
            if (this.getEthereumProvider()) {
                console.log(token_address);
                //取得したクイズを格納する配列
                let res = [];

                console.log(start, end);
                if (start <= end) {
                    for (let i = start; i < end; i++) {
                        res.push(await token.read.get_user_history({ account, args: [address, i] }));
                    }
                } else {
                    //console.log("33");
                    for (let i = start - 1; i >= end; i--) {
                        res.push(await token.read.get_user_history({ account, args: [address, i] }));
                    }
                }

                return res;
            } else {
                console.log("Ethereum object does not exist");
            }
        } catch (err) {
            console.log(err);
        }
    }

    async get_user_history_len(address) {
        console.log(token_address);
        let account = await this.get_address();
        const res = await token.read.get_user_history_len({ account, args: [address] });
        return Number(res);
    }

    //ユーザーのデータを取得する
    async get_user_data(address) {
        try {
            if (this.getEthereumProvider()) {
                let account = await this.get_address();
                console.log(token_address);
                const res = account
                    ? await quiz.read.get_user({ account, args: [address] })
                    : await quiz.read.get_user({ args: [address] });
                return [res[0], res[1], Number(res[2]), res[3]];
            } else {
                console.log("Ethereum object does not exist");
            }
        } catch (err) {
            console.log(err);
        }
    }

    async approve(account, amount) {
        try {
            if (ethereum) {
                console.log(amount);
                try {
                    const { request } = await publicClient.simulateContract({
                        account,
                        address: token_address,
                        abi: token_abi,
                        functionName: "approve",
                        args: [quiz_address, amount],
                    });
                    console.log("成功");
                    return await walletClient.writeContract(request);
                } catch (e) {
                    console.log(e);
                }
            } else {
                console.log("Ethereum object does not exist");
            }
        } catch (err) {
            console.log(err);
        }
    }

    async investment_to_quiz(id, amount, answer, isNotPayingOut, numOfStudent, isNotAddingReward, students) {
        console.log([id, amount, isNotPayingOut, numOfStudent, isNotAddingReward]);
        let res = null;
        let res2 = null;
        let hash = null;
        let hash2 = null;
        let is_not_paying_out = null;
        let is_not_adding_reward = null;
        amount = Number(amount) * 10 ** 18;

        if (isNotPayingOut === "false") {
            is_not_paying_out = false;
        } else {
            is_not_paying_out = true;
        }
        if (isNotAddingReward === "false") {
            is_not_adding_reward = false;
        } else {
            is_not_adding_reward = true;
        }

        try {
            if (ethereum) {
                let account = await this.get_address();
                let approval = await token.read.allowance({ account, args: [account, quiz_address] });
                console.log(Number(approval));
                console.log(amount * numOfStudent);

                if (Number(approval) >= Number(amount * numOfStudent)) {
                    hash = await this._investment_to_quiz(account, id, amount, numOfStudent);
                    if (hash) {
                        res = await publicClient.waitForTransactionReceipt({ hash });
                    }
                } else {
                    hash = await this.approve(account, amount * numOfStudent);
                    if (hash) {
                        res = await publicClient.waitForTransactionReceipt({ hash });
                        hash = await this._investment_to_quiz(account, id, amount, numOfStudent);
                        console.log(hash);
                        if (hash) {
                            res = await publicClient.waitForTransactionReceipt({ hash });
                        }
                    }
                }

                if (is_not_paying_out == false) {
                    let addreses = sliceByNumber(students, 15);
                    console.log(addreses)
                    for (let i = 0; i < addreses.length; i++) {
                        hash2 = await this._payment_of_reward(account, id, answer, addreses[i]);
                        if (hash) {
                            res2 = await publicClient.waitForTransactionReceipt({ hash });
                        }
                    }
                    if (is_not_adding_reward == false) {
                        let reward = (await this.get_quiz_simple(id))[7];
                        console.log(reward);
                        approval = await token.read.allowance({ account, args: [account, quiz_address] });
                        console.log(approval);
                        if (Number(approval) >= Number(reward)) {
                            hash = await this._addingReward(account, id, reward);
                            if (hash) {
                                res = await publicClient.waitForTransactionReceipt({ hash });
                            }
                        } else {
                            hash = await this.approve(account, reward);
                            if (hash) {
                                res = res = await publicClient.waitForTransactionReceipt({ hash });
                                hash = await this._adding_reward(account, id, reward);
                                if (hash) {
                                    res = await publicClient.waitForTransactionReceipt({ hash });
                                }
                            }
                        }
                    }
                }
            } else {
                console.log("Ethereum object does not exist");
            }
        } catch (err) {
            console.log(err);
        }
        return { res, res2, hash, hash2 };
    }

    async _investment_to_quiz(account, id, amount, numOfStudent) {
        console.log([account, id, amount, numOfStudent])
        try {
            if (ethereum) {
                //console.log(title, explanation, thumbnail_url, content, answer_type, answer_data, correct, epochStartSeconds, epochEndSeconds, reward, correct_limit);
                try {
                    const { request } = await publicClient.simulateContract({
                        account,
                        address: quiz_address,
                        abi: quiz_abi,
                        functionName: "investment_to_quiz",
                        args: [id, amount.toString(), numOfStudent],
                    });

                    return await walletClient.writeContract(request);
                } catch (e) {
                    console.log(e);
                }
            } else {
                console.log("Ethereum object does not exist");
            }
        } catch (err) {
            console.log(err);
        }
    }

    async _payment_of_reward(account, id, answer, students) {
        console.log([account, id, answer, students]);
        try {
            if (ethereum) {
                try {
                    const { request } = await publicClient.simulateContract({
                        account,
                        address: quiz_address,
                        abi: quiz_abi,
                        functionName: "payment_of_reward",
                        args: [id, answer, students],
                    });

                    return await walletClient.writeContract(request);
                } catch (e) {
                    console.log(e);
                }
            } else {
                console.log("Ethereum object does not exist");
            }
        } catch (err) {
            console.log(err);
        }
    }

    async _adding_reward(account, id, reward) {
        console.log([account, id, reward]);
        try {
            if (ethereum) {
                try {
                    const { request } = await publicClient.simulateContract({
                        account,
                        address: quiz_address,
                        abi: quiz_abi,
                        functionName: "adding_reward",
                        args: [id],
                    });

                    return await walletClient.writeContract(request);
                } catch (e) {
                    console.log(e);
                }
            } else {
                console.log("Ethereum object does not exist");
            }
        } catch (err) {
            console.log(err);
        }
    }

    async create_quiz(title, explanation, thumbnail_url, content, answer_type, answer_data, correct, reply_startline, reply_deadline, reward, correct_limit, setShow) {
        setShow(true);
        let res = null;
        let hash = null;
        const respondentLimit = Number(correct_limit || 0);
        reward = Number(reward || 0) * 10 ** 18;
        try {
            if (ethereum) {
                let account = await this.get_address();
                if (!account) {
                    throw new Error("wallet_not_connected");
                }
                if (respondentLimit <= 0) {
                    throw new Error("student_count_unavailable");
                }
                let approval = await token.read.allowance({ account, args: [account, quiz_address] });

                if (Number(approval) >= Number(reward * respondentLimit)) {
                    hash = await this._create_quiz(account, title, explanation, thumbnail_url, content, answer_type, answer_data, correct, reply_startline, reply_deadline, reward, respondentLimit);
                    res = await publicClient.waitForTransactionReceipt({ hash });
                } else {
                    hash = await this.approve(account, reward * respondentLimit);
                    res = await publicClient.waitForTransactionReceipt({ hash });
                    hash = await this._create_quiz(account, title, explanation, thumbnail_url, content, answer_type, answer_data, correct, reply_startline, reply_deadline, reward, respondentLimit);
                    res = await publicClient.waitForTransactionReceipt({ hash });
                }
            } else {
                throw new Error("ethereum_not_found");
            }
        } catch (err) {
            console.log(err);
            throw err;
        } finally {
            setShow(false);
        }
        return res;
    }

    async _create_quiz(account, title, explanation, thumbnail_url, content, answer_type, answer_data, correct, reply_startline, reply_deadline, reward, correct_limit) {
        const dateStartObj = new Date(reply_startline);
        const dateEndObj = new Date(reply_deadline);

        // Date オブジェクトをエポック秒に変換する
        const epochStartSeconds = Math.floor(dateStartObj.getTime() / 1000);
        const epochEndSeconds = Math.floor(dateEndObj.getTime() / 1000);
        try {
            if (ethereum) {
                const { request } = await publicClient.simulateContract({
                    account,
                    address: quiz_address,
                    abi: quiz_abi,
                    functionName: "create_quiz",
                    args: [title, explanation, thumbnail_url, content, answer_type, answer_data.toString(), correct, epochStartSeconds, epochEndSeconds, reward, correct_limit],
                });

                return await walletClient.writeContract(request);
            } else {
                throw new Error("ethereum_not_found");
            }
        } catch (err) {
            console.log(err);
            throw err;
        }
    }

    async edit_quiz(id, owner, title, explanation, thumbnail_url, content, reply_startline, reply_deadline, setShow) {
        setShow(true);
        //console.log([id, owner, title, explanation, thumbnail_url, content, reply_startline, reply_deadline]);
        let res = null;
        let hash = null;
        try {
            if (ethereum) {
                let account = await this.get_address();
                let approval = await token.read.allowance({ account, args: [account, quiz_address] });

                hash = await this._edit_quiz(account, id, owner, title, explanation, thumbnail_url, content, reply_startline, reply_deadline);
                console.log(hash);
                if (hash) {
                    res = await publicClient.waitForTransactionReceipt({ hash });
                }
                console.log(res);

                console.log("create_quiz_cont");
            } else {
                setShow(false);
                console.log("Ethereum object does not exist");
            }
        } catch (err) {
            setShow(false);
            console.log(err);
        }
        return res;
    }

    async _edit_quiz(account, id, owner, title, explanation, thumbnail_url, content, reply_startline, reply_deadline) {
        const dateStartObj = new Date(reply_startline);
        const dateEndObj = new Date(reply_deadline);

        // Date オブジェクトをエポック秒に変換する
        const epochStartSeconds = Math.floor(dateStartObj.getTime() / 1000);
        const epochEndSeconds = Math.floor(dateEndObj.getTime() / 1000);
        try {
            if (ethereum) {
                //console.log(title, explanation, thumbnail_url, content, answer_type, answer_data, correct, epochStartSeconds, epochEndSeconds, reward, correct_limit);

                try {
                    const { request } = await publicClient.simulateContract({
                        account,
                        address: quiz_address,
                        abi: quiz_abi,
                        functionName: "edit_quiz",
                        args: [id, owner, title, explanation, thumbnail_url, content, epochStartSeconds, epochEndSeconds],
                        //args: ["a", "a", "a", "a", 1, "a", "a", epochStartSeconds, epochEndSeconds, 2, 2],
                    });

                    return await walletClient.writeContract(request);
                } catch (e) {
                    console.log(e);
                }
            } else {
                console.log("Ethereum object does not exist");
            }
        } catch (err) {
            console.log(err);
        }
    }

    async create_answer(id, answer, setShow, setContent) {
        console.log(id, answer);
        try {
            if (ethereum) {
                let account = await this.get_address();

                setShow(true);
                setContent("書き込み中...");
                let hash = await this._save_answer(account, id, answer);

                if (hash) {
                    let res = await publicClient.waitForTransactionReceipt({ hash });
                    console.log(res);
                    // トランザクション成功後にのみローカルに保存
                    localStorage.setItem(`quiz_${id}_answer`, answer);
                    return res;
                } else {
                    // hash が取得できなかった = トランザクションが拒否された
                    setShow(false);
                    throw new Error("Transaction was rejected or failed");
                }
                console.log("create_answer_cont");
            } else {
                console.log("Ethereum object does not exist");
            }
        } catch (err) {
            console.log(err);
            setShow(false);
            throw err; // 呼び出し元でキャッチできるように再スロー
        }
    }

    async _save_answer(account, id, answer) {
        try {
            const { request } = await publicClient.simulateContract({
                account,
                address: quiz_address,
                abi: quiz_abi,
                functionName: "save_answer",
                args: [id, answer.toString()],
            });
            console.log("正常そう");
            return await walletClient.writeContract(request);
        } catch (e) {
            console.log(e);
        }
    }

    async _post_answer(account, id, answer) {
        try {
            const { request } = await publicClient.simulateContract({
                account,
                address: quiz_address,
                abi: quiz_abi,
                functionName: "post_answer",
                args: [id, answer.toString()],
            });
            console.log("正常そう");
            return await walletClient.writeContract(request);
        } catch (e) {
            console.log(e);
        }
    }

    async get_quiz_all_data(id) {
        try {
            const result = await quiz.read.get_quiz_all_data({ args: [id] });
            return toQuizAllDataArray(result);
        } catch (error) {
            console.log(error);
            const [quizData, answerType, simpleData] = await Promise.all([
                this.get_quiz(id),
                quiz.read.get_quiz_answer_type({ args: [id] }),
                this.get_quiz_simple(id),
            ]);
            return [
                Number(quizData?.[0] || id),
                quizData?.[1] || "",
                quizData?.[2] || "",
                quizData?.[3] || "",
                quizData?.[4] || "",
                quizData?.[5] || "",
                Number(answerType || 0),
                quizData?.[6] || "",
                Number(quizData?.[8] || 0),
                Number(quizData?.[9] || 0),
                Number(quizData?.[10] || 0),
                Number(simpleData?.[8] || 0),
                Number(simpleData?.[9] || 0),
                Number(simpleData?.[10] || 0),
            ];
        }
    }

    async get_quiz(id) {
        const answer_typr = await quiz.read.get_quiz_answer_type({ args: [id] });
        const res = toQuizArray(await quiz.read.get_quiz({ args: [id] }));
        const res2 = await this.get_confirm_answer(id);
        const registeredCorrectAnswer = getRegisteredCorrectAnswer(id);
        return [...res, answer_typr, registeredCorrectAnswer, res2[1]];
    }

    async get_quiz_simple(id) {
        const account = await this.get_address();
        if (account) {
            return toQuizSimpleArray(await quiz.read.get_quiz_simple({ account, args: [id] }));
        }
        return toQuizSimpleArray(await quiz.read.get_quiz_simple({ args: [id] }));
    }

    async get_is_payment(id) {
        return await quiz.read.get_is_payment({ args: [id] });
    }

    async get_confirm_answer(id) {
        return await quiz.read.get_confirm_answer({ args: [id] });
    }

    async get_quiz_all_data_list(start, end) {
        let account = await this.get_address();
        const ids = [];

        console.log(start, end);
        if (start <= end) {
            for (let i = start; i < end; i++) {
                ids.push(i);
            }
        } else {
            for (let i = start - 1; i >= end; i--) {
                ids.push(i);
            }
        }

        const settled = await Promise.allSettled(
            ids.map((id) => (
                this.get_quiz_all_data(id)
            ))
        );

        return settled
            .filter((result) => result.status === "fulfilled")
            .map((result) => toQuizAllDataArray(result.value));
    }

    //startからendまでのクイズを取得

    async get_quiz_list(start, end) {
        let account = await this.get_address();
        const ids = [];

        console.log(start, end);
        if (start <= end) {
            for (let i = start; i < end; i++) {
                ids.push(i);
            }
        } else {
            for (let i = start - 1; i >= end; i--) {
                ids.push(i);
            }
        }

        const settled = await Promise.allSettled(
            ids.map((id) => (
                account
                    ? quiz.read.get_quiz_simple({ account, args: [id] })
                    : quiz.read.get_quiz_simple({ args: [id] })
            ))
        );

        return settled
            .filter((result) => result.status === "fulfilled")
            .map((result) => toQuizSimpleArray(result.value));
    }

    async get_quiz_lenght() {
        return await quiz.read.get_quiz_length();
    }

    async get_num_of_students() {
        try {
            return Number(await quiz.read.get_num_of_students());
        } catch (error) {
            console.log(error);
            try {
                const students = await this.get_student_list();
                return Array.isArray(students) ? students.length : 0;
            } catch (fallbackError) {
                console.log(fallbackError);
                return 0;
            }
        }
    }

    async add_student(address) {
        console.log(address);
        try {
            if (ethereum) {
                try {
                    let account = await this.get_address();
                    const { request } = await publicClient.simulateContract({
                        account,
                        address: this.getAccessControlAddress(),
                        abi: quiz_abi,
                        functionName: "add_student",
                        args: [address],
                    });
                    return await walletClient.writeContract(request);
                } catch (e) {
                    console.log(e);
                }
            } else {
                console.log("Ethereum object does not exist");
            }
        } catch (err) {
            console.log(err);
        }
    }

    async add_teacher(address) {
        try {
            if (ethereum) {
                try {
                    let account = await this.get_address();
                    const { request } = await publicClient.simulateContract({
                        account,
                        address: this.getAccessControlAddress(),
                        abi: quiz_abi,
                        functionName: "add_teacher",
                        args: [address],
                    });
                    return await walletClient.writeContract(request);
                } catch (e) {
                    console.log(e);
                }
            } else {
                console.log("Ethereum object does not exist");
            }
        } catch (err) {
            console.log(err);
        }
    }

    async get_teachers() {
        try {
            if (this.getEthereumProvider()) {
                let account = await this.get_address();
                return await publicClient.readContract({
                    account,
                    address: this.getAccessControlAddress(),
                    abi: quiz_abi,
                    functionName: "get_teacher_all",
                    args: [],
                });
            } else {
                console.log("Ethereum object does not exist");
            }
        } catch (err) {
            console.log(err);
        }
    }

    async get_results() {
        try {
            if (this.getEthereumProvider()) {
                let account = await this.get_address();
                let res = account
                    ? await quiz.read.get_student_results({ account, args: [] })
                    : await quiz.read.get_student_results({ args: [] });
                console.log(res);
                return res;
            } else {
                console.log("Ethereum object does not exist");
            }
        } catch (err) {
            console.log(err);
            try {
                const students = await this.get_student_list();
                const rows = await Promise.all(
                    (Array.isArray(students) ? students : []).map(async (student) => {
                        const user = await this.get_user_data(student);
                        return {
                            student,
                            result: BigInt(Math.floor(Number(user?.[2] || 0) * 10 ** 18)),
                        };
                    })
                );
                return rows;
            } catch (fallbackError) {
                console.log(fallbackError);
                return [];
            }
        }
    }

    async isTeacher() {
        try {
            if (this.getEthereumProvider()) {
                let account = await this.get_address();
                if (!account) return false;

                try {
                    if (!IS_TEACHER_NO_ARG_ABI) throw new Error("is_teacher_no_arg_abi_missing");
                    const directResult = await publicClient.readContract({
                        account,
                        address: this.getAccessControlAddress(),
                        abi: [IS_TEACHER_NO_ARG_ABI],
                        functionName: "_isTeacher",
                        args: [],
                    });
                    if (typeof directResult === "boolean") return directResult;
                } catch (directError) {
                    console.log(directError);
                }

                try {
                    if (!IS_TEACHER_WITH_ADDRESS_ABI) throw new Error("is_teacher_with_address_abi_missing");
                    const overloadResult = await publicClient.readContract({
                        account,
                        address: this.getAccessControlAddress(),
                        abi: [IS_TEACHER_WITH_ADDRESS_ABI],
                        functionName: "_isTeacher",
                        args: [account],
                    });
                    if (typeof overloadResult === "boolean") return overloadResult;
                } catch (overloadError) {
                    console.log(overloadError);
                }

                try {
                    const teachers = await this.get_teachers();
                    return Array.isArray(teachers)
                        ? teachers.some((teacher) => this.normalizeAddress(teacher) === this.normalizeAddress(account))
                        : false;
                } catch (listError) {
                    console.log(listError);
                }
            } else {
                console.log("Ethereum object does not exist");
            }
        } catch (err) {
            console.log(err);
        }
        return false;
    }

    async isStudent(address = "") {
        try {
            if (this.getEthereumProvider()) {
                const account = await this.get_address();
                const targetAddress = address || account;
                if (!targetAddress) return null;

                try {
                    if (!IS_STUDENT_WITH_ADDRESS_ABI) throw new Error("is_student_with_address_abi_missing");
                    return await publicClient.readContract({
                        account,
                        address: this.getAccessControlAddress(),
                        abi: [IS_STUDENT_WITH_ADDRESS_ABI],
                        functionName: "_isStudent",
                        args: [targetAddress],
                    });
                } catch (overloadError) {
                    try {
                        if (!IS_STUDENT_NO_ARG_ABI) throw new Error("is_student_no_arg_abi_missing");
                        return await publicClient.readContract({
                            account,
                            address: this.getAccessControlAddress(),
                            abi: [IS_STUDENT_NO_ARG_ABI],
                            functionName: "_isStudent",
                            args: [],
                        });
                    } catch (fallbackError) {
                        return null;
                    }
                }
            } else {
                console.log("Ethereum object does not exist");
            }
        } catch (err) {
            console.log(err);
        }
        return null;
    }

    async getUserRole(address = "") {
        try {
            if (this.getEthereumProvider()) {
                const account = await this.get_address();
                const targetAddress = address || account;
                if (!targetAddress) {
                    return normalizeRole(ROLE_CODE.NONE);
                }

                try {
                    const roleCode = await publicClient.readContract({
                        account,
                        address: this.getAccessControlAddress(),
                        abi: [GET_USER_ROLE_WITH_ADDRESS_ABI],
                        functionName: "get_user_role",
                        args: [targetAddress],
                    });

                    let roleLabel = "";
                    try {
                        roleLabel = await publicClient.readContract({
                            account,
                            address: this.getAccessControlAddress(),
                            abi: [GET_USER_ROLE_LABEL_WITH_ADDRESS_ABI],
                            functionName: "get_user_role_label",
                            args: [targetAddress],
                        });
                    } catch (labelError) {
                        console.log(labelError);
                    }

                    return normalizeRole(roleCode, roleLabel);
                } catch (withAddressError) {
                    try {
                        if (targetAddress !== account) {
                            throw withAddressError;
                        }
                        const roleCode = await publicClient.readContract({
                            account,
                            address: this.getAccessControlAddress(),
                            abi: [GET_USER_ROLE_NO_ARG_ABI],
                            functionName: "get_user_role",
                            args: [],
                        });
                        return normalizeRole(roleCode);
                    } catch (noArgError) {
                        const [teacher, student] = await Promise.all([
                            this.isTeacher().catch(() => false),
                            this.isStudent(targetAddress).catch(() => null),
                        ]);

                        if (teacher) return normalizeRole(ROLE_CODE.TEACHER);
                        if (student === true) return normalizeRole(ROLE_CODE.STUDENT);
                        if (targetAddress !== account) {
                            try {
                                const teachers = await this.get_teachers();
                                if (Array.isArray(teachers) && teachers.some((item) => this.normalizeAddress(item) === this.normalizeAddress(targetAddress))) {
                                    return normalizeRole(ROLE_CODE.TEACHER);
                                }
                            } catch (teacherListError) {
                                console.log(teacherListError);
                            }

                            try {
                                const students = await this.get_student_list();
                                if (Array.isArray(students) && students.some((item) => this.normalizeAddress(item) === this.normalizeAddress(targetAddress))) {
                                    return normalizeRole(ROLE_CODE.STUDENT);
                                }
                            } catch (studentListError) {
                                console.log(studentListError);
                            }
                        }
                        if (student === null && targetAddress) return normalizeRole(ROLE_CODE.NONE);
                    }
                }
            }
        } catch (err) {
            console.log(err);
        }

        return normalizeRole(ROLE_CODE.NONE);
    }

    async isRegistered(address = "") {
        try {
            if (!this.getEthereumProvider()) return false;
            const account = await this.get_address();
            const targetAddress = address || account;
            if (!targetAddress) return false;

            try {
                return await publicClient.readContract({
                    account,
                    address: this.getAccessControlAddress(),
                    abi: [IS_REGISTERED_WITH_ADDRESS_ABI],
                    functionName: "isRegistered",
                    args: [targetAddress],
                });
            } catch (withAddressError) {
                if (targetAddress !== account) {
                    const role = await this.getUserRole(targetAddress);
                    return role.key !== "guest";
                }

                try {
                    return await publicClient.readContract({
                        account,
                        address: this.getAccessControlAddress(),
                        abi: [IS_REGISTERED_NO_ARG_ABI],
                        functionName: "isRegistered",
                        args: [],
                    });
                } catch (noArgError) {
                    const role = await this.getUserRole(targetAddress);
                    return role.key !== "guest";
                }
            }
        } catch (error) {
            console.log(error);
        }

        return false;
    }

    async getRoleSummary(address = "") {
        const fallbackRole = await this.getUserRole(address);
        try {
            if (!this.getEthereumProvider()) {
                return {
                    registered: fallbackRole.key !== "guest",
                    isTeacher: fallbackRole.key === "teacher",
                    isStudent: fallbackRole.key === "student",
                    role: fallbackRole.code,
                    roleKey: fallbackRole.key,
                    roleLabel: fallbackRole.label,
                };
            }

            const account = await this.get_address();
            const targetAddress = address || account;
            if (!targetAddress) {
                return {
                    registered: false,
                    isTeacher: false,
                    isStudent: false,
                    role: ROLE_CODE.NONE,
                    roleKey: "guest",
                    roleLabel: "未登録",
                };
            }

            const result = await publicClient.readContract({
                account,
                address: this.getAccessControlAddress(),
                abi: [GET_ROLE_SUMMARY_WITH_ADDRESS_ABI],
                functionName: "getRoleSummary",
                args: [targetAddress],
            });

            return {
                registered: Boolean(result?.[0]),
                isTeacher: Boolean(result?.[1]),
                isStudent: Boolean(result?.[2]),
                role: Number(result?.[3] ?? fallbackRole.code),
                roleKey: normalizeRole(result?.[3], result?.[4]).key,
                roleLabel: normalizeRole(result?.[3], result?.[4]).label,
            };
        } catch (error) {
            return {
                registered: fallbackRole.key !== "guest",
                isTeacher: fallbackRole.key === "teacher",
                isStudent: fallbackRole.key === "student",
                role: fallbackRole.code,
                roleKey: fallbackRole.key,
                roleLabel: fallbackRole.label,
            };
        }
    }

    async getRegistrationDetails(address = "") {
        const fallbackRole = await this.getUserRole(address);
        try {
            if (!this.getEthereumProvider()) {
                return {
                    registered: fallbackRole.key !== "guest",
                    isTeacher: fallbackRole.key === "teacher",
                    isStudent: fallbackRole.key === "student",
                    role: fallbackRole.code,
                    roleKey: fallbackRole.key,
                    roleLabel: fallbackRole.label,
                    addedBy: "",
                    addedAt: 0,
                };
            }

            const account = await this.get_address();
            const targetAddress = address || account;
            if (!targetAddress) {
                return {
                    registered: false,
                    isTeacher: false,
                    isStudent: false,
                    role: ROLE_CODE.NONE,
                    roleKey: "guest",
                    roleLabel: "未登録",
                    addedBy: "",
                    addedAt: 0,
                };
            }

            let result;
            try {
                result = await publicClient.readContract({
                    account,
                    address: this.getAccessControlAddress(),
                    abi: [GET_REGISTRATION_DETAILS_WITH_ADDRESS_ABI],
                    functionName: "getRegistrationDetails",
                    args: [targetAddress],
                });
            } catch (withAddressError) {
                if (targetAddress !== account) {
                    throw withAddressError;
                }
                result = await publicClient.readContract({
                    account,
                    address: this.getAccessControlAddress(),
                    abi: [GET_REGISTRATION_DETAILS_NO_ARG_ABI],
                    functionName: "getRegistrationDetails",
                    args: [],
                });
            }

            const normalized = normalizeRole(result?.[3], result?.[4]);
            return {
                registered: Boolean(result?.[0]),
                isTeacher: Boolean(result?.[1]),
                isStudent: Boolean(result?.[2]),
                role: Number(result?.[3] ?? normalized.code),
                roleKey: normalized.key,
                roleLabel: normalized.label,
                addedBy: String(result?.[5] || ""),
                addedAt: Number(result?.[6] || 0),
            };
        } catch (error) {
            console.log(error);
            return {
                registered: fallbackRole.key !== "guest",
                isTeacher: fallbackRole.key === "teacher",
                isStudent: fallbackRole.key === "student",
                role: fallbackRole.code,
                roleKey: fallbackRole.key,
                roleLabel: fallbackRole.label,
                addedBy: "",
                addedAt: 0,
            };
        }
    }

    async getQuizStatistics(id) {
        try {
            const result = await publicClient.readContract({
                address: quiz_address,
                abi: [GET_QUIZ_STATISTICS_ABI],
                functionName: "get_quiz_statistics",
                args: [Number(id)],
            });

            return {
                respondentCount: Number(result?.[0] || 0),
                respondentLimit: Number(result?.[1] || 0),
                correctCount: Number(result?.[2] || 0),
                incorrectCount: Number(result?.[3] || 0),
                pendingCount: Number(result?.[4] || 0),
                lifecycle: Number(result?.[5] || 0),
                isPayment: Boolean(result?.[6]),
            };
        } catch (error) {
            console.log(error);
            try {
                const simple = await this.get_quiz_simple(id);
                return {
                    respondentCount: Number(simple?.[8] || 0),
                    respondentLimit: Number(simple?.[9] || 0),
                    correctCount: 0,
                    incorrectCount: 0,
                    pendingCount: 0,
                    lifecycle: 0,
                    isPayment: Boolean(simple?.[11]),
                };
            } catch (fallbackError) {
                console.log(fallbackError);
                return null;
            }
        }
    }

    async getQuizLifecycleLabel(id) {
        try {
            return await publicClient.readContract({
                address: quiz_address,
                abi: [GET_QUIZ_LIFECYCLE_LABEL_ABI],
                functionName: "get_quiz_lifecycle_label",
                args: [Number(id)],
            });
        } catch (error) {
            console.log(error);
            try {
                const simple = await this.get_quiz_simple(id);
                const endAt = Number(simple?.[6] || 0);
                if (endAt && endAt < Math.floor(Date.now() / 1000)) return "closed";
                return "published";
            } catch (fallbackError) {
                console.log(fallbackError);
                return "";
            }
        }
    }

    async getReviewRequired(quizId, address = "") {
        try {
            const account = await this.get_address();
            const targetAddress = address || account;
            if (!targetAddress) return false;

            return await publicClient.readContract({
                account,
                address: quiz_address,
                abi: [GET_REVIEW_REQUIRED_ABI],
                functionName: "get_review_required",
                args: [Number(quizId), targetAddress],
            });
        } catch (error) {
            console.log(error);
            return false;
        }
    }

    async getReviewQuizIds(address = "") {
        try {
            const account = await this.get_address();
            const targetAddress = address || account;
            if (!targetAddress) return [];

            const result = await publicClient.readContract({
                account,
                address: quiz_address,
                abi: [GET_REVIEW_QUIZ_IDS_ABI],
                functionName: "get_review_quiz_ids",
                args: [targetAddress],
            });

            return Array.isArray(result) ? result.map((item) => Number(item)) : [];
        } catch (error) {
            console.log(error);
            return [];
        }
    }

    async createAttendanceSession(label, attendanceCode) {
        try {
            const account = await this.get_address();
            const { request } = await publicClient.simulateContract({
                account,
                address: quiz_address,
                abi: [CREATE_ATTENDANCE_SESSION_ABI],
                functionName: "create_attendance_session",
                args: [String(label || ""), String(attendanceCode || "")],
            });
            return await walletClient.writeContract(request);
        } catch (error) {
            console.log(error);
            return null;
        }
    }

    async closeAttendanceSession(sessionId) {
        try {
            const account = await this.get_address();
            const { request } = await publicClient.simulateContract({
                account,
                address: quiz_address,
                abi: [CLOSE_ATTENDANCE_SESSION_ABI],
                functionName: "close_attendance_session",
                args: [Number(sessionId)],
            });
            return await walletClient.writeContract(request);
        } catch (error) {
            console.log(error);
            return null;
        }
    }

    async markAttendance(sessionId, attendanceCode) {
        try {
            const account = await this.get_address();
            const { request } = await publicClient.simulateContract({
                account,
                address: quiz_address,
                abi: [MARK_ATTENDANCE_ABI],
                functionName: "mark_attendance",
                args: [Number(sessionId), String(attendanceCode || "")],
            });
            return await walletClient.writeContract(request);
        } catch (error) {
            console.log(error);
            return null;
        }
    }

    async getAttendanceSessionCount() {
        try {
            const result = await publicClient.readContract({
                address: quiz_address,
                abi: [GET_ATTENDANCE_SESSION_COUNT_ABI],
                functionName: "get_attendance_session_count",
                args: [],
            });
            return Number(result || 0);
        } catch (error) {
            console.log(error);
            return 0;
        }
    }

    async getAttendanceSession(sessionId) {
        try {
            const result = await publicClient.readContract({
                address: quiz_address,
                abi: [GET_ATTENDANCE_SESSION_ABI],
                functionName: "get_attendance_session",
                args: [Number(sessionId)],
            });
            return {
                id: Number(result?.[0] || 0),
                label: String(result?.[1] || ""),
                createdAt: Number(result?.[2] || 0),
                closedAt: Number(result?.[3] || 0),
                isActive: Boolean(result?.[4]),
                attendeeCount: Number(result?.[5] || 0),
            };
        } catch (error) {
            console.log(error);
            return null;
        }
    }

    async hasAttended(sessionId, address = "") {
        try {
            const account = await this.get_address();
            const targetAddress = address || account;
            if (!targetAddress) return false;
            return await publicClient.readContract({
                account,
                address: quiz_address,
                abi: [HAS_ATTENDED_ABI],
                functionName: "has_attended",
                args: [Number(sessionId), targetAddress],
            });
        } catch (error) {
            console.log(error);
            return false;
        }
    }

    async getAttendanceAttendees(sessionId) {
        try {
            return await publicClient.readContract({
                address: quiz_address,
                abi: [GET_ATTENDANCE_ATTENDEES_ABI],
                functionName: "get_attendance_attendees",
                args: [Number(sessionId)],
            });
        } catch (error) {
            console.log(error);
            return [];
        }
    }

    async recordAnnouncementHash(contentHash, tag = "") {
        try {
            const account = await this.get_address();
            const { request } = await publicClient.simulateContract({
                account,
                address: quiz_address,
                abi: [RECORD_ANNOUNCEMENT_HASH_ABI],
                functionName: "record_announcement_hash",
                args: [contentHash, String(tag || "")],
            });
            return await walletClient.writeContract(request);
        } catch (error) {
            console.log(error);
            return null;
        }
    }

    async recordSuperchatOnChain(messageId, messageHash, amount) {
        try {
            const account = await this.get_address();
            const { request } = await publicClient.simulateContract({
                account,
                address: quiz_address,
                abi: [RECORD_SUPERCHAT_ABI],
                functionName: "record_superchat",
                args: [String(messageId || ""), messageHash, BigInt(amount)],
            });
            return await walletClient.writeContract(request);
        } catch (error) {
            console.log(error);
            return null;
        }
    }

    async awardBadge(user, badgeKey) {
        try {
            const account = await this.get_address();
            const { request } = await publicClient.simulateContract({
                account,
                address: quiz_address,
                abi: [AWARD_BADGE_ABI],
                functionName: "award_badge",
                args: [user, badgeKey],
            });
            return await walletClient.writeContract(request);
        } catch (error) {
            console.log(error);
            return null;
        }
    }

    async hasBadge(user, badgeKey) {
        try {
            return await publicClient.readContract({
                address: quiz_address,
                abi: [HAS_BADGE_ABI],
                functionName: "has_badge",
                args: [user, badgeKey],
            });
        } catch (error) {
            console.log(error);
            return false;
        }
    }

    async get_only_student_results() {
        try {
            let results = await this.get_results();
            let scores = (Array.isArray(results) ? results : []).map((item) => Number(item?.result || 0));
            scores.sort((a, b) => b - a);
            return scores;
        } catch (err) {
            console.log(err);
            return [];
        }
    }

    async get_rank(result) {
        try {
            let results = await this.get_only_student_results();
            for (let i = 0; i < results.length; i++) {
                if (result == results[i]) return i + 1;
            }
        } catch (err) {
            console.log(err);
        }
        return 0;
    }

    async get_respondentCount_and_respondentLimit(id) {
        try {
            return await quiz.read.get_respondentCount_and_respondentLimit({ args: [id] });
        } catch (error) {
            console.log(error);
            const simple = await this.get_quiz_simple(id);
            return [Number(simple?.[8] || 0), Number(simple?.[9] || 0)];
        }
    }
    //ここから変更
    async get_student_answer_hash(student, id) {
        try {
            if (ethereum) {
                let account = await this.get_address();
                let res = await quiz.read.get_student_answer_hash({ account, args: [student, id] });
                return res;
            } else {
                console.log("Ethereum object does not exists");
            }
        } catch (err) {
            console.log(err);
        }
    }


    async get_student_list() {
        try {
            if (this.getEthereumProvider()) {
                let account = await this.get_address();
                let res = await publicClient.readContract({
                    account,
                    address: this.getAccessControlAddress(),
                    abi: quiz_abi,
                    functionName: "get_student_all",
                    args: [],
                });
                return res;
            } else {
                console.log("Ethereum object does not exists");
            }
        } catch (err) {
            console.log(err);
        }
    }

    async get_students_answer_hash_list(students, id) {
        try {
            if (ethereum) {
                let res = {};
                console.log(students[1]);
                for (let i = 0; i < students.length; i++) {
                    res[students[i]] = await this.get_student_answer_hash(students[i], id);
                }
                return res;
            } else {
                console.log("Ethereum object does not exists");
            }
        } catch (err) {
            console.log(err);
        }
    }
    //ここまで変更

    async get_data_for_survey_users() {
        try {
            if (ethereum) {
                let account = await this.get_address();
                let res = await quiz.read.get_data_for_survey_users({ account, args: [] });
                return res;
            } else {
                console.log("Ethereum object does not exists");
            }
        } catch (err) {
            console.log(err);
            try {
                const students = await this.get_student_list();
                const rows = await Promise.all(
                    (Array.isArray(students) ? students : []).map(async (student) => {
                        const user = await this.get_user_data(student);
                        return {
                            user: student,
                            create_quiz_count: 0,
                            result: BigInt(Math.floor(Number(user?.[2] || 0) * 10 ** 18)),
                            answer_count: 0,
                        };
                    })
                );
                return rows;
            } catch (fallbackError) {
                console.log(fallbackError);
                return [];
            }
        }
    }
    async get_data_for_survey_quizs() {
        try {
            if (ethereum) {
                let account = await this.get_address();
                let res = await quiz.read.get_data_for_survey_quizs({ account, args: [] });
                return res;
            } else {
                console.log("Ethereum object does not exists");
            }
        } catch (err) {
            console.log(err);
            try {
                const length = await this.get_quiz_lenght();
                const rows = [];
                for (let i = 0; i < Number(length || 0); i++) {
                    const quizData = await this.get_quiz_simple(i);
                    rows.push({
                        reward: BigInt(Number(quizData?.[7] || 0)),
                        respondent_count: Number(quizData?.[8] || 0),
                    });
                }
                return rows;
            } catch (fallbackError) {
                console.log(fallbackError);
                return [];
            }
        }
    }

    async resolveSuperchatRecipient(recipientAddress = "") {
        const account = await this.get_address();
        const requestedRecipient = String(recipientAddress || "").trim();

        if (requestedRecipient) {
            const checksummedRecipient = checksumAddress(requestedRecipient);
            return {
                address: checksummedRecipient,
                label: `指定先 ${this.formatShortAddress(checksummedRecipient)}`,
                isDefault: false,
            };
        }

        const teachers = (await this.get_teachers())
            .map((item) => {
                try {
                    return checksumAddress(item);
                } catch (error) {
                    return "";
                }
            })
            .filter(Boolean);

        if (teachers.length === 0) {
            throw new Error("superchat_recipient_not_found");
        }

        const normalizedSelf = this.normalizeAddress(account);
        const preferredTeacher = teachers.find((item) => this.normalizeAddress(item) !== normalizedSelf) || teachers[0];

        return {
            address: preferredTeacher,
            label: "教員側",
            isDefault: true,
        };
    }

    // スーパーチャット送金用関数
    async send_superchat(amount, recipientAddress = "") {
        try {
            if (ethereum) {
                let account = await this.get_address();
                const balance = await tttToken.read.balanceOf({ args: [account] });
                const amountInWei = BigInt(Math.floor(amount)) * 10n**18n;
                if (balance < amountInWei) {
                    throw new Error("insufficient_ttt_balance");
                }
                const recipient = await this.resolveSuperchatRecipient(recipientAddress);

                const { request } = await publicClient.simulateContract({
                    account,
                    address: ttt_token_address,
                    abi: token_abi,
                    functionName: "transfer",
                    args: [recipient.address, amountInWei],
                });

                const hash = await walletClient.writeContract(request);

                console.log("Superchat Tx Hash:", hash);
                await publicClient.waitForTransactionReceipt({ hash });
                return recipient;
            } else {
                console.log("Ethereum object does not exist");
                return false;
            }
        } catch (err) {
            console.error("Superchat transaction failed:", err);
            throw err;
        }
    }
}

export { Contracts_MetaMask };
