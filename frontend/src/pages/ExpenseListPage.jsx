import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, STATUS_COLORS } from '../common'
import DecisionCell from '../components/DecisionCell'

// 필터 버튼 목록: AI 점검 결과와 총무 결정 상태로 걸러 본다
const FILTERS = ['전체', '적합', '주의', '위반', '결정 대기']

function matchesFilter(expense, filter) {
  if (filter === '전체') return true
  if (filter === '결정 대기') return expense.final_status === '대기'
  return expense.ai_status === filter
}

// 지출 목록 페이지: 점검 결과를 보고 바로 확정/소명할 수 있다
function ExpenseListPage() {
  const [expenses, setExpenses] = useState([])
  const [filter, setFilter] = useState('전체')
  const [error, setError] = useState('')

  async function loadExpenses() {
    try {
      setExpenses(await api('/expenses'))
    } catch (e) {
      setError(e.message)
    }
  }

  // 화면이 처음 열릴 때 한 번 목록을 불러온다
  useEffect(() => {
    loadExpenses()
  }, [])

  const shown = expenses.filter((exp) => matchesFilter(exp, filter))

  return (
    <div>
      <h2>지출 목록</h2>
      <p style={{ color: 'gray' }}>
        ※ AI 점검은 참고용이며, 최종 판단은 총무가 합니다. 현재 점검 기준은 시연용 임시 규정입니다.
      </p>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} style={{ fontWeight: f === filter ? 'bold' : 'normal' }}>
            {f} ({expenses.filter((exp) => matchesFilter(exp, f)).length})
          </button>
        ))}
      </div>

      <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th>날짜</th>
            <th>사업명</th>
            <th>항목</th>
            <th>내용</th>
            <th>금액</th>
            <th>증빙</th>
            <th>AI 점검</th>
            <th>근거 조항</th>
            <th>판단 이유</th>
            <th>총무 결정</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((exp) => (
            <tr key={exp.id}>
              <td>{exp.date}</td>
              <td>{exp.event_name}</td>
              <td>{exp.category}</td>
              <td>
                <Link to={`/expenses/${exp.id}`}>{exp.description}</Link>
              </td>
              <td>{exp.amount.toLocaleString()}원</td>
              <td>{exp.has_receipt ? '있음' : '없음'}</td>
              <td style={{ color: STATUS_COLORS[exp.ai_status], fontWeight: 'bold' }}>{exp.ai_status}</td>
              <td>{exp.ai_clause}</td>
              <td>{exp.ai_reason}</td>
              <td>
                <DecisionCell expense={exp} onSaved={loadExpenses} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default ExpenseListPage
