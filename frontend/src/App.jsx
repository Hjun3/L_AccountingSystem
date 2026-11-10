import { useEffect, useState } from 'react'
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import { api, canEdit, isAdmin, UserContext } from './common'
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

// 상단 메뉴: 현재 보고 있는 페이지는 굵게 표시. 역할에 따라 보이는 메뉴가 다르다.
function NavMenu({ user, onLogout }) {
  const style = ({ isActive }) => ({ fontWeight: isActive ? 'bold' : 'normal' })
  return (
    <nav className="no-print" style={{ display: 'flex', gap: 16, borderBottom: '1px solid gray', paddingBottom: 8, flexWrap: 'wrap' }}>
      <NavLink to="/" end style={style}>대시보드</NavLink>
      {canEdit(user) && <NavLink to="/expenses/new" style={style}>지출 등록</NavLink>}
      {canEdit(user) && <NavLink to="/expenses/import" style={style}>거래내역 불러오기</NavLink>}
      <NavLink to="/expenses" end style={style}>지출 목록</NavLink>
      <NavLink to="/budget" style={style}>예산</NavLink>
      <NavLink to="/calendar" style={style}>캘린더</NavLink>
      <NavLink to="/regulation" style={style}>규정 보기</NavLink>
      <span style={{ flex: 1 }} />
      {isAdmin(user) && <NavLink to="/logs" style={style}>기록</NavLink>}
      {isAdmin(user) && <NavLink to="/users" style={style}>사용자 관리</NavLink>}
      <span>
        {user.display_name} ({user.role_label}) · <NavLink to="/account" style={style}>비밀번호 변경</NavLink> ·{' '}
        <button onClick={onLogout} style={{ fontSize: 12 }}>로그아웃</button>
      </span>
    </nav>
  )
}

function App() {
  // undefined: 확인 중, null: 로그인 안 됨, 객체: 로그인한 사용자
  const [user, setUser] = useState(undefined)

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
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
        <PasswordPage forced onChanged={loadMe} />
        <button onClick={logout}>로그아웃</button>
      </div>
    )
  }

  // 주소(URL)에 따라 어떤 페이지를 보여줄지 정한다
  return (
    <UserContext.Provider value={user}>
      <BrowserRouter>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
          <h1 className="no-print">학생회 회계 점검 동료</h1>
          <NavMenu user={user} onLogout={logout} />
          {!canEdit(user) && (
            <p className="no-print" style={{ background: '#eef', padding: 6, fontSize: 13 }}>
              열람 계정입니다. 보기만 할 수 있고, 등록·수정은 할 수 없습니다.
            </p>
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
        </div>
      </BrowserRouter>
    </UserContext.Provider>
  )
}

export default App
