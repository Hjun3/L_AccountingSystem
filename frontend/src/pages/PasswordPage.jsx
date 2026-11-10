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
    <div style={{ maxWidth: 320 }}>
      <h2>비밀번호 변경</h2>
      {forced && <p style={{ color: 'darkorange' }}>임시 비밀번호로 로그인했습니다. 새 비밀번호로 바꿔야 사용할 수 있습니다.</p>}
      <form onSubmit={submit} style={{ display: 'grid', gap: 8 }}>
        <input type="password" placeholder="현재(임시) 비밀번호" autoComplete="current-password" value={form.current_password} onChange={(e) => setForm({ ...form, current_password: e.target.value })} required />
        <input type="password" placeholder="새 비밀번호 (8자 이상)" autoComplete="new-password" value={form.new_password} onChange={(e) => setForm({ ...form, new_password: e.target.value })} required />
        <input type="password" placeholder="새 비밀번호 확인" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required />
        <button type="submit">변경</button>
      </form>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {done && !forced && <p style={{ color: 'green' }}>비밀번호를 바꿨습니다. 다른 기기의 로그인은 끊어졌습니다.</p>}
    </div>
  )
}

export default PasswordPage
