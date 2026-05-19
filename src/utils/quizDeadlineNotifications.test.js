import {
    buildDueDeadlineReminders,
    getDefaultNotificationSettings,
    readDeadlineNotificationSettings,
    saveDeadlineNotificationSettings,
} from "./quizDeadlineNotifications";

describe("quizDeadlineNotifications", () => {
    const storageKeys = [
        "web3_quiz_deadline_notification_settings_v1",
        "web3_quiz_deadline_sent_v1",
    ];

    beforeEach(() => {
        storageKeys.forEach((key) => localStorage.removeItem(key));
    });

    test("stores and reads reminder settings with defaults", () => {
        saveDeadlineNotificationSettings({ enabled: true, oneHour: false });
        expect(readDeadlineNotificationSettings()).toEqual({
            ...getDefaultNotificationSettings(),
            enabled: true,
            oneHour: false,
        });
    });

    test("builds 2-hour and 1-hour reminders for unanswered quizzes only", () => {
        const nowEpoch = 1_800_000_000;
        const settings = {
            enabled: true,
            twoHours: true,
            oneHour: true,
        };
        const quizzes = [
            [0, "0x1", "未回答クイズ", "", "", nowEpoch - 600, nowEpoch + 1800, 0, 0, 0, 0, false, "0xabc"],
            [1, "0x1", "回答済みクイズ", "", "", nowEpoch - 600, nowEpoch + 1800, 0, 0, 0, 3, false, "0xabc"],
        ];

        const reminders = buildDueDeadlineReminders(quizzes, settings, nowEpoch);
        expect(reminders).toHaveLength(2);
        expect(reminders[0].title).toBe("未回答クイズ");
        expect(reminders[0].label).toBe("2時間前");
        expect(reminders[1].label).toBe("1時間前");
    });

    test("does not build reminders after deadline", () => {
        const nowEpoch = 1_800_000_000;
        const settings = {
            enabled: true,
            twoHours: true,
            oneHour: true,
        };
        const quizzes = [
            [0, "0x1", "締切済み", "", "", nowEpoch - 7200, nowEpoch - 60, 0, 0, 0, 0, false, "0xabc"],
        ];

        expect(buildDueDeadlineReminders(quizzes, settings, nowEpoch)).toHaveLength(0);
    });
});
