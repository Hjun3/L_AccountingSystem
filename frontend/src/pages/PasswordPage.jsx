import { useState } from 'react'
import { api } from '../common'

// 비밀번호 변경. 임시 비밀번호로 처음 로그인하면 이 화면이 먼저 나온다.
function PasswordPage({ forced, onChanged }) {
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' })
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (form.new_password !== form.confirm) {
      setError('새 비밀번호 두 개가 다릅니다.')
      return
    }
    try {
      await api('/auth/password', {
        method: 'POST',
        body: JSON.stringify({ current_password: form.current_password, new_password: form.new_password }),
      })
      setForm({ current_password: '', new_password: '', confirm: '' })
      setDone(true)
      onChanged()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div style={{ maxWidth: 420 }}>
      <h2>비밀번호 변경</h2>
      {forced && <p className="notice" style={{ color: 'var(--warn)' }}>임시 비밀번호로 로그인했습니다. 새 비밀번호로 바꿔야 사용할 수 있습니다.</p>}
      <form onSubmit={submit} className="card" style={{ display: 'grid', gap: 12, padding: 24 }}>
        <label>현재(임시) 비밀번호 <input type="password" autoComplete="current-password" value={form.current_password} onChange={(e) => setForm({ ...form, current_password: e.target.value })} required /></label>
        <label>새 비밀번호 <span className="muted">(8자 이상)</span> <input type="password" autoComplete="new-password" value={form.new_password} onChange={(e) => setForm({ ...form, new_password: e.target.value })} required /></label>
        <label>새 비밀번호 확인 <input type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required /></label>
        <button type="submit" style={{ height: 40, marginTop: 4 }}>변경</button>
        {error && <p style={{ color: 'var(--bad)', margin: 0 }}>{error}</p>}
        {done && !forced && <p style={{ color: 'var(--ok)', margin: 0 }}>비밀번호를 바꿨습니다. 다른 기기의 로그인은 끊어졌습니다.</p>}
      </form>
    </div>
  )
}

export default PasswordPage
