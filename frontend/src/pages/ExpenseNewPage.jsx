import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../common'

// 폼의 처음 상태
const EMPTY_FORM = {
  date: '',
  amount: '',
  event_name: '',
  category: '',
  description: '',
  has_receipt: true,
}

// 지출 등록 페이지: 저장하면 AI 점검을 거친 뒤 그 지출의 상세 페이지로 이동한다
function ExpenseNewPage() {
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false) // AI 점검 중에는 저장 버튼을 막아 중복 저장을 방지
  const navigate = useNavigate()

  // 입력칸 값이 바뀔 때마다 form 상태를 갱신 (체크박스는 checked 값을 사용)
  function handleChange(e) {
    const { name, value, type, checked } = e.target
    setForm({ ...form, [name]: type === 'checkbox' ? checked : value })
  }

  async function handleSubmit(e) {
    e.preventDefault() // 폼 제출 시 페이지가 새로고침되지 않게 막음
    setError('')
    setSaving(true)
    try {
      const saved = await api('/expenses', {
        method: 'POST',
        body: JSON.stringify({ ...form, amount: Number(form.amount) }),
      })
      navigate(`/expenses/${saved.id}`)
    } catch (e) {
      setError(`저장에 실패했습니다. ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
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
          지출 항목 <input name="category" placeholder="예: 수용비, 급량비" value={form.category} onChange={handleChange} required />
        </label>
        <label>
          지출 내용 <input name="description" value={form.description} onChange={handleChange} required />
        </label>
        <label>
          <input type="checkbox" name="has_receipt" checked={form.has_receipt} onChange={handleChange} /> 증빙(영수증) 있음
        </label>
        <button type="submit" disabled={saving}>
          {saving ? 'AI 점검 중...' : '저장'}
        </button>
      </form>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  )
}

export default ExpenseNewPage
