// 여러 페이지에서 같이 쓰는 값과 함수

export const API_URL = 'http://localhost:8000'

// AI 점검 결과별 글자색 (한눈에 구분되도록)
export const STATUS_COLORS = { 적합: 'green', 주의: 'darkorange', 위반: 'red' }

// AI 점검 결과를 화면에 보여줄 이름. 저장값(적합/주의/위반)은 그대로 두고 표시만 동료 말투로 바꾼다.
export const STATUS_LABELS = { 적합: '문제 없음', 주의: '확인 필요', 위반: '조치 필요' }

// 비목 목록 (감사자료에서 확인한 학생회 비목). 입력칸 자동완성에 쓴다.
export const CATEGORIES = ['수용비', '급량비', '상품비', '대여비', '환급비', '보조비', '활동비', '교통비']

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
      ...options,
    })
  } catch {
    throw new Error('서버에 연결할 수 없습니다. 백엔드가 실행 중인지 확인하세요.')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(typeof data?.detail === 'string' ? data.detail : '요청에 실패했습니다. 입력값을 확인하세요.')
  }
  return data
}
