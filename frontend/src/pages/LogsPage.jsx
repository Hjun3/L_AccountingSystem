import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../common'
import Pager, { paginate } from '../components/Pager'

const PAGE_SIZE = 20 // 한 쪽에 보여 줄 기록 수
const ACTIONS = ['전체', '지출 수정', '지출 삭제', '증빙 첨부', '증빙 삭제', '총무 결정']

// 기록 화면: 지출 수정·삭제, 증빙 첨부·삭제, 총무 결정을 최신순으로 모아 본다.
// 관리자만 볼 수 있다. (서버에서도 /logs는 관리자만 허용)
function LogsPage() {
  const [logs, setLogs] = useState([])
  const [filter, setFilter] = useState('전체')
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    api('/logs').then(setLogs).catch((e) => setError(e.message))
  }, [])

  const shown = logs.filter((l) => filter === '전체' || l.action === filter)
  const { rows, count, current } = paginate(shown, page, PAGE_SIZE)

  return (
    <div>
      <h2>기록</h2>
      <p className="muted" style={{ fontSize: 13 }}>
        지출 수정·삭제, 증빙 첨부·삭제, 총무 결정 기록입니다. 기록은 지우거나 고칠 수 없습니다.
      </p>
      {error && <p style={{ color: 'var(--bad)' }}>{error}</p>}

      <div style={{ display: 'flex', gap: 4, margin: '12px 0', flexWrap: 'wrap' }}>
        {ACTIONS.map((a) => (
          <button key={a} onClick={() => { setFilter(a); setPage(1) }} className={a === filter ? 'active' : ''}>
            {a} ({logs.filter((l) => a === '전체' || l.action === a).length})
          </button>
        ))}
      </div>

      <div className="table-box">
      <table>
        <thead>
          <tr><th>시각</th><th>한 사람</th><th>종류</th><th>대상 지출</th><th>내용</th></tr>
        </thead>
        <tbody>
          {rows.map((l, i) => (
            <tr key={i}>
              <td className="tnum" style={{ whiteSpace: 'nowrap' }}>{l.created_at.replace('T', ' ').slice(0, 16)}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{l.actor || '-'}</td>
              <td style={{ whiteSpace: 'nowrap', color: l.action === '지출 삭제' ? 'var(--bad)' : 'inherit' }}>{l.action}</td>
              <td>
                {l.expense ? (
                  <Link to={`/expenses/${l.expense_id}`}>
                    {l.expense.date} {l.expense.event_name} {l.expense.amount.toLocaleString()}원
                  </Link>
                ) : (
                  `#${l.expense_id}`
                )}
                {l.expense?.deleted_at && <span style={{ color: 'var(--bad)' }}> (삭제됨)</span>}
              </td>
              <td>{l.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {shown.length === 0 && <p className="muted" style={{ padding: 16 }}>기록이 없습니다.</p>}
      </div>
      <Pager page={current} count={count} onChange={(p) => { setPage(p); window.scrollTo(0, 0) }} />
    </div>
  )
}

export default LogsPage
