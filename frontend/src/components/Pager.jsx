// 페이지 번호 (지출 목록, 거래내역, 기록에서 같이 쓴다)
// 번호는 5개씩 묶어 보여 준다. « » 5쪽 이동, ‹ › 1쪽 이동
// 쪽이 하나뿐이면 아무것도 그리지 않는다.
function Pager({ page, count, onChange }) {
  if (count <= 1) return null
  const go = (p) => onChange(Math.min(count, Math.max(1, p)))
  const first = Math.floor((page - 1) / 5) * 5 + 1 // 지금 묶음의 첫 번호 (1, 6, 11 ...)
  const numbers = Array.from({ length: Math.min(5, count - first + 1) }, (_, i) => first + i)
  const arrow = { width: 32, padding: 0 }
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 16 }}>
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
