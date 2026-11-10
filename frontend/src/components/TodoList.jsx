import { useEffect, useRef, useState } from 'react'
import { api } from '../common'

const UNDO_SECONDS = 5 // 대시보드에서 체크한 뒤 되돌릴 수 있는 시간

// AI가 알려 준 "챙길 것" 체크리스트. 체크하면 바로 저장된다.
// showDone=false 이면 끝낸 항목은 숨긴다 (대시보드용).
//   이때 체크한 항목은 바로 사라지지 않고 5초 동안 줄이 그어진 채 [되돌리기]를 보여 준다 (잘못 눌렀을 때 대비).
function TodoList({ expense, onChanged, showDone = true }) {
  const [error, setError] = useState('')
  const [justDone, setJustDone] = useState([]) // 방금 체크해서 아직 보여 주는 항목 번호들
  const timers = useRef({})

  // 화면을 떠나면 남은 타이머를 정리한다
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), [])

  async function save(index, done) {
    await api(`/expenses/${expense.id}/todos/${index}`, { method: 'PATCH', body: JSON.stringify({ done }) })
  }

  async function toggle(index, done) {
    setError('')
    // 대시보드: 누르는 즉시 줄을 긋고, 잠깐 남겨 두었다가 목록을 새로 불러와 사라지게 한다
    if (!showDone) setJustDone((list) => [...list, index])
    try {
      await save(index, done)
      if (showDone) return onChanged()
      timers.current[index] = setTimeout(() => {
        delete timers.current[index]
        setJustDone((list) => list.filter((i) => i !== index))
        onChanged()
      }, UNDO_SECONDS * 1000)
    } catch (e) {
      setJustDone((list) => list.filter((i) => i !== index)) // 저장 실패: 원래대로
      setError(e.message)
    }
  }

  async function undo(index) {
    setError('')
    clearTimeout(timers.current[index])
    delete timers.current[index]
    try {
      await save(index, false)
      setJustDone((list) => list.filter((i) => i !== index))
    } catch (e) {
      setError(e.message)
    }
  }

  const items = expense.ai_todos.map((todo, index) => ({ ...todo, index }))
  const shown = showDone ? items : items.filter((t) => !t.done || justDone.includes(t.index))
  if (shown.length === 0) return null

  return (
    <div>
      {shown.map((t) => {
        const done = t.done || justDone.includes(t.index)
        return (
          <div key={t.index} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ textDecoration: done ? 'line-through' : 'none', color: done ? 'gray' : 'inherit' }}>
              <input type="checkbox" checked={done} disabled={justDone.includes(t.index)} onChange={(e) => toggle(t.index, e.target.checked)} /> {t.text}
            </label>
            {justDone.includes(t.index) && (
              <button onClick={() => undo(t.index)} style={{ fontSize: 12, padding: '0 8px' }}>되돌리기</button>
            )}
          </div>
        )
      })}
      {error && <span style={{ color: 'red' }}>{error}</span>}
    </div>
  )
}

export default TodoList
