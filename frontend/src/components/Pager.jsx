import { useLayoutEffect, useRef } from 'react'

// 페이지 번호 (지출 목록, 거래내역, 기록, 내 정보에서 같이 쓴다)
// 번호는 5개씩 묶어 보여 준다. « » 5쪽 이동, ‹ › 1쪽 이동
// 쪽이 하나뿐이면 아무것도 그리지 않는다.
// keepPosition: 쪽을 바꿔 목록 길이가 달라져도 페이지 번호가 화면에서 같은 자리에 있게 화면을 맞춘다
//   (예: 마지막 쪽 3개 → 첫 쪽 5개로 가면 목록이 길어져 번호가 화면 아래로 밀려나는 것을 막음)
function Pager({ page, count, onChange, keepPosition = false }) {
  const boxRef = useRef(null)
  const before = useRef(null) // 쪽을 바꾸기 직전 번호 줄의 화면 위치

  // 쪽이 바뀌어 다시 그려진 직후(화면에 보이기 전): 번호 줄이 움직인 만큼 화면을 같이 움직인다
  useLayoutEffect(() => {
    if (!keepPosition || before.current === null || !boxRef.current) return
    const moved = boxRef.current.getBoundingClientRect().top - before.current
    before.current = null
    if (moved) window.scrollBy(0, moved)
  }, [page, keepPosition])

  if (count <= 1) return null
  const go = (p) => {
    const next = Math.min(count, Math.max(1, p))
    if (next === page) return
    if (keepPosition && boxRef.current) before.current = boxRef.current.getBoundingClientRect().top
    onChange(next)
  }
  const first = Math.floor((page - 1) / 5) * 5 + 1 // 지금 묶음의 첫 번호 (1, 6, 11 ...)
  const numbers = Array.from({ length: Math.min(5, count - first + 1) }, (_, i) => first + i)
  const arrow = { width: 32, padding: 0 }
  return (
    <div ref={boxRef} style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 16 }}>
      <button type="button" style={arrow} onClick={() => go(page - 5)} disabled={page === 1} title="5쪽 앞으로">«</button>
      <button type="button" style={arrow} onClick={() => go(page - 1)} disabled={page === 1} title="이전 쪽">‹</button>
      {numbers.map((n) => (
        <button type="button" key={n} onClick={() => go(n)} className={n === page ? 'active' : ''} style={{ minWidth: 32, padding: '0 8px' }}>{n}</button>
      ))}
      <button type="button" style={arrow} onClick={() => go(page + 1)} disabled={page === count} title="다음 쪽">›</button>
      <button type="button" style={arrow} onClick={() => go(page + 5)} disabled={page === count} title="5쪽 뒤로">»</button>
    </div>
  )
}

// 목록을 쪽으로 나눈다: { rows: 이번 쪽 줄들, count: 전체 쪽 수, current: 지금 쪽 }
// page가 전체 쪽 수보다 커지면(줄이 줄어든 경우) 마지막 쪽으로 맞춘다.
export function paginate(items, page, size) {
  const count = Math.max(1, Math.ceil(items.length / size))
  const current = Math.min(page, count)
  return { rows: items.slice((current - 1) * size, current * size), count, current }
}

export default Pager
