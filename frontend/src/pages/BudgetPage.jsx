import { useEffect, useState } from 'react'
import { api, API_URL, canEdit, isAdmin, loadEventParents, topEvent, useTerm, useUser } from '../common'
import SuggestInput from '../components/SuggestInput'

const won = (n) => `${n.toLocaleString()}원`

// 예산 1줄: 금액을 고치거나 삭제할 수 있다
function BudgetRow({ budget, onChanged, setError, editable }) {
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
      <td style={{ paddingLeft: 32, color: 'var(--sub)' }}><span style={{ color: 'var(--line-strong)', marginRight: 6 }}>└</span>{budget.category}</td>
      <td className="num">
        {/* 열람 계정은 금액을 글로만 본다 */}
        {editable ? (
          <>
            {changed && <button onClick={save} style={{ height: 26, fontSize: 12, marginRight: 4 }}>저장</button>}
            <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))} style={{ width: 110, height: 28, textAlign: 'right' }} />
          </>
        ) : budget.amount.toLocaleString()}
      </td>
      <td className="num">{budget.spent.toLocaleString()}</td>
      <td className="num" style={{ color: over ? 'var(--bad)' : 'inherit', fontWeight: over ? 700 : 400 }}>{budget.remaining.toLocaleString()}</td>
      <td><RateBar rate={rate} over={over} /></td>
      <td style={{ textAlign: 'right' }}>{editable && <button onClick={remove} style={{ height: 26, fontSize: 12, color: 'var(--bad)' }}>삭제</button>}</td>
    </tr>
  )
}

// 집행률 막대 + 퍼센트. 100%를 넘으면 빨강
function RateBar({ rate, over, width = 90 }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
      <span style={{ width, height: 6, background: 'var(--line)', borderRadius: 3, display: 'inline-block' }}>
        <span style={{ display: 'block', width: `${Math.min(rate ?? 0, 100)}%`, height: '100%', borderRadius: 3, background: over ? 'var(--bad)' : 'var(--primary)' }} />
      </span>
      <span className="tnum" style={{ color: over ? 'var(--bad)' : 'var(--sub)', fontSize: 12 }}>{rate === null ? '-' : `${rate}%`}</span>
    </span>
  )
}

// 기간(학기 전/1학기/여름방학/2학기)의 시작일·종료일 고치기
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
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }} title="이 날짜 안의 지출이 이 기간으로 계산됩니다">
      <span className="muted">기간</span>
      <input type="date" value={dates.start_date} onChange={(e) => setDates({ ...dates, start_date: e.target.value })} />
      <span className="muted">~</span>
      <input type="date" value={dates.end_date} onChange={(e) => setDates({ ...dates, end_date: e.target.value })} />
      {changed && <button type="submit" onClick={save}>기간 저장</button>}
    </span>
  )
}

// 사업 x 월 지출 표. monthly: [{event_name, month, total}]
// wide: 상자 폭을 다 쓴다 (월별 지출이 한 줄을 다 쓸 때)
function MonthlyTable({ monthly, wide = false }) {
  if (monthly.length === 0) return <p className="muted" style={{ padding: 16, margin: 0 }}>이 기간에 지출이 없습니다.</p>
  const months = [...new Set(monthly.map((m) => m.month))].sort()
  const events = [...new Set(monthly.map((m) => m.event_name))]
  const amount = (e, m) => monthly.find((x) => x.event_name === e && x.month === m)?.total || 0
  const monthTotal = (m) => monthly.filter((x) => x.month === m).reduce((s, x) => s + x.total, 0)

  return (
    <table className={wide ? 'compact-table wide' : 'compact-table'}>
      <thead>
        <tr>
          <th>사업</th>
          {months.map((m) => <th key={m} className="num">{Number(m.slice(5))}월</th>)}
          <th className="num">합계</th>
        </tr>
      </thead>
      <tbody>
        {events.map((e) => (
          <tr key={e}>
            <td>{e}</td>
            {months.map((m) => <td key={m} className="num">{amount(e, m) ? amount(e, m).toLocaleString() : ''}</td>)}
            <td className="num" style={{ fontWeight: 600 }}>{months.reduce((s, m) => s + amount(e, m), 0).toLocaleString()}</td>
          </tr>
        ))}
        <tr style={{ fontWeight: 700, background: '#fafbfc' }}>
          <td>월 합계</td>
          {months.map((m) => <td key={m} className="num">{monthTotal(m).toLocaleString()}</td>)}
          <td className="num">{monthly.reduce((s, x) => s + x.total, 0).toLocaleString()}</td>
        </tr>
      </tbody>
    </table>
  )
}

