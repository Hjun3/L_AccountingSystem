import { useEffect, useState } from 'react'
import { api, API_URL } from '../common'
import { BarList, MonthBars } from '../components/Charts'

// 사용량·백업 화면 (관리자만): AI 사용량(이번 달 횟수·토큰, 종류별·사람별, 날짜별, 최근 6개월)과 백업 내려받기
function UsagePage() {
  const [month, setMonth] = useState(null) // null = 이번 달
  const [usage, setUsage] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api('/ai-usage' + (month ? `?month=${month}` : '')).then(setUsage).catch((e) => setError(e.message))
  }, [month])

  if (error) return <p style={{ color: 'var(--bad)' }}>{error}</p>
  if (!usage) return <p>불러오는 중...</p>

  const rate = Math.min(100, Math.round((usage.count / usage.warn_at) * 100))
  // 그 달의 1일부터 말일까지 날짜별 횟수 (없는 날은 0)
  const [y, m] = usage.month.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  const perDay = Object.fromEntries(usage.daily.map((d) => [Number(d.date.slice(8)), d.count]))
  const maxDay = Math.max(1, ...usage.daily.map((d) => d.count))

  return (
    <div style={{ maxWidth: 1100 }}>
      <h2>사용량·백업</h2>

      <div className="section-title" style={{ marginTop: 8 }}>
        <h3>AI 사용량 <span className="muted" style={{ fontWeight: 400 }}>{y}년 {m}월</span></h3>
        {/* 최근 6개월 중 고르기 */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {usage.months.map((mo) => (
            <button key={mo.month} onClick={() => setMonth(mo.month)} className={mo.month === usage.month ? 'active' : ''} style={{ height: 28, fontSize: 12 }}>
              {Number(mo.month.slice(5))}월
            </button>
          ))}
        </div>
      </div>

      <div className="card tnum" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
        <div>
          <div className="muted">사용 횟수</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: usage.over ? 'var(--warn)' : 'var(--text)' }}>{usage.count}회</div>
          {/* 경고 기준 대비 막대 */}
          <div style={{ height: 6, background: 'var(--line)', borderRadius: 3, marginTop: 6 }}>
            <div style={{ width: `${rate}%`, height: '100%', borderRadius: 3, background: usage.over ? 'var(--warn)' : 'var(--primary)' }} />
          </div>
          <div className="muted" style={{ marginTop: 4 }}>경고 기준 {usage.warn_at}회 {usage.over ? '· 넘었어요' : `· ${rate}%`}</div>
        </div>
        <div>
          <div className="muted">사용 토큰</div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{usage.tokens.toLocaleString()}</div>
          <div className="muted">1회 평균 {usage.count ? Math.round(usage.tokens / usage.count).toLocaleString() : 0}</div>
        </div>
        <div>
          <div className="muted">종류별</div>
          {usage.by_kind.length === 0 && <div className="muted">없음</div>}
          {usage.by_kind.map((k) => (
            <div key={k.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginTop: 4 }}>
              <span>{k.name}</span><b>{k.count}회</b>
            </div>
          ))}
        </div>
      </div>
      <p className="muted" style={{ marginTop: -6 }}>
        AI는 지출을 저장할 때 점검 1번, 영수증 읽기 버튼을 누를 때 1번만 써요. 경고 기준은 backend/.env 의 AI_MONTHLY_WARN 으로 바꿀 수 있고, 넘어도 막지는 않아요.
        정확한 금액은 OpenAI 사용량 페이지에서 확인하세요.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginTop: 8 }}>
        <section>
          <h3>날짜별 사용 횟수</h3>
          <div className="card" style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 120, borderBottom: '1px solid var(--line-strong)' }}>
              {Array.from({ length: lastDay }, (_, i) => i + 1).map((d) => (
                <div key={d} title={`${m}월 ${d}일: ${perDay[d] || 0}회`} style={{ flex: 1, height: `${((perDay[d] || 0) / maxDay) * 100}%`, minHeight: perDay[d] ? 3 : 0, background: 'var(--primary)', borderRadius: '2px 2px 0 0' }} />
              ))}
            </div>
            <div className="muted" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span>1일</span><span>{Math.ceil(lastDay / 2)}일</span><span>{lastDay}일</span>
            </div>
          </div>
        </section>
        <section>
          <h3>사람별</h3>
          <div className="card" style={{ marginBottom: 0 }}>
            <BarList rows={usage.by_user.map((u) => ({ name: u.name, value: u.count, sub: `${u.tokens.toLocaleString()} 토큰` }))} emptyText="이번 달 사용 기록이 없어요." unit="회" />
          </div>
        </section>
      </div>

      <h3>최근 6개월</h3>
      <div className="card">{usage.months.length ? <MonthBars rows={usage.months.map((mo) => ({ month: mo.month, value: mo.count }))} unit="회" /> : <p className="muted">기록이 없어요.</p>}</div>

      {/* 백업 */}
      <h3 style={{ marginTop: 32 }}>백업</h3>
      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <b>전체 데이터 백업 내려받기</b>
          <div className="muted" style={{ marginTop: 2 }}>
            지출·예산·일정·기록·계정이 담긴 DB와 증빙 파일을 zip 하나로 받아요. 되살리는 방법은 zip 안의 안내 파일에 있어요.
            <br />노트북 고장이나 인수인계에 대비해 감사 전·임기 끝에 한 번씩 받아 두세요. 개인정보가 들어 있으니 안전한 곳에 보관하세요.
          </div>
        </div>
        <a className="btn primary" href={`${API_URL}/backup.zip`} download>백업 내려받기</a>
      </div>
    </div>
  )
}

export default UsagePage
