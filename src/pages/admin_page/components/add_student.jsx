import React, { useEffect, useMemo, useState } from "react";
import { Form } from "react-bootstrap";
import { ACTION_TYPES, appendActivityLog } from "../../../utils/activityLog";

function formatInternalId(prefix, index) {
    return `${prefix}-${String(index + 1).padStart(3, "0")}`;
}

function Add_students(props) {
    const [addStudent, setAddStudent] = useState("");
    const [students, setStudents] = useState([]);
    const addStudent_list = useMemo(
        () => addStudent.split("\n").map((item) => item.trim()).filter(Boolean),
        [addStudent]
    );

    const loadStudents = async () => {
        try {
            const result = await props.cont.get_student_list();
            setStudents(Array.isArray(result) ? result : []);
        } catch (error) {
            console.error("Failed to load registered students", error);
            setStudents([]);
        }
    };

    const add_student = async () => {
        if (!addStudent_list.length) return;
        await props.cont.add_student(addStudent_list);
        appendActivityLog(ACTION_TYPES.ADMIN_ADD_STUDENT, {
            page: "admin",
            count: addStudent_list.length,
        });
        setAddStudent("");
        await loadStudents();
    };

    useEffect(() => {
        props.cont.get_student_list()
            .then((result) => {
                setStudents(Array.isArray(result) ? result : []);
            })
            .catch((error) => {
                console.error("Failed to load registered students", error);
                setStudents([]);
            });
    }, [props.cont]);

    return (
        <div>
            <h3 className="section-title">学生を追加</h3>
            <p className="section-desc">追加する学生のウォレットアドレスを改行区切りで入力してください。下側で登録済み学生も確認できます。</p>

            <Form.Group style={{ textAlign: "left", marginBottom: "var(--space-4)" }}>
                <Form.Label>ウォレットアドレス一覧</Form.Label>
                <Form.Control
                    as="textarea"
                    rows={Math.max(addStudent.split("\n").length + 3, 6)}
                    value={addStudent}
                    onChange={(event) => setAddStudent(event.target.value)}
                    placeholder={"0x1234...\n0x5678..."}
                />
            </Form.Group>

            {addStudent_list.length > 0 && (
                <div className="address-list">
                    <div className="address-list-title">追加予定アドレス ({addStudent_list.length}件)</div>
                    {addStudent_list.map((item, index) => (
                        <div key={`${item}-${index}`} className="address-item">{item}</div>
                    ))}
                </div>
            )}

            <button className="btn-action" onClick={add_student}>
                学生をコントラクトに追加
            </button>

            <div className="address-list" style={{ marginTop: "var(--space-8)" }}>
                <div className="address-list-title">登録済み学生 ({students.length}件)</div>
                {students.length === 0 ? (
                    <div className="address-item">登録済み学生はまだありません。</div>
                ) : (
                    students.map((item, index) => (
                        <div key={`${item}-${index}`} className="address-item">
                            <div className="address-item-id">{formatInternalId("USER", index)}</div>
                            <div>{item}</div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

export default Add_students;
