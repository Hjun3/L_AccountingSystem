import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, isAdmin, useUser } from '../common'
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

const SECTIONS = [['profile', '프로필'], ['security', '보안'], ['sessions', '로그인된 곳'], ['activity', '최근 활동']]

// 내 정보 화면: 프로필(이름 바꾸기), 보안(비밀번호), 로그인된 곳(다른 기기 로그아웃), 최근 활동
function AccountPage({ onUserChanged }) {
  const user = useUser()
  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState(user.display_name)
  const [changingPassword, setChangingPassword] = useState(false)
  const [sessions, setSessions] = useState([])
  const [activity, setActivity] = useState(null)
  const [message, setMessage] = useState('') // 잘 됐을 때 안내
  const [error, setError] = useState('')

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

  const saveName = (e) => {
    e.preventDefault()
    run(async () => {
      await api('/auth/me', { method: 'PATCH', body: JSON.stringify({ display_name: name }) })
      setEditingName(false)
      onUserChanged()
    }, '이름을 바꿨습니다. 앞으로 남는 기록에는 새 이름이 쓰입니다.')
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

  const others = sessions.filter((s) => !s.current)
  const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div style={{ maxWidth: 1000 }}>
      {/* 머리: 이름 첫 글자 동그라미 + 이름·아이디·역할 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <div className="avatar">{user.display_name.slice(0, 1)}</div>
        <div>
          <h2 style={{ margin: 0 }}>{user.display_name}</h2>
          <div className="muted" style={{ fontSize: 13 }}>
            {user.username} · <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{user.role_label}</span>
          </div>
        </div>
      </div>
      {error && <p className="notice" style={{ color: 'var(--bad)' }}>{error}</p>}
      {message && <p className="notice" style={{ color: 'var(--ok)' }}>{message}</p>}

      <div className="account-main">
        {/* 왼쪽: 구역 목차 */}
        <nav className="account-nav">
          {SECTIONS.map(([id, label]) => (
            <button key={id} type="button" onClick={() => go(id)}>{label}</button>
          ))}
        </nav>

        <div style={{ display: 'grid', gap: 20, minWidth: 0 }}>
          {/* 프로필 */}
          <section id="profile" className="card account-section">
            <h3>프로필</h3>
            <Row
              label="이름"
              action={!editingName && <button onClick={() => { setName(user.display_name); setEditingName(true) }}>변경</button>}
            >
              {editingName ? (
                <form onSubmit={saveName} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} autoFocus style={{ flex: 1, minWidth: 140 }} />
                  <button type="submit" disabled={!name.trim() || name.trim() === user.display_name}>저장</button>
                  <button type="button" onClick={() => setEditingName(false)}>취소</button>
                </form>
              ) : (
                <b>{user.display_name}</b>
              )}
            </Row>
            <Row label="아이디">
              {user.username} <span className="muted">· 아이디는 바꿀 수 없어요</span>
            </Row>
            <Row label="역할">
              {user.role_label} <span className="muted">· {ROLE_HELP[user.role]}</span>
              {!isAdmin(user) && <div className="muted">역할은 관리자가 바꿀 수 있어요.</div>}
            </Row>
            <Row label="계정 만든 날">{(user.created_at || '').slice(0, 10)}</Row>
          </section>

          {/* 보안 */}
          <section id="security" className="card account-section">
            <h3>보안</h3>
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
          </section>

          {/* 로그인된 곳 */}
          <section id="sessions" className="card account-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <h3>로그인된 곳 <span className="muted" style={{ fontWeight: 400 }}>{sessions.length}곳</span></h3>
              <button onClick={logoutOthers} disabled={others.length === 0}>다른 기기 모두 로그아웃</button>
            </div>
            <p className="muted" style={{ marginTop: 0 }}>모르는 기기가 있거나 공용 컴퓨터에서 로그아웃을 깜빡했다면 여기서 끊으세요. 로그인은 7일 동안 유지돼요.</p>
            {sessions.map((s) => (
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
          </section>

          {/* 최근 활동 */}
          <section id="activity" className="card account-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <h3>최근 활동</h3>
              {isAdmin(user) && <Link to="/logs" className="muted">전체 기록</Link>}
            </div>
            {activity === null ? (
              <p className="muted">불러오는 중...</p>
            ) : activity.length === 0 ? (
              <p className="muted">아직 남긴 기록이 없어요. 지출 등록·수정·확정을 하면 여기에 보여요.</p>
            ) : (
              <ol className="timeline">
                {activity.map((a, i) => (
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
          </section>
        </div>
      </div>
    </div>
  )
}

export default AccountPage
