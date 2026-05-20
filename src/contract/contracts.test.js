import { Contracts_MetaMask } from "./contracts";

const mockWaitForTransactionReceipt = jest.fn();
const mockAllowance = jest.fn();

jest.mock("./contractClients", () => ({
    ethereum: {},
    walletClient: null,
    publicClient: {
        waitForTransactionReceipt: (...args) => mockWaitForTransactionReceipt(...args),
        readContract: jest.fn(),
    },
    token_abi: [],
    quiz_abi: [],
    bootstrap_teacher_addresses: [],
    token_address: "0x021e416bb6bfA1e76Aa4E280828b1d55F2d5f2F0",
    ttt_token_address: "0x22b6457aC35b2A839EE6eb47c91f0941E1b21476",
    class_room_address: "0xa9AA6D24ecF43fEd6203680866f78B9A4798A8e0",
    quiz_address: "0xeb196c161EFA30939f78170694bb908E17fd1479",
    legacy_quiz_addresses: [
        "0x55B3977C7B7b913eaf175A7364c8375732d22241",
        "0xEbBD4E3276bcb847838E18DDA7585Ac8925a5eA6",
    ],
    tokenContract: {
        read: {
            allowance: (...args) => mockAllowance(...args),
        },
    },
    tttTokenContract: { read: {} },
    quizContract: { read: {} },
    amoy: { id: 80002 },
    sliceByNumber: (array, size) => {
        const chunks = [];
        for (let index = 0; index < array.length; index += size) {
            chunks.push(array.slice(index, index + size));
        }
        return chunks;
    },
    getEthereumProvider: jest.fn(() => ({})),
    waitForEthereumProvider: jest.fn(async () => ({})),
}));

jest.mock("../utils/quizCorrectAnswerStore", () => ({
    getRegisteredCorrectAnswer: jest.fn(() => ""),
}));

