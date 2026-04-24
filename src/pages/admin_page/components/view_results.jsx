import React, { useState, useEffect } from "react";
import { CSVLink } from "react-csv";
import { Contracts_MetaMask } from "../../../contract/contracts";
import { ACTION_TYPES, appendActivityLog, getActivityLogs } from "../../../utils/activityLog";
import { buildExtendedCsvData, getCourseEnhancementSnapshot } from "../../../utils/courseEnhancements";
import { convertTftToPoint, normalizeTftAmount } from "../../../utils/quizRewardRate";

function getCurrentDateTime() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

function Create_csvlink(props) {
    return (
        <div className="csv-download-area">
            <CSVLink filename={`students_data_${getCurrentDateTime()}.csv`} data={props.cont[0]}>
                📥 学生の成績データをダウンロード
            </CSVLink>
            <CSVLink filename={`quizs_data_${getCurrentDateTime()}.csv`} data={props.cont[1]}>
                📥 小テストの統計データをダウンロード
            </CSVLink>
            <CSVLink filename={`lecture_summary_${getCurrentDateTime()}.csv`} data={props.cont[2]}>
                📥 出席・反応を含む集計CSVをダウンロード
            </CSVLink>
            <CSVLink filename={`reaction_history_${getCurrentDateTime()}.csv`} data={props.cont[3]}>
                📥 理解度リアクションCSVをダウンロード
            </CSVLink>
        </div>
    );
}

function View_result(props) {
    let contract = new Contracts_MetaMask();
    const [results, setResults] = useState([]);
    const [data_for_survey_users, setData_for_survey_users] = useState(null);
    const [data_for_survey_quizs, setData_for_survey_quizs] = useState(null);
    const [usersData, setUsersData] = useState(null);
    const [quizsData, setQuizsData] = useState(null);
    const [extendedGradeData, setExtendedGradeData] = useState(null);
    const [reactionCsvData, setReactionCsvData] = useState(null);
    const [csvdownloader, setCsvdownloader] = useState(false);

    const handle_export_csv = () => {
        if (!Array.isArray(data_for_survey_users) || !data_for_survey_users.length || !Array.isArray(data_for_survey_quizs) || !data_for_survey_quizs.length) {
            return;
        }
        const users_data = [
            Object.keys(data_for_survey_users[0])
        ];
        for (let i = 0; i < data_for_survey_users.length; i++) {
            users_data.push([
                data_for_survey_users[i].user, 
                Number(data_for_survey_users[i].create_quiz_count).toString(), 
                normalizeTftAmount(data_for_survey_users[i].result).toString(), 
                Number(data_for_survey_users[i].answer_count).toString()
            ]);
        }

        const quizs_data = [
            Object.keys(data_for_survey_quizs[0])
        ];
        for (let i = 0; i < data_for_survey_quizs.length; i++) {
            quizs_data.push([
                (Number(data_for_survey_quizs[i].reward) / (10 ** 18)).toString(), 
                Number(data_for_survey_quizs[i].respondent_count).toString()
            ]);
        }

        const snapshot = getCourseEnhancementSnapshot();
        const extended = buildExtendedCsvData({
            results,
            logs: getActivityLogs(),
            boardLogs: snapshot.boardLogs,
            reactionHistory: snapshot.reactionHistory,
        });

        setUsersData(users_data);
        setQuizsData(quizs_data);
        setExtendedGradeData(extended.gradeRows);
        setReactionCsvData(extended.reactionRows);
        setCsvdownloader(true);
        appendActivityLog(ACTION_TYPES.EXPORT_GRADES, {
            page: "admin",
            studentRows: users_data.length - 1,
            quizRows: quizs_data.length - 1,
        });
    };

    async function get_data_for_survey() {
        setData_for_survey_users(await contract.get_data_for_survey_users());
        setData_for_survey_quizs(await contract.get_data_for_survey_quizs());
    }

    useEffect(() => {
        get_data_for_survey();
        props.cont.get_results().then((result) => {
            console.log(result);
            setResults(result);
        });
    }, []);

    return (
        <div>
            <h3 className="section-title">📊 生徒の成績</h3>
            <p className="section-desc">スマートコントラクト上の成績データを閲覧・エクスポートできます</p>

            <div className="row">
                <button className="btn-action" onClick={() => handle_export_csv()}>
                    📤 成績データのCSVファイルを出力
                </button>
                {csvdownloader === true && <Create_csvlink cont={[usersData, quizsData, extendedGradeData, reactionCsvData]} />}
            </div>

            <div className="results-table-wrap">
                <table className="results-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>ウォレットアドレス</th>
                            <th>得点</th>
                        </tr>
                    </thead>
                    <tbody>
                        {results.map((item, index) => (
                            <tr key={index}>
                                <td>{index + 1}</td>
                                <td className="address-cell">{item.student}</td>
                                <td className="score-cell">{convertTftToPoint(Number(item.result || 0)).toFixed(1)}点</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default View_result;
