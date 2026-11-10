import { useEffect, useState } from 'react'
import { api, CATEGORIES } from '../common'

// 사업명·비목 입력칸의 자동완성 목록.
// 예산에 등록된 사업명과 기본 비목을 제안해서, 지출과 예산의 이름이 어긋나지 않게 돕는다.
// 사용법: 페이지에 <NameSuggestions /> 를 한 번 넣고, 입력칸에 list="event-names" 또는 list="categories"를 준다.
function NameSuggestions() {
  const [eventNames, setEventNames] = useState([])

  useEffect(() => {
    api('/budgets/names')
      .then(setEventNames)
      .catch(() => {}) // 자동완성은 없어도 입력은 되므로 실패해도 무시
  }, [])

  return (
    <>
      <datalist id="event-names">
        {eventNames.map((n) => <option key={n} value={n} />)}
      </datalist>
      <datalist id="categories">
        {CATEGORIES.map((c) => <option key={c} value={c} />)}
      </datalist>
    </>
  )
}

export default NameSuggestions
