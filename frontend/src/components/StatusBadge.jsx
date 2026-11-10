import { STATUS_BG, STATUS_COLORS, STATUS_LABELS } from '../common'

// AI 점검 결과를 색 배지로 보여준다 (문제 없음 / 확인 필요 / 조치 필요)
function StatusBadge({ status }) {
  if (!status) return null
  return (
    <span className="badge" style={{ color: STATUS_COLORS[status], background: STATUS_BG[status] }}>
      {STATUS_LABELS[status]}
    </span>
  )
}

export default StatusBadge
