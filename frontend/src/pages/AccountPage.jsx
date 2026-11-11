import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, isAdmin, useTerm, useUser } from '../common'
import { MonthBars } from '../components/Charts'
import Pager, { paginate } from '../components/Pager'
import PasswordPage from './PasswordPage'

// 역할별로 할 수 있는 일 (사용자 관리 화면과 같은 설명)
const ROLE_HELP = {
  admin: '모든 기능 + 사용자 관리 + 기록 보기',
  treasurer: '회계 작업 전부 (등록·수정·결정·예산)',
  viewer: '보기만 가능',
}

// '2026-11-11T08:23:21' → '방금 전', '5분 전', '3시간 전', '2일 전' 또는 날짜
function timeAgo(text) {
  if (!text) return '-'
  const minutes = Math.floor((Date.now() - new Date(text).getTime()) / 60000)
  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}시간 전`
  if (minutes < 60 * 24 * 7) return `${Math.floor(minutes / 1440)}일 전`
  return text.slice(0, 10)
}

// 한 줄: 왼쪽 항목 이름 | 가운데 값 | 오른쪽 버튼 (계정 설정 화면에서 흔한 모양)
function Row({ label, children, action }) {
  return (
    <div className="account-row">
      <div className="muted" style={{ fontSize: 13 }}>{label}</div>
      <div style={{ minWidth: 0 }}>{children}</div>
      <div>{action}</div>
    </div>
  )
}

// 그 자리에서 고치는 줄: [변경] → 입력칸 + 저장/취소 (이름·직책에 같이 씀)
function EditableRow({ label, value, placeholder, maxLength, allowEmpty = false, onSave, hint }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(value)
  async function submit(e) {
    e.preventDefault()
    if (await onSave(text.trim())) setEditing(false)
  }
  return (
    <Row label={label} action={!editing && <button onClick={() => { setText(value); setEditing(true) }}>{value ? '변경' : '입력'}</button>}>
      {editing ? (
        <form onSubmit={submit} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input value={text} maxLength={maxLength} placeholder={placeholder} onChange={(e) => setText(e.target.value)} autoFocus style={{ flex: 1, minWidth: 140 }} />
          <button type="submit" disabled={(!allowEmpty && !text.trim()) || text.trim() === value}>저장</button>
          <button type="button" onClick={() => setEditing(false)}>취소</button>
        </form>
      ) : (
        <>
          {value ? <b>{value}</b> : <span className="muted">{placeholder}</span>}
          {hint && <div className="muted">{hint}</div>}
        </>
      )}
    </Row>
  )
}

// 막대에 보여 줄 달 목록: 임기를 골랐으면 임기 첫 달 ~ (이번 달과 임기 마지막 달 중 빠른 달), 아니면 기록이 있는 달만
function monthRange(term, counts) {
  if (!term) return Object.keys(counts).sort()
  const thisMonth = new Date().toLocaleDateString('sv').slice(0, 7)
  const last = term.end_date.slice(0, 7) < thisMonth ? term.end_date.slice(0, 7) : thisMonth
  const months = []
  let [y, m] = term.start_date.slice(0, 7).split('-').map(Number)
  for (let i = 0; i < 24; i++) {
    const key = `${y}-${String(m).padStart(2, '0')}`
    if (key > last) break
    months.push(key)
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  return months
}

const SECTIONS = [['profile', '프로필'], ['summary', '내 활동'], ['sessions', '로그인된 곳'], ['activity', '최근 활동']]
const PAGE_SIZE = 5 // 로그인된 곳·최근 활동을 한 쪽에 몇 개씩

// 내 정보 화면: 프로필(이름 바꾸기), 보안(비밀번호), 로그인된 곳(다른 기기 로그아웃), 최근 활동
function AccountPage({ onUserChanged }) {
  const user = useUser()
  const { terms, termId } = useTerm() // 왼쪽 메뉴에서 고른 임기 (내 활동 요약 기준)
  const [changingPassword, setChangingPassword] = useState(false)
  const [sessions, setSessions] = useState([])
  const [activity, setActivity] = useState(null)
  const [message, setMessage] = useState('') // 잘 됐을 때 안내
  const [error, setError] = useState('')
  const [sessionPage, setSessionPage] = useState(1)
  const [activityPage, setActivityPage] = useState(1)
  const [current, setCurrent] = useState('profile') // 지금 화면에 보이는 구역 (왼쪽 목차에 표시)

  // 화면을 내릴 때 지금 보고 있는 구역을 찾는다: 화면 맨 위에서 100px 선을 지나간 구역 중 마지막 것
  // (목차를 누르면 그 구역이 화면 맨 위로 오므로, 짧은 구역도 정확히 잡힌다)
  useEffect(() => {
    function onScroll() {
      const line = 100
      let found = SECTIONS[0][0]
      for (const [id] of SECTIONS) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top <= line) found = id
      }
      // 실제로 내려서 맨 아래에 닿으면 마지막 구역 (마지막 구역이 짧아 위까지 못 올라오는 경우)
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2
      if (window.scrollY > 0 && atBottom) found = SECTIONS[SECTIONS.length - 1][0]
      setCurrent(found)
    }
    onScroll()
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  function loadSessions() {
    api('/auth/sessions').then(setSessions).catch((e) => setError(e.message))
  }
  useEffect(() => {
    loadSessions()
    api('/me/activity').then(setActivity).catch(() => setActivity([]))
  }, [])

  async function run(job, doneText) {
    setError('')
    setMessage('')
    try {
      await job()
      setMessage(doneText)
    } catch (e) {
      setError(e.message)
    }
  }

  // 이름·직책 저장 (성공하면 true)
  async function saveMe(field, value, doneText) {
    setError('')
    setMessage('')
    try {
      await api('/auth/me', { method: 'PATCH', body: JSON.stringify({ [field]: value }) })
      onUserChanged()
      setMessage(doneText)
      return true
    } catch (e) {
      setError(e.message)
      return false
    }
  }

  const logoutOne = (s) => {
    if (!window.confirm(`'${s.device}'의 로그인을 끊을까요?`)) return
    run(async () => {
      await api(`/auth/sessions/${s.id}`, { method: 'DELETE' })
      loadSessions()
    }, `'${s.device}'에서 로그아웃했습니다.`)
  }

  const logoutOthers = () => {
    if (!window.confirm('지금 이 기기만 남기고 다른 곳의 로그인을 모두 끊을까요?')) return
    run(async () => {
      const r = await api('/auth/sessions/logout-others', { method: 'POST' })
      loadSessions()
      return r
    }, '다른 기기의 로그인을 모두 끊었습니다.')
  }

  // 내 활동 요약: 고른 임기 날짜 안에서 내가 남긴 기록을 종류별로 센다 ('전체 임기'면 전체)
  const term = terms.find((t) => t.id === termId)
  const inTerm = (activity || []).filter((a) => !term || (term.start_date <= a.created_at.slice(0, 10) && a.created_at.slice(0, 10) <= term.end_date))
  const registeredLogs = inTerm.filter((a) => a.action === '지출 등록')
  const monthCount = {}
  for (const a of registeredLogs) monthCount[a.created_at.slice(0, 7)] = (monthCount[a.created_at.slice(0, 7)] || 0) + 1
  const summary = {
    termName: term ? term.name : '전체 임기',
    registered: registeredLogs.length,
    registeredAmount: registeredLogs.reduce((n, a) => n + (a.expense && !a.expense.deleted_at ? a.expense.amount : 0), 0),
    confirmed: inTerm.filter((a) => a.action === '총무 결정' && a.detail.includes('→ 확정')).length,
    attached: inTerm.filter((a) => a.action === '증빙 첨부').length,
    edited: inTerm.filter((a) => a.action === '지출 수정' || a.action === '지출 삭제').length,
    months: monthRange(term, monthCount).map((m) => ({ month: m, value: monthCount[m] || 0 })),
  }

  const others = sessions.filter((s) => !s.current)
  const sessionView = paginate(sessions, sessionPage, PAGE_SIZE)
  const activityView = paginate(activity || [], activityPage, PAGE_SIZE)
  const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div style={{ maxWidth: 1100 }}>
      <h2>내 정보</h2>
      {error && <p className="notice" style={{ color: 'var(--bad)' }}>{error}</p>}
      {message && <p className="notice" style={{ color: 'var(--ok)' }}>{message}</p>}

      <div className="account-main">
        {/* 왼쪽 (화면을 내려도 따라옴): 프로필 요약 + 구역 목차. 지금 보고 있는 구역은 강조 */}
        <aside className="account-side">
          <div className="card" style={{ marginBottom: 0, textAlign: 'center', padding: '24px 16px' }}>
            <div className="avatar" style={{ margin: '0 auto 10px', width: 64, height: 64, fontSize: 28 }}>{user.display_name.slice(0, 1)}</div>
            {user.position && <div style={{ color: 'var(--primary)', fontWeight: 600, fontSize: 13 }}>{user.position}</div>}
            <b style={{ fontSize: 17 }}>{user.display_name}</b>
            <div className="muted">{user.username}</div>
            <span className="role-chip">{user.role_label}</span>
          </div>
          <nav className="account-nav card">
            {SECTIONS.map(([id, label]) => (
              <button key={id} type="button" onClick={() => go(id)} className={current === id ? 'on' : ''}>{label}</button>
            ))}
          </nav>
        </aside>

        <div style={{ display: 'grid', gap: 20, minWidth: 0 }}>
          {/* 프로필 */}
          <section id="profile" className="card account-section">
            <h3>프로필</h3>
            <EditableRow label="이름" value={user.display_name} maxLength={20}
              onSave={(v) => saveMe('display_name', v, '이름을 바꿨습니다. 앞으로 남는 기록에는 새 이름이 쓰입니다.')} />
            <EditableRow label="직책" value={user.position} placeholder="예: 총무, 회장, 사무국장" maxLength={15} allowEmpty
              hint="이름 앞에 붙어 기록에도 함께 남아요 (예: 총무 김철수)"
              onSave={(v) => saveMe('position', v, v ? `직책을 '${v}'(으)로 정했습니다.` : '직책을 지웠습니다.')} />
            <Row label="아이디">
              {user.username} <span className="muted">· 아이디는 바꿀 수 없어요</span>
            </Row>
            <Row label="역할">
              {user.role_label} <span className="muted">· {ROLE_HELP[user.role]}</span>
              {!isAdmin(user) && <div className="muted">역할(할 수 있는 일)은 관리자가 바꿀 수 있어요.</div>}
            </Row>
            <Row label="비밀번호" action={!changingPassword && <button onClick={() => setChangingPassword(true)}>변경</button>}>
              {changingPassword ? (
                <>
                  <PasswordPage embedded onChanged={() => { setChangingPassword(false); setMessage('비밀번호를 바꿨습니다. 다른 기기의 로그인은 끊어졌습니다.'); loadSessions() }} />
                  <button type="button" onClick={() => setChangingPassword(false)} style={{ marginTop: 8 }}>취소</button>
                </>
              ) : (
                <span style={{ letterSpacing: 2 }}>••••••••</span>
              )}
            </Row>
            <Row label="계정 만든 날">{(user.created_at || '').slice(0, 10)}</Row>
          </section>

          {/* 내 활동 요약: 고른 임기 동안 내가 한 일 */}
          <section id="summary" className="card account-section">
            <h3>내 활동 <span className="muted" style={{ fontWeight: 400 }}>{summary.termName}</span></h3>
            <div className="tnum" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, margin: '8px 0 16px' }}>
              {[
                ['지출 등록', `${summary.registered}건`, `${summary.registeredAmount.toLocaleString()}원`],
                ['확정', `${summary.confirmed}건`, '총무 결정'],
                ['증빙 첨부', `${summary.attached}건`, '사진·PDF'],
                ['수정·삭제', `${summary.edited}건`, '지출 정보'],
              ].map(([label, value, sub]) => (
                <div key={label} style={{ background: '#fafbfc', borderRadius: 'var(--r-sm)', padding: '12px 14px' }}>
                  <div className="muted">{label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
                  <div className="muted">{sub}</div>
                </div>
              ))}
            </div>
            <div className="muted" style={{ marginBottom: 6 }}>월별 지출 등록 건수</div>
            {summary.months.length ? <MonthBars rows={summary.months} unit="건" /> : <p className="muted">이 기간에 등록한 지출이 없어요.</p>}
          </section>

          {/* 로그인된 곳 */}
          <section id="sessions" className="card account-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <h3>로그인된 곳 <span className="muted" style={{ fontWeight: 400 }}>{sessions.length}곳</span></h3>
              <button onClick={logoutOthers} disabled={others.length === 0}>다른 기기 모두 로그아웃</button>
            </div>
            <p className="muted" style={{ marginTop: 0 }}>모르는 기기가 있거나 공용 컴퓨터에서 로그아웃을 깜빡했다면 여기서 끊으세요. 로그인은 7일 동안 유지돼요.</p>
            {sessionView.rows.map((s) => (
              <div key={s.id} className="account-row">
                <div className="session-icon">{/iPhone|Android|iPad/.test(s.device) ? '📱' : '💻'}</div>
                <div style={{ minWidth: 0 }}>
                  <b>{s.device}</b>
                  {s.current && <span className="badge-current">이 기기</span>}
                  <div className="muted">로그인 {s.created_at ? s.created_at.replace('T', ' ').slice(0, 16) : '기록 없음'} · 마지막 사용 {s.current ? '지금' : timeAgo(s.last_seen)}</div>
                </div>
                <div>{!s.current && <button onClick={() => logoutOne(s)}>로그아웃</button>}</div>
              </div>
            ))}
            <Pager page={sessionView.current} count={sessionView.count} onChange={setSessionPage} keepPosition />
          </section>

          {/* 최근 활동 */}
          <section id="activity" className="card account-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <h3>최근 활동 {activity?.length > 0 && <span className="muted" style={{ fontWeight: 400 }}>전체 {activity.length}개</span>}</h3>
              {isAdmin(user) && <Link to="/logs" className="muted">전체 기록</Link>}
            </div>
            {activity === null ? (
              <p className="muted">불러오는 중...</p>
            ) : activity.length === 0 ? (
              <p className="muted">아직 남긴 기록이 없어요. 지출 등록·수정·확정을 하면 여기에 보여요.</p>
            ) : (
              <ol className="timeline">
                {activityView.rows.map((a, i) => (
                  <li key={i}>
                    <div className="muted tnum">{a.created_at.replace('T', ' ').slice(0, 16)}</div>
                    <div>
                      <b>{a.action}</b>{' '}
                      {a.expense ? (
                        <Link to={`/expenses/${a.expense_id}`}>{a.expense.event_name} · {a.expense.amount.toLocaleString()}원</Link>
                      ) : (
                        <span className="muted">#{a.expense_id}</span>
                      )}
                      {a.detail && <div className="muted">{a.detail}</div>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
            <Pager page={activityView.current} count={activityView.count} onChange={setActivityPage} keepPosition />
          </section>
        </div>
      </div>
    </div>
  )
}

export default AccountPage
