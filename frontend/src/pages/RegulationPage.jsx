import { useEffect, useRef, useState } from 'react'
import { api } from '../common'

// 규정 파일 글을 화면용 덩어리로 나눈다 (파일 내용은 바꾸지 않고 보여 주는 모양만 정리)
// - '※'로 시작하는 줄: 맨 위 안내
// - '[제1부] …' 같은 줄: 큰 제목
// - '총학생회칙 제78조(…)', '감사지침 제1항 (…)' 같은 줄: 조항 제목 (왼쪽 목차에 나옴)
// - '====' 줄은 구분선이라 뺀다
function parseRegulation(text) {
  const notes = []
  const blocks = [] // { type: 'part' | 'clause' | 'line', text, id }
  text.split('\n').forEach((raw, i) => {
    const line = raw.trimEnd()
    if (/^=+$/.test(line.trim())) return
    if (line.startsWith('※')) return notes.push(line.replace(/^※\s*/, ''))
    if (/^\[제\d+부\]/.test(line)) return blocks.push({ type: 'part', text: line, id: `p${i}` })
    if (/^(총학생회칙 제\d+조|감사지침 제\d+항)/.test(line)) return blocks.push({ type: 'clause', text: line, id: `c${i}` })
    blocks.push({ type: 'line', text: line })
  })
  return { notes, blocks }
}

// 규정 보기 페이지: AI가 점검 근거로 쓰는 규정 파일 내용을 보여준다. 왼쪽 목차를 누르면 그 조항으로 이동
function RegulationPage() {
  const [regulation, setRegulation] = useState(null)
  const [error, setError] = useState('')
  const [current, setCurrent] = useState('') // 지금 화면에 보이는 조항 (왼쪽 목차에 강조)
  const tocRef = useRef(null)
  const clickedAt = useRef(0) // 목차를 누른 시각: 누른 직후 화면이 움직이는 동안에는 누른 조항을 그대로 강조

  useEffect(() => {
    api('/regulation')
      .then(setRegulation)
      .catch((e) => setError(e.message))
  }, [])

  // 화면을 내릴 때 지금 읽고 있는 조항을 찾는다: 화면 맨 위에서 100px 선을 지나간 제목 중 마지막 것 (내 정보 화면과 같은 방식)
  useEffect(() => {
    if (!regulation) return
    const ids = parseRegulation(regulation.content).blocks.filter((b) => b.type !== 'line').map((b) => b.id)
    function onScroll() {
      if (Date.now() - clickedAt.current < 1200) return
      let found = ids[0]
      for (const id of ids) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top <= 100) found = id
      }
      // 맨 아래에 닿으면 마지막 조항 (마지막 조항이 짧아 위까지 못 올라오는 경우)
      if (window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) found = ids[ids.length - 1]
      setCurrent(found)
    }
    onScroll()
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [regulation])

  // 강조된 목차 줄이 목차 상자 밖에 있으면 목차 상자만 스크롤해서 보이게 한다 (화면 전체는 움직이지 않음)
  useEffect(() => {
    const box = tocRef.current
    const btn = box?.querySelector('button.active')
    if (!btn) return
    if (btn.offsetTop < box.scrollTop) box.scrollTop = btn.offsetTop - 8
    else if (btn.offsetTop + btn.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = btn.offsetTop + btn.offsetHeight - box.clientHeight + 8
  }, [current])

  if (error) return <p style={{ color: 'var(--bad)' }}>{error}</p>
  if (!regulation) return <p>불러오는 중...</p>

  const { notes, blocks } = parseRegulation(regulation.content)
  const go = (id) => {
    clickedAt.current = Date.now()
    setCurrent(id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

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
        <nav className="card regulation-toc" ref={tocRef}>
          {blocks.filter((b) => b.type !== 'line').map((b) => (
            <button key={b.id} type="button" onClick={() => go(b.id)} className={[b.type === 'part' ? 'part' : '', b.id === current ? 'active' : ''].join(' ').trim()}>
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
