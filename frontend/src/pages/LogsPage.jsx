import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../common'

const ACTIONS = ['전체', '지출 수정', '지출 삭제', '증빙 첨부', '증빙 삭제', '총무 결정']

// 기록 화면: 지출 수정·삭제, 증빙 첨부·삭제, 총무 결정을 최신순으로 모아 본다.
// 관리자(감사·인수인계 담당)가 확인하는 용도. 지금은 로그인이 없어서 누구나 볼 수 있다.
function LogsPage() {
  const [logs, setLogs] = useState([])
  const [filter, setFilter] = useState('전체')
  const [error, setError] = useState('')

  useEffect(() => {
    api('/logs').then(setLogs).catch((e) => setError(e.message))
  }, [])

  const shown = logs.filter((l) => filter === '전체' || l.action === filter)

  return (
    <div>
      <h2>기록</h2>
      <p style={{ fontSize: 13, color: 'gray' }}>
        지출 수정·삭제, 증빙 첨부·삭제, 총무 결정 기록입니다. 기록은 지우거나 고칠 수 없습니다.
      </p>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
        {ACTIONS.map((a) => (
          <button key={a} onClick={() => setFilter(a)} style={{ fontWeight: a === filter ? 'bold' : 'normal' }}>
            {a} ({logs.filter((l) => a === '전체' || l.action === a).length})
          </button>
        ))}
      </div>

      <table border="1" cellPadding="4" style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>
        <thead>
          <tr><th>시각</th><th>종류</th><th>대상 지출</th><th>내용</th></tr>
        </thead>
        <tbody>
          {shown.map((l, i) => (
            <tr key={i}>
              <td style={{ whiteSpace: 'nowrap' }}>{l.created_at.replace('T', ' ')}</td>
              <td style={{ whiteSpace: 'nowrap', color: l.action === '지출 삭제' ? 'red' : 'inherit' }}>{l.action}</td>
              <td>
                {l.expense ? (
                  <Link to={`/expenses/${l.expense_id}`}>
                    {l.expense.date} {l.expense.event_name} {l.expense.amount.toLocaleString()}원
                  </Link>
                ) : (
                  `#${l.expense_id}`
                )}
                {l.expense?.deleted_at && <span style={{ color: 'red' }}> (삭제됨)</span>}
              </td>
              <td>{l.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {shown.length === 0 && <p style={{ color: 'gray' }}>기록이 없습니다.</p>}
    </div>
  )
}

export default LogsPage