// 사업 묶기: 하위 사업을 상위 사업 아래로 (예: MT 사전답사 → MT). 사업명은 그대로, 표·대시보드·결산에서 묶어 보여 준다
function EventGroupCard({ parents, onChanged }) {
  const [form, setForm] = useState({ event_name: '', parent_name: '' })
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    setError('')
    try {
      await api('/event-groups', { method: 'POST', body: JSON.stringify(form) })
      setForm({ event_name: '', parent_name: form.parent_name })
      onChanged()
    } catch (e) {
      setError(e.message)
    }
  }

  async function remove(child) {
    try {
      await api(`/event-groups/${encodeURIComponent(child)}`, { method: 'DELETE' })
      onChanged()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <section className="card compact-card">
      <b>사업 묶기</b> <span className="muted">작은 사업을 큰 사업 아래로 (예: MT 사전답사 → MT)</span>
      <form onSubmit={submit} style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 10 }}>
        <SuggestInput list="event-names" placeholder="하위 사업" value={form.event_name} onChange={(e) => setForm({ ...form, event_name: e.target.value })} required style={{ width: '100%' }} />
        <span className="muted">→</span>
        <SuggestInput list="event-names" placeholder="상위 사업" value={form.parent_name} onChange={(e) => setForm({ ...form, parent_name: e.target.value })} required style={{ width: '100%' }} />
        <button type="submit">묶기</button>
      </form>
      {error && <div style={{ color: 'var(--bad)', fontSize: 12, marginTop: 6 }}>{error}</div>}
      {Object.keys(parents).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {Object.entries(parents).map(([child, parent]) => (
            <span key={child} className="chip">
              {child} <span className="muted">→</span> <b>{parent}</b>
              <button type="button" onClick={() => remove(child)} title="묶음 풀기">×</button>
            </span>
          ))}
        </div>
      )}
    </section>
  )
}

// 새 임기 만들기 (관리자만): 다음 학생회가 쓸 때. 지금 임기의 예산 구조를 복사할 수 있다.
function NewTermForm({ terms, currentTerm, onCreated }) {
  const nextYear = Math.max(new Date().getFullYear(), ...terms.map((t) => t.year)) + 1
  const [open, setOpen] = useState(false) // 작은 창이 열려 있는지
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
      setOpen(false)
      onCreated(list.find((t) => t.year === Number(year)).id)
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={{ marginLeft: 8 }} title="다음 학생회가 쓸 새 임기 만들기 (관리자)">+ 새 임기</button>
      {open && (
        <div className="popup-bg" onClick={() => setOpen(false)}>
          <form className="popup" onSubmit={submit} onClick={(e) => e.stopPropagation()} style={{ display: 'grid', gap: 12 }}>
            <b>새 임기 만들기</b>
            <span className="muted" style={{ marginTop: -6 }}>다음 학생회가 쓸 때 만듭니다. 기간 4개(학기 전/1학기/여름방학/2학기)가 함께 만들어집니다.</span>
            <span><input inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value.replace(/[^0-9]/g, ''))} style={{ width: 80 }} autoFocus /> 년</span>
            {currentTerm && (
              <label style={{ fontSize: 13 }}>
                <input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} /> {currentTerm.name} 예산(사업·지출 항목·금액) 복사
              </label>
            )}
            {error && <span style={{ color: 'var(--bad)', fontSize: 13 }}>{error}</span>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
              <button type="button" onClick={() => setOpen(false)}>닫기</button>
              <button type="submit">만들기</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}

