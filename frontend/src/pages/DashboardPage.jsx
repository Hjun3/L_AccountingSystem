import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, KIND_COLORS, termQuery, useTerm } from '../common'
import { BarList, BudgetBars, MonthBars } from '../components/Charts'
import MiniCalendar from '../components/MiniCalendar'
import StatusBadge from '../components/StatusBadge'
import TodoList from '../components/TodoList'

// 지출을 기준(사업명, 비목 등)별로 묶어 합계를 구한다. 금액 큰 순서.
function sumBy(expenses, key) {
  const groups = {}
  for (const exp of expenses) {
    const g = (groups[exp[key]] ||= { name: exp[key], value: 0, count: 0 })
    g.value += exp.amount
    g.count += 1
  }
  return Object.values(groups)
    .sort((a, b) => b.value - a.value)
    .map((g) => ({ ...g, sub: `${g.count}건` }))
}

// 지출을 월별로 합친다. 첫 지출 달부터 마지막 지출 달까지 빈 달도 0으로 채운다.
function byMonth(expenses) {
  if (expenses.length === 0) return []
  const totals = {}
  for (const e of expenses) totals[e.date.slice(0, 7)] = (totals[e.date.slice(0, 7)] || 0) + e.amount
  const months = Object.keys(totals).sort()
  const rows = []
  let [y, m] = months[0].split('-').map(Number)
  const last = months[months.length - 1]
  for (;;) {
    const key = `${y}-${String(m).padStart(2, '0')}`
    rows.push({ month: key, value: totals[key] || 0 })
    if (key === last || rows.length > 24) break
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  return rows
}

// 대시보드: 위쪽은 잔액과 오늘 할 일, 아래쪽은 차트로 흐름을 본다
function DashboardPage() {
  const [expenses, setExpenses] = useState(null)
  const [schedules, setSchedules] = useState([])
  const [bank, setBank] = useState(null) // 통장 현황 (불러온 거래내역 기준)
  const [budgetRows, setBudgetRows] = useState([]) // 사업별 예산 집행 (임기 전체)
  const { terms, termId } = useTerm() // 왼쪽 메뉴에서 고른 임기
  const [error, setError] = useState('')
  // 예산은 임기가 있어야 계산할 수 있다. '전체 임기'면 가장 최근 임기 예산을 쓴다.
  const budgetTerm = terms.find((t) => t.id === termId) || terms[0]

  async function loadBudgets() {
    if (!budgetTerm) return
    const periods = await api(`/periods?term_id=${budgetTerm.id}`)
    const results = await Promise.all(periods.map((p) => api(`/budgets?period_id=${p.id}`)))
    // 기간별 예산 줄을 사업명으로 합친다
    const byEvent = {}
    for (const r of results) {
      for (const b of r.budgets) {
        const e = (byEvent[b.event_name] ||= { name: b.event_name, budget: 0, spent: 0 })
        e.budget += b.amount
        e.spent += b.spent
      }
    }
    setBudgetRows(Object.values(byEvent).sort((a, b) => b.budget - a.budget))
  }

  function load() {
    Promise.all([api('/expenses' + termQuery(termId)), api('/schedules'), api('/bank/summary' + termQuery(termId))])
      .then(([exps, schs, bankSummary]) => {
        setExpenses(exps)
        setSchedules(schs)
        setBank(bankSummary)
      })
      .catch((e) => setError(e.message))
    loadBudgets().catch(() => setBudgetRows([]))
  }

  useEffect(load, [termId, budgetTerm?.id]) // 임기를 바꾸면 다시 불러온다

  if (error) return <p style={{ color: 'var(--bad)' }}>{error}</p>
  if (!expenses) return <p>불러오는 중...</p>

  const total = expenses.reduce((sum, exp) => sum + exp.amount, 0)
  const countOf = (status) => expenses.filter((exp) => exp.ai_status === status).length
  const waiting = expenses.filter((exp) => exp.final_status === '대기')
  // 주의/위반인데 아직 총무가 결정하지 않은 건
  const needCheck = waiting.filter((exp) => exp.ai_status === '주의' || exp.ai_status === '위반')
  // 아직 끝내지 않은 '챙길 것'이 있는 지출
  const withTodos = expenses.filter((exp) => exp.ai_todos.some((t) => !t.done))
  const todoCount = withTodos.reduce((n, exp) => n + exp.ai_todos.filter((t) => !t.done).length, 0)
  const todayString = new Date().toLocaleDateString('sv') // YYYY-MM-DD
  const upcoming = schedules.filter((s) => s.date >= todayString).slice(0, 4)
  const budgetTotal = budgetRows.reduce((n, r) => n + r.budget, 0)

  return (
    <div style={{ maxWidth: 1040 }}>
      {/* 1. 잔액·요약 + 달력 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(260px, 1fr)', gap: 20, marginBottom: 8 }} className="dash-top">
        <section className="card" style={{ marginBottom: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="muted">통장 잔액{bank.as_of && ` · ${bank.as_of.slice(0, 10)} 거래 기준`}</div>
          {bank.balance === null ? (
            <p style={{ fontSize: 15 }}>
              거래내역을 불러오면 잔액이 보입니다. <Link to="/expenses/import">거래내역 불러오기</Link>
            </p>
          ) : (
            <>
              <div className="tnum" style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.02em' }}>
                {bank.balance.toLocaleString()}<span style={{ fontSize: 20, fontWeight: 600 }}>원</span>
              </div>
              {/* 최근 달 입출금 (통장 기준) */}
              {bank.months.length > 0 && (
                <div className="tnum" style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--sub)', marginTop: 6 }}>
                  <span>{Number(bank.months[0].month.slice(5))}월 입금 <b style={{ color: 'var(--text)' }}>+{bank.months[0].deposit.toLocaleString()}</b></span>
                  <span>출금 <b style={{ color: 'var(--text)' }}>−{bank.months[0].withdraw.toLocaleString()}</b></span>
                  <Link to="/expenses/import" style={{ marginLeft: 'auto' }}>거래내역 대조</Link>
                </div>
              )}
            </>
          )}
          {/* 요약 3개: 같은 모양 카드 대신 한 줄에 구분선으로 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 'auto', paddingTop: 18, borderTop: '1px solid var(--line)' }}>
            {[
              { label: budgetTerm ? `${budgetTerm.name} 지출` : '지출', value: `${total.toLocaleString()}원`, sub: budgetTotal ? `예산 ${Math.round((total / budgetTotal) * 100)}% 사용` : `${expenses.length}건` },
              { label: '챙길 것', value: `${todoCount}개`, sub: `${withTodos.length}건의 지출`, alert: todoCount > 0 },
              { label: '결정 대기', value: `${waiting.length}건`, sub: `확인·조치 필요 ${needCheck.length}건`, alert: needCheck.length > 0, to: '/expenses' },
            ].map((it, i) => (
              <div key={it.label} style={{ paddingLeft: i ? 16 : 0, borderLeft: i ? '1px solid var(--line)' : 'none' }}>
                <div className="muted">{it.label}</div>
                <div className="tnum" style={{ fontSize: 18, fontWeight: 700, color: it.alert ? 'var(--bad)' : 'var(--text)' }}>
                  {it.to ? <Link to={it.to} style={{ color: 'inherit' }}>{it.value}</Link> : it.value}
                </div>
                <div className="muted">{it.sub}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="card" style={{ marginBottom: 0 }}>
          <MiniCalendar schedules={schedules} expenses={expenses} />
        </section>
      </div>

      {/* 2. 오늘 할 일 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(260px, 1fr)', gap: 20 }} className="dash-top">
        <section>
          <div className="section-title">
            <h3>챙길 것 <span className="tnum" style={{ color: 'var(--bad)' }}>{todoCount || ''}</span></h3>
            <span className="muted">AI가 알려 준 할 일. 끝내면 체크하세요.</span>
          </div>
          <div className="card" style={{ padding: '4px 20px', marginBottom: 0 }}>
            {withTodos.length === 0 ? (
              <p className="muted" style={{ padding: '12px 0' }}>남은 할 일이 없습니다.</p>
            ) : (
              withTodos.slice(0, 5).map((exp, i) => (
                <div key={exp.id} style={{ padding: '12px 0', borderTop: i ? '1px solid var(--line)' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <Link to={`/expenses/${exp.id}`} style={{ color: 'var(--text)', fontWeight: 500 }}>
                      <StatusBadge status={exp.ai_status} /> {exp.event_name} · {exp.description}
                    </Link>
                    <span className="tnum muted" style={{ whiteSpace: 'nowrap' }}>{exp.amount.toLocaleString()}원</span>
                  </div>
                  <div style={{ marginTop: 6, paddingLeft: 14, display: 'grid', gap: 4 }}>
                    <TodoList expense={exp} onChanged={load} showDone={false} />
                  </div>
                </div>
              ))
            )}
            {withTodos.length > 5 && <p className="muted" style={{ paddingBottom: 8 }}>외 {withTodos.length - 5}건은 지출 목록에서 확인하세요.</p>}
          </div>
        </section>

        <section>
          <div className="section-title">
            <h3>다가오는 일정</h3>
            <Link to="/calendar" className="muted">전체</Link>
          </div>
          <div className="card" style={{ padding: '4px 16px', marginBottom: 0 }}>
            {upcoming.length === 0 ? (
              <p className="muted" style={{ padding: '12px 0' }}>예정된 일정이 없습니다.</p>
            ) : (
              upcoming.map((sc, i) => (
                <div key={sc.id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderTop: i ? '1px solid var(--line)' : 'none' }}>
                  <div style={{ minWidth: 40, textAlign: 'center' }}>
                    <div className="muted">{Number(sc.date.slice(5, 7))}월</div>
                    <div className="tnum" style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.1 }}>{Number(sc.date.slice(8))}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: KIND_COLORS[sc.kind] }}>{sc.kind}</div>
                    <div>{sc.title}</div>
                  </div>
                </div>
              ))
            )}
          </div>
          <p className="muted" style={{ marginTop: 10 }}>
            AI 점검: 문제 없음 {countOf('적합')} · 확인 필요 {countOf('주의')} · 조치 필요 {countOf('위반')}
          </p>
        </section>
      </div>

      {/* 3. 흐름: 월별 지출, 사업별 예산 집행 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
        <section>
          <h3>월별 지출</h3>
          <div className="card"><MonthBars rows={byMonth(expenses)} /></div>
        </section>
        <section>
          <div className="section-title">
            <h3>사업별 예산 집행{budgetTerm && <span className="muted" style={{ fontWeight: 400 }}> · {budgetTerm.name}</span>}</h3>
            <Link to="/budget" className="muted">예산·결산</Link>
          </div>
          <div className="card"><BudgetBars rows={budgetRows.slice(0, 7)} /></div>
        </section>
      </div>

      {/* 4. 구성: 비목별, 사업별 지출 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
        <section>
          <h3>비목별 지출</h3>
          <div className="card"><BarList rows={sumBy(expenses, 'category')} emptyText="지출이 없습니다." /></div>
        </section>
        <section>
          <h3>사업별 지출</h3>
          <div className="card"><BarList rows={sumBy(expenses, 'event_name').slice(0, 7)} emptyText="지출이 없습니다." /></div>
        </section>
      </div>
    </div>
  )
}

export default DashboardPage
