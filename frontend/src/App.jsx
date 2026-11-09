import { useEffect, useState } from 'react'

const API_URL = 'http://localhost:8000'

// 폼의 처음 상태 (저장 후 이 값으로 되돌림)
const EMPTY_FORM = {
  date: '',
  amount: '',
  event_name: '',
  category: '',
  description: '',
  has_receipt: true,
}

function App() {
  const [form, setForm] = useState(EMPTY_FORM)
  const [expenses, setExpenses] = useState([])
  const [error, setError] = useState('')

  // 서버에서 지출 목록을 받아온다
  async function loadExpenses() {
    try {
      const res = await fetch(`${API_URL}/expenses`)
      setExpenses(await res.json())
    } catch {
      setError('서버에 연결할 수 없습니다. 백엔드가 실행 중인지 확인하세요.')
    }
  }

  // 화면이 처음 열릴 때 한 번 목록을 불러온다
  useEffect(() => {
    loadExpenses()
  }, [])

  // 입력칸 값이 바뀔 때마다 form 상태를 갱신 (체크박스는 checked 값을 사용)
  function handleChange(e) {
    const { name, value, type, checked } = e.target
    setForm({ ...form, [name]: type === 'checkbox' ? checked : value })
  }

  async function handleSubmit(e) {
    e.preventDefault() // 폼 제출 시 페이지가 새로고침되지 않게 막음
    setError('')
    try {
      const res = await fetch(`${API_URL}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: Number(form.amount) }),
      })
      if (!res.ok) {
        // AI 점검 실패(502) 등 서버가 보낸 에러 이유를 그대로 보여준다
        const data = await res.json().catch(() => ({}))
        const detail = typeof data.detail === 'string' ? data.detail : '입력값을 확인하세요.'
        setError(`저장에 실패했습니다. ${detail}`)
        return
      }
      setForm(EMPTY_FORM)
      loadExpenses()
    } catch {
      setError('서버에 연결할 수 없습니다. 백엔드가 실행 중인지 확인하세요.')
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}>
      <h1>학생회 회계 점검 동료</h1>

      <h2>지출 등록</h2>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 8, maxWidth: 400 }}>
        <label>
          지출 날짜 <input type="date" name="date" value={form.date} onChange={handleChange} required />
        </label>
        <label>
          금액(원) <input type="number" name="amount" min="0" value={form.amount} onChange={handleChange} required />
        </label>
        <label>
          사업명 <input name="event_name" placeholder="예: 개강총회" value={form.event_name} onChange={handleChange} required />
        </label>
        <label>
          지출 항목 <input name="category" placeholder="예: 식비, 물품비" value={form.category} onChange={handleChange} required />
        </label>
        <label>
          지출 내용 <input name="description" value={form.description} onChange={handleChange} required />
        </label>
        <label>
          <input type="checkbox" name="has_receipt" checked={form.has_receipt} onChange={handleChange} /> 증빙(영수증) 있음
        </label>
        <button type="submit">저장</button>
      </form>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <h2>지출 목록</h2>
      <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th>날짜</th>
            <th>사업명</th>
            <th>항목</th>
            <th>내용</th>
            <th>금액</th>
            <th>증빙</th>
            <th>총무 결정</th>
          </tr>
        </thead>
        <tbody>
          {expenses.map((exp) => (
            <tr key={exp.id}>
              <td>{exp.date}</td>
              <td>{exp.event_name}</td>
              <td>{exp.category}</td>
              <td>{exp.description}</td>
              <td>{exp.amount.toLocaleString()}원</td>
              <td>{exp.has_receipt ? '있음' : '없음'}</td>
              <td>{exp.final_status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default App
