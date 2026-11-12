// 대시보드용 간단한 막대 차트 (라이브러리 없이 HTML로 그림)
// 규칙: 한 가지 값만 보여 주므로 색은 강조색(파랑) 하나. 예산 초과만 빨강 + '초과' 글자를 같이 쓴다.
// 막대에 마우스를 올리면 정확한 금액이 나온다 (title).

const won = (n) => `${n.toLocaleString()}원`

// 금액을 짧게 (요약용): 1,950,000 → 195만
export function shortWon(n) {
  if (n >= 100000000) return `${(n / 100000000).toFixed(1).replace(/\.0$/, '')}억`
  if (n >= 10000) return `${Math.round(n / 10000).toLocaleString()}만`
  return n.toLocaleString()
}

// 가로 막대 목록: rows = [{ name, value, sub? }]
export function BarList({ rows, emptyText = '데이터가 없습니다.', unit }) {
  const fmt = (v) => (unit ? `${v.toLocaleString()}${unit}` : won(v)) // unit을 주면 '3회'처럼
  if (rows.length === 0) return <p className="muted">{emptyText}</p>
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {rows.map((r) => (
        <div key={r.name} title={`${r.name}: ${fmt(r.value)}`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
            <span>{r.name}{r.sub && <span className="muted"> · {r.sub}</span>}</span>
            <span className="tnum">{fmt(r.value)}</span>
          </div>
          <div style={{ height: 8, background: 'var(--line)', borderRadius: 4 }}>
            <div style={{ width: `${(r.value / max) * 100}%`, height: '100%', background: 'var(--primary)', borderRadius: 4, minWidth: r.value ? 4 : 0 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// 예산 집행 막대: rows = [{ name, budget, spent }]. 막대 길이 = 집행률(100%까지), 넘으면 빨강.
export function BudgetBars({ rows }) {
  if (rows.length === 0) return <p className="muted">등록된 예산이 없습니다.</p>
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {rows.map((r) => {
        const rate = r.budget > 0 ? Math.round((r.spent / r.budget) * 100) : null
        const over = r.budget > 0 && r.spent > r.budget
        return (
          <div key={r.name} title={`${r.name}: 예산 ${won(r.budget)} 중 ${won(r.spent)} 사용`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4, gap: 8 }}>
              <span>{r.name}</span>
              <span className="tnum" style={{ color: over ? 'var(--bad)' : 'var(--sub)', whiteSpace: 'nowrap' }}>
                {shortWon(r.spent)} / {shortWon(r.budget)}
                <b style={{ marginLeft: 6 }}>{rate === null ? '-' : `${rate}%`}</b>
                {over && ' 초과'}
              </span>
            </div>
            <div style={{ height: 8, background: 'var(--line)', borderRadius: 4 }}>
              <div style={{ width: `${Math.min(rate ?? 0, 100)}%`, height: '100%', borderRadius: 4, background: over ? 'var(--bad)' : 'var(--primary)', minWidth: r.spent ? 4 : 0 }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// 월별 세로 막대: rows = [{ month: '2026-03', value }]. unit을 주면 금액 대신 '3건'처럼 보여 준다
export function MonthBars({ rows, unit }) {
  const label = (v) => (unit ? `${v}${unit}` : shortWon(v))
  const full = (v) => (unit ? `${v}${unit}` : won(v))
  if (rows.length === 0) return <p className="muted">지출이 없습니다.</p>
  const max = Math.max(...rows.map((r) => r.value), 1)
  const HEIGHT = 140
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: HEIGHT + 20, borderBottom: '1px solid var(--line-strong)' }}>
        {rows.map((r) => (
          <div key={r.month} title={`${r.month}: ${full(r.value)}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
            <span className="tnum muted" style={{ marginBottom: 4 }}>{r.value ? label(r.value) : ''}</span>
            <div style={{ width: '60%', maxWidth: 36, height: Math.max((r.value / max) * HEIGHT, r.value ? 3 : 0), background: 'var(--primary)', borderRadius: '4px 4px 0 0' }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 2, marginTop: 6 }}>
        {rows.map((r) => (
          <span key={r.month} className="muted" style={{ flex: 1, textAlign: 'center' }}>{Number(r.month.slice(5))}월</span>
        ))}
      </div>
    </div>
  )
}
