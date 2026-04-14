const QUIZ_RATE_OPTIONS = [
    { id: "light", point: 0.3, reward: 15, label: "0.3点 / 15TFT" },
    { id: "middle", point: 0.6, reward: 30, label: "0.6点 / 30TFT" },
    { id: "heavy", point: 1.2, reward: 60, label: "1.2点 / 60TFT" },
];

const TFT_PER_POINT = 50;
const MAX_TFT_PER_LECTURE = 150;
const MAX_TFT_TOTAL = 750;
const TOTAL_LECTURE_COUNT = 5;

function convertTftToPoint(tftAmount) {
    return Number(tftAmount || 0) / TFT_PER_POINT;
}

export {
    QUIZ_RATE_OPTIONS,
    TFT_PER_POINT,
    MAX_TFT_PER_LECTURE,
    MAX_TFT_TOTAL,
    TOTAL_LECTURE_COUNT,
    convertTftToPoint,
};
