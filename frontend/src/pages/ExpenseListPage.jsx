import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, loadEventParents, STATUS_LABELS, termQuery, topEvent, useTerm } from '../common'
import DecisionCell from '../components/DecisionCell'
import Pager, { paginate } from '../components/Pager'
import StatusBadge from '../components/StatusBadge'

// 필터 버튼 목록: AI 점검 결과와 총무 결정 상태로 걸러 본다
const FILTERS = ['전체', '적합', '주의', '위반', '미점검', '결정 대기', '증빙 없음'] // 미점검 버튼은 해당 지출이 있을 때만 보인다

const PAGE_SIZE = 10 // 한 쪽에 보여 줄 지출 수

function matchesFilter(expense, filter) {
  if (filter === '전체') return true
  if (filter === '결정 대기') return expense.final_status === '대기'
  if (filter === '증빙 없음') return !expense.has_receipt // 감사 전에 증빙부터 챙기도록 모아 보기
  return expense.ai_status === filter
}

// 지출 목록 페이지: 점검 결과를 보고 바로 확정할 수 있다 (확인·조치 필요 지출은 메모를 남기고 확정)
function ExpenseListPage() {
  const [expenses, setExpenses] = useState([])
  const [filter, setFilterState] = useState('전체')
  const [error, setError] = useState('')
  const { termId } = useTerm() // 위 메뉴에서 고른 임기
  const [page, setPage] = useState(1)
  const navigate = useNavigate()
  // 캘린더 일정의 [이동]으로 오면 주소에 사업명이 붙는다 (예: /expenses?event=일일호프)
  const [searchParams, setSearchParams] = useSearchParams()
  const eventFilter = searchParams.get('event')
  // 대시보드에서 '증빙 없음'처럼 필터를 정해서 오면 주소의 ?filter= 를 따른다
  const urlFilter = searchParams.get('filter')
  useEffect(() => {
    if (urlFilter && FILTERS.includes(urlFilter)) setFilterState(urlFilter)
  }, [urlFilter])
  function setFilter(f) {
    setFilterState(f)
    if (urlFilter) {
      searchParams.delete('filter')
      setSearchParams(searchParams)
    }
  }
  const [parents, setParents] = useState({}) // 사업 묶음: 상위 사업으로 거르면 하위 사업 지출도 함께 보인다
  useEffect(() => {
    loadEventParents().then(setParents).catch(() => {})
  }, [])

  async function loadExpenses() {
    try {
      setExpenses(await api('/expenses' + termQuery(termId)))
    } catch (e) {
      setError(e.message)
    }
  }

  // 화면이 처음 열릴 때 한 번 목록을 불러온다
  useEffect(() => {
    loadExpenses()
  }, [termId]) // 임기를 바꾸면 다시 불러온다

  // 필터나 임기를 바꾸면 첫 쪽으로
  useEffect(() => setPage(1), [filter, termId, eventFilter])

  const inEvent = expenses.filter((exp) => !eventFilter || exp.event_name === eventFilter || topEvent(exp.event_name, parents) === eventFilter)
  const shown = inEvent.filter((exp) => matchesFilter(exp, filter))

  const sum = shown.reduce((n, exp) => n + exp.amount, 0)
  const { rows: pageRows, count: pageCount, current } = paginate(shown, page, PAGE_SIZE)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ marginBottom: 6 }}>지출 목록</h2>
        <span className="muted">AI 점검은 참고용이며 최종 판단은 총무가 합니다. 점검 기준: 총학생회칙 + 추정 관행(대의원회 세칙 받기 전)</span>
      </div>
      {error && <p style={{ color: 'var(--bad)' }}>{error}</p>}

      <div style={{ display: 'flex', gap: 4, margin: '12px 0', flexWrap: 'wrap', alignItems: 'center' }}>
        {FILTERS.filter((f) => f !== '미점검' || expenses.some((exp) => exp.ai_status === '미점검')).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={f === filter ? 'active' : ''}>
            {STATUS_LABELS[f] || f} {inEvent.filter((exp) => matchesFilter(exp, f)).length}
          </button>
        ))}
        {eventFilter && (
          <button className="active" onClick={() => setSearchParams({})} title="사업 거르기 풀기">사업: {eventFilter} ×</button>
        )}
        <span className="muted" style={{ marginLeft: 'auto' }}>
          {shown.length}건 · <span className="num">{sum.toLocaleString()}원</span>
        </span>
      </div>

      <div className="table-box">
        <table>
          <thead>
            <tr>
              <th>날짜</th>
              <th>사업 · 항목</th>
              <th>내용</th>
              <th className="num">금액</th>
              <th>증빙</th>
              <th>AI 점검 · 근거</th>
              <th className="num">챙길 것</th>
              <th>총무 결정</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((exp) => {
              const todosLeft = exp.ai_todos.filter((t) => !t.done).length
              return (
                // 줄 아무 곳이나 누르면 상세 페이지로 (총무 결정 칸은 제외)
                <tr key={exp.id} onClick={() => navigate(`/expenses/${exp.id}`)} style={{ cursor: 'pointer' }}>
                  <td className="tnum" style={{ whiteSpace: 'nowrap' }}>{exp.date.slice(2).replaceAll('-', '.')}</td>
                  <td style={{ minWidth: 110 }}>
                    <div>{exp.event_name}</div>
                    <div className="muted">{exp.category}</div>
                  </td>
                  <td style={{ minWidth: 200 }}>
                    {exp.description}
                  </td>
                  <td className="num" style={{ fontWeight: 600 }}>{exp.amount.toLocaleString()}</td>
                  <td style={{ color: exp.has_receipt ? 'var(--sub)' : 'var(--bad)', whiteSpace: 'nowrap' }}>
                    {exp.has_receipt ? '있음' : '없음'}
                  </td>
                  <td style={{ minWidth: 200 }}>
                    <StatusBadge status={exp.ai_status} />
                    <div className="muted" style={{ marginTop: 2 }}>{exp.ai_clause}</div>
                    <div style={{ fontSize: 12, color: 'var(--sub)' }}>{exp.ai_reason}</div>
                  </td>
                  <td className="num" style={{ color: todosLeft ? 'var(--bad)' : 'var(--muted)' }}>{todosLeft || '-'}</td>
                  <td onClick={(e) => e.stopPropagation()} style={{ cursor: 'default' }}>
                    <DecisionCell key={exp.id + exp.final_status} expense={exp} onSaved={loadExpenses} compact />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {shown.length === 0 && <p className="muted" style={{ padding: 16 }}>{eventFilter ? `'${eventFilter}' 사업으로 등록된 지출이 없습니다.` : '해당하는 지출이 없습니다.'}</p>}
      </div>
      <Pager page={current} count={pageCount} onChange={(p) => { setPage(p); window.scrollTo(0, 0) }} />
    </div>
  )
}

export default ExpenseListPage
