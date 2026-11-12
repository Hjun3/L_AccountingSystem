import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, canEdit, useUser, STATUS_COLORS } from '../common'
import Pager, { paginate } from '../components/Pager'
import AiUsageWarning from '../components/AiUsageWarning'
import SuggestInput from '../components/SuggestInput'

// 아직 등록되지 않은 출금 1건: 총무가 사업명과 지출 항목을 채운 뒤 'AI 점검 후 등록'을 누른다
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
      <td><SuggestInput list="event-names" placeholder="사업명" value={form.event_name} onChange={set('event_name')} style={{ width: 110 }} /></td>
      <td><SuggestInput list="categories" placeholder="항목" value={form.category} onChange={set('category')} style={{ width: 90 }} /></td>
      <td><input value={form.description} onChange={set('description')} style={{ width: 180 }} /></td>
      <td style={{ textAlign: 'center' }}><input type="checkbox" title="증빙 있음" checked={form.has_receipt} onChange={set('has_receipt')} /></td>
      <td>
        <button onClick={register} disabled={!ready || saving}>{saving ? 'AI 점검 중...' : 'AI 점검 후 등록'}</button>
        {error && <div style={{ color: 'var(--bad)', fontSize: 12 }}>{error}</div>}
      </td>
    </>
  )
}