describe("Contracts_MetaMask legacy quiz settlement", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockWaitForTransactionReceipt.mockResolvedValue({ status: "success" });
        mockAllowance.mockResolvedValue(0n);
    });

    test("settle_quiz_rewards_manually sends payout to the original quiz contract address", async () => {
        const contract = new Contracts_MetaMask();
        const legacyQuizAddress = "0x55B3977C7B7b913eaf175A7364c8375732d22241";

        contract.get_address = jest.fn().mockResolvedValue("0xd5670D7B88411d03741680451C2ea630B68C6944");
        contract._payment_of_reward_manual = jest.fn().mockResolvedValue("0x1234");
        contract._investment_to_quiz = jest.fn().mockResolvedValue("");
        contract.approve = jest.fn().mockResolvedValue("");
        contract._adding_reward = jest.fn().mockResolvedValue("");

        await contract.settle_quiz_rewards_manually(
            4,
            0,
            "1/6",
            ["0x1111111111111111111111111111111111111111"],
            [],
            "true",
            legacyQuizAddress
        );

        expect(contract._payment_of_reward_manual).toHaveBeenCalledWith(
            "0xd5670D7B88411d03741680451C2ea630B68C6944",
            4,
            "1/6",
            ["0x1111111111111111111111111111111111111111"],
            [],
            true,
            legacyQuizAddress
        );
    });

    test("ensure_wallet_connected reuses existing accounts before requesting access again", async () => {
        const contract = new Contracts_MetaMask();
        const provider = {
            request: jest.fn().mockResolvedValue(["0xabc"]),
        };

        contract.getEthereumProviderReady = jest.fn().mockResolvedValue(provider);
        contract.request_wallet_access = jest.fn();

        const accounts = await contract.ensure_wallet_connected();

        expect(provider.request).toHaveBeenCalledWith({ method: "eth_accounts" });
        expect(contract.request_wallet_access).not.toHaveBeenCalled();
        expect(accounts).toEqual(["0xabc"]);
    });

    test("request_wallet_access caches the connected account immediately", async () => {
        const contract = new Contracts_MetaMask();
        const provider = {
            request: jest.fn().mockResolvedValue(["0xdef"]),
        };

        contract.getEthereumProviderReady = jest.fn().mockResolvedValue(provider);

        const accounts = await contract.request_wallet_access();

        expect(accounts).toEqual(["0xdef"]);
        await expect(contract.get_address()).resolves.toBe("0xdef");
    });

    test("ensure_wallet_connected reuses cached account without extra provider requests", async () => {
        const contract = new Contracts_MetaMask();
        const provider = {
            request: jest.fn().mockResolvedValue(["0xaaa"]),
        };

        contract.getEthereumProviderReady = jest.fn().mockResolvedValue(provider);
        await contract.request_wallet_access();

        provider.request.mockClear();
        const accounts = await contract.ensure_wallet_connected();

        expect(accounts).toEqual(["0xaaa"]);
        expect(provider.request).not.toHaveBeenCalled();
    });

    test("create_answer uses the account returned by ensure_wallet_connected", async () => {
        const contract = new Contracts_MetaMask();
        contract.getEthereumProviderReady = jest.fn().mockResolvedValue({});
        contract.ensure_amoy_network = jest.fn().mockResolvedValue(true);
        contract.get_read_account_cached = jest.fn().mockResolvedValue("");
        contract.ensure_wallet_connected = jest.fn().mockResolvedValue(["0x999"]);
        contract._save_answer = jest.fn().mockResolvedValue("0xhash");
        contract.waitForReceiptWithRetry = jest.fn().mockResolvedValue({ status: "success", transactionHash: "0xhash" });
        contract.invalidateQuizSimpleCache = jest.fn();

        const setShow = jest.fn();
        const setContent = jest.fn();

        await contract.create_answer(2, "A", setShow, setContent, "");

        expect(contract._save_answer).toHaveBeenCalledWith("0x999", 2, "A", "");
        expect(contract.waitForReceiptWithRetry).toHaveBeenCalledWith("0xhash");
    });

    test("edit_quiz uses the connected write account and amoy preflight", async () => {
        const contract = new Contracts_MetaMask();
        contract.getEthereumProviderReady = jest.fn().mockResolvedValue({});
        contract.ensure_amoy_network = jest.fn().mockResolvedValue(true);
        contract.getConnectedWriteAccount = jest.fn().mockResolvedValue("0x777");
        contract._edit_quiz = jest.fn().mockResolvedValue("0xedit");

        mockWaitForTransactionReceipt.mockResolvedValueOnce({ status: "success" });

        const receipt = await contract.edit_quiz(1, "0xowner", "t", "e", "u", "c", "2026-05-20T10:00", "2026-05-20T11:00", jest.fn(), "");

        expect(contract.ensure_amoy_network).toHaveBeenCalled();
        expect(contract._edit_quiz).toHaveBeenCalledWith(
            "0x777",
            1,
            "0xowner",
            "t",
            "e",
            "u",
            "c",
            "2026-05-20T10:00",
            "2026-05-20T11:00",
            ""
        );
        expect(receipt).toEqual({ status: "success" });
    });

    test("add_quiz_reward_delta reads allowance via public read helper", async () => {
        const contract = new Contracts_MetaMask();
        contract.getEthereumProviderReady = jest.fn().mockResolvedValue({});
        contract.ensure_amoy_network = jest.fn().mockResolvedValue(true);
        contract.getConnectedWriteAccount = jest.fn().mockResolvedValue("0x777");
        contract.readTokenAllowance = jest.fn().mockResolvedValue(0n);
        contract.approve = jest.fn().mockResolvedValue("0xapprove");
        contract._investment_to_quiz = jest.fn().mockResolvedValue("0xinvest");

        mockWaitForTransactionReceipt
            .mockResolvedValueOnce({ status: "success" })
            .mockResolvedValueOnce({ status: "success" });

        await contract.add_quiz_reward_delta(2, "10", 5, jest.fn(), "");

        expect(contract.readTokenAllowance).toHaveBeenCalledWith(
            "0x777",
            "0xeb196c161EFA30939f78170694bb908E17fd1479"
        );
        expect(contract.approve).toHaveBeenCalled();
        expect(contract._investment_to_quiz).toHaveBeenCalled();
    });

    test("providerRequestWithRetry retries provider limit errors", async () => {
        const contract = new Contracts_MetaMask();
        const provider = {
            request: jest.fn()
                .mockRejectedValueOnce(new Error("Request exceeds defined limit."))
                .mockResolvedValueOnce(["0xabc"]),
        };

        const result = await contract.providerRequestWithRetry(provider, { method: "eth_accounts" }, 2, 1);

        expect(result).toEqual(["0xabc"]);
        expect(provider.request).toHaveBeenCalledTimes(2);
    });
});
