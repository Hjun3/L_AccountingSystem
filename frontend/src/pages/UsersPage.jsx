import { useEffect, useState } from 'react'
import { api, useUser } from '../common'

const ROLE_OPTIONS = [
  ['admin', '관리자'],
  ['treasurer', '총무'],
  ['viewer', '열람'],
]

// 사용자 관리 (관리자만): 계정 만들기, 역할 바꾸기(관리자 권한 주기), 비활성화, 비밀번호 초기화
function UsersPage() {
  const me = useUser()
  const [users, setUsers] = useState([])
  const [form, setForm] = useState({ username: '', display_name: '', role: 'treasurer', temp_password: '' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    api('/users').then(setUsers).catch((e) => setError(e.message))
  }, [])

  // 요청을 보내고 결과(사용자 목록)를 반영하는 공통 함수
  async function run(path, method, body, message) {
    setError('')
    setNotice('')
    try {
      const result = await api(path, { method, body: JSON.stringify(body) })
      if (Array.isArray(result)) setUsers(result)
      setNotice(message)
      return true
    } catch (e) {
      setError(e.message)
      return false
    }
  }

  async function addUser(e) {
    e.preventDefault()
    if (await run('/users', 'POST', form, `'${form.username}' 계정을 만들었습니다. 임시 비밀번호를 본인에게 전달하세요.`)) {
      setForm({ username: '', display_name: '', role: 'treasurer', temp_password: '' })
    }
  }

  function changeRole(u, role) {
    const label = ROLE_OPTIONS.find((r) => r[0] === role)[1]
    if (!window.confirm(`${u.display_name}(${u.username})의 역할을 '${label}'(으)로 바꿀까요?`)) return
    run(`/users/${u.id}`, 'PATCH', { role }, '역할을 바꿨습니다.')
  }

  function toggleActive(u) {
    const msg = u.is_active ? '비활성화하면 바로 로그아웃되고 로그인할 수 없습니다.' : '다시 로그인할 수 있게 됩니다.'
    if (!window.confirm(`${u.display_name}(${u.username}): ${msg} 계속할까요?`)) return
    run(`/users/${u.id}`, 'PATCH', { is_active: !u.is_active }, u.is_active ? '비활성화했습니다.' : '활성화했습니다.')
  }

  function resetPassword(u) {
    const temp = window.prompt(`${u.display_name}(${u.username})의 새 임시 비밀번호 (8자 이상)`)
    if (!temp) return
    run(`/users/${u.id}/reset-password`, 'POST', { temp_password: temp }, '임시 비밀번호로 초기화했습니다. 다음 로그인 때 본인이 바꾸게 됩니다.')
  }

  return (
    <div>
      <h2>사용자 관리</h2>
      <p style={{ fontSize: 13, color: 'gray' }}>
        관리자: 모든 기능 + 사용자 관리 + 기록 / 총무: 회계 작업 전부 / 열람: 보기만 가능.
        새 계정은 임시 비밀번호로 만들어지고, 처음 로그인할 때 본인이 비밀번호를 바꿉니다.
      </p>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {notice && <p style={{ color: 'green' }}>{notice}</p>}

      <form onSubmit={addUser} style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
        <input placeholder="아이디" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
        <input placeholder="이름" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} required />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          {ROLE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input placeholder="임시 비밀번호 (8자 이상)" value={form.temp_password} onChange={(e) => setForm({ ...form, temp_password: e.target.value })} required autoComplete="off" />
        <button type="submit">계정 만들기</button>
      </form>

      <table border="1" cellPadding="4" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr><th>아이디</th><th>이름</th><th>역할</th><th>상태</th><th></th></tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} style={{ color: u.is_active ? 'inherit' : 'gray' }}>
              <td>{u.username}{u.id === me.id && ' (나)'}</td>
              <td>{u.display_name}</td>
              <td>
                <select value={u.role} onChange={(e) => changeRole(u, e.target.value)}>
                  {ROLE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </td>
              <td>
                {u.is_active ? '사용 중' : '비활성'}
                {u.must_change_password && <span style={{ color: 'darkorange' }}> (임시 비밀번호)</span>}
              </td>
              <td>
                <button onClick={() => toggleActive(u)} disabled={u.id === me.id}>{u.is_active ? '비활성화' : '활성화'}</button>{' '}
                <button onClick={() => resetPassword(u)} disabled={u.id === me.id}>비밀번호 초기화</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: 12, color: 'gray' }}>본인 계정의 비밀번호는 오른쪽 위 '비밀번호 변경'에서 바꿉니다. 마지막 관리자는 역할을 바꾸거나 비활성화할 수 없습니다.</p>
    </div>
  )
}

export default UsersPage
