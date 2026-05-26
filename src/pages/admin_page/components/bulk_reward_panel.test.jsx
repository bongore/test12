import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Bulk_reward_panel from "./bulk_reward_panel";
import { useAccessControl } from "../../../utils/accessControl";
import { getRewardPayoutEntries, syncRewardPayoutLedgerFromServer } from "../../../utils/rewardPayoutLedger";

jest.mock("../../../utils/accessControl", () => ({
    useAccessControl: jest.fn(),
}));

jest.mock("../../../utils/rewardPayoutLedger", () => ({
    getRewardPayoutEntries: jest.fn(() => []),
    persistRewardPayoutEntriesToServer: jest.fn(async () => []),
    syncRewardPayoutLedgerFromServer: jest.fn(async () => []),
}));

describe("Bulk_reward_panel", () => {
    const mockContract = {
        get_student_list: jest.fn(),
        get_user_data: jest.fn(),
        get_all_quiz_simple_list: jest.fn(),
        get_revealed_correct_answer: jest.fn(),
        get_student_answer_detail: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
        useAccessControl.mockReturnValue({
            isLoading: false,
            isTeacher: true,
            address: "0xd5670D7B88411d03741680451C2ea630B68C6944",
        });

        mockContract.get_student_list.mockResolvedValue([
            "0x1111111111111111111111111111111111111111",
        ]);
        mockContract.get_user_data.mockResolvedValue(["学生A"]);
        mockContract.get_all_quiz_simple_list.mockResolvedValue([
            [
                5,
                "0xteacher",
                "応用数学第四回演習問題(5)",
                "",
                "",
                0,
                0,
                50000000000000000000n,
                1,
                10,
                0,
                false,
                "0x55B3977C7B7b913eaf175A7364c8375732d22241",
            ],
        ]);
        mockContract.get_revealed_correct_answer.mockResolvedValue("1/6");
        mockContract.get_student_answer_detail.mockResolvedValue({
            submitted: true,
            state: 3,
            answerText: "1/6",
            reward: 0,
        });
    });

    test("loads eligible quizzes and exposes bulk payout controls", async () => {
        render(<Bulk_reward_panel cont={mockContract} />);

        expect(await screen.findByText("💸 全問題一括報酬配布")).toBeInTheDocument();
        expect(await screen.findByText(/応用数学第四回演習問題\(5\)/)).toBeInTheDocument();
        expect(screen.getByText("旧コントラクト")).toBeInTheDocument();
        expect(screen.getByText("未完了 1 問 / 配布完了 0 問 / 全 1 問")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "全対象問題を一括配布" })).toBeEnabled();

        fireEvent.click(screen.getByRole("button", { name: "対象を全選択" }));

        await waitFor(() => {
            expect(screen.getByRole("button", { name: "選択した問題を一括配布" })).toBeEnabled();
        });
    });

    test("shows payout transaction links for already completed quizzes from the payout ledger", async () => {
        const payoutEntries = [
            {
                quizId: 5,
                sourceAddress: "0x55B3977C7B7b913eaf175A7364c8375732d22241",
                studentAddress: "0x1111111111111111111111111111111111111111",
                txHash: "0xfeed1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
                confirmed: true,
            },
        ];
        getRewardPayoutEntries.mockReturnValue(payoutEntries);
        syncRewardPayoutLedgerFromServer.mockResolvedValue(payoutEntries);
        mockContract.get_student_answer_detail.mockResolvedValue({
            submitted: true,
            state: 2,
            answerText: "1/6",
            reward: 50000000000000000000n,
        });

        render(<Bulk_reward_panel cont={mockContract} />);

        expect(await screen.findByText("報酬配布が完了した問題")).toBeInTheDocument();
        const payoutLink = await screen.findByRole("link", { name: /0xfeed1234/i });
        expect(payoutLink).toHaveAttribute("href", "https://amoy.polygonscan.com/tx/0xfeed1234567890abcdef1234567890abcdef1234567890abcdef1234567890");
    });
});
