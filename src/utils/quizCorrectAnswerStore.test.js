import { getRegisteredCorrectAnswer, setRegisteredCorrectAnswer } from "./quizCorrectAnswerStore";

describe("quizCorrectAnswerStore", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    test("stores and reads registered correct answers by quiz id", () => {
        setRegisteredCorrectAnswer(3, "42");

        expect(getRegisteredCorrectAnswer(3)).toBe("42");
        expect(getRegisteredCorrectAnswer("3")).toBe("42");
        expect(getRegisteredCorrectAnswer(99)).toBe("");
    });
});
