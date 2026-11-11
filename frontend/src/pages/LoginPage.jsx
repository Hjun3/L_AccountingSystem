import { useState } from 'react'
import { api } from '../common'

// 로그인 화면. 계정은 관리자가 '사용자 관리'에서 만들어 준다.
const big = { height: 48, fontSize: 16, padding: '0 14px' } // 입력칸·버튼을 크게

function LoginPage({ onLogin, onBack }) {
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      onLogin(await api('/auth/login', { method: 'POST', body: JSON.stringify(form) }))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    // 화면 가운데에 크게: 입력칸·버튼 높이 48px, 글자 16px
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div className="card" style={{ width: '100%', maxWidth: 440, padding: '40px 36px', marginBottom: 0 }}>
        <h1 style={{ fontSize: 36, margin: '0 0 6px', letterSpacing: '-0.02em' }}>짝<span style={{ color: 'var(--primary)' }}>장부</span></h1>
        <p className="muted" style={{ marginTop: 0, marginBottom: 28, fontSize: 15 }}>회계 장부를 같이 쓰는 짝꿍</p>
        <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
          <input style={big} placeholder="아이디" autoComplete="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
          <input style={big} type="password" placeholder="비밀번호" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <button style={{ ...big, fontWeight: 600, marginTop: 4 }} type="submit" disabled={loading}>{loading ? '로그인 중...' : '로그인'}</button>
        </form>
        {error && <p style={{ color: 'var(--bad)', fontSize: 14 }}>{error}</p>}
        <p className="muted" style={{ fontSize: 14, marginTop: 16 }}>계정이 없으면 관리자에게 요청하세요.</p>
        {onBack && <button onClick={onBack} style={{ marginTop: 8, height: 40, fontSize: 14 }}>← 소개 화면으로</button>}
      </div>
    </div>
  )
}

export default LoginPage
