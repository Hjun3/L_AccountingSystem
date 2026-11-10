import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, KIND_COLORS, STATUS_COLORS, STATUS_LABELS } from '../common'
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
      <h3>{title}</h3>
      <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr><th>구분</th><th>건수</th><th>합계</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td>{r.count}건</td>
              <td style={{ textAlign: 'right' }}>{r.total.toLocaleString()}원</td>
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
  const [error, setError] = useState('')

  function load() {
    Promise.all([api('/expenses'), api('/schedules'), api('/bank/summary')])
      .then(([exps, schs, bankSummary]) => {
        setExpenses(exps)
        setSchedules(schs)
        setBank(bankSummary)
      })
      .catch((e) => setError(e.message))
  }

  useEffect(load, [])

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

  return (
    <div>
      <h2>대시보드</h2>

      <p>
        총 지출 <b>{expenses.length}건</b>, <b>{total.toLocaleString()}원</b>
      </p>

      <h3>통장 현황</h3>
      {bank.balance === null ? (
        <p>
          거래내역을 불러오면 잔액이 보입니다. <Link to="/expenses/import">거래내역 불러오기</Link>
        </p>
      ) : (
        <>
          <p>
            잔액 <b style={{ fontSize: 18 }}>{bank.balance.toLocaleString()}원</b>{' '}
            <span style={{ fontSize: 12, color: 'gray' }}>({bank.as_of.replace('T', ' ').slice(0, 16)} 거래 기준)</span>
          </p>
          <table border="1" cellPadding="4" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr><th>월</th><th>입금</th><th>출금</th></tr>
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
        </>
      )}

      <h3>다가오는 일정</h3>
      {upcoming.length === 0 ? (
        <p>예정된 일정이 없습니다. <Link to="/calendar">캘린더에서 추가</Link></p>
      ) : (
        <ul>
          {upcoming.map((s) => (
            <li key={s.id}>
              {s.date} <span style={{ color: KIND_COLORS[s.kind] }}>[{s.kind}]</span> {s.title}
            </li>
          ))}
        </ul>
      )}

      <h3>챙길 것 ({todoCount}개)</h3>
      {withTodos.length === 0 ? (
        <p style={{ color: 'gray' }}>남은 할 일이 없습니다.</p>
      ) : (
        withTodos.map((exp) => (
          <div key={exp.id} style={{ marginBottom: 6 }}>
            <Link to={`/expenses/${exp.id}`}>
              {exp.date} {exp.event_name} - {exp.description}
            </Link>
            <div style={{ paddingLeft: 12 }}>
              <TodoList expense={exp} onChanged={load} showDone={false} />
            </div>
          </div>
        ))
      )}

      <h3>AI 점검 결과</h3>
      <div style={{ display: 'flex', gap: 24, fontSize: 18 }}>
        {['적합', '주의', '위반'].map((s) => (
          <span key={s} style={{ color: STATUS_COLORS[s], fontWeight: 'bold' }}>
            {STATUS_LABELS[s]} {countOf(s)}건
          </span>
        ))}
      </div>

      <h3>총무 결정</h3>
      <p>
        결정 대기 {waiting.length}건 (그중 확인·조치 필요 <b style={{ color: 'red' }}>{needCheck.length}건</b>)
      </p>
      {needCheck.length > 0 && (
        <ul>
          {needCheck.map((exp) => (
            <li key={exp.id}>
              <span style={{ color: STATUS_COLORS[exp.ai_status] }}>[{STATUS_LABELS[exp.ai_status]}]</span>{' '}
              <Link to={`/expenses/${exp.id}`}>
                {exp.date} {exp.event_name} - {exp.description}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
        <SummaryTable title="사업별 지출" rows={sumBy(expenses, 'event_name')} />
        <SummaryTable title="비목별 지출" rows={sumBy(expenses, 'category')} />
      </div>
    </div>
  )
}

export default DashboardPage
