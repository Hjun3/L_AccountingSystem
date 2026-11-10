import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, STATUS_COLORS } from '../common'

const ORDER = { 위반: 0, 주의: 1, 적합: 2 } // 조치 필요 → 확인 필요 → 문제 없음 순

// 대시보드의 '챙길 것': 지출별로 묶지 않고 할 일 하나를 한 줄씩 보여 준다.
// 체크는 '선택'만 하고, 아래 [확정]을 눌러야 저장되어 사라진다. [취소]는 체크를 모두 푼다 (잘못 눌렀을 때 대비).
// 높이를 정할 수 있게 목록(스크롤 영역)과 버튼 줄을 나눠서 그린다.
function DashboardTodos({ expenses, onChanged }) {
  const [selected, setSelected] = useState([]) // 체크한 할 일 (예: '12-0' = 12번 지출의 0번째)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // 모든 지출의 끝내지 않은 할 일을 한 줄씩 펼친다
  const items = expenses
    .flatMap((expense) => expense.ai_todos.map((todo, index) => ({ ...todo, index, expense, key: `${expense.id}-${index}` })))
    .filter((t) => !t.done)
    .sort((a, b) => (ORDER[a.expense.ai_status] ?? 3) - (ORDER[b.expense.ai_status] ?? 3) || a.expense.date.localeCompare(b.expense.date))

  const toggle = (key) => setSelected((list) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]))

  async function finish() {
    setError('')
    setSaving(true)
    try {
      for (const t of items.filter((t) => selected.includes(t.key))) {
        await api(`/expenses/${t.expense.id}/todos/${t.index}`, { method: 'PATCH', body: JSON.stringify({ done: true }) })
      }
      setSelected([])
      onChanged()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 20px' }}>
        {items.length === 0 && <p className="muted" style={{ padding: '12px 0' }}>남은 할 일이 없습니다.</p>}
        {items.map((t, i) => {
          const exp = t.expense
          const on = selected.includes(t.key)
          return (
            <label key={t.key} style={{ display: 'flex', gap: 12, padding: '12px 0', borderTop: i ? '1px solid var(--line)' : 'none', cursor: 'pointer' }}>
              <input type="checkbox" checked={on} onChange={() => toggle(t.key)} style={{ marginTop: 3 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* 1줄: 할 일 */}
                <div style={{ fontWeight: 500, color: on ? 'var(--sub)' : 'var(--text)', textDecoration: on ? 'line-through' : 'none' }}>{t.text}</div>
                {/* 2줄: 어느 지출의 할 일인지 (점 색 = 점검 결과) */}
                <div style={{ display: 'flex', gap: 8, marginTop: 3, fontSize: 12, color: 'var(--sub)' }}>
                  <Link to={`/expenses/${exp.id}`} title={`${exp.event_name} · ${exp.description}`} onClick={(e) => e.stopPropagation()}
                    style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'inherit' }}>
                    <span style={{ color: STATUS_COLORS[exp.ai_status] }}>●</span> {exp.event_name} · {exp.description}
                  </Link>
                  <span className="tnum" style={{ whiteSpace: 'nowrap' }}>{exp.amount.toLocaleString()}원</span>
                </div>
              </div>
            </label>
          )
        })}
      </div>
      {/* 버튼 줄: 선택한 것이 있을 때만 누를 수 있다 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, padding: '10px 20px', borderTop: '1px solid var(--line)' }}>
        {error && <span style={{ color: 'var(--bad)', fontSize: 12, marginRight: 'auto' }}>{error}</span>}
        <span className="muted" style={{ marginRight: 4 }}>{selected.length ? `${selected.length}개 선택` : '끝낸 일을 체크하세요'}</span>
        <button onClick={() => setSelected([])} disabled={!selected.length || saving}>취소</button>
        <button type="submit" onClick={finish} disabled={!selected.length || saving}>{saving ? '저장 중...' : '확정'}</button>
      </div>
    </div>
  )
}

export default DashboardTodos
