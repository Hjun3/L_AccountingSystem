import { useState } from 'react'
import { api } from '../common'

// 지출 한 건에 대한 총무 결정 칸 (목록 페이지와 상세 페이지에서 같이 사용)
// 대기 상태면 확정/소명 입력을 보여주고, 결정된 뒤에는 결과와 '취소' 버튼을 보여준다
// 아래에는 결정 이력(확정/소명/취소 기록)을 항상 보여준다
// compact: 목록용 간단 모드. 소명 입력칸은 '소명' 버튼을 눌렀을 때만 열고, 이력은 숨긴다.
function DecisionCell({ expense, onSaved, compact = false }) {
  const [editing, setEditing] = useState(expense.final_status === '대기')
  const [writing, setWriting] = useState(!compact) // 소명 입력칸을 보여 줄지
  const [explanation, setExplanation] = useState(expense.explanation || '')
  const [error, setError] = useState('')

  async function save(finalStatus) {
    setError('')
    try {
      await api(`/expenses/${expense.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ final_status: finalStatus, explanation }),
      })
      setEditing(finalStatus === '대기') // 취소하면 다시 입력 상태로
      if (compact) setWriting(false)
      onSaved()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 4 }}>
      {editing ? (
        <>
          {!compact && <div>현재: {expense.final_status}</div>}
          {writing ? (
            <>
              <textarea placeholder="소명 내용" rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} />
              <div style={{ display: 'flex', gap: 4 }}>
                {!compact && <button onClick={() => save('확정')}>확정</button>}
                <button onClick={() => save('소명')}>소명 저장</button>
                {compact && <button onClick={() => setWriting(false)}>닫기</button>}
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => save('확정')}>확정</button>
              <button onClick={() => setWriting(true)}>소명</button>
            </div>
          )}
        </>
      ) : (
        <>
          <b>{expense.final_status}</b>
          {expense.explanation && <div style={{ fontSize: 13 }}>소명: {expense.explanation}</div>}
          <button onClick={() => save('대기')} style={{ justifySelf: 'start' }}>취소</button>
        </>
      )}
      {error && <span style={{ color: 'red', fontSize: 12 }}>{error}</span>}
      {!compact && <DecisionLogs logs={expense.logs} />}
    </div>
  )
}

// 결정 이력 목록 (예: 2026-11-09 10:12 대기 → 소명 (소명 내용))
function DecisionLogs({ logs }) {
  if (!logs || logs.length === 0) return null
  return (
    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: 'gray' }}>
      {logs.map((log, i) => (
        <li key={i}>
          {log.created_at.replace('T', ' ').slice(0, 16)} {log.from_status} →{' '}
          {log.to_status === '대기' ? '취소' : log.to_status}
          {log.explanation && ` (${log.explanation})`}
          {log.actor && ` - ${log.actor}`}
        </li>
      ))}
    </ul>
  )
}

export default DecisionCell