// 거래내역 불러오기: 은행 엑셀의 출금 내역을 등록된 지출과 맞춰 보고, 빠진 건을 등록한다
function BankImportPage() {
  const user = useUser()
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [file, setFile] = useState(null) // 고른 파일 (비밀번호를 넣고 다시 읽을 때 사용)
  const [password, setPassword] = useState('') // 파일 비밀번호: 서버에 저장하지 않고 파일을 풀 때만 씀
  const [dragging, setDragging] = useState(false) // 파일을 끌어다 올려 놓는 중인지
  const [onlyUnregistered, setOnlyUnregistered] = useState(true) // 표에서 미등록만 볼지
  const [page, setPage] = useState(1) // 통장 출금 표의 쪽 번호 (한 쪽 10건)

  async function readFile(target, pw) {
    setError('')
    setLoading(true)
    try {
      const body = new FormData()
      body.append('file', target)
      body.append('password', pw)
      setResult(await api('/bank/import', { method: 'POST', body }))
      setPage(1)
    } catch (e) {
      setResult(null)
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // 파일 고르기와 끌어다 놓기 둘 다 여기로 온다
  function chooseFile(chosen) {
    if (!chosen || loading) return
    if (!chosen.name.toLowerCase().endsWith('.xlsx')) return setError('은행 앱에서 받은 엑셀 파일(.xlsx)만 읽을 수 있습니다.')
    setFile(chosen)
    readFile(chosen, password)
  }

  // 등록이 끝난 줄은 '등록됨'으로 바꿔 보여준다
  function markRegistered(index, expenseId) {
    const transactions = result.transactions.map((t, i) => (i === index ? { ...t, matched_expense_id: expenseId } : t))
    setResult({ ...result, transactions })
  }

  const unregisteredCount = result ? result.transactions.filter((t) => !t.matched_expense_id).length : 0

  const allRows = result ? result.transactions.map((tx, i) => ({ tx, i })).filter(({ tx }) => !onlyUnregistered || !tx.matched_expense_id) : []
  const { rows, count: pageCount, current } = paginate(allRows, page, 10)

  // 열람 계정은 등록할 수 없으므로 안내만 보여 준다 (메뉴에도 없지만 주소로 들어온 경우)
  if (!canEdit(user)) return <div className="card">열람 계정은 이 화면을 쓸 수 없습니다. 지출은 '지출 목록'에서 볼 수 있어요.</div>

  return (
    <div>
      <h2>거래내역 불러오기</h2>
      <AiUsageWarning />

      {/* 위쪽: 왼쪽 파일 올리기, 오른쪽 안내 (아래 결과 표와 폭을 맞춤) */}
      <div className="new-expense" style={{ maxWidth: 'none' }}>
        <section className="card" style={{ marginBottom: 0 }}>
          <b>거래내역 엑셀 올리기</b>
          <p className="muted" style={{ marginTop: 2 }}>카카오뱅크·토스뱅크 앱에서 받은 거래내역 엑셀(.xlsx)</p>
          <label
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); chooseFile(e.dataTransfer.files[0]) }}
            style={{
              display: 'grid', placeItems: 'center', textAlign: 'center', minHeight: 140, marginTop: 10, cursor: loading ? 'default' : 'pointer',
              border: `1.5px dashed ${dragging ? 'var(--primary)' : 'var(--line-strong)'}`, borderRadius: 'var(--r-lg)',
              background: dragging ? 'var(--primary-soft)' : '#fafbfc', color: 'var(--sub)',
            }}
          >
            <input type="file" accept=".xlsx" onChange={(e) => { chooseFile(e.target.files[0]); e.target.value = '' }} disabled={loading} style={{ display: 'none' }} />
            {loading ? (
              <span style={{ color: 'var(--primary)', fontWeight: 500 }}>읽는 중...</span>
            ) : (
              <span>
                <b style={{ color: 'var(--primary)' }}>{file ? '다른 파일 고르기' : '엑셀 파일 고르기'}</b><br />
                <span className="muted">{file ? `지금 파일: ${file.name}` : '또는 여기로 끌어다 놓기'}</span>
              </span>
            )}
          </label>
          {/* 비밀번호: 이메일로 받은 엑셀은 보통 걸려 있다 */}
          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            <input
              type="password"
              placeholder="파일 비밀번호 (있으면 먼저 입력)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              style={{ flex: 1, minWidth: 0 }}
            />
            {file && (
              <button onClick={() => readFile(file, password)} disabled={loading}>비밀번호로 다시 읽기</button>
            )}
          </div>
          <p className="muted">비밀번호는 파일을 여는 데만 쓰고 저장하지 않습니다.</p>
          {error && <p style={{ color: 'var(--bad)' }}>{error}</p>}
        </section>

        <section className="card" style={{ marginBottom: 0 }}>
          <b>이렇게 맞춰 봐요</b>
          <ol style={{ margin: '8px 0 0', paddingLeft: 18, display: 'grid', gap: 6, color: 'var(--sub)', fontSize: 13 }}>
            <li>통장 출금을 등록된 지출과 날짜·금액으로 맞춰 봐요</li>
            <li>빠진 출금은 사업명·지출 항목을 채워 바로 등록해요. AI 점검은 등록 버튼을 누른 줄만 해요</li>
            <li>반대로 지출은 있는데 통장 출금이 없는 건도 알려 줘요 (현금 사용, 입력 실수)</li>
          </ol>
          <p className="muted" style={{ marginTop: 12 }}>
            엑셀 파일은 저장하지 않고, 거래 내역만 대시보드 잔액용으로 저장해요 (같은 거래는 한 번만).
            <br />시연용 가상 파일: backend/sample_data/kakaobank_sample.xlsx, tossbank_sample.xlsx
          </p>
        </section>
      </div>

      {result && (
        <>
          {/* 결과 요약 */}
          <div className="card tnum" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginTop: 20 }}>
            {[
              { label: '출금', value: result.transactions.length },
              { label: '등록됨', value: result.transactions.length - unregisteredCount, color: STATUS_COLORS.적합 },
              { label: '미등록 출금', value: unregisteredCount, color: unregisteredCount ? 'var(--bad)' : undefined },
              { label: '통장에 없는 지출', value: result.unmatched_expenses.length, color: result.unmatched_expenses.length ? 'var(--warn)' : undefined },
            ].map((it) => (
              <div key={it.label}>
                <div className="muted">{it.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: it.color }}>{it.value}건</div>
              </div>
            ))}
            <div className="muted" style={{ gridColumn: '1 / -1' }}>새로 저장된 거래 {result.saved_count}건 (이미 저장된 거래는 건너뜀)</div>
          </div>

          <div className="section-title">
            <h3>통장 출금</h3>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className={onlyUnregistered ? 'active' : ''} onClick={() => { setOnlyUnregistered(true); setPage(1) }}>미등록 {unregisteredCount}</button>
              <button className={!onlyUnregistered ? 'active' : ''} onClick={() => { setOnlyUnregistered(false); setPage(1) }}>전체 {result.transactions.length}</button>
            </div>
          </div>
          <div className="table-box">
            <table>
              <thead>
                <tr>
                  <th>거래일시</th><th className="num">금액</th><th>통장 내용</th><th>상태</th>
                  <th>사업명</th><th>항목</th><th>지출 내용</th><th>증빙</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ tx, i }) => (
                  <tr key={i}>
                    <td className="tnum" style={{ whiteSpace: 'nowrap' }}>{tx.datetime.replace('T', ' ').slice(0, 16)}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{tx.amount.toLocaleString()}</td>
                    <td>{tx.content}</td>
                    {tx.matched_expense_id ? (
                      <>
                        <td><Link to={`/expenses/${tx.matched_expense_id}`} className="status" style={{ color: STATUS_COLORS.적합 }}>등록됨</Link></td>
                        <td colSpan={5}></td>
                      </>
                    ) : (
                      <>
                        <td><span className="status" style={{ color: 'var(--bad)' }}>미등록</span></td>
                        <UnregisteredRow tx={tx} onRegistered={(id) => markRegistered(i, id)} />
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <p className="muted" style={{ padding: 16 }}>미등록 출금이 없습니다. 모두 지출로 등록되어 있어요.</p>}
          </div>
          <Pager page={current} count={pageCount} onChange={setPage} keepPosition />

          <div className="section-title">
            <h3>통장에 출금이 없는 지출 <span className="muted" style={{ fontWeight: 400 }}>{result.unmatched_expenses.length}건</span></h3>
            <span className="muted">현금 사용이거나 날짜·금액 입력이 틀렸을 수 있어요</span>
          </div>
          {/* 길어지면 이 안에서 스크롤 */}
          <div className="table-box" style={{ maxHeight: 360, overflowY: 'auto' }}>
            <table>
              <tbody>
                {result.unmatched_expenses.map((exp) => (
                  <tr key={exp.id}>
                    <td className="tnum" style={{ whiteSpace: 'nowrap', width: 110 }}>{exp.date}</td>
                    <td className="num" style={{ fontWeight: 600, width: 110 }}>{exp.amount.toLocaleString()}</td>
                    <td><Link to={`/expenses/${exp.id}`} style={{ color: 'var(--text)' }}>{exp.event_name} · {exp.description}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.unmatched_expenses.length === 0 && <p className="muted" style={{ padding: 16 }}>없습니다.</p>}
          </div>
        </>
      )}
    </div>
  )
}

export default BankImportPage
