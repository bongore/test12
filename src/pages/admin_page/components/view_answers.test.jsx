import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Contracts_MetaMask } from "../../../contract/contracts";
import View_answers from "./view_answers";

const mockContract = {
    get_all_quiz_simple_list: jest.fn(),
    get_quiz: jest.fn(),
    get_student_list: jest.fn(),
    get_students_answer_hash_list: jest.fn(),
    get_student_answer_detail: jest.fn(),
};

jest.mock("../../../contract/contracts", () => ({
    Contracts_MetaMask: jest.fn(),
}));

describe("View_answers", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Contracts_MetaMask.mockImplementation(() => mockContract);
        mockContract.get_all_quiz_simple_list.mockResolvedValue([
            Object.assign([1, "0xteacher", "確認用クイズ", "", "", 0, 0, 0, 1, 10, 0, false], {
                sourceAddress: "0xeb196c161EFA30939f78170694bb908E17fd1479",
            }),
        ]);
        mockContract.get_quiz.mockResolvedValue([
            1,
            "0xteacher",
            "確認用クイズ",
            "",
            "",
            "問題本文",
            "A,B,C",
            0,
            0,
            0,
            50000000000000000000,
            1,
            10,
            0,
            "",
            false,
        ]);
        mockContract.get_student_list.mockResolvedValue(["0x1111111111111111111111111111111111111111"]);
        mockContract.get_students_answer_hash_list.mockResolvedValue({
            "0x1111111111111111111111111111111111111111": "0x0000000000000000000000000000000000000000000000000000000000000000",
        });
        mockContract.get_student_answer_detail.mockResolvedValue({
            answerText: "1/6",
            state: 3,
            answerTime: 1710000000,
            reward: 0,
            result: false,
            submitted: true,
            attemptCount: 1,
        });
    });

    test("shows submitted student answers from answer_text even when hash decoding is empty", async () => {
        render(<View_answers />);

        const quizButton = await screen.findByRole("button", { name: /確認用クイズ/ });
        fireEvent.click(quizButton);

        await waitFor(() => {
            expect(mockContract.get_student_answer_detail).toHaveBeenCalledWith(
                "0x1111111111111111111111111111111111111111",
                1,
                "0xeb196c161EFA30939f78170694bb908E17fd1479"
            );
        });

        expect(await screen.findByText("1/6")).toBeInTheDocument();
        expect(screen.getByText("回答済み")).toBeInTheDocument();
        expect(screen.getByText("✅ 回答済:", { exact: false })).toBeInTheDocument();
    });
});
