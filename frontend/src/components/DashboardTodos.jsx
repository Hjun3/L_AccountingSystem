import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, STATUS_COLORS, STATUS_LABELS } from '../common'

const UNDO_SECONDS = 5 // 체크한 뒤 되돌릴 수 있는 시간
const ORDER = { 위반: 0, 주의: 1, 적합: 2 } // 조치 필요 → 확인 필요 → 문제 없음 순

// 대시보드의 '챙길 것': 지출별로 묶지 않고 할 일 하나를 한 줄씩 보여 준다.
// 체크하면 바로 저장되고, 5초 동안 줄이 그어진 채 [되돌리기]를 보여 준 뒤 사라진다 (잘못 눌렀을 때 대비).
function DashboardTodos({ expenses, onChanged }) {
  const [justDone, setJustDone] = useState([]) // 방금 체크해서 아직 보여 주는 할 일 (예: '12-0' = 12번 지출의 0번째)
  const [error, setError] = useState('')
  const timers = useRef({})

  // 화면을 떠나면 남은 타이머를 정리한다
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), [])

  const save = (item, done) =>
    api(`/expenses/${item.expense.id}/todos/${item.index}`, { method: 'PATCH', body: JSON.stringify({ done }) })

  async function check(item) {
    setError('')
    setJustDone((list) => [...list, item.key]) // 누르는 즉시 줄을 긋는다
    try {
      await save(item, true)
      timers.current[item.key] = setTimeout(() => {
        delete timers.current[item.key]
        setJustDone((list) => list.filter((k) => k !== item.key))
        onChanged()
      }, UNDO_SECONDS * 1000)
    } catch (e) {
      setJustDone((list) => list.filter((k) => k !== item.key)) // 저장 실패: 원래대로
      setError(e.message)
    }
  }

  async function undo(item) {
    setError('')
    clearTimeout(timers.current[item.key])
    delete timers.current[item.key]
    try {
      await save(item, false)
      setJustDone((list) => list.filter((k) => k !== item.key))
    } catch (e) {
      setError(e.message)
    }
  }

  // 모든 지출의 할 일을 한 줄씩 펼친다 (끝낸 것은 빼되, 방금 체크한 것은 잠깐 남긴다)
  const items = expenses
    .flatMap((expense) => expense.ai_todos.map((todo, index) => ({ ...todo, index, expense, key: `${expense.id}-${index}` })))
    .filter((t) => !t.done || justDone.includes(t.key))
    .sort((a, b) => (ORDER[a.expense.ai_status] ?? 3) - (ORDER[b.expense.ai_status] ?? 3) || a.expense.date.localeCompare(b.expense.date))

  if (items.length === 0) return <p className="muted" style={{ padding: '12px 0' }}>남은 할 일이 없습니다.</p>

  return (
    <div>
      {items.map((t, i) => {
        const pending = justDone.includes(t.key)
        const exp = t.expense
        return (
          <div key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: i ? '1px solid var(--line)' : 'none' }}>
            <input type="checkbox" checked={pending} disabled={pending} onChange={() => check(t)} aria-label={t.text} />
            <span style={{ whiteSpace: 'nowrap', textDecoration: pending ? 'line-through' : 'none', color: pending ? 'gray' : 'inherit' }}>{t.text}</span>
            {/* 어느 지출의 할 일인지: 점 색이 점검 결과 */}
            <Link to={`/expenses/${exp.id}`} title={`${STATUS_LABELS[exp.ai_status]} · ${exp.event_name} · ${exp.description}`}
              style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: 'var(--sub)' }}>
              <span style={{ color: STATUS_COLORS[exp.ai_status] }}>●</span> {exp.event_name} · {exp.description}
            </Link>
            {pending ? (
              <button onClick={() => undo(t)} style={{ fontSize: 12, padding: '0 8px' }}>되돌리기</button>
            ) : (
              <span className="tnum muted" style={{ whiteSpace: 'nowrap' }}>{exp.amount.toLocaleString()}원</span>
            )}
          </div>
        )
      })}
      {error && <p style={{ color: 'var(--bad)' }}>{error}</p>}
    </div>
  )
}

export default DashboardTodos
