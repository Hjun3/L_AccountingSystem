import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, isAdmin, useUser } from '../common'

// 이번 달 AI 사용 횟수가 기준(backend/.env의 AI_MONTHLY_WARN)을 넘으면 띄우는 경고.
// AI를 쓰는 화면(지출 등록, 거래내역 불러오기) 위에 넣는다. 막지는 않고 알려만 준다.
function AiUsageWarning() {
  const [usage, setUsage] = useState(null)
  const user = useUser()

  useEffect(() => {
    api('/ai-usage').then(setUsage).catch(() => {}) // 사용량을 못 불러와도 화면은 그대로 쓴다
  }, [])

  if (!usage?.over) return null
  return (
    <p className="notice" style={{ color: 'var(--warn)', marginBottom: 16 }}>
      이번 달 AI를 {usage.count}회 썼어요. 경고 기준({usage.warn_at}회)을 넘었으니 OpenAI 사용 금액을 한번 확인해 주세요.
      {isAdmin(user) && <> <Link to="/usage">사용량 보기</Link></>}
    </p>
  )
}

export default AiUsageWarning
