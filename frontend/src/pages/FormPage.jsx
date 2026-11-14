import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../common'

// 인쇄용 서류 화면 (사필영수증, 도안 출장 요청서)
// 지출 정보로 미리 채우고, 나머지 빈칸은 화면에서 입력한 뒤 인쇄한다. 입력값은 저장하지 않는다.

// 밑줄만 있는 입력칸: 화면에서는 입력, 인쇄하면 글자만 보인다
function Field({ value, onChange, width = 200, placeholder = '' }) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{ border: 'none', borderBottom: '1px solid black', width, font: 'inherit', background: 'transparent' }}
    />
  )
}

const cell = { border: '1px solid black', padding: 6 }
const head = { ...cell, background: '#eee', width: 110, fontWeight: 'bold' }

// 사필영수증의 비목 칸. 지출의 비목을 보고 미리 체크한다.
const SAPIL_KINDS = ['상품', '환급', '활동비', '지원금', '참가비', '이월']
const CATEGORY_TO_KIND = { 상품비: '상품', 환급비: '환급', 활동비: '활동비', 보조비: '지원금' }

function SapilReceipt({ expense }) {
  const [f, setF] = useState({
    payee: '', payeeAccount: '', payer: '학생회', payerAccount: '',
    moneyDate: expense.date, eventDate: expense.date,
    name: '', position: '', phone: '',
    unit: String(expense.amount), count: '1',
    kind: CATEGORY_TO_KIND[expense.category] || '',
    submitDate: new Date().toLocaleDateString('sv'),
  })
  const set = (key) => (v) => setF({ ...f, [key]: v })
  const total = (Number(f.unit) || 0) * (Number(f.count) || 0)

  return (
    <div>
      <h2 style={{ textAlign: 'center' }}>사 필 영 수 증</h2>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <tbody>
          <tr><td style={head}>받는 곳</td><td style={cell}><Field value={f.payee} onChange={set('payee')} /> 계좌 <Field value={f.payeeAccount} onChange={set('payeeAccount')} width={180} /></td></tr>
          <tr><td style={head}>지불하는 곳</td><td style={cell}><Field value={f.payer} onChange={set('payer')} /> 계좌 <Field value={f.payerAccount} onChange={set('payerAccount')} width={180} /></td></tr>
          <tr><td style={head}>사업</td><td style={cell}>{expense.event_name}</td></tr>
          <tr><td style={head}>일시</td><td style={cell}>
            지급일 <Field value={f.moneyDate} onChange={set('moneyDate')} width={110} /> / 사업 시행일 <Field value={f.eventDate} onChange={set('eventDate')} width={110} />
          </td></tr>
          <tr><td style={head}>수령인</td><td style={cell}>
            성명 <Field value={f.name} onChange={set('name')} width={90} /> 직책 <Field value={f.position} onChange={set('position')} width={90} /> 연락처 <Field value={f.phone} onChange={set('phone')} width={130} />
          </td></tr>
          <tr><td style={head}>금액</td><td style={cell}>
            <Field value={f.unit} onChange={set('unit')} width={90} />원 × <Field value={f.count} onChange={set('count')} width={40} />명 = <b>{total.toLocaleString()}원</b>
            {total !== expense.amount && <span className="no-print" style={{ color: 'var(--bad)', fontSize: 12 }}> (등록된 지출 {expense.amount.toLocaleString()}원과 다름)</span>}
          </td></tr>
          <tr><td style={head}>비목</td><td style={cell}>
            {SAPIL_KINDS.map((k) => (
              <label key={k} style={{ marginRight: 12 }}>
                <input type="checkbox" checked={f.kind === k} onChange={() => set('kind')(f.kind === k ? '' : k)} /> {k}
              </label>
            ))}
          </td></tr>
          <tr><td style={head}>내용</td><td style={cell}>{expense.description}</td></tr>
          <tr><td style={head}>제출일자</td><td style={cell}><Field value={f.submitDate} onChange={set('submitDate')} width={110} /></td></tr>
        </tbody>
      </table>
      <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 16, textAlign: 'center' }}>
        <tbody>
          <tr><td style={cell}>받는 곳 (인)</td><td style={cell}>지불하는 곳 (인)</td><td style={cell}>대의원회 (인)</td></tr>
          <tr><td style={{ ...cell, height: 70 }}></td><td style={cell}></td><td style={cell}></td></tr>
        </tbody>
      </table>
      <p style={{ fontSize: 13 }}>첨부: 수령인 학생증 사본, 총무 학생증 사본, 통장 거래내역</p>
    </div>
  )
}

function DoanRequest({ expense }) {
  const [f, setF] = useState({ visit: '', place: '' })
  // 제품 목록: 처음에는 지출 내용으로 한 줄을 채워 둔다
  const [items, setItems] = useState([{ name: expense.description, qty: '' }])
  const setItem = (i, key) => (v) => setItems(items.map((it, j) => (j === i ? { ...it, [key]: v } : it)))

  return (
    <div>
      <h2 style={{ textAlign: 'center' }}>도안 출장 요청서</h2>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <tbody>
          <tr><td style={head}>사업명</td><td style={cell}>{expense.event_name}</td></tr>
          <tr><td style={head}>방문 희망 일시</td><td style={cell}><Field value={f.visit} onChange={(v) => setF({ ...f, visit: v })} width={250} placeholder="예: 2026-05-16 15:00" /></td></tr>
          <tr><td style={head}>방문 장소</td><td style={cell}><Field value={f.place} onChange={(v) => setF({ ...f, place: v })} width={250} /></td></tr>
        </tbody>
      </table>
      <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 16 }}>
        <thead>
          <tr><th style={{ ...cell, width: 40 }}>번호</th><th style={cell}>제품명</th><th style={{ ...cell, width: 80 }}>수량</th><th style={{ ...cell, width: 160 }}>특이사항 (상임의원 기재)</th></tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td style={{ ...cell, textAlign: 'center' }}>{i + 1}</td>
              <td style={cell}><Field value={it.name} onChange={setItem(i, 'name')} width="95%" /></td>
              <td style={cell}><Field value={it.qty} onChange={setItem(i, 'qty')} width={60} /></td>
              <td style={cell}></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="no-print" onClick={() => setItems([...items, { name: '', qty: '' }])}>줄 추가</button>
    </div>
  )
}

function FormPage() {
  const { id, kind } = useParams() // 주소 /expenses/3/forms/sapil
  const [expense, setExpense] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api(`/expenses/${id}`).then(setExpense).catch((e) => setError(e.message))
  }, [id])

  if (error) return <p style={{ color: 'var(--bad)' }}>{error}</p>
  if (!expense) return <p>불러오는 중...</p>

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="no-print" style={{ marginBottom: 12 }}>
        <Link to={`/expenses/${id}`}>← 지출 상세로</Link>{' '}
        <button onClick={() => window.print()}>인쇄 / PDF 저장</button>
        <p style={{ fontSize: 12, color: 'var(--muted)' }}>
          감사자료의 항목을 바탕으로 만든 양식이라 학생회 실제 양식과 다를 수 있습니다. 밑줄 칸은 입력한 뒤 인쇄하세요. (입력값은 저장되지 않습니다)
        </p>
      </div>
      {kind === 'sapil' && <SapilReceipt expense={expense} />}
      {kind === 'doan' && <DoanRequest expense={expense} />}
      {kind !== 'sapil' && kind !== 'doan' && <p>알 수 없는 서류입니다.</p>}
    </div>
  )
}

export default FormPage
