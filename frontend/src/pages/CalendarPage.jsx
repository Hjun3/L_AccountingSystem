import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, KIND_COLORS, scheduleDays, scheduleOn, STATUS_COLORS, STATUS_LABELS } from '../common'

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
  const [form, setForm] = useState({ date: toDateString(year, month, today.getDate()), end_date: '', kind: '사업', title: '', memo: '' })
  const navigate = useNavigate()
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
      setForm({ ...form, end_date: '', title: '', memo: '' })
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

  // 고른 날짜(일정 등록 날짜)의 일정·지출: 오른쪽 카드에 보여 준다
  const daySchedules = schedules.filter((sc) => scheduleOn(sc, form.date))
  const dayExpenses = expenses.filter((exp) => exp.date === form.date)
  const moveButton = { height: 24, fontSize: 12, padding: '0 8px', flexShrink: 0 }
  const deleteButton = (sc) => (
    <button
      onClick={(e) => {
        e.stopPropagation() // 삭제 버튼을 눌러도 날짜 선택은 되지 않게
        deleteSchedule(sc)
      }}
      style={{ fontSize: 11, lineHeight: 1, width: 16, height: 16, padding: 0, verticalAlign: 'middle', flexShrink: 0 }}
      title="일정 삭제"
    >
      ×
    </button>
  )

  return (
    <div>
      <h2>캘린더</h2>
      {error && <p style={{ color: 'var(--bad)' }}>{error}</p>}

      <div className="calendar-main">
        {/* 왼쪽: 달력 */}
        <section>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <button onClick={() => moveMonth(-1)} style={{ width: 32, padding: 0 }} title="이전 달">‹</button>
            <b style={{ fontSize: 18, minWidth: 120, textAlign: 'center' }}>{year}년 {month + 1}월</b>
            <button onClick={() => moveMonth(1)} style={{ width: 32, padding: 0 }} title="다음 달">›</button>
            <span className="muted" style={{ marginLeft: 'auto' }}>날짜를 누르면 오른쪽에 그날 일정·지출이 보여요</span>
          </div>

          <div className="cal-grid">
            {WEEKDAYS.map((w, i) => (
              <div key={w} className="cal-head" style={{ color: i === 0 ? 'var(--bad)' : undefined }}>{w}</div>
            ))}
            {cells.map((date, i) => (
              <div
                key={i}
                onClick={() => date && setForm({ ...form, date })}
                className={`cal-cell${date ? '' : ' empty'}${date === form.date ? ' picked' : ''}`}
              >
                {date && (
                  <>
                    <div className={date === todayString ? 'cal-today' : ''} style={{ marginBottom: 2 }}>{Number(date.slice(8))}</div>
                    {schedules.filter((sc) => scheduleOn(sc, date)).map((sc) => (
                      // 여러 날 일정은 기간 동안 매일 보이고, 띠 모양 바탕으로 이어져 보이게 한다
                      <div key={'s' + sc.id} className={`cal-item${sc.end_date ? ' multi' : ''}`} style={{ color: KIND_COLORS[sc.kind] }} title={[scheduleDays(sc), sc.memo].filter(Boolean).join(' · ')}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {sc.date === date || date.endsWith('-01') ? `[${sc.kind}] ${sc.title}` : `↳ ${sc.title}`}
                        </span>
                        {sc.date === date && deleteButton(sc)}
                      </div>
                    ))}
                    {expenses.filter((exp) => exp.date === date).map((exp) => (
                      // 칸 안에서는 표시만 한다. 이동은 오른쪽 카드의 [이동] 버튼으로
                      <div key={'e' + exp.id} className="cal-item">
                        <span style={{ color: STATUS_COLORS[exp.ai_status], overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          ● {exp.event_name} {exp.amount.toLocaleString()}원
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            ))}
          </div>
          <p className="muted">
            ● 지출 (색: <span style={{ color: STATUS_COLORS['적합'] }}>{STATUS_LABELS['적합']}</span> /{' '}
            <span style={{ color: STATUS_COLORS['주의'] }}>{STATUS_LABELS['주의']}</span> /{' '}
            <span style={{ color: STATUS_COLORS['위반'] }}>{STATUS_LABELS['위반']}</span>) · [사업] [감사] [기타] 일정
          </p>
        </section>

        {/* 오른쪽: 고른 날짜의 일정·지출, 일정 등록 */}
        <aside style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <section className="card" style={{ marginBottom: 0 }}>
            <b>{Number(form.date.slice(5, 7))}월 {Number(form.date.slice(8))}일</b>
            {daySchedules.length === 0 && dayExpenses.length === 0 ? (
              <p className="muted">일정과 지출이 없습니다.</p>
            ) : (
              <div style={{ display: 'grid', gap: 8, marginTop: 10, fontSize: 13 }}>
                {/* 일정: [이동]을 누르면 그 사업(일정 제목과 같은 사업명)의 지출 목록으로 */}
                {daySchedules.map((sc) => (
                  <div key={'s' + sc.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: KIND_COLORS[sc.kind], flexShrink: 0 }}>{sc.kind}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      {sc.title}{sc.end_date && <span className="muted"> · {scheduleDays(sc)}</span>}
                      {sc.memo && <div className="muted">{sc.memo}</div>}
                    </span>
                    <button onClick={() => navigate(`/expenses?event=${encodeURIComponent(sc.title)}`)} style={moveButton} title={`'${sc.title}' 사업의 지출 목록 보기`}>이동</button>
                    {deleteButton(sc)}
                  </div>
                ))}
                {/* 지출: [이동]을 누르면 지출 상세로 */}
                {dayExpenses.map((exp) => (
                  <div key={'e' + exp.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: STATUS_COLORS[exp.ai_status], flexShrink: 0 }}>●</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      {exp.event_name} · <span className="tnum" style={{ fontWeight: 600 }}>{exp.amount.toLocaleString()}원</span>
                      <div className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exp.description}</div>
                    </span>
                    <button onClick={() => navigate(`/expenses/${exp.id}`)} style={moveButton} title="지출 상세 보기">이동</button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <form onSubmit={addSchedule} className="card" style={{ display: 'grid', gap: 10, marginBottom: 0 }}>
            <b>일정 등록</b>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8 }}>
              <label>
                시작일 <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
              </label>
              <label>
                <span>종료일 <span className="muted">(선택)</span></span>
                <input type="date" value={form.end_date} min={form.date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
              </label>
            </div>
            <div>
              <label>
                종류
                <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                  <option>사업</option>
                  <option>감사</option>
                  <option>기타</option>
                </select>
              </label>
            </div>
            <label>
              제목 <input placeholder="예: 1학기 정기감사 자료 제출 마감" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </label>
            <label>
              메모 <input placeholder="(선택)" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
            </label>
            <button type="submit">일정 추가</button>
          </form>
        </aside>
      </div>
    </div>
  )
}

export default CalendarPage
