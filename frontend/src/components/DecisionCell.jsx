import { useState } from 'react'
import { api, finalLabel } from '../common'

// 지출 한 건에 대한 총무 결정 칸 (목록 페이지와 상세 페이지에서 같이 사용)
// - 대기 상태: [확정] 버튼
//   · AI가 '문제 없음'이면 누르면 바로 확정
//   · AI가 '확인 필요'·'조치 필요'면 메모 입력칸이 열리고, 메모를 적어야 확정 (감사 때 설명할 근거)
//     이미 메모가 있어도(취소 후 다시 확정 등) 입력칸을 열어 고칠 수 있게 한다
// - 확정 상태: '확정'과 메모, [취소] 버튼. 목록(compact)에서는 긴 메모를 두 줄까지만 보여 준다
// 메모는 지출 상세의 '메모'와 같은 칸에 저장된다.
// compact: 목록용 간단 모드 (결정 이력은 숨김)
const MEMO_MAX = 300 // 메모 최대 글자 수
// 긴 메모를 두 줄까지만 보여 주고 '...'로 줄인다 (마우스를 올리면 전체가 보임)
const clamp2 = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }

function DecisionCell({ expense, onSaved, compact = false }) {
  const [writing, setWriting] = useState(false) // 메모 입력칸을 보여 줄지
  const [memo, setMemo] = useState(expense.memo || '')
  const [error, setError] = useState('')
  const needsMemo = expense.ai_status === '주의' || expense.ai_status === '위반'

  async function save(finalStatus, withMemo = false) {
    setError('')
    try {
      await api(`/expenses/${expense.id}`, {
        method: 'PATCH',
        body: JSON.stringify(withMemo ? { final_status: finalStatus, memo } : { final_status: finalStatus }),
      })
      setWriting(false)
      onSaved()
    } catch (e) {
      setError(e.message)
    }
  }

  // [확정]을 눌렀을 때: 메모가 필요한데 아직 없으면 입력칸부터 연다
  function confirm() {
    if (needsMemo) {
      setMemo(expense.memo || '') // 있던 메모를 채워서 연다 (고치거나 그대로 확정)
      setWriting(true)
    } else save('확정')
  }

  const decided = expense.final_status !== '대기'

  return (
    <div style={{ display: 'grid', gap: 4 }}>
      {decided ? (
        <>
          <b>{finalLabel(expense.final_status)}</b>
          {expense.memo && (
            <div title={expense.memo} style={{ fontSize: 12, color: 'var(--sub)', wordBreak: 'break-all', whiteSpace: 'pre-wrap', maxWidth: 260, ...(compact ? clamp2 : {}) }}>
              메모: {expense.memo}
            </div>
          )}
          <button onClick={() => save('대기')} style={{ justifySelf: 'start' }}>취소</button>
        </>
      ) : writing ? (
        <>
          <span style={{ fontSize: 12, color: 'var(--warn)' }}>확인·조치가 필요한 지출이에요. 왜 넘어가는지 메모를 남겨 주세요.</span>
          <textarea placeholder="예: 학생증 사본은 다음 주에 받기로 함" rows={3} maxLength={MEMO_MAX} value={memo} onChange={(e) => setMemo(e.target.value)} style={{ width: '100%', minWidth: 200, resize: 'vertical' }} />
          <span className="muted" style={{ textAlign: 'right' }}>{memo.length}/{MEMO_MAX}</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => save('확정', true)} disabled={!memo.trim()}>메모 저장하고 확정</button>
            <button onClick={() => setWriting(false)}>닫기</button>
          </div>
        </>
      ) : (
        <>
          {!compact && <div>현재: 대기</div>}
          <button onClick={confirm} style={{ justifySelf: 'start' }}>확정</button>
        </>
      )}
      {error && <span style={{ color: 'var(--bad)', fontSize: 12 }}>{error}</span>}
      {!compact && <DecisionLogs logs={expense.logs} />}
    </div>
  )
}

// 결정 이력 목록 (예: 2026-11-09 10:12 대기 → 확정 (확정할 때의 메모))
function DecisionLogs({ logs }) {
  if (!logs || logs.length === 0) return null
  return (
    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: 'gray' }}>
      {logs.map((log, i) => (
        <li key={i}>
          {log.created_at.replace('T', ' ').slice(0, 16)} {finalLabel(log.from_status)} →{' '}
          {log.to_status === '대기' ? '취소' : finalLabel(log.to_status)}
          {log.explanation && ` (${log.explanation})`}
          {log.actor && ` - ${log.actor}`}
        </li>
      ))}
    </ul>
  )
}

export default DecisionCell
