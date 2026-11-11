// 여러 페이지에서 같이 쓰는 값과 함수
import { createContext, useContext } from 'react'

export const API_URL = 'http://localhost:8000'

// AI 점검 결과별 글자색 (한눈에 구분되도록)
export const STATUS_COLORS = { 적합: '#1e8e3e', 주의: '#b26a00', 위반: '#d22d2d' }

// 지금 로그인한 사용자 정보를 모든 페이지에서 꺼내 쓰기 위한 통로 (App.jsx에서 값을 넣음)
export const UserContext = createContext(null)
export const useUser = () => useContext(UserContext)
// 역할별로 할 수 있는 일
export const canEdit = (user) => user && (user.role === 'admin' || user.role === 'treasurer')
export const isAdmin = (user) => user && user.role === 'admin'

// 지금 고른 임기(예: 2026년). termId가 null이면 '전체'. (App.jsx에서 값을 넣음)
export const TermContext = createContext({ terms: [], termId: null, setTermId: () => {}, reloadTerms: () => {} })
export const useTerm = () => useContext(TermContext)
// 서버 요청 주소 뒤에 붙일 임기 조건. 예: '?term_id=3' (전체면 빈 글자)
export const termQuery = (termId) => (termId ? `?term_id=${termId}` : '')

// AI 점검 결과를 화면에 보여줄 이름. 저장값(적합/주의/위반)은 그대로 두고 표시만 동료 말투로 바꾼다.
export const STATUS_LABELS = { 적합: '문제 없음', 주의: '확인 필요', 위반: '조치 필요' }
// 총무 결정을 화면에 보여줄 이름. 결정은 대기/확정 두 가지 (예전 기록의 '소명'은 메모를 남긴 확정과 같아 '확정'으로 보여준다)
export const FINAL_LABELS = { 대기: '대기', 확정: '확정', 소명: '확정' }
export const finalLabel = (status) => FINAL_LABELS[status] || status

// 배지(동그란 표시) 바탕색
export const STATUS_BG = { 적합: '#e6f4ea', 주의: '#fff3e0', 위반: '#fdecea' }

// 비목 목록 (감사자료에서 확인한 학생회 비목). 입력칸 자동완성에 쓴다.
export const CATEGORIES = ['수용비', '급량비', '상품비', '대여비', '환급비', '보조비', '활동비', '교통비', '기타']

// 캘린더 일정 종류별 글자색
export const KIND_COLORS = { 사업: 'steelblue', 감사: 'purple', 기타: 'gray' }

// 서버에 요청을 보내고 JSON 결과를 돌려준다.
// 실패하면 서버가 보낸 이유(detail)를 담은 에러를 던지므로, 화면에서는 error.message만 보여주면 된다.
export async function api(path, options = {}) {
  let res
  try {
    // 파일 업로드(FormData)일 때는 브라우저가 형식을 직접 정하도록 Content-Type을 넣지 않는다
    const isFile = options.body instanceof FormData
    res = await fetch(API_URL + path, {
      headers: isFile ? {} : { 'Content-Type': 'application/json' },
      credentials: 'include', // 로그인 쿠키를 함께 보낸다
      ...options,
    })
  } catch {
    throw new Error('서버에 연결할 수 없습니다. 백엔드가 실행 중인지 확인하세요.')
  }
  const data = await res.json().catch(() => null)
  // 로그인이 풀렸으면(401) 앱 전체에 알려서 로그인 화면으로 보낸다
  if (res.status === 401 && path !== '/auth/login') window.dispatchEvent(new Event('auth-required'))
  if (!res.ok) {
    throw new Error(typeof data?.detail === 'string' ? data.detail : '요청에 실패했습니다. 입력값을 확인하세요.')
  }
  return data
}

// 일정이 그 날짜에 걸쳐 있는지 (여러 날 일정은 시작일~종료일, 하루짜리는 그날만)
export const scheduleOn = (schedule, date) => schedule.date <= date && date <= (schedule.end_date || schedule.date)
// 일정 날짜를 짧게: '3/21' 또는 '3/21~3/22'
const md = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`
export const scheduleDays = (schedule) => (schedule.end_date ? `${md(schedule.date)}~${md(schedule.end_date)}` : md(schedule.date))
