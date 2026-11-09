import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, STATUS_COLORS } from '../common'
import DecisionCell from '../components/DecisionCell'

// 지출 상세 페이지: 지출 1건의 정보, AI 점검 내용, 총무 결정과 이력을 크게 보여준다
function ExpenseDetailPage() {
  const { id } = useParams() // 주소 /expenses/3 에서 3을 꺼냄
  const [expense, setExpense] = useState(null)
  const [error, setError] = useState('')

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

  if (error) return <p style={{ color: 'red' }}>{error}</p>
  if (!expense) return <p>불러오는 중...</p>

  return (
    <div>
      <p>
        <Link to="/expenses">← 지출 목록으로</Link>
      </p>
      <h2>지출 상세</h2>

      <h3>지출 정보</h3>
      <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse' }}>
        <tbody>
          <tr><th>날짜</th><td>{expense.date}</td></tr>
          <tr><th>사업명</th><td>{expense.event_name}</td></tr>
          <tr><th>지출 항목</th><td>{expense.category}</td></tr>
          <tr><th>지출 내용</th><td>{expense.description}</td></tr>
          <tr><th>금액</th><td>{expense.amount.toLocaleString()}원</td></tr>
          <tr><th>증빙</th><td>{expense.has_receipt ? '있음' : '없음'}</td></tr>
          <tr><th>등록 시각</th><td>{expense.created_at.replace('T', ' ')}</td></tr>
        </tbody>
      </table>

      <h3>AI 점검 (참고용)</h3>
      <p style={{ fontSize: 20, fontWeight: 'bold', color: STATUS_COLORS[expense.ai_status] }}>{expense.ai_status}</p>
      <p>
        <b>근거 조항:</b> {expense.ai_clause} (<Link to="/regulation">규정 보기</Link>)
      </p>
      <p>
        <b>판단 이유:</b> {expense.ai_reason}
      </p>

      <h3>총무 결정</h3>
      {/* key를 주어 다른 지출로 이동하면 결정 칸의 입력 상태를 새로 시작한다 */}
      <div style={{ maxWidth: 400 }}>
        <DecisionCell key={expense.id} expense={expense} onSaved={loadExpense} />
      </div>
    </div>
  )
}

export default ExpenseDetailPage
