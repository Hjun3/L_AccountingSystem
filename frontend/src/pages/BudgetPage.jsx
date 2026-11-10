import { useEffect, useState } from 'react'
import { api, API_URL } from '../common'
import NameSuggestions from '../components/NameSuggestions'

const won = (n) => `${n.toLocaleString()}원`

// 예산 1줄: 금액·메모를 고치거나 삭제할 수 있다
function BudgetRow({ budget, onChanged, setError }) {
  const [amount, setAmount] = useState(budget.amount)
  const changed = Number(amount) !== budget.amount
  const rate = budget.amount > 0 ? Math.round((budget.spent / budget.amount) * 100) : null
  const over = budget.remaining < 0

  async function save() {
    try {
      onChanged(await api(`/budgets/${budget.id}`, { method: 'PATCH', body: JSON.stringify({ amount: Number(amount), memo: budget.memo || '' }) }))
    } catch (e) {
      setError(e.message)
    }
  }

  async function remove() {
    if (!window.confirm(`'${budget.event_name} - ${budget.category}' 예산을 삭제할까요?`)) return
    try {
      onChanged(await api(`/budgets/${budget.id}`, { method: 'DELETE' }))
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <tr>
      <td>{budget.category}</td>
      <td>
        <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 100 }} />
        {changed && <button onClick={save}>저장</button>}
      </td>
      <td style={{ textAlign: 'right' }}>{won(budget.spent)}</td>
      <td style={{ textAlign: 'right', color: over ? 'red' : 'inherit', fontWeight: over ? 'bold' : 'normal' }}>
        {won(budget.remaining)}
      </td>
      <td>
        {/* 집행률 막대: 100%를 넘으면 빨간색 */}
        <div style={{ width: 100, height: 10, background: '#eee', display: 'inline-block', marginRight: 4 }}>
          <div style={{ width: `${Math.min(rate ?? 0, 100)}%`, height: '100%', background: over ? 'red' : 'steelblue' }} />
        </div>
        {rate === null ? '-' : `${rate}%`}
      </td>
      <td><button onClick={remove} style={{ fontSize: 11 }}>삭제</button></td>
    </tr>
  )
}

// 예산 페이지: 사업·비목별 예산을 등록하고, 예산 대비 지출과 남은 금액을 본다
function BudgetPage() {
  const [data, setData] = useState(null)
  const [form, setForm] = useState({ event_name: '', category: '', amount: '' })
  const [error, setError] = useState('')
  const [period, setPeriod] = useState({ start: '', end: '' }) // 결산 기간 (비우면 전체)

  useEffect(() => {
    api('/budgets').then(setData).catch((e) => setError(e.message))
  }, [])

  async function addBudget(e) {
    e.preventDefault()
    setError('')
    try {
      setData(await api('/budgets', { method: 'POST', body: JSON.stringify({ ...form, amount: Number(form.amount) }) }))
      setForm({ ...form, category: '', amount: '' }) // 같은 사업의 다른 비목을 이어서 넣기 쉽게 사업명은 남긴다
    } catch (e) {
      setError(e.message)
    }
  }

  if (!data) return error ? <p style={{ color: 'red' }}>{error}</p> : <p>불러오는 중...</p>

  // 예산 줄을 사업명별로 묶는다
  const groups = {}
  for (const b of data.budgets) (groups[b.event_name] ||= []).push(b)
  const sum = (list, key) => list.reduce((s, b) => s + b[key], 0)
  const total = { amount: sum(data.budgets, 'amount'), spent: sum(data.budgets, 'spent') }

  return (
    <div>
      <h2>예산</h2>
      <NameSuggestions />
      <p>
        총예산 <b>{won(total.amount)}</b> · 지출 <b>{won(total.spent)}</b> · 남은 금액{' '}
        <b style={{ color: total.amount - total.spent < 0 ? 'red' : 'inherit' }}>{won(total.amount - total.spent)}</b>
      </p>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <div style={{ border: '1px dashed gray', padding: 8, marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <b>결산보고서</b>
        <input type="date" value={period.start} onChange={(e) => setPeriod({ ...period, start: e.target.value })} />~
        <input type="date" value={period.end} onChange={(e) => setPeriod({ ...period, end: e.target.value })} />
        {/* 서버가 만든 엑셀 파일을 바로 내려받는 링크 */}
        <a href={`${API_URL}/reports/settlement.xlsx?start=${period.start}&end=${period.end}`} download>
          엑셀로 내려받기
        </a>
        <span style={{ fontSize: 12, color: 'gray' }}>기간을 비우면 전체. 사업별 결산, 비목별 집계, 지출 내역 시트가 들어 있습니다.</span>
      </div>

      <form onSubmit={addBudget} style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
        <input list="event-names" placeholder="사업명 (예: 개강총회)" value={form.event_name} onChange={(e) => setForm({ ...form, event_name: e.target.value })} required />
        <input list="categories" placeholder="비목 (예: 급량비)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required />
        <input type="number" min="0" placeholder="예산액" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
        <button type="submit">예산 추가</button>
      </form>

      {Object.keys(groups).length === 0 && <p style={{ color: 'gray' }}>등록된 예산이 없습니다. 예산계획서의 사업·비목별 금액을 위에서 추가하세요.</p>}

      {Object.entries(groups).map(([eventName, list]) => (
        <div key={eventName} style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 4 }}>
            {eventName}{' '}
            <span style={{ fontSize: 14, fontWeight: 'normal' }}>
              (예산 {won(sum(list, 'amount'))} / 지출 {won(sum(list, 'spent'))} / 남음{' '}
              <span style={{ color: sum(list, 'remaining') < 0 ? 'red' : 'inherit' }}>{won(sum(list, 'remaining'))}</span>)
            </span>
          </h3>
          <table border="1" cellPadding="4" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr><th>비목</th><th>예산액</th><th>지출</th><th>남은 금액</th><th>집행률</th><th></th></tr>
            </thead>
            <tbody>
              {list.map((b) => (
                <BudgetRow key={b.id + ':' + b.amount} budget={b} onChanged={setData} setError={setError} />
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {data.unbudgeted.length > 0 && (
        <>
          <h3>예산에 없는 지출</h3>
          <p style={{ fontSize: 12, color: 'gray' }}>
            예산에 없는 사업명·비목으로 등록된 지출입니다. 예산을 추가하거나, 지출의 사업명·비목 오타를 확인하세요.
          </p>
          <ul>
            {data.unbudgeted.map((u) => (
              <li key={u.event_name + u.category}>
                {u.event_name} - {u.category}: {won(u.spent)}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

export default BudgetPage
