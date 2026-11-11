import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
// Pretendard 글꼴 (프로젝트 안에 포함되어 인터넷 없이도 보임)
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import './index.css'

// 글자를 눌렀을 때 입력칸처럼 깜빡이는 커서가 남지 않게 한다 (사이트 전체, 모든 접속자에게 적용)
// - 크롬의 '캐럿 브라우징'(F7)이 켜진 브라우저에서도 커서가 남지 않도록, 입력칸이 아닌 곳을 누르면
//   남은 빈 선택(= 커서)을 지운다. 드래그로 글자를 고른 경우(빈 선택이 아님)는 그대로 둔다.
document.addEventListener('mouseup', (e) => {
  if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return
  const selection = window.getSelection()
  if (selection && selection.rangeCount > 0 && selection.isCollapsed) selection.removeAllRanges()
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