// 예산 페이지: 기간(학기 전/1학기/여름방학/2학기)을 고르고, 그 기간의 사업·지출 항목별 예산 대비 지출과 월별 지출을 본다
function BudgetPage() {
  const [periods, setPeriods] = useState([])
  const [periodId, setPeriodId] = useState(null)
  const [data, setData] = useState(null)
  const [form, setForm] = useState({ event_name: '', category: '', amount: '' })
  const [error, setError] = useState('')
  const [parents, setParents] = useState({}) // 사업 묶음 { 하위: 상위 }
  const user = useUser()
  const editable = canEdit(user) // 열람 계정은 예산을 보기만 한다
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

  function loadGroups() {
    loadEventParents().then(setParents).catch(() => setParents({}))
  }
  useEffect(loadGroups, [])

  async function addBudget(e) {
    e.preventDefault()
    setError('')
    try {
      setData(await api('/budgets', { method: 'POST', body: JSON.stringify({ ...form, period_id: periodId, amount: Number(form.amount) }) }))
      setForm({ ...form, category: '', amount: '' }) // 같은 사업의 다른 지출 항목을 이어서 넣기 쉽게 사업명은 남긴다
    } catch (e) {
      setError(e.message)
    }
  }

  const period = periods.find((p) => p.id === periodId)
  const sum = (list, key) => list.reduce((s, b) => s + b[key], 0)
  if (!data || !period || data.period.id !== period.id) return error ? <p style={{ color: 'var(--bad)' }}>{error}</p> : <p>불러오는 중...</p>

  // 예산 줄을 사업명별로 묶는다. 같은 묶음(상위 사업)끼리 붙어 나오게 상위 사업 → 상위가 먼저 → 이름 순
  const groups = {}
  const ordered = [...data.budgets].sort((a, b) =>
    topEvent(a.event_name, parents).localeCompare(topEvent(b.event_name, parents)) ||
    (a.event_name !== topEvent(a.event_name, parents)) - (b.event_name !== topEvent(b.event_name, parents)) ||
    a.event_name.localeCompare(b.event_name))
  for (const b of ordered) (groups[b.event_name] ||= []).push(b)
  // 묶음별 사업 수와 합계 (사업이 2개 이상인 묶음만 '묶음 합계' 줄을 보여 준다)
  const tops = {}
  for (const [name, list] of Object.entries(groups)) {
    const t = (tops[topEvent(name, parents)] ||= { count: 0, amount: 0, spent: 0, last: null })
    t.count += 1
    t.amount += sum(list, 'amount')
    t.spent += sum(list, 'spent')
    t.last = name
  }
  const total = { amount: sum(data.budgets, 'amount'), spent: sum(data.budgets, 'spent') }

  const remainingTotal = total.amount - total.spent
  const overLines = data.budgets.filter((x) => x.remaining < 0) // 예산을 넘긴 항목
  const unusedLines = data.budgets.filter((x) => x.spent === 0 && x.amount > 0) // 아직 한 푼도 안 쓴 항목

  // 살펴볼 것: 세 칸(예산 넘김 | 아직 안 쓴 예산 | 예산에 없는 지출). 칸마다 이름 옆에 금액, 많으면 칸 안에서 스크롤
  const lookColumn = (title, color, rows, empty) => (
    <div className="look-col">
      <div style={{ fontWeight: 600, color, marginBottom: 6 }}>{title} {rows.length}</div>
      <div className="look-list">
        {rows.length === 0 ? <div className="muted">{empty}</div> : rows.map((r) => (
          <div key={r.key} className="look-item" title={`${r.name} · ${r.category}`}>
            <span className="look-name">{r.name} <span className="muted">· {r.category}</span></span>
            <span className="tnum" style={{ color: r.color }}>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
  // stacked: 좁은 칸(열람 계정의 오른쪽 칸)에서는 세 칸을 위아래로 쌓는다
  const lookBox = (stacked) => (
    <div className={stacked ? 'look-cols stacked' : 'look-cols'}>
      {lookColumn('예산 넘김', 'var(--bad)', overLines.map((x) => ({ key: x.id, name: x.event_name, category: x.category, value: `+${(-x.remaining).toLocaleString()}`, color: 'var(--bad)' })), '없어요')}
      {lookColumn('아직 안 쓴 예산', 'var(--text)', unusedLines.map((x) => ({ key: x.id, name: x.event_name, category: x.category, value: x.amount.toLocaleString(), color: 'var(--muted)' })), '없어요')}
      {lookColumn('예산에 없는 지출', data.unbudgeted.length ? 'var(--warn)' : 'var(--text)', data.unbudgeted.map((u) => ({ key: u.event_name + u.category, name: u.event_name, category: u.category, value: u.spent.toLocaleString(), color: 'var(--warn)' })), '없어요')}
    </div>
  )
  const totalRate = total.amount > 0 ? Math.round((total.spent / total.amount) * 100) : null

  return (
    <div>
      <h2>예산·결산 <span className="muted" style={{ fontSize: 15, fontWeight: 500 }}>{term.name}</span></h2>
      {termId === null && <p className="muted">'전체 임기'를 고른 상태라 가장 최근 임기({term.name}) 예산을 보여줍니다.</p>}

      {/* 기간 탭 + 기간 날짜 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {periods.map((p) => (
            <button key={p.id} onClick={() => setPeriodId(p.id)} className={p.id === periodId ? 'active' : ''}>
              {p.name}
            </button>
          ))}
          {isAdmin(user) && <NewTermForm terms={terms} currentTerm={term} onCreated={(id) => reloadTerms(id)} />}
        </div>
        {editable ? (
          <PeriodDates key={period.id + period.start_date + period.end_date} period={period} onSaved={() => { loadPeriods(); reloadTerms(termId) }} setError={setError} />
        ) : (
          <span className="muted">기간 {period.start_date} ~ {period.end_date}</span>
        )}
      </div>
      {error && <p style={{ color: 'var(--bad)' }}>{error}</p>}

      {/* 기간 요약 */}
      <div className="card tnum" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, alignItems: 'end' }}>
        {[
          { label: `${period.name} 총예산`, value: won(total.amount) },
          { label: '지출', value: won(total.spent) },
          { label: '남은 금액', value: won(remainingTotal), color: remainingTotal < 0 ? 'var(--bad)' : undefined },
        ].map((it) => (
          <div key={it.label}>
            <div className="muted">{it.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: it.color }}>{it.value}</div>
          </div>
        ))}
        <div>
          <div className="muted">집행률</div>
          <RateBar rate={totalRate} over={total.spent > total.amount} width={140} />
        </div>
        {/* 이 기간 결산보고서 (서버가 만든 엑셀 파일을 바로 내려받는 링크) */}
        <div>
          <div className="muted">{period.name} 결산보고서</div>
          <a className="btn primary" href={`${API_URL}/reports/settlement.xlsx?period_id=${period.id}`} download style={{ marginTop: 4 }}>엑셀 내려받기</a>
        </div>
      </div>

      {/* 1줄: 왼쪽 사업별 예산 표 | 오른쪽 예산 추가 + 사업 묶기.
          표 상자는 높이를 차지하지 않게 띄워 두고(absolute), 줄 높이는 오른쪽 카드들 높이에 맞춘다 */}
      <div className="budget-row" style={{ minHeight: 480 }}>
        <div style={{ position: 'relative', minHeight: 480 }}>
        <section className="panel" style={{ position: 'absolute', inset: 0 }}>
          <div className="panel-head"><b>사업별 예산</b><span className="muted">{data.budgets.length}줄 · 표 안에서 스크롤</span></div>
          <div className="panel-body">
            {Object.keys(groups).length === 0 ? (
              <p className="muted" style={{ padding: 16 }}>{period.name}에 등록된 예산이 없습니다. 예산계획서의 사업·지출 항목별 금액을 오른쪽에서 추가하세요.</p>
            ) : (
              <table style={{ width: '100%' }}>
                <thead>
                  <tr><th>사업 · 항목</th><th className="num">예산액</th><th className="num">지출</th><th className="num">남은 금액</th><th>집행률</th><th></th></tr>
                </thead>
                {Object.entries(groups).map(([eventName, list]) => {
                  const b = sum(list, 'amount'), sp = sum(list, 'spent')
                  const top = topEvent(eventName, parents)
                  const t = tops[top]
                  return (
                    <tbody key={eventName}>
                      {/* 사업 줄: 소계. 묶인 하위 사업이면 '↳'와 묶음 이름 */}
                      <tr className="event-row">
                        <td>
                          {top !== eventName && <span className="muted">↳ </span>}
                          {eventName}
                          {top !== eventName && <span className="muted" style={{ fontWeight: 400 }}> · {top} 묶음</span>}
                        </td>
                        <td className="num">{b.toLocaleString()}</td>
                        <td className="num">{sp.toLocaleString()}</td>
                        <td className="num" style={{ color: b - sp < 0 ? 'var(--bad)' : 'inherit' }}>{(b - sp).toLocaleString()}</td>
                        <td><RateBar rate={b > 0 ? Math.round((sp / b) * 100) : null} over={sp > b} /></td>
                        <td />
                      </tr>
                      {list.map((x) => (
                        <BudgetRow key={x.id + ':' + x.amount} budget={x} onChanged={setData} setError={setError} editable={editable} />
                      ))}
                      {/* 묶음의 마지막 사업 뒤에 묶음 합계 (사업이 2개 이상일 때만) */}
                      {t.count >= 2 && t.last === eventName && (
                        <tr style={{ fontWeight: 700, borderTop: '2px solid var(--line-strong)' }}>
                          <td>{top} 묶음 합계</td>
                          <td className="num">{t.amount.toLocaleString()}</td>
                          <td className="num">{t.spent.toLocaleString()}</td>
                          <td className="num" style={{ color: t.amount - t.spent < 0 ? 'var(--bad)' : 'inherit' }}>{(t.amount - t.spent).toLocaleString()}</td>
                          <td><RateBar rate={t.amount > 0 ? Math.round((t.spent / t.amount) * 100) : null} over={t.spent > t.amount} /></td>
                          <td />
                        </tr>
                      )}
                    </tbody>
                  )
                })}
              </table>
            )}
          </div>
        </section>
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
          {editable ? (
            <form onSubmit={addBudget} className="card" style={{ display: 'grid', gap: 10, marginBottom: 0, flex: 1, alignContent: 'start' }}>
              <div>
                <b>{period.name} 예산 추가</b>
                <div className="muted" style={{ marginTop: 2 }}>새 사업도 여기서 만들어요. 사업명에 목록에 없는 새 이름을 쓰면 새 사업으로 추가돼요.</div>
              </div>
              <label>사업명 <SuggestInput list="event-names" placeholder="예: 개강총회 (새 이름도 가능)" value={form.event_name} onChange={(e) => setForm({ ...form, event_name: e.target.value })} required /></label>
              <label>지출 항목 <SuggestInput list="categories" placeholder="예: 급량비" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required /></label>
              <label>예산액(원) <input inputMode="numeric" placeholder="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^0-9]/g, '') })} required /></label>
              <button type="submit">추가</button>
              <div className="muted" style={{ marginTop: 'auto' }}>한 사업에 지출 항목이 여러 개면 사업명은 그대로 두고 항목·금액만 바꿔 계속 추가하세요.</div>
            </form>
          ) : (
            <section className="panel" style={{ height: 480 }}>{/* 높이 고정: 항목이 많아도 칸 안에서 스크롤 */}
              <div className="panel-head"><b>살펴볼 것</b></div>
              <div className="panel-body" style={{ overflow: 'hidden' }}>
            {lookBox(true)}
              </div>
            </section>
          )}
          {/* 사업 묶기 (예산 추가 바로 아래) */}
          {editable && <EventGroupCard parents={parents} onChanged={loadGroups} />}
        </aside>
      </div>

      {/* 2줄 (높이 고정): 왼쪽 월별 지출(표 내용 폭만큼) | 오른쪽 살펴볼 것(남는 폭 전부) */}
      <div className="budget-row" style={{ height: 280, marginTop: 20, gridTemplateColumns: editable ? 'fit-content(70%) minmax(300px, 1fr)' : 'minmax(0, 1fr)' }}>
        <section className="panel">
          <div className="panel-head"><b>월별 지출</b><span className="muted">사업 x 월</span></div>
          <div className="panel-body"><MonthlyTable monthly={data.monthly} wide={!editable} /></div>
        </section>
        {editable ? (
          <section className="panel">
            <div className="panel-head"><b>살펴볼 것</b></div>
            <div className="panel-body" style={{ overflow: 'hidden' }}>
            {lookBox(false)}
            </div>
          </section>
        ) : null}
      </div>

    </div>
  )
}

export default BudgetPage
