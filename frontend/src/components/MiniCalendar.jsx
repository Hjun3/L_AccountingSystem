import { useState } from 'react'
import { Link } from 'react-router-dom'
import { KIND_COLORS, scheduleOn } from '../common'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const pad = (n) => String(n).padStart(2, '0')

// 대시보드용 작은 달력. 일정이 있는 날은 종류 색 점, 지출이 있는 날은 회색 점.
// 날짜를 누르면 큰 캘린더(그 달)로 이동한다.
function MiniCalendar({ schedules, expenses }) {
  const today = new Date()
  const [ym, setYm] = useState({ y: today.getFullYear(), m: today.getMonth() })
  const first = new Date(ym.y, ym.m, 1).getDay()
  const days = new Date(ym.y, ym.m + 1, 0).getDate()
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  const dateOf = (d) => `${ym.y}-${pad(ym.m + 1)}-${pad(d)}`
  const todayStr = today.toLocaleDateString('sv')
  const move = (diff) => {
    const d = new Date(ym.y, ym.m + diff, 1)
    setYm({ y: d.getFullYear(), m: d.getMonth() })
  }
  const monthParam = `${ym.y}-${pad(ym.m + 1)}`

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button onClick={() => move(-1)} style={{ height: 26, padding: '0 8px' }} aria-label="이전 달">‹</button>
        <Link to={`/calendar?month=${monthParam}`} style={{ color: 'var(--text)', fontWeight: 600 }}>
          {ym.y}년 {ym.m + 1}월
        </Link>
        <button onClick={() => move(1)} style={{ height: 26, padding: '0 8px' }} aria-label="다음 달">›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', fontSize: 12, rowGap: 2 }}>
        {WEEKDAYS.map((w, i) => (
          <span key={w} style={{ color: i === 0 ? 'var(--bad)' : 'var(--muted)', paddingBottom: 4 }}>{w}</span>
        ))}
        {cells.map((d, i) => {
          if (!d) return <span key={'e' + i} />
          const date = dateOf(d)
          const daySchedules = schedules.filter((s) => scheduleOn(s, date))
          const hasExpense = expenses.some((e) => e.date === date)
          const isToday = date === todayStr
          const tip = [...daySchedules.map((s) => `[${s.kind}] ${s.title}`), hasExpense ? '지출 있음' : ''].filter(Boolean).join('\n')
          return (
            <Link key={date} to={`/calendar?month=${monthParam}`} title={tip || undefined}
              style={{ padding: '4px 0', borderRadius: 6, color: 'var(--text)', textDecoration: 'none',
                background: isToday ? 'var(--primary-soft)' : 'transparent', fontWeight: isToday ? 700 : 400 }}>
              <div className="tnum">{d}</div>
              <div style={{ height: 6, display: 'flex', justifyContent: 'center', gap: 2 }}>
                {daySchedules.slice(0, 2).map((s) => (
                  <i key={s.id} style={{ width: 5, height: 5, borderRadius: '50%', background: KIND_COLORS[s.kind] }} />
                ))}
                {hasExpense && <i style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--muted)' }} />}
              </div>
            </Link>
          )
        })}
      </div>
      <div className="muted" style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {Object.entries(KIND_COLORS).map(([k, c]) => (
          <span key={k}><i style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: c, marginRight: 4 }} />{k}</span>
        ))}
        <span><i style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--muted)', marginRight: 4 }} />지출</span>
      </div>
    </div>
  )
}

export default MiniCalendar
