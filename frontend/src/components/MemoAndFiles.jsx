import { useState } from 'react'
import { api, API_URL } from '../common'

// 지출 상세 페이지 아래쪽: 총무 메모와 증빙 파일(영수증 사진 등) 첨부
function MemoAndFiles({ expense, onChanged }) {
  const [memo, setMemo] = useState(expense.memo || '')
  const [memoSaved, setMemoSaved] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function saveMemo() {
    setError('')
    try {
      await api(`/expenses/${expense.id}/memo`, { method: 'PATCH', body: JSON.stringify({ memo }) })
      setMemoSaved(true)
      onChanged()
    } catch (e) {
      setError(e.message)
    }
  }

  // 파일을 고르면 바로 하나씩 업로드한다 (여러 장 선택 가능)
  async function uploadFiles(e) {
    const files = Array.from(e.target.files)
    e.target.value = '' // 같은 파일을 다시 고를 수 있게 선택 상태를 비움
    setError('')
    setUploading(true)
    try {
      for (const file of files) {
        const form = new FormData()
        form.append('file', file)
        await api(`/expenses/${expense.id}/attachments`, { method: 'POST', body: form })
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
      onChanged()
    }
  }

  async function deleteFile(attachment) {
    if (!window.confirm(`'${attachment.file_name}' 파일을 삭제할까요?`)) return
    try {
      await api(`/attachments/${attachment.id}`, { method: 'DELETE' })
      onChanged()
    } catch (e) {
      setError(e.message)
    }
  }

  const isImage = (name) => /\.(jpe?g|png|webp)$/i.test(name) // heic는 브라우저가 못 보여줘서 제외

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>메모</h3>
      <p style={{ fontSize: 12, color: 'gray', margin: 0 }}>총무 메모입니다. 확인·조치가 필요한 지출을 확정할 때 남긴 메모도 여기에 보입니다. AI 점검에는 쓰이지 않습니다.</p>
      <div style={{ display: 'flex', gap: 4, maxWidth: 600 }}>
        <input
          style={{ flex: 1 }}
          placeholder="예: 사유서 대의원회 제출 완료"
          value={memo}
          onChange={(e) => {
            setMemo(e.target.value)
            setMemoSaved(false)
          }}
        />
        <button onClick={saveMemo} disabled={memoSaved}>
          {memoSaved ? '저장됨' : '메모 저장'}
        </button>
      </div>

      <h3>증빙 파일</h3>
      <input type="file" multiple accept="image/*,.heic,.pdf" onChange={uploadFiles} disabled={uploading} />
      {uploading && <span> 올리는 중...</span>}
      {expense.attachments.length === 0 ? (
        <p style={{ color: 'gray' }}>첨부된 파일이 없습니다.</p>
      ) : (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
          {expense.attachments.map((a) => {
            const url = `${API_URL}/attachments/${a.id}`
            return (
              <div key={a.id} style={{ border: '1px solid lightgray', padding: 6, width: 160, fontSize: 12 }}>
                <a href={url} target="_blank" rel="noreferrer">
                  {isImage(a.file_name) ? (
                    <img src={url} alt={a.file_name} style={{ width: '100%', height: 120, objectFit: 'cover' }} />
                  ) : (
                    <div style={{ height: 120, display: 'grid', placeItems: 'center', background: '#f3f3f3' }}>파일 열기</div>
                  )}
                </a>
                <div style={{ wordBreak: 'break-all' }}>{a.file_name}</div>
                <button onClick={() => deleteFile(a)} style={{ fontSize: 11 }}>삭제</button>
              </div>
            )
          })}
        </div>
      )}
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  )
}

export default MemoAndFiles
