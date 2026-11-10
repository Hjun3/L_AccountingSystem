import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, canEdit, KIND_COLORS, STATUS_COLORS, STATUS_LABELS, termQuery, useTerm, useUser } from '../common'
import { BarList, BudgetBars, MonthBars } from '../components/Charts'
import MiniCalendar from '../components/MiniCalendar'
import StatusBadge from '../components/StatusBadge'
import DashboardTodos from '../components/DashboardTodos'

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

// 지출을 월별로 합친다. 빈 달도 0으로 채운다.
// 임기를 골랐으면 임기의 첫 달~마지막 달, 아니면 첫 지출 달~마지막 지출 달
function byMonth(expenses, term) {
  const totals = {}
  for (const e of expenses) totals[e.date.slice(0, 7)] = (totals[e.date.slice(0, 7)] || 0) + e.amount
  const months = Object.keys(totals).sort()
  if (term?.start_date) months.unshift(term.start_date.slice(0, 7)), months.push(term.end_date.slice(0, 7))
  if (months.length === 0) return []
  months.sort()
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
  const user = useUser()
  const [groupBy, setGroupBy] = useState('event_name') // 지출 구성: 사업별(event_name, 기본) / 항목별(category)
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
  // 결정 대기: 확인·조치 필요를 먼저, 그다음 날짜 오래된 순
  const waitingSorted = [...needCheck, ...waiting.filter((exp) => !needCheck.includes(exp))]
  const selectedTerm = terms.find((t) => t.id === termId) // '전체 임기'면 없음

  return (
    <div>
      {/* 1. 잔액·요약 + 달력 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(260px, 1fr)', gap: 20, marginBottom: 8 }} className="dash-top">
        <section className="card" style={{ marginBottom: 0, display: 'flex', flexDirection: 'column' }}>
          {/* 윗줄: 잔액 + 오른쪽 위 바로가기 버튼 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div className="muted">통장 잔액{bank.as_of && ` · ${bank.as_of.slice(0, 10)} 거래 기준`}</div>
              {bank.balance === null ? (
                <p style={{ fontSize: 15 }}>거래내역을 불러오면 잔액이 보입니다.</p>
              ) : (
                <div className="tnum" style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.02em' }}>
                  {bank.balance.toLocaleString()}<span style={{ fontSize: 20, fontWeight: 600 }}>원</span>
                </div>
              )}
            </div>
            {canEdit(user) && (
              <div style={{ display: 'flex', gap: 6 }}>
                <Link to="/expenses/new" className="btn primary">+ 지출 등록</Link>
                <Link to="/expenses/import" className="btn">거래내역 불러오기</Link>
              </div>
            )}
          </div>
          {/* 가운데: 왼쪽 최근 입출금, 오른쪽 예산 사용 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px 40px', marginTop: 16 }}>
            {/* 최근 3개월 입출금 (통장 기준). 오래된 달부터 */}
            {bank.months.length > 0 && (
            <div className="tnum" style={{ display: 'grid', gridTemplateColumns: `auto repeat(${bank.months.length}, auto)`, justifyContent: 'start', columnGap: 28, rowGap: 4, fontSize: 13 }}>
              <span className="muted" style={{ whiteSpace: 'nowrap' }}>최근 입출금</span>
              {[...bank.months].reverse().map((m) => <span key={m.month} className="muted" style={{ textAlign: 'right' }}>{Number(m.month.slice(5))}월</span>)}
              {[['입금', 'deposit', '+'], ['출금', 'withdraw', '−']].map(([label, key, sign]) => [
                <span key={key} className="muted">{label}</span>,
                ...[...bank.months].reverse().map((m) => (
                  <b key={key + m.month} style={{ textAlign: 'right' }}>{m[key] ? `${sign}${m[key].toLocaleString()}` : '-'}</b>
                )),
              ])}
            </div>
            )}
            {/* 예산 사용: 임기 예산 대비 지출 */}
            <div style={{ flex: 1, minWidth: 220, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="muted">{budgetTerm ? `${budgetTerm.name} 예산 사용` : '예산 사용'}</span>
                <Link to="/budget" className="muted">예산·결산</Link>
              </div>
              {budgetTotal ? (
                <>
                  <div className="tnum" style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
                    <b style={{ fontSize: 22, color: total > budgetTotal ? 'var(--bad)' : 'var(--text)' }}>{Math.round((total / budgetTotal) * 100)}%</b>
                    <span className="muted">{total.toLocaleString()} / {budgetTotal.toLocaleString()}원</span>
                  </div>
                  <div style={{ height: 8, background: 'var(--line)', borderRadius: 4, marginTop: 6 }}>
                    <div style={{ width: `${Math.min((total / budgetTotal) * 100, 100)}%`, height: '100%', borderRadius: 4, background: total > budgetTotal ? 'var(--bad)' : 'var(--primary)' }} />
                  </div>
                  <div className="muted tnum" style={{ marginTop: 6 }}>
                    {total > budgetTotal ? `${(total - budgetTotal).toLocaleString()}원 초과` : `남은 예산 ${(budgetTotal - total).toLocaleString()}원`}
                  </div>
                </>
              ) : (
                <p className="muted" style={{ marginTop: 4 }}>예산을 등록하면 사용률이 보입니다.</p>
              )}
            </div>
          </div>
          {/* 요약 3개: 같은 모양 카드 대신 한 줄에 구분선으로 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 'auto', paddingTop: 18, borderTop: '1px solid var(--line)' }}>
            {[
              { label: budgetTerm ? `${budgetTerm.name} 지출` : '지출', value: `${total.toLocaleString()}원`, sub: `${expenses.length}건` },
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
        <section style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="section-title">
            <h3>챙길 것 <span className="tnum" style={{ color: 'var(--bad)' }}>{todoCount || ''}</span></h3>
            {/* 점 색 설명 */}
            <span className="muted" style={{ display: 'flex', gap: 10 }}>
              {['위반', '주의', '적합'].map((st) => (
                <span key={st}><span style={{ color: STATUS_COLORS[st] }}>●</span> {STATUS_LABELS[st]}</span>
              ))}
            </span>
          </div>
          {/* 카드 높이는 오른쪽 칸에 맞추고, 넘치면 카드 안에서 스크롤한다 */}
          <div className="card" style={{ padding: 0, marginBottom: 0, flex: 1, position: 'relative', minHeight: 320 }}>
            <div style={{ position: 'absolute', inset: 0 }}>
              <DashboardTodos expenses={expenses} onChanged={load} />
            </div>
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

          <div className="section-title" style={{ marginTop: 20 }}>
            <h3>결정 기다리는 지출 <span className="tnum muted" style={{ fontWeight: 400 }}>{waitingSorted.length || ''}</span></h3>
            <Link to="/expenses" className="muted">지출 목록</Link>
          </div>
          <div className="card" style={{ padding: '4px 16px', marginBottom: 0 }}>
            {waitingSorted.length === 0 ? (
              <p className="muted" style={{ padding: '12px 0' }}>모두 확정했습니다.</p>
            ) : (
              waitingSorted.slice(0, 4).map((exp, i) => (
                <Link key={exp.id} to={`/expenses/${exp.id}`} style={{ display: 'flex', gap: 8, padding: '10px 0', borderTop: i ? '1px solid var(--line)' : 'none', color: 'var(--text)' }}>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    <StatusBadge status={exp.ai_status} /> {exp.event_name} · {exp.description}
                  </span>
                  <span className="tnum muted" style={{ whiteSpace: 'nowrap' }}>{exp.amount.toLocaleString()}원</span>
                </Link>
              ))
            )}
          </div>
          <p className="muted" style={{ marginTop: 10 }}>
            AI 점검: 문제 없음 {countOf('적합')} · 확인 필요 {countOf('주의')} · 조치 필요 {countOf('위반')}
          </p>
        </section>
      </div>

      {/* 3. 예산 집행과 지출 구성: 같은 높이의 두 칸 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginTop: 12 }}>
        <section style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="section-title">
            <h3>사업별 예산 집행{budgetTerm && <span className="muted" style={{ fontWeight: 400 }}> · {budgetTerm.name}</span>}</h3>
            <Link to="/budget" className="muted">예산·결산</Link>
          </div>
          <div className="card" style={{ flex: 1, marginBottom: 0 }}><BudgetBars rows={budgetRows.slice(0, 7)} /></div>
        </section>
        <section style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="section-title">
            <h3>지출 구성</h3>
            {/* 항목별 / 사업별 전환 */}
            <div style={{ display: 'flex', gap: 4 }}>
              {[['event_name', '사업별'], ['category', '항목별']].map(([key, label]) => (
                <button key={key} onClick={() => setGroupBy(key)} className={groupBy === key ? 'active' : ''} style={{ fontSize: 12, padding: '0 10px' }}>{label}</button>
              ))}
            </div>
          </div>
          <div className="card" style={{ flex: 1, marginBottom: 0 }}>
            <BarList rows={sumBy(expenses, groupBy).slice(0, 7)} emptyText="지출이 없습니다." />
          </div>
        </section>
      </div>

      {/* 4. 월별 지출: 임기 전체 달을 한 줄로 */}
      <section style={{ marginTop: 20 }}>
        <h3>월별 지출{selectedTerm && <span className="muted" style={{ fontWeight: 400 }}> · {selectedTerm.name}</span>}</h3>
        <div className="card"><MonthBars rows={byMonth(expenses, selectedTerm)} /></div>
      </section>
    </div>
  )
}

export default DashboardPage
