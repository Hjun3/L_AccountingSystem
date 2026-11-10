import { STATUS_COLORS, STATUS_LABELS } from '../common'

// AI 점검 결과를 '색 점 + 글자'로 보여준다 (문제 없음 / 확인 필요 / 조치 필요)
// 색만으로 구분하지 않도록 글자를 항상 같이 쓴다.
function StatusBadge({ status }) {
  if (!status) return null
  return (
    <span className="status" style={{ color: STATUS_COLORS[status] }}>
      {STATUS_LABELS[status]}
    </span>
  )
}

export default StatusBadge
