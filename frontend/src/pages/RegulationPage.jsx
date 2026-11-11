import { useEffect, useState } from 'react'
import { api } from '../common'

// 규정 파일 글을 화면용 덩어리로 나눈다 (파일 내용은 바꾸지 않고 보여 주는 모양만 정리)
// - '※'로 시작하는 줄: 맨 위 안내
// - '[제1부] …' 같은 줄: 큰 제목
// - '총학생회칙 제78조(…)', '관행 제1항 (…)' 같은 줄: 조항 제목 (왼쪽 목차에 나옴)
// - '====' 줄은 구분선이라 뺀다
function parseRegulation(text) {
  const notes = []
  const blocks = [] // { type: 'part' | 'clause' | 'line', text, id }
  text.split('\n').forEach((raw, i) => {
    const line = raw.trimEnd()
    if (/^=+$/.test(line.trim())) return
    if (line.startsWith('※')) return notes.push(line.replace(/^※\s*/, ''))
    if (/^\[제\d+부\]/.test(line)) return blocks.push({ type: 'part', text: line, id: `p${i}` })
    if (/^(총학생회칙 제\d+조|관행 제\d+항)/.test(line)) return blocks.push({ type: 'clause', text: line, id: `c${i}` })
    blocks.push({ type: 'line', text: line })
  })
  return { notes, blocks }
}

// 규정 보기 페이지: AI가 점검 근거로 쓰는 규정 파일 내용을 보여준다. 왼쪽 목차를 누르면 그 조항으로 이동
function RegulationPage() {
  const [regulation, setRegulation] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api('/regulation')
      .then(setRegulation)
      .catch((e) => setError(e.message))
  }, [])

  if (error) return <p style={{ color: 'var(--bad)' }}>{error}</p>
  if (!regulation) return <p>불러오는 중...</p>

  const { notes, blocks } = parseRegulation(regulation.content)
  const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div>
      <h2>회계 규정</h2>
      <p className="muted" style={{ marginTop: -8 }}>AI 점검에 사용 중인 규정 파일: backend/regulations/{regulation.file_name}</p>
      {notes.length > 0 && (
        <div className="notice" style={{ margin: '12px 0 20px' }}>
          {notes.map((n) => <div key={n}>{n}</div>)}
        </div>
      )}

      <div className="regulation-main">
        {/* 왼쪽: 조항 목차 (화면을 내려도 따라옴) */}
        <nav className="card regulation-toc">
          {blocks.filter((b) => b.type !== 'line').map((b) => (
            <button key={b.id} type="button" onClick={() => go(b.id)} className={b.type === 'part' ? 'part' : ''}>
              {b.type === 'part' ? b.text.replace(/^\[(제\d+부)\]\s*/, '$1 · ') : b.text}
            </button>
          ))}
        </nav>

        {/* 오른쪽: 규정 본문 */}
        <article className="card regulation-body">
          {blocks.map((b, i) =>
            b.type === 'part' ? (
              <h3 key={b.id} id={b.id} className="part">{b.text}</h3>
            ) : b.type === 'clause' ? (
              <h4 key={b.id} id={b.id}>{b.text}</h4>
            ) : b.text.trim() === '' ? null : (
              <p key={i}>{b.text}</p>
            ),
          )}
        </article>
      </div>
    </div>
  )
}

export default RegulationPage
