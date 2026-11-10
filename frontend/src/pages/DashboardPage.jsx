import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, KIND_COLORS, termQuery, useTerm } from '../common'
import StatusBadge from '../components/StatusBadge'
import TodoList from '../components/TodoList'

// 지출 목록을 기준(사업명, 비목 등)별로 묶어 금액 합계와 건수를 구한다
// 예: sumBy(expenses, 'category') -> [{ name: '급량비', total: 530000, count: 2 }, ...]
function sumBy(expenses, key) {
  const groups = {}
  for (const exp of expenses) {
    const name = exp[key]
    if (!groups[name]) groups[name] = { name, total: 0, count: 0 }
    groups[name].total += exp.amount
    groups[name].count += 1
  }
  return Object.values(groups).sort((a, b) => b.total - a.total) // 금액 큰 순서
}

function SummaryTable({ title, rows }) {
  return (
    <div style={{ flex: 1, minWidth: 260 }}>
      <h3>{title}</h3>
      <div className="table-box">
        <table>
          <thead>
            <tr><th>구분</th><th className="num">건수</th><th className="num">합계</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td className="num">{r.count}건</td>
                <td className="num">{r.total.toLocaleString()}원</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// 대시보드: 전체 지출 현황과 AI 점검/총무 결정 상황을 한눈에 요약
function DashboardPage() {
  const [expenses, setExpenses] = useState(null)
  const [schedules, setSchedules] = useState([])
  const [bank, setBank] = useState(null) // 통장 현황 (불러온 거래내역 기준)
  const { termId } = useTerm() // 위 메뉴에서 고른 임기
  const [error, setError] = useState('')

  function load() {
    Promise.all([api('/expenses' + termQuery(termId)), api('/schedules'), api('/bank/summary' + termQuery(termId))])
      .then(([exps, schs, bankSummary]) => {
        setExpenses(exps)
        setSchedules(schs)
        setBank(bankSummary)
      })
      .catch((e) => setError(e.message))
  }

  useEffect(load, [termId]) // 임기를 바꾸면 다시 불러온다

  if (error) return <p style={{ color: 'var(--bad)' }}>{error}</p>
  if (!expenses) return <p>불러오는 중...</p>

  const total = expenses.reduce((sum, exp) => sum + exp.amount, 0)
  const countOf = (status) => expenses.filter((exp) => exp.ai_status === status).length
  const waiting = expenses.filter((exp) => exp.final_status === '대기')
  // 주의/위반인데 아직 총무가 결정하지 않은 건: 감사 전에 먼저 봐야 할 것
  const needCheck = waiting.filter((exp) => exp.ai_status === '주의' || exp.ai_status === '위반')
  // 아직 끝내지 않은 '챙길 것'이 있는 지출
  const withTodos = expenses.filter((exp) => exp.ai_todos.some((t) => !t.done))
  const todoCount = withTodos.reduce((n, exp) => n + exp.ai_todos.filter((t) => !t.done).length, 0)
  // 오늘 이후 일정 중 가까운 5개 (날짜 문자열은 'YYYY-MM-DD'라 글자 비교로 날짜 비교가 됨)
  const todayString = new Date().toLocaleDateString('sv') // 'sv' 형식이 YYYY-MM-DD
  const upcoming = schedules.filter((s) => s.date >= todayString).slice(0, 5)

  return (
    <div className="narrow" style={{ maxWidth: 900 }}>
      {/* 맨 위: 통장 잔액을 크게, 나머지는 한 줄 요약 */}
      <section style={{ marginBottom: 32 }}>
        <div className="muted">통장 잔액{bank.as_of && ` · ${bank.as_of.slice(0, 10)} 거래 기준`}</div>
        {bank.balance === null ? (
          <p style={{ fontSize: 15 }}>
            거래내역을 불러오면 잔액이 보입니다. <Link to="/expenses/import">거래내역 불러오기</Link>
          </p>
        ) : (
          <div className="tnum" style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.02em' }}>
            {bank.balance.toLocaleString()}<span style={{ fontSize: 20, fontWeight: 600 }}>원</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 10, fontSize: 14, color: 'var(--sub)' }}>
          <span>
            지출 <b style={{ color: 'var(--text)' }}>{total.toLocaleString()}원</b> ({expenses.length}건)
          </span>
          <span>
            챙길 것 <b style={{ color: todoCount ? 'var(--bad)' : 'var(--text)' }}>{todoCount}개</b>
          </span>
          <Link to="/expenses" style={{ color: 'inherit' }}>
            결정 대기 <b style={{ color: 'var(--text)' }}>{waiting.length}건</b>
            {needCheck.length > 0 && <span style={{ color: 'var(--bad)' }}> (확인·조치 필요 {needCheck.length})</span>}
          </Link>
        </div>
      </section>

      {/* 오늘 할 일: 챙길 것 */}
      <section>
        <div className="section-title">
          <h3>챙길 것</h3>
          <span className="muted">AI가 알려 준 할 일. 끝내면 체크하세요.</span>
        </div>
        <div className="card" style={{ padding: '6px 20px' }}>
          {withTodos.length === 0 ? (
            <p className="muted" style={{ padding: '10px 0' }}>남은 할 일이 없습니다.</p>
          ) : (
            withTodos.map((exp, i) => (
              <div key={exp.id} style={{ padding: '12px 0', borderTop: i ? '1px solid var(--line)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <Link to={`/expenses/${exp.id}`} style={{ color: 'var(--text)', fontWeight: 500 }}>
                    {exp.event_name} · {exp.description}
                  </Link>
                  <span className="tnum muted" style={{ whiteSpace: 'nowrap' }}>{exp.date} · {exp.amount.toLocaleString()}원</span>
                </div>
                <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
                  <TodoList expense={exp} onChanged={load} showDone={false} />
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {/* 확인·조치 필요 */}
        <section style={{ flex: 1, minWidth: 280 }}>
          <div className="section-title"><h3>확인·조치가 필요한 지출</h3></div>
          {needCheck.length === 0 ? (
            <p className="muted">없습니다.</p>
          ) : (
            needCheck.map((exp) => (
              <div key={exp.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <StatusBadge status={exp.ai_status} />
                <div>
                  <Link to={`/expenses/${exp.id}`}>{exp.event_name} · {exp.description}</Link>
                </div>
              </div>
            ))
          )}
          <p className="muted" style={{ marginTop: 10 }}>
            AI 점검 전체: 문제 없음 {countOf('적합')} · 확인 필요 {countOf('주의')} · 조치 필요 {countOf('위반')}
          </p>
        </section>

        {/* 다가오는 일정 */}
        <section style={{ flex: 1, minWidth: 260 }}>
          <div className="section-title">
            <h3>다가오는 일정</h3>
            <Link to="/calendar" className="muted">캘린더</Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="muted">예정된 일정이 없습니다.</p>
          ) : (
            upcoming.map((sc) => (
              <div key={sc.id} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <span className="tnum muted" style={{ minWidth: 44, paddingTop: 2 }}>{sc.date.slice(5).replace('-', '.')}</span>
                <span>
                  <span style={{ color: KIND_COLORS[sc.kind], fontSize: 12, fontWeight: 600 }}>{sc.kind}</span> {sc.title}
                </span>
              </div>
            ))
          )}
        </section>
      </div>

      {/* 월별 입출금 */}
      {bank.balance !== null && (
        <section>
          <h3>월별 입출금 (통장)</h3>
          <div className="table-box">
            <table>
              <thead>
                <tr><th>월</th><th className="num">입금</th><th className="num">출금</th></tr>
              </thead>
              <tbody>
                {bank.months.map((m) => (
                  <tr key={m.month}>
                    <td>{m.month}</td>
                    <td className="num">{m.deposit.toLocaleString()}원</td>
                    <td className="num">−{m.withdraw.toLocaleString()}원</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <SummaryTable title="사업별 지출" rows={sumBy(expenses, 'event_name')} />
        <SummaryTable title="비목별 지출" rows={sumBy(expenses, 'category')} />
      </div>
    </div>
  )
}

export default DashboardPage
