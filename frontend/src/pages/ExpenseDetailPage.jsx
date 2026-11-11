import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, canEdit, useUser } from '../common'
import DecisionCell from '../components/DecisionCell'
import MemoAndFiles from '../components/MemoAndFiles'
import SuggestInput from '../components/SuggestInput'
import StatusBadge from '../components/StatusBadge'
import TodoList from '../components/TodoList'

// 지출 정보 수정 폼. 저장하면 바뀐 칸이 '기록' 화면에 남는다. (AI 점검은 다시 하지 않음)
function ExpenseEditForm({ expense, onSaved, onCancel }) {
  const [form, setForm] = useState({
    date: expense.date,
    amount: expense.amount,
    event_name: expense.event_name,
    category: expense.category,
    description: expense.description,
    has_receipt: expense.has_receipt,
  })
  const [error, setError] = useState('')
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  async function save(e) {
    e.preventDefault()
    setError('')
    try {
      await api(`/expenses/${expense.id}`, { method: 'PUT', body: JSON.stringify({ ...form, amount: Number(form.amount) }) })
      onSaved()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <form onSubmit={save} style={{ display: 'grid', gap: 6, maxWidth: 400 }}>
      <label>날짜 <input type="date" value={form.date} onChange={set('date')} required /></label>
      <label>금액(원) <input type="number" min="0" value={form.amount} onChange={set('amount')} required /></label>
      <label>사업명 <SuggestInput list="event-names" value={form.event_name} onChange={set('event_name')} required /></label>
      <label>지출 항목 <SuggestInput list="categories" value={form.category} onChange={set('category')} required /></label>
      <label>지출 내용 <input value={form.description} onChange={set('description')} required /></label>
      <label><input type="checkbox" checked={form.has_receipt} onChange={set('has_receipt')} /> 증빙(영수증) 있음</label>
      <div>
        <button type="submit">수정 저장</button> <button type="button" onClick={onCancel}>취소</button>
      </div>
      <span style={{ fontSize: 12, color: 'gray' }}>수정 내용은 '기록' 화면에 남습니다. AI 점검은 다시 하지 않습니다.</span>
      {error && <span style={{ color: 'red' }}>{error}</span>}
    </form>
  )
}

// 지출 상세 페이지: 지출 1건의 정보, AI 점검 내용, 총무 결정과 이력을 크게 보여준다
function ExpenseDetailPage() {
  const { id } = useParams() // 주소 /expenses/3 에서 3을 꺼냄
  const [expense, setExpense] = useState(null)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const user = useUser()

  async function loadExpense() {
    try {
      setExpense(await api(`/expenses/${id}`))
    } catch (e) {
      setError(e.message)
    }
  }

  useEffect(() => {
    loadExpense()
  }, [id])

  // 삭제: 실제로 지우지 않고 '삭제됨' 표시만 한다. 사유는 기록에 남는다.
  async function remove() {
    const reason = window.prompt('이 지출을 삭제할까요? 삭제 사유를 적어 주세요. (예: 중복 등록)')
    if (reason === null) return // 취소를 누른 경우
    try {
      await api(`/expenses/${expense.id}`, { method: 'DELETE', body: JSON.stringify({ reason }) })
      navigate('/expenses')
    } catch (e) {
      setError(e.message)
    }
  }

  if (error) return <p style={{ color: 'red' }}>{error}</p>
  if (!expense) return <p>불러오는 중...</p>

  const deleted = Boolean(expense.deleted_at)

  return (
    <div>
      <p>
        <Link to="/expenses">← 지출 목록으로</Link>
      </p>
      <h2>지출 상세</h2>
      {deleted && (
        <p style={{ background: '#fee', padding: 8 }}>
          삭제된 지출입니다 ({expense.deleted_at.replace('T', ' ')}). 목록·예산·결산에서 빠지며, 바꿀 수 없습니다. 사유는 <Link to="/logs">기록</Link>에서 볼 수 있습니다.
        </p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16, alignItems: 'start' }}>
      <div className="card">
      <h3 style={{ marginTop: 0 }}>지출 정보</h3>
      {editing ? (
        <ExpenseEditForm
          expense={expense}
          onSaved={() => {
            setEditing(false)
            loadExpense()
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <table style={{ width: '100%' }}>
            <tbody>
              <tr><th>날짜</th><td>{expense.date}</td></tr>
              <tr><th>사업명</th><td>{expense.event_name}</td></tr>
              <tr><th>지출 항목</th><td>{expense.category}</td></tr>
              <tr><th>지출 내용</th><td>{expense.description}</td></tr>
              <tr><th>금액</th><td>{expense.amount.toLocaleString()}원</td></tr>
              <tr><th>증빙</th><td>{expense.has_receipt ? '있음' : '없음'}</td></tr>
              <tr><th>등록 시각</th><td>{expense.created_at.replace('T', ' ')}</td></tr>
              {expense.updated_at && <tr><th>수정 시각</th><td>{expense.updated_at.replace('T', ' ')}</td></tr>}
              <tr><th>서류 만들기</th><td>
                <Link to={`/expenses/${expense.id}/forms/sapil`}>사필영수증</Link> ·{' '}
                <Link to={`/expenses/${expense.id}/forms/doan`}>도안 출장 요청서</Link>
              </td></tr>
            </tbody>
          </table>
          {!deleted && canEdit(user) && (
            <p style={{ marginBottom: 0 }}>
              <button onClick={() => setEditing(true)}>수정</button> <button onClick={remove}>삭제</button>
            </p>
          )}
        </>
      )}
      </div>

      <div>
      <div className="card">
      <h3 style={{ marginTop: 0 }}>AI 점검 (참고용)</h3>
      {expense.updated_at && (
        <p style={{ fontSize: 12, color: 'darkorange' }}>※ 등록 후 지출 정보가 수정되었습니다. 아래 점검 결과는 수정 전 내용 기준입니다.</p>
      )}
      <p style={{ fontSize: 18 }}><StatusBadge status={expense.ai_status} /></p>
      <p>
        <b>근거 조항:</b> {expense.ai_clause} (<Link to="/regulation">규정 보기</Link>)
      </p>
      <p>
        <b>판단 이유:</b> {expense.ai_reason}
      </p>
      {expense.ai_todos.length > 0 && (
        <>
          <b>챙길 것</b>
          <TodoList expense={expense} onChanged={loadExpense} />
        </>
      )}
      </div>

      {!deleted && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>총무 결정</h3>
          {/* key를 주어 다른 지출로 이동하면 결정 칸의 입력 상태를 새로 시작한다 */}
          <DecisionCell key={expense.id} expense={expense} onSaved={loadExpense} />
        </div>
      )}
      </div>
      </div>

      {!deleted && (
        <div className="card">
          <MemoAndFiles key={'m' + expense.id} expense={expense} onChanged={loadExpense} />
        </div>
      )}
    </div>
  )
}

export default ExpenseDetailPage
