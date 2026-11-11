import { useState } from 'react'
import { api, API_URL, canEdit, useUser } from '../common'

// 지출 상세 페이지 아래쪽: 총무 메모와 증빙 파일(영수증 사진 등) 첨부
function MemoAndFiles({ expense, onChanged }) {
  const [memo, setMemo] = useState(expense.memo || '')
  const [memoSaved, setMemoSaved] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const editable = canEdit(useUser()) // 열람 계정은 메모·파일을 보기만 한다
  const [dragging, setDragging] = useState(false) // 파일을 끌어다 올려 놓는 중인지

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
  // (파일 고르기와 끌어다 놓기 둘 다 여기로 온다)
  async function uploadFiles(fileList) {
    const files = Array.from(fileList)
    if (files.length === 0 || uploading) return
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

  // 파일 칸 하나의 크기 (추가 칸과 같은 크기)
  const tile = { height: 200, borderRadius: 'var(--r-lg)', overflow: 'hidden' }
  const isImage = (name) => /\.(jpe?g|png|webp)$/i.test(name) // heic는 브라우저가 못 보여줘서 제외

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>메모</h3>
      <p className="muted" style={{ margin: '0 0 8px' }}>총무 메모입니다. 확인·조치가 필요한 지출을 확정할 때 남긴 메모도 여기에 보입니다. AI 점검에는 쓰이지 않습니다.</p>
      {!editable ? (
        <p style={{ whiteSpace: 'pre-wrap', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{expense.memo || <span className="muted">메모가 없습니다.</span>}</p>
      ) : (
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
      )}

      <h3>증빙 파일 <span className="muted" style={{ fontWeight: 400 }}>{expense.attachments.length}개 · 사진(JPG·PNG·HEIC)·PDF, 파일당 10MB까지</span></h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        {/* 첫 칸: 파일 추가 (눌러서 고르거나 끌어다 놓기). 열람 계정에는 없다 */}
        {editable && (
        <label
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); uploadFiles(e.dataTransfer.files) }}
          style={{
            ...tile, display: 'grid', placeItems: 'center', textAlign: 'center', cursor: uploading ? 'default' : 'pointer',
            border: `1.5px dashed ${dragging ? 'var(--primary)' : 'var(--line-strong)'}`, background: dragging ? 'var(--primary-soft)' : '#fafbfc',
          }}
        >
          <input type="file" multiple accept="image/*,.heic,.pdf" onChange={(e) => { uploadFiles(e.target.files); e.target.value = '' }} disabled={uploading} style={{ display: 'none' }} />
          {uploading ? (
            <span style={{ color: 'var(--primary)' }}>올리는 중...</span>
          ) : (
            <span>
              <span style={{ fontSize: 26, color: 'var(--primary)', lineHeight: 1 }}>+</span><br />
              <b style={{ color: 'var(--primary)', fontSize: 13 }}>파일 추가</b><br />
              <span className="muted">또는 끌어다 놓기</span>
            </span>
          )}
        </label>
        )}

        {expense.attachments.map((a) => {
          const url = `${API_URL}/attachments/${a.id}`
          const ext = a.file_name.split('.').pop().toUpperCase()
          return (
            <div key={a.id} style={{ ...tile, border: '1px solid var(--line)', display: 'flex', flexDirection: 'column' }}>
              <a href={url} target="_blank" rel="noreferrer" title="새 창에서 크게 보기" style={{ flex: 1, minHeight: 0, background: '#f3f4f6', display: 'grid', placeItems: 'center' }}>
                {isImage(a.file_name) ? (
                  <img src={url} alt={a.file_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--sub)' }}>{ext}</span>
                )}
              </a>
              <div style={{ padding: '8px 10px', fontSize: 12 }}>
                <div title={a.file_name} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>{a.file_name}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                  <span className="muted">{(a.created_at || '').slice(0, 10)}</span>
                  {editable && <button onClick={() => deleteFile(a)} style={{ height: 24, fontSize: 11, padding: '0 8px', color: 'var(--bad)' }}>삭제</button>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {error && <p style={{ color: 'var(--bad)' }}>{error}</p>}
      {!editable && expense.attachments.length === 0 && <p className="muted">첨부된 파일이 없습니다.</p>}
    </div>
  )
}

export default MemoAndFiles
