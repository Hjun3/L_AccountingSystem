import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../common'

// 아직 등록되지 않은 출금 1건: 총무가 사업명과 비목을 채운 뒤 'AI 점검 후 등록'을 누른다
function UnregisteredRow({ tx, onRegistered }) {
  const [form, setForm] = useState({ event_name: '', category: '', description: tx.content, has_receipt: false })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function register() {
    setError('')
    setSaving(true)
    try {
      const saved = await api('/expenses', {
        method: 'POST',
        body: JSON.stringify({ ...form, date: tx.date, amount: tx.amount }),
      })
      onRegistered(saved.id)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const ready = form.event_name && form.category && form.description

  return (
    <>
      <td><input placeholder="사업명" value={form.event_name} onChange={set('event_name')} style={{ width: 110 }} /></td>
      <td><input placeholder="비목" value={form.category} onChange={set('category')} style={{ width: 70 }} /></td>
      <td><input value={form.description} onChange={set('description')} style={{ width: 180 }} /></td>
      <td style={{ textAlign: 'center' }}><input type="checkbox" checked={form.has_receipt} onChange={set('has_receipt')} /></td>
      <td>
        <button onClick={register} disabled={!ready || saving}>{saving ? 'AI 점검 중...' : 'AI 점검 후 등록'}</button>
        {error && <div style={{ color: 'red', fontSize: 12 }}>{error}</div>}
      </td>
    </>
  )
}

// 거래내역 불러오기: 은행 엑셀의 출금 내역을 등록된 지출과 맞춰 보고, 빠진 건을 등록한다
function BankImportPage() {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function upload(e) {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    setError('')
    setLoading(true)
    try {
      const body = new FormData()
      body.append('file', file)
      setResult(await api('/bank/import', { method: 'POST', body }))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // 등록이 끝난 줄은 '등록됨'으로 바꿔 보여준다
  function markRegistered(index, expenseId) {
    const transactions = result.transactions.map((t, i) => (i === index ? { ...t, matched_expense_id: expenseId } : t))
    setResult({ ...result, transactions })
  }

  const unregisteredCount = result ? result.transactions.filter((t) => !t.matched_expense_id).length : 0

  return (
    <div>
      <h2>거래내역 불러오기</h2>
      <p style={{ fontSize: 13 }}>
        카카오뱅크·토스뱅크 앱에서 받은 거래내역 엑셀(xlsx)을 올리면, 출금 내역을 등록된 지출과 날짜·금액으로 맞춰 봅니다.
        <br />
        AI는 'AI 점검 후 등록'을 누른 줄만 호출합니다. 파일은 서버에 저장하지 않습니다.
      </p>
      <p style={{ fontSize: 12, color: 'gray' }}>
        시연용 가상 파일: backend/sample_data/kakaobank_sample.xlsx, tossbank_sample.xlsx
      </p>
      <input type="file" accept=".xlsx" onChange={upload} disabled={loading} />
      {loading && <span> 읽는 중...</span>}
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {result && (
        <>
          <h3>
            출금 {result.transactions.length}건 (미등록 <span style={{ color: 'red' }}>{unregisteredCount}건</span>)
          </h3>
          <table border="1" cellPadding="4" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th>거래일시</th><th>금액</th><th>통장 내용</th><th>상태</th>
                <th>사업명</th><th>비목</th><th>지출 내용</th><th>증빙</th><th></th>
              </tr>
            </thead>
            <tbody>
              {result.transactions.map((tx, i) => (
                <tr key={i} style={{ background: tx.matched_expense_id ? 'white' : '#fff4f4' }}>
                  <td>{tx.datetime.replace('T', ' ')}</td>
                  <td style={{ textAlign: 'right' }}>{tx.amount.toLocaleString()}원</td>
                  <td>{tx.content}</td>
                  {tx.matched_expense_id ? (
                    <>
                      <td><Link to={`/expenses/${tx.matched_expense_id}`}>등록됨</Link></td>
                      <td colSpan={5}></td>
                    </>
                  ) : (
                    <>
                      <td style={{ color: 'red' }}>미등록</td>
                      <UnregisteredRow tx={tx} onRegistered={(id) => markRegistered(i, id)} />
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          <h3>통장에 출금이 없는 지출 ({result.unmatched_expenses.length}건)</h3>
          <p style={{ fontSize: 12, color: 'gray' }}>
            같은 기간에 지출로 등록했지만 같은 날짜·금액의 출금이 없습니다. 현금 사용이거나 날짜·금액 입력이 틀렸을 수 있습니다.
          </p>
          <ul>
            {result.unmatched_expenses.map((exp) => (
              <li key={exp.id}>
                <Link to={`/expenses/${exp.id}`}>
                  {exp.date} {exp.amount.toLocaleString()}원 {exp.event_name} - {exp.description}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

export default BankImportPage
