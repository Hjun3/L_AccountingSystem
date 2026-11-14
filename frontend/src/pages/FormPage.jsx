import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../common'

// 인쇄용 서류 화면 (사필영수증, 도안 출장 요청서) - 총대의원회 공식 양식의 항목·순서를 따른다
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
const line = { margin: '6px 0' }

// 사필영수증 (총대의원회 공식 양식 순서: docs/raw/(학과) 사필영수증 양식_수정.hwp)
// 비목: 양식의 선택지. 지출 항목(비목) 이름이 같으면 미리 고른다.
const SAPIL_KINDS = ['학생회비', '수용비', '보조비', '수당', '대여비', '상품비', '활동비', '환급비', '참가비', '이월금']
const KEEPERS = ['과학생회', '단과대 학생회', '단과대 대의원회', '총대의원회']
const won = (n) => `₩ ${n.toLocaleString()} 원`

// 명단 표 (지불자 / 수령자): 학과(직책)/학번, 연락처, 성명, 날짜
function PeopleTable({ title, dateLabel, rows, setRows, unit, note }) {
  const set = (i, key) => (v) => setRows(rows.map((r, j) => (j === i ? { ...r, [key]: v } : r)))
  return (
    <div style={{ marginTop: 28, breakBefore: 'page' }}>
      <h3 style={{ textAlign: 'center' }}>사필영수증 명단 ({title})</h3>
      <p style={line}>총 인 원 : {rows.length}명 · 금 액 : {won(unit * rows.length)} ({unit.toLocaleString()}원 × {rows.length}명)</p>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr>{['번호', '학과(직책) / 학번', '연락처', '성명', dateLabel].map((h) => <th key={h} style={cell}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={{ ...cell, textAlign: 'center', width: 40 }}>{i + 1}</td>
              <td style={cell}><Field value={r.dept} onChange={set(i, 'dept')} width="95%" /></td>
              <td style={cell}><Field value={r.phone} onChange={set(i, 'phone')} width="95%" /></td>
              <td style={cell}><Field value={r.name} onChange={set(i, 'name')} width="95%" /></td>
              <td style={cell}><Field value={r.date} onChange={set(i, 'date')} width="95%" /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={line}>이상 {rows.length} 명.</p>
      <p style={{ ...line, fontSize: 13 }}>{note}</p>
    </div>
  )
}

function SapilReceipt({ expense }) {
  const [f, setF] = useState({
    keeper: '과학생회', org: '', kind: SAPIL_KINDS.includes(expense.category) ? expense.category : '',
    payee: '', payer: '', moneyDate: expense.date, eventDate: expense.date,
    unit: String(expense.amount), count: '1', issueDate: new Date().toLocaleDateString('sv'), drafter: '', council: '',
  })
  const set = (key) => (v) => setF({ ...f, [key]: v })
  const count = Math.max(1, Math.min(50, Number(f.count) || 1))
  const unit = Number(f.unit) || 0
  const total = unit * count
  const person = (date) => ({ dept: '', phone: '', name: '', date })
  const [payers, setPayers] = useState([person(expense.date)])
  const [payees, setPayees] = useState([person(expense.date)])
  // 수령자 명단 줄 수는 '명' 칸을 따라간다
  if (payees.length !== count) setPayees(Array.from({ length: count }, (_, i) => payees[i] || person(f.moneyDate)))
  const kindText = f.kind || '(비목)'

  return (
    <div>
      <p style={{ ...line, fontSize: 13 }}>
        [<select value={f.keeper} onChange={(e) => set('keeper')(e.target.value)} style={{ font: 'inherit', border: 'none', background: 'transparent' }}>
          {KEEPERS.map((k) => <option key={k}>{k}</option>)}
        </select>] 보관용
      </p>
      <p style={line}><Field value={f.org} onChange={set('org')} width={300} placeholder="○○대학 ◇◇학과" /></p>
      <h2 style={{ textAlign: 'center', margin: '16px 0' }}>{kindText} 영수증</h2>
      <p className="no-print" style={line}>
        비목:{' '}
        {SAPIL_KINDS.map((k) => (
          <label key={k} style={{ marginRight: 10 }}>
            <input type="radio" checked={f.kind === k} onChange={() => set('kind')(k)} /> {k}
          </label>
        ))}
      </p>
      <div style={{ lineHeight: 2 }}>
        <div>수 령 자 : <Field value={f.payee} onChange={set('payee')} width={300} placeholder="○○학과 000" /></div>
        <div>지 불 자 : <Field value={f.payer} onChange={set('payer')} width={300} placeholder="00학과 00학생회 000" /></div>
        <div>사 업 : {expense.event_name}</div>
        <div>일 시 : <Field value={f.moneyDate} onChange={set('moneyDate')} width={110} /> (돈이 움직인 마지막 일시)</div>
        <div style={{ paddingLeft: 52 }}><Field value={f.eventDate} onChange={set('eventDate')} width={110} /> (사업을 시행하는 일시)</div>
        <div>
          금 액 : <b>{won(total)}</b> (<Field value={f.unit} onChange={set('unit')} width={90} />원 × <Field value={f.count} onChange={set('count')} width={40} />명)
          {total !== expense.amount && <span className="no-print" style={{ color: 'var(--bad)', fontSize: 12 }}> (등록된 지출 {expense.amount.toLocaleString()}원과 다름)</span>}
        </div>
      </div>
      <p style={{ margin: '20px 0', lineHeight: 1.8 }}>
        {f.payer || '(지불자)'} 에서 {f.payee || '(수령자)'}에 {expense.event_name} 사업을 위해 <b>{won(total)}</b>을 {kindText}(으)로 제공합니다. 이에 영수증을 발급합니다.
      </p>
      <p style={{ textAlign: 'center' }}><Field value={f.issueDate} onChange={set('issueDate')} width={110} /></p>
      <div style={{ lineHeight: 2.4, marginTop: 12 }}>
        <div>기 안 자 : <Field value={f.drafter} onChange={set('drafter')} width={280} placeholder="00학과 00학생회 000" /> (직인)</div>
        <div>대 의 원 : <Field value={f.council} onChange={set('council')} width={280} placeholder="전자정보대학 대의원회" /> (직인)</div>
      </div>

      <PeopleTable title="지 불 자" dateLabel="지불날짜" rows={payers} setRows={setPayers} unit={unit}
        note="지불자 증빙서류: 지불자 학생증(신분증), 지불자 통장사본, 지불자 통장거래내역" />
      <button className="no-print" onClick={() => setPayers([...payers, person(f.moneyDate)])}>지불자 줄 추가</button>
      <PeopleTable title="수 령 자" dateLabel="수령날짜" rows={payees} setRows={setPayees} unit={unit}
        note="수령자 증빙서류: 수령자 학생증(신분증), 수령자 통장사본, 수령자 통장거래내역 · 외부인: 사업자등록증, 납품서, 거래명세서" />
    </div>
  )
}

// 도안 출장 요청서 (총대의원회 공식 양식 순서: docs/raw/(학과) 도안 출장 요청서 양식_수정.xlsx)
function DoanRequest({ expense }) {
  const [f, setF] = useState({ org: '', position: '', name: '', visit: '', place: '' })
  const set = (key) => (v) => setF({ ...f, [key]: v })
  // 제품 목록: 처음에는 지출 내용으로 한 줄을 채워 둔다
  const [items, setItems] = useState([{ name: expense.description, qty: '', note: '' }])
  const setItem = (i, key) => (v) => setItems(items.map((it, j) => (j === i ? { ...it, [key]: v } : it)))
  const row = (label, input) => <tr><td style={head}>{label}</td><td style={cell}>{input}</td></tr>

  return (
    <div>
      <h2 style={{ textAlign: 'center' }}>도안 출장 요청서</h2>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <tbody>
          {row('소속', <Field value={f.org} onChange={set('org')} width={300} placeholder="00대학 00학과 00학생회" />)}
          {row('직책', <Field value={f.position} onChange={set('position')} width={200} placeholder="00부장" />)}
          {row('성명', <Field value={f.name} onChange={set('name')} width={200} />)}
          {row('사업/행사명', expense.event_name)}
          {row('방문희망 일시', <Field value={f.visit} onChange={set('visit')} width={250} placeholder="00월 00일 00시 00분" />)}
          {row('방문희망 장소', <Field value={f.place} onChange={set('place')} width={300} placeholder="건물번호, 호수 자세히 작성" />)}
        </tbody>
      </table>
      <h3 style={{ marginTop: 20 }}>도안 내용</h3>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr><th style={{ ...cell, width: 40 }}>번호</th><th style={cell}>제품명</th><th style={{ ...cell, width: 70 }}>수량</th><th style={{ ...cell, width: 70 }}>확인</th><th style={{ ...cell, width: 140 }}>비고</th></tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td style={{ ...cell, textAlign: 'center' }}>{i + 1}</td>
              <td style={cell}><Field value={it.name} onChange={setItem(i, 'name')} width="95%" /></td>
              <td style={cell}><Field value={it.qty} onChange={setItem(i, 'qty')} width={50} /></td>
              <td style={cell}></td>
              <td style={cell}><Field value={it.note} onChange={setItem(i, 'note')} width="95%" /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="no-print" onClick={() => setItems([...items, { name: '', qty: '', note: '' }])}>줄 추가</button>
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
          총대의원회 공식 양식(hwp·엑셀)의 항목과 순서를 따라 만든 인쇄용 화면입니다. 칸 모양은 원본과 조금 다를 수 있어요. 밑줄 칸은 입력한 뒤 인쇄하세요. (입력값은 저장되지 않습니다)
        </p>
      </div>
      {kind === 'sapil' && <SapilReceipt expense={expense} />}
      {kind === 'doan' && <DoanRequest expense={expense} />}
      {kind !== 'sapil' && kind !== 'doan' && <p>알 수 없는 서류입니다.</p>}
    </div>
  )
}

export default FormPage
