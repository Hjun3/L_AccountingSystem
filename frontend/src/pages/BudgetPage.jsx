import { useEffect, useState } from 'react'
import { api, API_URL, isAdmin, useTerm, useUser } from '../common'
import NameSuggestions from '../components/NameSuggestions'

const won = (n) => `${n.toLocaleString()}원`

// 예산 1줄: 금액을 고치거나 삭제할 수 있다
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

// 기간(학기 전/1학기/2학기)의 시작일·종료일 고치기
function PeriodDates({ period, onSaved, setError }) {
  const [dates, setDates] = useState({ start_date: period.start_date, end_date: period.end_date })
  const changed = dates.start_date !== period.start_date || dates.end_date !== period.end_date

  async function save() {
    try {
      await api(`/periods/${period.id}`, { method: 'PATCH', body: JSON.stringify(dates) })
      onSaved()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <span>
      기간 <input type="date" value={dates.start_date} onChange={(e) => setDates({ ...dates, start_date: e.target.value })} /> ~{' '}
      <input type="date" value={dates.end_date} onChange={(e) => setDates({ ...dates, end_date: e.target.value })} />
      {changed && <button onClick={save}>기간 저장</button>}
      <span style={{ fontSize: 12, color: 'gray' }}> (이 날짜 안의 지출이 이 기간으로 계산됩니다)</span>
    </span>
  )
}

// 사업 x 월 지출 표. monthly: [{event_name, month, total}]
function MonthlyTable({ monthly }) {
  if (monthly.length === 0) return <p style={{ color: 'gray' }}>이 기간에 지출이 없습니다.</p>
  const months = [...new Set(monthly.map((m) => m.month))].sort()
  const events = [...new Set(monthly.map((m) => m.event_name))]
  const amount = (e, m) => monthly.find((x) => x.event_name === e && x.month === m)?.total || 0
  const monthTotal = (m) => monthly.filter((x) => x.month === m).reduce((s, x) => s + x.total, 0)

  return (
    <table border="1" cellPadding="4" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr>
          <th>사업</th>
          {months.map((m) => <th key={m}>{Number(m.slice(5))}월</th>)}
          <th>합계</th>
        </tr>
      </thead>
      <tbody>
        {events.map((e) => (
          <tr key={e}>
            <td>{e}</td>
            {months.map((m) => <td key={m} style={{ textAlign: 'right' }}>{amount(e, m) ? amount(e, m).toLocaleString() : ''}</td>)}
            <td style={{ textAlign: 'right' }}>{months.reduce((s, m) => s + amount(e, m), 0).toLocaleString()}</td>
          </tr>
        ))}
        <tr style={{ fontWeight: 'bold' }}>
          <td>월 합계</td>
          {months.map((m) => <td key={m} style={{ textAlign: 'right' }}>{monthTotal(m).toLocaleString()}</td>)}
          <td style={{ textAlign: 'right' }}>{monthly.reduce((s, x) => s + x.total, 0).toLocaleString()}</td>
        </tr>
      </tbody>
    </table>
  )
}

// 새 임기 만들기 (관리자만): 다음 학생회가 쓸 때. 지금 임기의 예산 구조를 복사할 수 있다.
function NewTermForm({ terms, currentTerm, onCreated }) {
  const nextYear = Math.max(new Date().getFullYear(), ...terms.map((t) => t.year)) + 1
  const [year, setYear] = useState(nextYear)
  const [copy, setCopy] = useState(true)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    setError('')
    const copyText = copy && currentTerm ? ` (${currentTerm.name} 예산 복사)` : ''
    if (!window.confirm(`${year}년 임기를 만들까요?${copyText}`)) return
    try {
      const list = await api('/terms', {
        method: 'POST',
        body: JSON.stringify({ year: Number(year), copy_budgets_from: copy && currentTerm ? currentTerm.id : null }),
      })
      onCreated(list.find((t) => t.year === Number(year)).id)
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <form onSubmit={submit} style={{ border: '1px dashed gray', padding: 8, marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <b>새 임기 만들기</b>
      <input type="number" value={year} onChange={(e) => setYear(e.target.value)} style={{ width: 80 }} />년
      {currentTerm && (
        <label>
          <input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} /> {currentTerm.name} 예산(사업·지출 항목·금액) 복사
        </label>
      )}
      <button type="submit">만들기</button>
      <span style={{ fontSize: 12, color: 'gray' }}>다음 학생회가 쓸 때 만듭니다. 기간 3개(학기 전/1학기/2학기)가 함께 만들어집니다.</span>
      {error && <span style={{ color: 'red' }}>{error}</span>}
    </form>
  )
}

// 예산 페이지: 기간(학기 전/1학기/2학기)을 고르고, 그 기간의 사업·비목별 예산 대비 지출과 월별 지출을 본다
function BudgetPage() {
  const [periods, setPeriods] = useState([])
  const [periodId, setPeriodId] = useState(null)
  const [data, setData] = useState(null)
  const [form, setForm] = useState({ event_name: '', category: '', amount: '' })
  const [error, setError] = useState('')
  const user = useUser()
  const { terms, termId, reloadTerms } = useTerm()
  // 위 메뉴에서 '전체 임기'를 고르면 예산은 가장 최근 임기를 보여준다
  const term = terms.find((t) => t.id === termId) || terms[0]

  // 그 임기의 기간 목록을 불러오고, 처음에는 오늘이 들어 있는 기간을 고른다
  async function loadPeriods(reset = false) {
    if (!term) return
    try {
      const list = await api(`/periods?term_id=${term.id}`)
      setPeriods(list)
      if (reset || periodId === null) {
        const today = new Date().toLocaleDateString('sv')
        const current = list.find((p) => p.start_date <= today && today <= p.end_date) || list[0]
        setPeriodId(current.id)
      } else {
        loadBudgets(periodId) // 기간 날짜가 바뀌면 지출 합계도 다시 계산
      }
    } catch (e) {
      setError(e.message)
    }
  }

  async function loadBudgets(id) {
    try {
      setData(await api(`/budgets?period_id=${id}`))
    } catch (e) {
      setError(e.message)
    }
  }

  // 임기가 바뀌면 그 임기의 기간으로 새로 시작한다
  useEffect(() => {
    setData(null)
    loadPeriods(true)
  }, [term?.id])

  useEffect(() => {
    if (periodId !== null) loadBudgets(periodId)
  }, [periodId])

  async function addBudget(e) {
    e.preventDefault()
    setError('')
    try {
      setData(await api('/budgets', { method: 'POST', body: JSON.stringify({ ...form, period_id: periodId, amount: Number(form.amount) }) }))
      setForm({ ...form, category: '', amount: '' }) // 같은 사업의 다른 비목을 이어서 넣기 쉽게 사업명은 남긴다
    } catch (e) {
      setError(e.message)
    }
  }

  const period = periods.find((p) => p.id === periodId)
  if (!data || !period || data.period.id !== period.id) return error ? <p style={{ color: 'red' }}>{error}</p> : <p>불러오는 중...</p>

  // 예산 줄을 사업명별로 묶는다
  const groups = {}
  for (const b of data.budgets) (groups[b.event_name] ||= []).push(b)
  const sum = (list, key) => list.reduce((s, b) => s + b[key], 0)
  const total = { amount: sum(data.budgets, 'amount'), spent: sum(data.budgets, 'spent') }

  return (
    <div>
      <h2>예산 ({term.name})</h2>
      {termId === null && <p style={{ fontSize: 12, color: 'gray' }}>'전체 임기'를 고른 상태라 가장 최근 임기({term.name}) 예산을 보여줍니다.</p>}
      <NameSuggestions />

      {/* 기간 탭 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {periods.map((p) => (
          <button key={p.id} onClick={() => setPeriodId(p.id)} className={p.id === periodId ? 'active' : ''}>
            {p.name}
          </button>
        ))}
      </div>
      <PeriodDates key={period.id + period.start_date + period.end_date} period={period} onSaved={() => { loadPeriods(); reloadTerms(termId) }} setError={setError} />

      <p>
        <b>{period.name}</b> 총예산 <b>{won(total.amount)}</b> · 지출 <b>{won(total.spent)}</b> · 남은 금액{' '}
        <b style={{ color: total.amount - total.spent < 0 ? 'red' : 'inherit' }}>{won(total.amount - total.spent)}</b>
      </p>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <div style={{ border: '1px dashed gray', padding: 8, marginBottom: 12 }}>
        <b>결산보고서</b>{' '}
        {/* 서버가 만든 엑셀 파일을 바로 내려받는 링크 */}
        <a href={`${API_URL}/reports/settlement.xlsx?period_id=${period.id}`} download>
          {period.name} 결산보고서 엑셀로 내려받기
        </a>
        <span style={{ fontSize: 12, color: 'gray' }}> (사업별 결산, 비목별 집계, 지출 내역 시트)</span>
      </div>

      <form onSubmit={addBudget} style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
        <input list="event-names" placeholder="사업명 (예: 개강총회)" value={form.event_name} onChange={(e) => setForm({ ...form, event_name: e.target.value })} required />
        <input list="categories" placeholder="지출 항목 (예: 급량비)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required />
        <input type="number" min="0" placeholder="예산액" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
        <button type="submit">{period.name} 예산 추가</button>
      </form>

      {Object.keys(groups).length === 0 && (
        <p style={{ color: 'gray' }}>{period.name}에 등록된 예산이 없습니다. 예산계획서의 사업·지출 항목별 금액을 위에서 추가하세요.</p>
      )}

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
              <tr><th>항목</th><th>예산액</th><th>지출</th><th>남은 금액</th><th>집행률</th><th></th></tr>
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
            이 기간에 예산에 없는 사업명·지출 항목으로 등록된 지출입니다. 예산을 추가하거나, 지출의 사업명·지출 항목 오타를 확인하세요.
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

      <h3>월별 지출</h3>
      <MonthlyTable monthly={data.monthly} />

      {isAdmin(user) && (
        <div style={{ marginTop: 32 }}>
          <NewTermForm terms={terms} currentTerm={term} onCreated={(id) => reloadTerms(id)} />
        </div>
      )}
    </div>
  )
}

export default BudgetPage
