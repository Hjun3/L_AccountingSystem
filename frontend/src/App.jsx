import { useEffect, useState } from 'react'
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import { api, canEdit, isAdmin, TermContext, UserContext } from './common'
import BankImportPage from './pages/BankImportPage'
import BudgetPage from './pages/BudgetPage'
import CalendarPage from './pages/CalendarPage'
import DashboardPage from './pages/DashboardPage'
import ExpenseDetailPage from './pages/ExpenseDetailPage'
import ExpenseListPage from './pages/ExpenseListPage'
import ExpenseNewPage from './pages/ExpenseNewPage'
import FormPage from './pages/FormPage'
import LoginPage from './pages/LoginPage'
import LogsPage from './pages/LogsPage'
import PasswordPage from './pages/PasswordPage'
import RegulationPage from './pages/RegulationPage'
import UsersPage from './pages/UsersPage'

// 왼쪽 메뉴: 하는 일별로 묶었다. 역할에 따라 보이는 메뉴가 다르다.
// NavLink는 지금 보고 있는 페이지에 자동으로 active 클래스를 붙인다 (index.css에서 강조).
function Sidebar({ user, onLogout, terms, termId, setTermId }) {
  return (
    <aside className="sidebar no-print">
      <div className="brand">학생회 회계 동료</div>
      {/* 임기 선택: 대시보드·지출 목록·예산이 이 임기 기준으로 보인다 */}
      <select value={termId ?? 'all'} onChange={(e) => setTermId(e.target.value === 'all' ? null : Number(e.target.value))} title="임기 선택">
        {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        <option value="all">전체 임기</option>
      </select>
      <nav>
        <NavLink to="/" end>대시보드</NavLink>

        <div className="group">지출</div>
        {canEdit(user) && <NavLink to="/expenses/new">지출 등록</NavLink>}
        {canEdit(user) && <NavLink to="/expenses/import">거래내역 불러오기</NavLink>}
        <NavLink to="/expenses" end>지출 목록</NavLink>

        <div className="group">계획</div>
        <NavLink to="/budget">예산·결산</NavLink>
        <NavLink to="/calendar">캘린더</NavLink>
        <NavLink to="/regulation">규정 보기</NavLink>

        {isAdmin(user) && (
          <>
            <div className="group">관리</div>
            <NavLink to="/logs">기록</NavLink>
            <NavLink to="/users">사용자 관리</NavLink>
          </>
        )}
      </nav>
      <div className="me">
        <b>{user.display_name}</b> · {user.role_label}
        <div style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
          <NavLink to="/account" style={{ padding: 0, display: 'inline' }}>비밀번호 변경</NavLink>
          <button onClick={onLogout} style={{ fontSize: 12, padding: '2px 8px' }}>로그아웃</button>
        </div>
      </div>
    </aside>
  )
}

function App() {
  // undefined: 확인 중, null: 로그인 안 됨, 객체: 로그인한 사용자
  const [user, setUser] = useState(undefined)
  const [terms, setTerms] = useState([])
  const [termId, setTermIdState] = useState(null)

  // 임기 선택은 브라우저에 기억해 둔다 (새로고침해도 유지)
  function setTermId(id) {
    setTermIdState(id)
    try {
      localStorage.setItem('termId', id === null ? 'all' : String(id))
    } catch {
      /* 저장이 안 되는 브라우저면 무시 */
    }
  }

  // 임기 목록을 불러오고, 처음에는 기억해 둔 임기 → 오늘이 들어 있는 임기 → 가장 최근 임기 순으로 고른다
  async function reloadTerms(selectId) {
    const list = await api('/terms')
    setTerms(list)
    if (selectId !== undefined) return setTermId(selectId)
    let saved = null
    try {
      saved = localStorage.getItem('termId')
    } catch {
      /* 무시 */
    }
    if (saved === 'all') return setTermIdState(null)
    if (saved && list.some((t) => String(t.id) === saved)) return setTermIdState(Number(saved))
    const today = new Date().toLocaleDateString('sv')
    const current = list.find((t) => t.start_date <= today && today <= t.end_date) || list[0]
    setTermIdState(current ? current.id : null)
  }

  useEffect(() => {
    if (user && !user.must_change_password) reloadTerms().catch(() => {})
  }, [user])

  async function loadMe() {
    try {
      setUser(await api('/auth/me'))
    } catch {
      setUser(null)
    }
  }

  useEffect(() => {
    loadMe()
    // 어느 페이지에서든 서버가 '로그인 필요(401)'를 돌려주면 로그인 화면으로 돌아간다
    const onAuthRequired = () => setUser(null)
    window.addEventListener('auth-required', onAuthRequired)
    return () => window.removeEventListener('auth-required', onAuthRequired)
  }, [])

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {})
    setUser(null)
  }

  if (user === undefined) return <p style={{ padding: 16 }}>불러오는 중...</p>
  if (user === null) return <LoginPage onLogin={setUser} />
  // 임시 비밀번호면 비밀번호부터 바꾸게 한다
  if (user.must_change_password) {
    return (
      <div className="content" style={{ margin: '40px auto', maxWidth: 400 }}>
        <PasswordPage forced onChanged={loadMe} />
        <button onClick={logout}>로그아웃</button>
      </div>
    )
  }

  // 주소(URL)에 따라 어떤 페이지를 보여줄지 정한다
  return (
    <UserContext.Provider value={user}>
      <TermContext.Provider value={{ terms, termId, setTermId, reloadTerms }}>
      <BrowserRouter>
        <div className="layout">
          <Sidebar user={user} onLogout={logout} terms={terms} termId={termId} setTermId={setTermId} />
          <main className="content">
          {!canEdit(user) && (
            <p className="notice no-print">열람 계정입니다. 보기만 할 수 있고, 등록·수정은 할 수 없습니다.</p>
          )}
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/expenses" element={<ExpenseListPage />} />
            <Route path="/expenses/new" element={<ExpenseNewPage />} />
            <Route path="/expenses/import" element={<BankImportPage />} />
            <Route path="/expenses/:id" element={<ExpenseDetailPage />} />
            <Route path="/expenses/:id/forms/:kind" element={<FormPage />} />
            <Route path="/budget" element={<BudgetPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/regulation" element={<RegulationPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/account" element={<PasswordPage onChanged={() => {}} />} />
          </Routes>
          </main>
        </div>
      </BrowserRouter>
      </TermContext.Provider>
    </UserContext.Provider>
  )
}

export default App
