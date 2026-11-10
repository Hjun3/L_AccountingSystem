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
    <div>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <table>
        <thead>
          <tr><th>구분</th><th>건수</th><th>합계</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td>{r.count}건</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{r.total.toLocaleString()}원</td>
            </tr>
          ))}
        </tbody>
      </table>
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

  if (error) return <p style={{ color: 'red' }}>{error}</p>
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

  // 맨 위 숫자 카드 4개
  const stats = [
    { label: '총 지출', value: `${total.toLocaleString()}원`, sub: `${expenses.length}건` },
    { label: '통장 잔액', value: bank.balance === null ? '-' : `${bank.balance.toLocaleString()}원`, sub: bank.as_of ? `${bank.as_of.slice(0, 10)} 기준` : '거래내역을 불러오세요' },
    { label: '챙길 것', value: `${todoCount}개`, sub: `${withTodos.length}건의 지출`, alert: todoCount > 0 },
    { label: '결정 대기', value: `${waiting.length}건`, sub: `확인·조치 필요 ${needCheck.length}건`, alert: needCheck.length > 0 },
  ]

  return (
    <div>
      <h2>대시보드</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
        {stats.map((st) => (
          <div key={st.label} className="card" style={{ marginBottom: 0 }}>
            <div className="muted">{st.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: st.alert ? 'var(--danger)' : 'inherit' }}>{st.value}</div>
            <div className="muted">{st.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>챙길 것 ({todoCount}개)</h3>
          {withTodos.length === 0 ? (
            <p className="muted">남은 할 일이 없습니다.</p>
          ) : (
            withTodos.map((exp) => (
              <div key={exp.id} style={{ marginBottom: 10 }}>
                <StatusBadge status={exp.ai_status} />{' '}
                <Link to={`/expenses/${exp.id}`}>
                  {exp.date} {exp.event_name} - {exp.description}
                </Link>
                <div style={{ paddingLeft: 12 }}>
                  <TodoList expense={exp} onChanged={load} showDone={false} />
                </div>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>결정 대기 중 확인·조치 필요 ({needCheck.length}건)</h3>
          {needCheck.length === 0 ? (
            <p className="muted">확인이 필요한 지출이 없습니다.</p>
          ) : (
            <ul style={{ paddingLeft: 18, margin: 0 }}>
              {needCheck.map((exp) => (
                <li key={exp.id} style={{ marginBottom: 4 }}>
                  <StatusBadge status={exp.ai_status} />{' '}
                  <Link to={`/expenses/${exp.id}`}>
                    {exp.date} {exp.event_name} - {exp.description}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <h3>AI 점검 결과</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['적합', '주의', '위반'].map((st) => (
              <span key={st}>
                <StatusBadge status={st} /> {countOf(st)}건
              </span>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>다가오는 일정</h3>
          {upcoming.length === 0 ? (
            <p className="muted">예정된 일정이 없습니다. <Link to="/calendar">캘린더에서 추가</Link></p>
          ) : (
            <ul style={{ paddingLeft: 18, margin: 0 }}>
              {upcoming.map((sc) => (
                <li key={sc.id}>
                  {sc.date} <span style={{ color: KIND_COLORS[sc.kind] }}>[{sc.kind}]</span> {sc.title}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>월별 입출금 (통장)</h3>
          {bank.balance === null ? (
            <p className="muted">
              거래내역을 불러오면 보입니다. <Link to="/expenses/import">거래내역 불러오기</Link>
            </p>
          ) : (
            <table style={{ width: '100%' }}>
              <thead>
                <tr><th>월</th><th style={{ textAlign: 'right' }}>입금</th><th style={{ textAlign: 'right' }}>출금</th></tr>
              </thead>
              <tbody>
                {bank.months.map((m) => (
                  <tr key={m.month}>
                    <td>{m.month}</td>
                    <td style={{ textAlign: 'right', color: 'steelblue' }}>{m.deposit.toLocaleString()}원</td>
                    <td style={{ textAlign: 'right', color: 'crimson' }}>{m.withdraw.toLocaleString()}원</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card" style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
        <SummaryTable title="사업별 지출" rows={sumBy(expenses, 'event_name')} />
        <SummaryTable title="비목별 지출" rows={sumBy(expenses, 'category')} />
      </div>
    </div>
  )
}

export default DashboardPage
