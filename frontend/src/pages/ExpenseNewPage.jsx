import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../common'
import NameSuggestions from '../components/NameSuggestions'

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
  const navigate = useNavigate()

  // 입력칸 값이 바뀔 때마다 form 상태를 갱신 (체크박스는 checked 값을 사용)
  function handleChange(e) {
    const { name, value, type, checked } = e.target
    setForm({ ...form, [name]: type === 'checkbox' ? checked : value })
  }

  // 영수증 사진을 AI로 읽어서 폼에 채운다. 값은 총무가 확인하고 고친 뒤 저장한다.
  async function readReceipt(e) {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
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
      setReceiptFile(file)
      setReadNotice('AI가 읽은 값을 채웠습니다. 틀린 곳이 없는지 확인하고, 사업명과 지출 항목을 입력한 뒤 저장하세요.')
    } catch (e) {
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

  return (
    <div>
      <h2>지출 등록</h2>
      <NameSuggestions />
      <div style={{ border: '1px dashed gray', padding: 8, marginBottom: 12, maxWidth: 384 }}>
        <b>영수증 사진으로 채우기</b>{' '}
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={readReceipt} disabled={reading || saving} />
        {reading && <div>AI가 영수증을 읽는 중...</div>}
        {receiptFile && !reading && <div style={{ fontSize: 12 }}>첨부 예정: {receiptFile.name}</div>}
        {readNotice && <div style={{ fontSize: 12, color: 'darkorange' }}>{readNotice}</div>}
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 8, maxWidth: 400 }}>
        <label>
          지출 날짜 <input type="date" name="date" value={form.date} onChange={handleChange} required />
        </label>
        <label>
          금액(원) <input type="number" name="amount" min="0" value={form.amount} onChange={handleChange} required />
        </label>
        <label>
          사업명 <input name="event_name" list="event-names" placeholder="예: 개강총회" value={form.event_name} onChange={handleChange} required />
        </label>
        <label>
          지출 항목 <input name="category" list="categories" placeholder="예: 수용비, 급량비" value={form.category} onChange={handleChange} required />
        </label>
        <label>
          지출 내용 <input name="description" value={form.description} onChange={handleChange} required />
        </label>
        <label>
          <input type="checkbox" name="has_receipt" checked={form.has_receipt} onChange={handleChange} /> 증빙(영수증) 있음
        </label>
        <button type="submit" disabled={saving}>
          {saving ? 'AI 점검 중...' : '저장'}
        </button>
      </form>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  )
}

export default ExpenseNewPage
