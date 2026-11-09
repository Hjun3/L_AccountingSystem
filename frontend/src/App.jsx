import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import DashboardPage from './pages/DashboardPage'
import ExpenseDetailPage from './pages/ExpenseDetailPage'
import ExpenseListPage from './pages/ExpenseListPage'
import ExpenseNewPage from './pages/ExpenseNewPage'
import RegulationPage from './pages/RegulationPage'

// 상단 메뉴: 현재 보고 있는 페이지는 굵게 표시
function NavMenu() {
  const style = ({ isActive }) => ({ fontWeight: isActive ? 'bold' : 'normal' })
  return (
    <nav style={{ display: 'flex', gap: 16, borderBottom: '1px solid gray', paddingBottom: 8 }}>
      <NavLink to="/" end style={style}>대시보드</NavLink>
      <NavLink to="/expenses/new" style={style}>지출 등록</NavLink>
      <NavLink to="/expenses" end style={style}>지출 목록</NavLink>
      <NavLink to="/regulation" style={style}>규정 보기</NavLink>
    </nav>
  )
}

// 주소(URL)에 따라 어떤 페이지를 보여줄지 정한다
function App() {
  return (
    <BrowserRouter>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
        <h1>학생회 회계 점검 동료</h1>
        <NavMenu />
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/expenses" element={<ExpenseListPage />} />
          <Route path="/expenses/new" element={<ExpenseNewPage />} />
          <Route path="/expenses/:id" element={<ExpenseDetailPage />} />
          <Route path="/regulation" element={<RegulationPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
