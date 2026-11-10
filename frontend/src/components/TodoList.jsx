import { useState } from 'react'
import { api } from '../common'

// AI가 알려 준 "챙길 것" 체크리스트. 체크하면 바로 저장된다.
// showDone=false 이면 끝낸 항목은 숨긴다 (대시보드용)
function TodoList({ expense, onChanged, showDone = true }) {
  const [error, setError] = useState('')

  async function toggle(index, done) {
    setError('')
    try {
      await api(`/expenses/${expense.id}/todos/${index}`, { method: 'PATCH', body: JSON.stringify({ done }) })
      onChanged()
    } catch (e) {
      setError(e.message)
    }
  }

  const items = expense.ai_todos.map((todo, index) => ({ ...todo, index }))
  const shown = showDone ? items : items.filter((t) => !t.done)
  if (shown.length === 0) return null

  return (
    <div>
      {shown.map((t) => (
        <label key={t.index} style={{ display: 'block', textDecoration: t.done ? 'line-through' : 'none', color: t.done ? 'gray' : 'inherit' }}>
          <input type="checkbox" checked={t.done} onChange={(e) => toggle(t.index, e.target.checked)} /> {t.text}
        </label>
      ))}
      {error && <span style={{ color: 'red' }}>{error}</span>}
    </div>
  )
}

export default TodoList
