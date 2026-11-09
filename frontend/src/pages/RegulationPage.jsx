import { useEffect, useState } from 'react'
import { api } from '../common'

// 규정 보기 페이지: AI가 점검 근거로 쓰는 규정 파일 내용을 그대로 보여준다
function RegulationPage() {
  const [regulation, setRegulation] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api('/regulation')
      .then(setRegulation)
      .catch((e) => setError(e.message))
  }, [])

  if (error) return <p style={{ color: 'red' }}>{error}</p>
  if (!regulation) return <p>불러오는 중...</p>

  return (
    <div>
      <h2>회계 규정</h2>
      <p style={{ color: 'gray' }}>
        AI 점검에 사용 중인 규정 파일: backend/regulations/{regulation.file_name}
      </p>
      {/* pre: 파일의 줄바꿈과 들여쓰기를 그대로 보여줌 */}
      <pre style={{ whiteSpace: 'pre-wrap', border: '1px solid lightgray', padding: 12 }}>{regulation.content}</pre>
    </div>
  )
}

export default RegulationPage
