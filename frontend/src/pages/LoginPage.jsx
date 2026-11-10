import { useState } from 'react'
import { api } from '../common'

// 로그인 화면. 계정은 관리자가 '사용자 관리'에서 만들어 준다.
function LoginPage({ onLogin }) {
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
    <div style={{ maxWidth: 320, margin: '80px auto' }}>
      <h1 style={{ fontSize: 22 }}>학생회 회계 점검 동료</h1>
      <form onSubmit={submit} style={{ display: 'grid', gap: 8 }}>
        <input placeholder="아이디" autoComplete="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
        <input type="password" placeholder="비밀번호" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        <button type="submit" disabled={loading}>{loading ? '로그인 중...' : '로그인'}</button>
      </form>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <p style={{ fontSize: 12, color: 'gray' }}>계정이 없으면 관리자에게 요청하세요.</p>
    </div>
  )
}

export default LoginPage
