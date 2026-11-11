import { useEffect, useRef, useState } from 'react'
import { api, CATEGORIES } from '../common'

// 사업명·지출 항목 입력칸 (자동완성 목록이 붙은 입력칸)
// 브라우저 기본 자동완성(datalist)은 ▼ 모양과 목록 모양을 바꿀 수 없어서 직접 만들었다.
// - list="event-names": 예산에 등록된 사업명 / list="categories": 기본 지출 항목
// - 입력하면 그 글자가 들어간 것만 보여 주고, 위아래 키·Enter로도 고를 수 있다.
// - 입력칸을 누르면 열리고, 열린 상태에서 다시 누르면 닫힌다.
// - 목록은 화면 기준(position: fixed)으로 띄워서, 표 안에 있어도 표에 스크롤이 생기지 않는다.
// 사용법은 보통 input과 같다: <SuggestInput list="categories" value={...} onChange={...} />

let eventNamesRequest = null // 사업명 목록은 한 번만 불러와서 모든 입력칸이 같이 쓴다
function loadEventNames() {
  eventNamesRequest ||= api('/budgets/names').catch(() => {
    eventNamesRequest = null // 실패하면 다음에 다시 시도 (자동완성은 없어도 입력은 됨)
    return []
  })
  return eventNamesRequest
}

function SuggestInput({ list, value, onChange, name, style, ...rest }) {
  const [options, setOptions] = useState(list === 'categories' ? CATEGORIES : [])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1) // 키보드로 고르고 있는 줄
  const [pos, setPos] = useState(null) // 목록을 띄울 화면 위치
  const inputRef = useRef(null)
  const listRef = useRef(null)

  // 입력칸 위치를 보고 목록 자리를 정한다. 아래 공간이 모자라면 위로 펼친다.
  function place() {
    const r = inputRef.current?.getBoundingClientRect()
    if (!r) return
    const below = window.innerHeight - r.bottom
    const up = below < 250 && r.top > below
    setPos({ left: r.left, minWidth: r.width, ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) })
  }

  // 열려 있는 동안 화면을 스크롤하거나 창 크기를 바꾸면 위치를 다시 맞춘다
  useEffect(() => {
    if (!open) return
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open])

  // 열려 있을 때 입력칸·목록 바깥 어디든 누르면 닫는다
  // (입력칸 이름표(label)를 누르면 브라우저가 입력칸으로 초점을 되돌려서, 초점만으로는 닫히지 않기 때문)
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (inputRef.current?.contains(e.target) || listRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    if (list === 'event-names') loadEventNames().then(setOptions)
  }, [list])

  const text = String(value || '').trim()
  // 입력한 글자가 들어간 것만. 이미 목록과 똑같이 입력했으면 전체를 보여 준다
  const shown = !text || options.includes(text) ? options : options.filter((o) => o.includes(text))
  const isNew = list === 'event-names' && text !== '' && !options.includes(text) // 아직 없는 사업명

  // 고르면 보통 입력처럼 onChange를 불러 준다
  function pick(option) {
    onChange({ target: { name, value: option, type: 'text' } })
    setOpen(false)
    setActive(-1)
  }

  function onKeyDown(e) {
    if (!open || shown.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % shown.length) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i <= 0 ? shown.length - 1 : i - 1)) }
    if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(shown[active]) }
    if (e.key === 'Escape') setOpen(false)
  }

  return (
    <span style={{ position: 'relative', display: 'inline-block', width: style?.width }}>
      <input
        {...rest}
        name={name}
        value={value}
        autoComplete="off"
        onChange={(e) => { onChange(e); setOpen(true); setActive(-1) }}
        ref={inputRef}
        onFocus={() => setOpen(true)}
        // 이미 입력 중인 칸을 다시 누르면 목록을 닫고, 아니면 연다
        onMouseDown={() => setOpen((o) => (document.activeElement === inputRef.current ? !o : true))}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        style={{ ...style, width: '100%', paddingRight: 28 }}
      />
      {/* 오른쪽 꺾쇠 표시 (누르면 입력칸이 눌린 것과 같음) */}
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"
        style={{ position: 'absolute', right: 10, top: '50%', marginTop: -6, pointerEvents: 'none', color: 'var(--muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
        <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {open && pos && (shown.length > 0 || isNew) && (
        <ul ref={listRef} className="suggest-list" role="listbox" style={pos}>
          {/* 목록에 없는 새 사업명: 이대로 입력하면 새 사업으로 추가된다는 안내 */}
          {isNew && (
            <li className="new" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(text)}>
              + '{text}' 새 사업으로 추가
            </li>
          )}
          {shown.map((o, i) => (
            <li
              key={o}
              role="option"
              aria-selected={i === active}
              className={i === active || o === text ? 'on' : ''}
              onMouseDown={(e) => e.preventDefault()} // 고르기 전에 입력칸이 닫히지 않게
              onClick={() => pick(o)}
              onMouseEnter={() => setActive(i)}
            >
              {o}
            </li>
          ))}
        </ul>
      )}
    </span>
  )
}

export default SuggestInput
