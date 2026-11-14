import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, termQuery, useTerm } from '../common'

// 감사 자가 점검: 감사시행세칙 제26조 채점표 항목마다 감점될 수 있는 것을 모아 보여 준다.
// 점수를 예상하지는 않는다 (실제 채점은 대의원회). 데이터는 서버 /audit 가 계산한다 (AI 호출 없음).
function AuditPage() {
  const { termId, terms } = useTerm() // 왼쪽 메뉴에서 고른 임기
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setData(null)
    api('/audit' + termQuery(termId)).then(setData).catch((e) => setError(e.message))
  }, [termId])

  if (error) return <p style={{ color: 'var(--bad)' }}>{error}</p>
  if (!data) return <p>불러오는 중...</p>

  const termName = terms?.find((t) => t.id === termId)?.name || '전체 임기'
  const total = data.items.reduce((s, item) => s + item.checks.reduce((n, c) => n + c.count, 0), 0)

  return (
    <div>
      <h2>감사 자가 점검 <span className="muted" style={{ fontSize: 14, fontWeight: 400 }}>{termName}</span></h2>
      <p className="muted" style={{ marginTop: -8 }}>
        감사 채점표(감사시행세칙 제26조) 항목별로 감점될 수 있는 것을 모았어요. 점수 예상이 아니라 미리 챙길 목록이에요.
        {' '}{total ? `챙길 것 ${total}건` : '앱에서 찾은 문제는 없어요.'}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 16, marginTop: 16 }}>
        {data.items.map((item) => (
          <section key={item.name} className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <b style={{ fontSize: 16 }}>{item.name}</b>
              <span className="muted tnum">{item.points}점</span>
            </div>
            {item.manual && <p className="muted" style={{ margin: '10px 0 0' }}>{item.manual}</p>}
            {item.checks.map((c) => (
              <div key={c.label} style={{ borderTop: '1px solid var(--line)', marginTop: 12, paddingTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontWeight: 500 }}>{c.label}</span>
                  <span className="tnum" style={{ fontWeight: 600, color: c.count ? 'var(--bad)' : 'var(--ok)', whiteSpace: 'nowrap' }}>
                    {c.count ? `${c.count}건` : '없어요'}
                  </span>
                </div>
                {c.count > 0 && (
                  <>
                    <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{c.hint}</div>
                    <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>
                      {c.rows.map((r, i) => (
                        <li key={i}>{r.id ? <Link to={`/expenses/${r.id}`}>{r.text}</Link> : r.text}</li>
                      ))}
                    </ul>
                    {(c.count > c.rows.length || c.link) && (
                      <div style={{ fontSize: 12, marginTop: 6 }}>
                        {c.count > c.rows.length && <span className="muted">외 {c.count - c.rows.length}건 </span>}
                        {c.link && <Link to={c.link}>보러 가기 →</Link>}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
            {item.examples?.length > 0 && (
              <div style={{ borderTop: '1px solid var(--line)', marginTop: 12, paddingTop: 12 }}>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>실제 감점 사례 (전자정보대학 2025~2026 감사 결과) · 앱에서 확인할 수 없으니 직접 챙기세요</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                  {item.examples.map((t) => <li key={t}>{t}</li>)}
                </ul>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}

export default AuditPage
