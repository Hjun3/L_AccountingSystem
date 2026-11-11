import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, CATEGORIES } from '../common'
import SuggestInput from '../components/SuggestInput'

// 폼의 처음 상태
const EMPTY_FORM = {
  date: '',
  amount: '',
  event_name: '',
  category: '',
  description: '',
  has_receipt: true,
}

// 사진을 긴 쪽이 maxSide 픽셀 이하가 되도록 줄여서 JPEG로 돌려준다.
// 휴대폰 원본 사진은 커서 AI 토큰이 많이 들기 때문에, AI에 보낼 때만 줄인다. (증빙 첨부는 원본 그대로)
function shrinkImage(file, maxSide = 1280) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(img.src)
      canvas.toBlob((blob) => resolve(blob || file), 'image/jpeg', 0.85)
    }
    img.onerror = () => resolve(file) // 줄이지 못하면 원본을 그대로 보냄
    img.src = URL.createObjectURL(file)
  })
}

// 지출 등록 페이지: 저장하면 AI 점검을 거친 뒤 그 지출의 상세 페이지로 이동한다
function ExpenseNewPage() {
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false) // AI 점검 중에는 저장 버튼을 막아 중복 저장을 방지
  const [receiptFile, setReceiptFile] = useState(null) // 읽어 온 영수증 사진 (저장 후 증빙으로 자동 첨부)
  const [reading, setReading] = useState(false)
  const [readNotice, setReadNotice] = useState('')
  const [preview, setPreview] = useState('') // 고른 영수증 사진 미리보기 주소
  const [aiFilled, setAiFilled] = useState([]) // AI가 채운 칸 이름들. 총무가 고치면 빠진다
  const [dragging, setDragging] = useState(false) // 사진을 끌어다 올려 놓는 중인지
  const navigate = useNavigate()

  // 입력칸 값이 바뀔 때마다 form 상태를 갱신 (체크박스는 checked 값을 사용)
  function handleChange(e) {
    const { name, value, type, checked } = e.target
    setForm({ ...form, [name]: type === 'checkbox' ? checked : value })
    setAiFilled((list) => list.filter((n) => n !== name))
  }

  // 지출 항목 버튼을 눌렀을 때
  function pickCategory(c) {
    setForm({ ...form, category: c })
  }

  // 영수증 사진을 AI로 읽어서 폼에 채운다. 값은 총무가 확인하고 고친 뒤 저장한다.
  // (파일 고르기와 끌어다 놓기 둘 다 여기로 온다)
  async function readReceipt(file) {
    if (!file || reading || saving) return
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return setError('영수증은 JPG, PNG, WEBP 사진만 읽을 수 있습니다.')
    if (preview) URL.revokeObjectURL(preview)
    const newPreview = URL.createObjectURL(file)
    setPreview(newPreview)
    setError('')
    setReadNotice('')
    setReading(true)
    try {
      const body = new FormData()
      body.append('file', await shrinkImage(file), 'receipt.jpg')
      const r = await api('/receipts/read', { method: 'POST', body })
      setForm({
        ...form,
        date: r.date || form.date,
        amount: r.amount ?? form.amount,
        description: [r.items, r.store && `[${r.store}]`].filter(Boolean).join(' ') || form.description,
        has_receipt: true,
      })
      // AI가 실제로 값을 준 칸만 표시
      setAiFilled([r.date && 'date', r.amount != null && 'amount', (r.items || r.store) && 'description'].filter(Boolean))
      setReceiptFile(file)
      setReadNotice('AI가 읽은 값을 채웠습니다. 틀린 곳이 없는지 확인하고, 사업명과 지출 항목을 입력한 뒤 저장하세요.')
    } catch (e) {
      // 실패하면 미리보기를 지워서 다시 '사진 고르기' 칸이 보이게 한다 (첨부 예정 사진도 비움)
      URL.revokeObjectURL(newPreview)
      setPreview('')
      setReceiptFile(null)
      setError(`영수증 읽기에 실패했습니다. ${e.message}`)
    } finally {
      setReading(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault() // 폼 제출 시 페이지가 새로고침되지 않게 막음
    setError('')
    setSaving(true)
    try {
      const saved = await api('/expenses', {
        method: 'POST',
        body: JSON.stringify({ ...form, amount: Number(form.amount) }),
      })
      // 영수증 사진으로 채웠다면 그 사진을 증빙 파일로 붙인다
      if (receiptFile) {
        const body = new FormData()
        body.append('file', receiptFile)
        await api(`/expenses/${saved.id}/attachments`, { method: 'POST', body }).catch(() => {})
      }
      navigate(`/expenses/${saved.id}`)
    } catch (e) {
      setError(`저장에 실패했습니다. ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  // AI가 채운 칸은 연한 파랑 바탕 + 'AI' 표시
  const ai = (name) => (aiFilled.includes(name) ? { background: 'var(--primary-soft)' } : undefined)
  const aiTag = (name) => aiFilled.includes(name) && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--primary)' }}> AI</span>

  return (
    <div>
      <h2>지출 등록</h2>
      <div className="new-expense">
        {/* 왼쪽: 입력 */}
        <form onSubmit={handleSubmit} className="card" style={{ display: 'grid', gap: 16, marginBottom: 0, padding: 24, alignContent: 'start', alignSelf: 'start' }}>
          <div className="two-col">
            <label>
              <span>지출 날짜{aiTag('date')}</span>
              <input type="date" name="date" value={form.date} onChange={handleChange} style={ai('date')} required />
            </label>
            <label>
              <span>금액(원){aiTag('amount')}</span>
              {/* 위아래 버튼이 없는 숫자 칸: 숫자만 남기고 나머지 글자는 지운다 */}
              <input name="amount" inputMode="numeric" placeholder="0" value={form.amount} onChange={(e) => { e.target.value = e.target.value.replace(/[^0-9]/g, ''); handleChange(e) }} style={ai('amount')} required />
              {form.amount > 0 && <span className="muted tnum">{Number(form.amount).toLocaleString()}원</span>}
            </label>
          </div>
          <div className="two-col">
            <label>
              사업명 <SuggestInput name="event_name" list="event-names" placeholder="예: 개강총회" value={form.event_name} onChange={handleChange} required />
            </label>
            <label>
              지출 항목 <SuggestInput name="category" list="categories" placeholder="예: 급량비" value={form.category} onChange={handleChange} required />
            </label>
          </div>
          {/* 지출 항목 빠르게 고르기 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: -8 }}>
            {CATEGORIES.map((c) => (
              <button key={c} type="button" onClick={() => pickCategory(c)} className={form.category === c ? 'active' : ''} style={{ height: 28, fontSize: 12, padding: '0 10px' }}>{c}</button>
            ))}
          </div>
          <label>
            <span>지출 내용{aiTag('description')}</span>
            <textarea name="description" rows={3} placeholder="예: 피자 [가나피자] 라지 16판 × 20,000원" value={form.description} onChange={handleChange} style={ai('description')} required />
          </label>
          <label>
            <input type="checkbox" name="has_receipt" checked={form.has_receipt} onChange={handleChange} /> 증빙(영수증) 있음
          </label>
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
            <button type="submit" disabled={saving} style={{ width: '100%', height: 44, fontSize: 15, fontWeight: 600 }}>
              {saving ? 'AI가 규정을 보며 점검하는 중...' : '저장하고 AI 점검 받기'}
            </button>
            {error && <p style={{ color: 'var(--bad)' }}>{error}</p>}
          </div>
        </form>

        {/* 오른쪽: 영수증 사진 + 저장 후 흐름 안내 */}
        <div className="new-expense-side" style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <section className="card receipt-card" style={{ marginBottom: 0 }}>
            <b>영수증 사진으로 채우기</b>
            <p className="muted" style={{ marginTop: 2 }}>AI가 날짜·금액·내용을 읽어 입력칸에 채워요. 사진은 증빙으로 같이 붙어요.</p>
            <label
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); readReceipt(e.dataTransfer.files[0]) }}
              style={{
                display: 'grid', placeItems: 'center', textAlign: 'center', minHeight: 180, marginTop: 10, cursor: 'pointer',
                border: `1.5px dashed ${dragging ? 'var(--primary)' : 'var(--line-strong)'}`, borderRadius: 'var(--r-lg)',
                background: dragging ? 'var(--primary-soft)' : '#fafbfc', overflow: 'hidden', color: 'var(--sub)',
              }}
            >
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { readReceipt(e.target.files[0]); e.target.value = '' }} disabled={reading || saving} style={{ display: 'none' }} />
              {preview ? (
                <img src={preview} alt="영수증 미리보기" style={{ maxWidth: '100%', maxHeight: 260, opacity: reading ? 0.4 : 1 }} />
              ) : (
                <span>
                  <b style={{ color: 'var(--primary)' }}>사진 고르기</b><br />
                  <span className="muted">또는 여기로 끌어다 놓기 (JPG·PNG)</span>
                </span>
              )}
            </label>
            {reading && <p style={{ color: 'var(--primary)', fontWeight: 500 }}>AI가 영수증을 읽는 중...</p>}
            {receiptFile && !reading && <p className="muted">첨부 예정: {receiptFile.name} · 다른 사진은 위 칸을 다시 누르세요</p>}
            {readNotice && <p style={{ fontSize: 13, color: 'var(--warn)' }}>{readNotice}</p>}
          </section>

          <section className="card steps-card" style={{ marginBottom: 0 }}>
            <b>저장하면</b>
            <ol style={{ margin: '8px 0 0', paddingLeft: 18, display: 'grid', gap: 6, color: 'var(--sub)', fontSize: 13 }}>
              <li>AI가 회계 규정을 보고 점검해요 (10초쯤)</li>
              <li>문제 없음 · 확인 필요 · 조치 필요와 근거 조항, 챙길 것을 알려 줘요</li>
              <li>확정은 총무가 해요. 확인·조치 필요는 메모를 남기고 확정해요</li>
            </ol>
          </section>
        </div>
      </div>
    </div>
  )
}

export default ExpenseNewPage
