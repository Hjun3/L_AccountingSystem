import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, KIND_COLORS, STATUS_COLORS } from '../common'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

// 숫자 연/월/일을 '2026-03-05' 형식 문자열로 만든다 (DB에 저장된 날짜와 같은 형식)
function toDateString(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// 달력에 그릴 칸 목록을 만든다. 1일 앞의 빈칸은 null로 채운다.
// 예: 1일이 수요일이면 [null, null, null, '…-01', '…-02', …]
function buildMonthCells(year, month) {
  const firstWeekday = new Date(year, month, 1).getDay() // 0=일요일
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = Array(firstWeekday).fill(null)
  for (let day = 1; day <= daysInMonth; day++) cells.push(toDateString(year, month, day))
  return cells
}

// 캘린더 페이지: 지출(점검 결과 색)과 일정(사업/감사/기타)을 날짜별로 보여주고, 일정을 등록/삭제한다
function CalendarPage() {
  const today = new Date()
  // 보고 있는 달은 주소에 저장한다 (예: /calendar?month=2026-04)
  // 그래야 지출 상세에 갔다가 뒤로 가기를 눌러도 같은 달로 돌아온다
  const [searchParams, setSearchParams] = useSearchParams()
  const monthParam = searchParams.get('month') // 없으면 이번 달
  const year = monthParam ? Number(monthParam.slice(0, 4)) : today.getFullYear()
  const month = monthParam ? Number(monthParam.slice(5, 7)) - 1 : today.getMonth() // 0=1월
  const [expenses, setExpenses] = useState([])
  const [schedules, setSchedules] = useState([])
  const [form, setForm] = useState({ date: toDateString(year, month, today.getDate()), kind: '사업', title: '', memo: '' })
  const [error, setError] = useState('')

  async function loadAll() {
    try {
      const [exps, schs] = await Promise.all([api('/expenses'), api('/schedules')])
      setExpenses(exps)
      setSchedules(schs)
    } catch (e) {
      setError(e.message)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  // 이전/다음 달로 이동 (12월 다음은 다음 해 1월)
  function moveMonth(diff) {
    const d = new Date(year, month + diff, 1)
    setSearchParams({ month: toDateString(d.getFullYear(), d.getMonth(), 1).slice(0, 7) })
  }

  async function addSchedule(e) {
    e.preventDefault()
    setError('')
    try {
      await api('/schedules', { method: 'POST', body: JSON.stringify(form) })
      setForm({ ...form, title: '', memo: '' })
      loadAll()
    } catch (e) {
      setError(e.message)
    }
  }

  async function deleteSchedule(schedule) {
    if (!window.confirm(`'${schedule.title}' 일정을 삭제할까요?`)) return
    try {
      await api(`/schedules/${schedule.id}`, { method: 'DELETE' })
      loadAll()
    } catch (e) {
      setError(e.message)
    }
  }

  const cells = buildMonthCells(year, month)
  const todayString = toDateString(today.getFullYear(), today.getMonth(), today.getDate())

  return (
    <div>
      <h2>캘린더</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
        <button onClick={() => moveMonth(-1)}>◀ 이전 달</button>
        <b style={{ fontSize: 18 }}>{year}년 {month + 1}월</b>
        <button onClick={() => moveMonth(1)}>다음 달 ▶</button>
        <span style={{ fontSize: 12, color: 'gray' }}>
          날짜를 누르면 아래 일정 등록 날짜로 들어갑니다.
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', border: '1px solid lightgray' }}>
        {WEEKDAYS.map((w) => (
          <div key={w} style={{ textAlign: 'center', fontWeight: 'bold', padding: 4, background: '#f3f3f3' }}>{w}</div>
        ))}
        {cells.map((date, i) => (
          <div
            key={i}
            onClick={() => date && setForm({ ...form, date })}
            style={{
              minHeight: 90,
              border: '1px solid #eee',
              padding: 4,
              fontSize: 12,
              cursor: date ? 'pointer' : 'default',
              background: date === form.date ? '#fffbe0' : 'white',
            }}
          >
            {date && (
              <>
                <div style={{ fontWeight: date === todayString ? 'bold' : 'normal' }}>{Number(date.slice(8))}</div>
                {schedules.filter((s) => s.date === date).map((s) => (
                  <div key={'s' + s.id} style={{ color: KIND_COLORS[s.kind] }} title={s.memo}>
                    [{s.kind}] {s.title}{' '}
                    <button
                      onClick={(e) => {
                        e.stopPropagation() // 삭제 버튼을 눌러도 날짜 선택은 되지 않게
                        deleteSchedule(s)
                      }}
                      style={{ fontSize: 10, padding: '0 3px' }}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {expenses.filter((exp) => exp.date === date).map((exp) => (
                  <div key={'e' + exp.id}>
                    <Link
                      to={`/expenses/${exp.id}`}
                      onClick={(e) => e.stopPropagation()}
                      style={{ color: STATUS_COLORS[exp.ai_status] }}
                    >
                      ● {exp.event_name} {exp.amount.toLocaleString()}원
                    </Link>
                  </div>
                ))}
              </>
            )}
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, color: 'gray' }}>
        ● 지출 (색: <span style={{ color: STATUS_COLORS['적합'] }}>적합</span> /{' '}
        <span style={{ color: STATUS_COLORS['주의'] }}>주의</span> /{' '}
        <span style={{ color: STATUS_COLORS['위반'] }}>위반</span>) · [사업] [감사] [기타] 일정
      </p>

      <h3>일정 등록</h3>
      <form onSubmit={addSchedule} style={{ display: 'grid', gap: 8, maxWidth: 400 }}>
        <label>
          날짜 <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        </label>
        <label>
          종류{' '}
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            <option>사업</option>
            <option>감사</option>
            <option>기타</option>
          </select>
        </label>
        <label>
          제목 <input placeholder="예: 1학기 정기감사 자료 제출 마감" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        </label>
        <label>
          메모 <input value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
        </label>
        <button type="submit">일정 추가</button>
      </form>
    </div>
  )
}

export default CalendarPage
