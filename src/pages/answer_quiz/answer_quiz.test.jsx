import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Contracts_MetaMask } from "../../contract/contracts";
import { useAccessControl } from "../../utils/accessControl";
import Answer_quiz from "./answer_quiz";

const mockNavigate = jest.fn();
const mockRecordPracticeAttempt = jest.fn();
const routerFuture = {
    v7_startTransition: true,
    v7_relativeSplatPath: true,
};
const buildQuizData = ({ title = "練習問題", deadline = "0", correctAnswer = "A", isPayment = false } = {}) => ([
    1,
    "0xteacher",
    title,
    "説明",
    "",
    "問題本文",
    "A,B,C",
    0,
    "0",
    deadline,
    0,
    0,
    0,
    0,
    correctAnswer,
    isPayment,
]);
const buildSimpleQuizData = ({ title = "練習問題", state = 0, isPayment = false } = {}) => ([
    1,
    "0xteacher",
    title,
    "説明",
    "",
    0,
    0,
    0,
    0,
    0,
    state,
    isPayment,
]);
const mockContract = {
    get_quiz: jest.fn(),
    get_quiz_simple: jest.fn(),
    get_quiz_with_source: jest.fn(),
    create_answer: jest.fn(),
};

jest.mock("@uiw/react-md-editor", () => ({
    __esModule: true,
    default: {
        Markdown: ({ source }) => <div>{source}</div>,
    },
}));

jest.mock("../../contract/wait_Modal", () => () => null);

jest.mock("../../contract/contracts", () => ({
    Contracts_MetaMask: jest.fn(),
}));

jest.mock("../../utils/accessControl", () => ({
    useAccessControl: jest.fn(),
}));

jest.mock("../../utils/courseEnhancements", () => ({
    recordPracticeAttempt: (...args) => mockRecordPracticeAttempt(...args),
}));

jest.mock("../../utils/activityLog", () => ({
    ACTION_TYPES: {},
    appendActivityLog: jest.fn(),
    clearDraft: jest.fn(),
    getDraft: jest.fn(() => ""),
    logPageView: jest.fn(),
    saveDraft: jest.fn(),
}));

jest.mock("react-router-dom", () => {
    const actual = jest.requireActual("react-router-dom");
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

describe("Answer_quiz practice mode", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        localStorage.clear();
        Contracts_MetaMask.mockImplementation(() => mockContract);
        useAccessControl.mockReturnValue({
            isLoading: false,
            canAnswerQuiz: true,
            address: "0xpractice",
        });
        const quizData = buildQuizData();
        const simpleQuizData = buildSimpleQuizData();
        mockContract.get_quiz.mockResolvedValue(quizData);
        mockContract.get_quiz_simple.mockResolvedValue(simpleQuizData);
        mockContract.get_quiz_with_source.mockResolvedValue({
            quizData,
            simpleQuizData,
            sourceAddress: "",
        });
    });

    test("records attempts and does not reveal the correct answer text", async () => {
        render(
            <MemoryRouter initialEntries={["/answer_quiz/1?practice=1"]} future={routerFuture}>
                <Routes>
                    <Route path="/answer_quiz/:id" element={<Answer_quiz />} />
                </Routes>
            </MemoryRouter>
        );

        expect(await screen.findByText("練習問題")).toBeInTheDocument();

        fireEvent.click(screen.getByDisplayValue("B"));
        fireEvent.click(screen.getByRole("button", { name: "練習として判定" }));

        await waitFor(() => {
            expect(mockRecordPracticeAttempt).toHaveBeenCalledWith(
                expect.objectContaining({
                    quizId: "1",
                    address: "0xpractice",
                    answer: "B",
                    isCorrect: false,
                    title: "練習問題",
                })
            );
        });

        expect(screen.getByText("練習モード: まだ復習が必要です。")).toBeInTheDocument();
        expect(screen.queryByText(/正解:/)).not.toBeInTheDocument();
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    test("submits a normal answer and returns to the quiz list", async () => {
        render(
            <MemoryRouter initialEntries={["/answer_quiz/1"]} future={routerFuture}>
                <Routes>
                    <Route path="/answer_quiz/:id" element={<Answer_quiz />} />
                </Routes>
            </MemoryRouter>
        );

        expect(await screen.findByText("練習問題")).toBeInTheDocument();

        fireEvent.click(screen.getByDisplayValue("A"));
        fireEvent.click(screen.getByRole("button", { name: "回答を送信" }));

        await waitFor(() => {
            expect(mockContract.create_answer).toHaveBeenCalledWith(
                "1",
                "A",
                expect.any(Function),
                expect.any(Function),
                ""
            );
        });
        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith("/list_quiz");
        });
        expect(mockRecordPracticeAttempt).not.toHaveBeenCalled();
    });

    test("shows the registered correct answer automatically after the deadline", async () => {
        mockContract.get_quiz_with_source.mockResolvedValueOnce({
            quizData: buildQuizData({ title: "締切後問題", deadline: "1" }),
            simpleQuizData: buildSimpleQuizData({ title: "締切後問題" }),
            sourceAddress: "",
        });

        render(
            <MemoryRouter initialEntries={["/answer_quiz/1"]} future={routerFuture}>
                <Routes>
                    <Route path="/answer_quiz/:id" element={<Answer_quiz />} />
                </Routes>
            </MemoryRouter>
        );

        expect(await screen.findByText("締切後問題")).toBeInTheDocument();
        expect(await screen.findByText(/正解:/)).toBeInTheDocument();
    });
});
