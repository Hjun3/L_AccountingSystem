import { useEffect, useRef, useState } from 'react'
import './landing.css'

// 화면에 들어오면 'in' 클래스를 붙여서 등장 애니메이션을 시작한다 (한 번만)
function useReveal(threshold = 0.25) {
  const ref = useRef(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true)
          observer.disconnect()
        }
      },
      { threshold },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold])
  return [ref, shown]
}

// 한 줄씩 차례로 나타나게 하는 지연 시간
const delay = (i, step = 0.18) => ({ transitionDelay: `${i * step}s` })

// ---------------- 문제 상황: 흩어진 책상 → 지출 카드 한 장으로 ----------------
// --x, --y: 가운데에서 떨어진 위치, --r: 기울기
const DESK_ITEMS = [
  { cls: 'paper', x: '-250px', y: '-120px', r: '-8deg', body: <><small>영수증</small>가나피자 320,000</> },
  { cls: 'file', x: '190px', y: '-140px', r: '5deg', body: <><small>엑셀</small><b>개강총회_정산(최종)(진짜최종).xlsx</b></> },
  { cls: 'kakao', x: '-200px', y: '60px', r: '-3deg', body: <>총무님 MT 영수증 어디 있어요?</> },
  { cls: 'pdf', x: '230px', y: '30px', r: '-6deg', body: <><small>PDF</small><b>통장거래내역_3월.pdf</b></> },
  { cls: 'note', x: '-40px', y: '-170px', r: '4deg', body: <>도안 요청 했나??</> },
  { cls: 'hwp', x: '40px', y: '150px', r: '3deg', body: <><small>한글</small><b>사필영수증_양식.hwp</b></> },
  { cls: 'paper', x: '-300px', y: '170px', r: '7deg', body: <><small>영수증</small>다이소 48,000</> },
]

function DeskScene() {
  const [ref, inView] = useReveal(0.4)
  const [stage, setStage] = useState('') // '' → 's1'(흩어짐) → 's2'(정리됨) → 처음부터 반복

  // 화면에 보이기 시작하면 12초 주기로 반복: 흩어짐(5초 동안 보여 줌) → 정리(7초 동안) → 다시 처음부터
  useEffect(() => {
    if (!inView) return
    let timers = []
    const play = () => {
      setStage('')
      timers = [
        setTimeout(() => setStage('s1'), 50),
        setTimeout(() => setStage('s2'), 5000),
        setTimeout(play, 12000),
      ]
    }
    play()
    return () => timers.forEach(clearTimeout)
  }, [inView])

  return (
    <section className="lp-desk-sec">
      <div className="lp-wrap" ref={ref}>
        <h2>정산할 때마다<br />파일부터 찾고 있다면</h2>
        <p className="desc">영수증은 사진첩에, 정산은 엑셀에, 증빙 요청은 카톡에.<br />한 곳에 모으면 지출 한 건이 카드 한 장이 됩니다.</p>
        <div className={`lp-desk ${stage}`}>
          {DESK_ITEMS.map((it, i) => (
            <div key={i} className={`lp-item ${it.cls}`}
              style={{ '--x': it.x, '--y': it.y, '--r': it.r, transitionDelay: stage === 's1' ? `${i * 0.08}s` : `${i * 0.05}s` }}>
              {it.body}
            </div>
          ))}
          <div className="lp-done">
            <div className="h"><span>03.04 · 개강총회 · 식비</span><span style={{ color: 'var(--ok)', fontWeight: 600 }}>● 문제 없음</span></div>
            <div className="t">피자 16판 [가나피자] · 320,000원</div>
            <div className="tags">
              <span>영수증 사진</span>
              <span>통장 출금 확인</span>
              <span>사필영수증</span>
              <span className="ok">챙길 것 0</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ---------------- 스크롤 장면: 노트북 속 화면 4개 ----------------
const MENU = ['대시보드', '지출 등록', '거래내역 불러오기', '지출 목록', '예산·결산', '캘린더']

function ViewReceipt() {
  return (
    <>
      <h4>지출 등록</h4>
      <div className="lp-mini-card" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>영수증 사진으로 채우기</span><b style={{ color: 'var(--ok)' }}>읽기 완료</b>
      </div>
      <div className="lp-mini-card">
        {[['날짜', '2026-05-15'], ['금액', '80,000원'], ['사업', '전정대 체육대회'], ['지출 항목', '수용비'], ['내용', '생수 100개, 이온음료 30개 [가나마트]']].map(([k, v]) => (
          <div key={k} className="lp-mini-row"><span style={{ color: 'var(--muted)' }}>{k}</span><span className="n">{v}</span></div>
        ))}
      </div>
      <div className="lp-mini-card" style={{ borderColor: '#f3d9a6', background: '#fffaf0' }}>
        <b style={{ color: 'var(--warn)' }}>● 확인 필요</b> · 참가자 명단 납부 대조 기록이 필요해요.
      </div>
    </>
  )
}

function ViewBank() {
  const rows = [['03.04', '가나피자', '320,000', true], ['04.16', '쿠팡', '23,000', true], ['04.20', '편의점', '15,600', false], ['05.15', '가나마트', '80,000', true], ['06.03', '사아상사', '75,000', true]]
  return (
    <>
      <h4>거래내역 불러오기 <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· 카카오뱅크.xlsx</span></h4>
      <div className="lp-mini-card">
        {rows.map(([d, n, a, ok]) => (
          <div key={d + n} className="lp-mini-row" style={ok ? null : { background: '#fff6f6' }}>
            <span style={{ color: 'var(--muted)', width: 40 }}>{d}</span>
            <span style={{ flex: 1 }}>{n}</span>
            <span className="n" style={{ marginRight: 12 }}>−{a}</span>
            <b style={{ color: ok ? 'var(--ok)' : 'var(--bad)', width: 40, textAlign: 'right' }}>{ok ? '등록됨' : '미등록'}</b>
          </div>
        ))}
      </div>
      <div className="lp-mini-card">통장에 출금이 없는 지출 <b>1건</b> · 택시비 90,000원</div>
    </>
  )
}

function ViewBudget() {
  const rows = [['개강총회', '368,000 / 350,000', 100, true], ['MT', '1,950,000 / 1,950,000', 100, false], ['중간고사 야식마차', '233,000 / 280,000', 83, false], ['전정대 체육대회', '90,000 / 150,000', 60, false], ['기말고사 야식마차', '280,000 / 300,000', 93, false]]
  return (
    <>
      <h4>예산 · 1학기</h4>
      <div className="lp-mini-card">
        {rows.map(([n, t, w, over]) => (
          <div key={n} style={{ padding: '5px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{n}</span>
              <span className="n" style={{ color: over ? 'var(--bad)' : 'inherit' }}>{t}{over && ' 초과'}</span>
            </div>
            <div className="lp-mini-bar"><i className={over ? 'over' : ''} style={{ '--w': `${w}%` }} /></div>
          </div>
        ))}
      </div>
      <div className="lp-mini-card" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>1학기 결산보고서.xlsx</span><b style={{ color: 'var(--primary)' }}>내려받기</b>
      </div>
    </>
  )
}

function ViewDashboard() {
  return (
    <>
      <div className="lp-cols">
        <div className="lp-mini-card">
          <div style={{ color: 'var(--muted)' }}>통장 잔액</div>
          <div className="lp-bigno">741,712원</div>
          <div style={{ display: 'flex', gap: 10, marginTop: 6, color: 'var(--sub)' }}>
            <span>챙길 것 <b style={{ color: 'var(--bad)' }}>2</b></span><span>결정 대기 <b>3</b></span>
          </div>
        </div>
        <div className="lp-mini-card">
          <div style={{ color: 'var(--muted)' }}>다가오는 일정</div>
          <div style={{ marginTop: 4 }}>11.20 <b style={{ color: 'steelblue' }}>사업</b> 일일호프</div>
          <div>12.11 <b style={{ color: 'purple' }}>감사</b> 정기감사 제출</div>
        </div>
      </div>
      <div className="lp-cols">
        <div className="lp-mini-card">
          <div style={{ color: 'var(--muted)' }}>월별 지출</div>
          <div className="lp-month">
            {['90%', '22%', '14%', '36%', '8%', '48%'].map((h, i) => <i key={i} style={{ '--h': h, transitionDelay: `${i * 0.08}s` }} />)}
          </div>
        </div>
        <div className="lp-mini-card">
          <div style={{ color: 'var(--muted)' }}>챙길 것</div>
          <div style={{ marginTop: 4 }}>☐ 수령인 학생증 사본 받기</div>
          <div>☐ 도안 요청하기</div>
          <div style={{ color: 'var(--muted)', textDecoration: 'line-through' }}>☑ 명단 납부 대조</div>
        </div>
      </div>
    </>
  )
}

const STEPS = [
  { menu: '지출 등록', title: <>영수증 사진 한 장이면<br />입력이 끝나요</>, text: '사진을 올리면 날짜·금액·품목을 읽어 채워 줍니다. 저장하면 AI가 회계 규정을 근거로 바로 점검하고, 사진은 증빙으로 붙어요.', View: ViewReceipt },
  { menu: '거래내역 불러오기', title: <>통장에만 있는 돈,<br />장부에만 있는 돈</>, text: '카카오뱅크·토스뱅크 거래내역 엑셀을 올리면 지출과 날짜·금액을 맞춰 봅니다. 빠진 지출과 통장에 없는 지출이 한눈에 보여요.', View: ViewBank },
  { menu: '예산·결산', title: <>남은 예산은 행사 중에,<br />결산은 클릭 한 번에</>, text: '학기별로 사업·지출 항목별 예산을 넣어 두면 쓸 때마다 남은 금액이 줄어들고, 넘치면 빨갛게 알려 줍니다. 결산보고서는 엑셀로 나와요.', View: ViewBudget },
  { menu: '대시보드', title: <>오늘 할 일과<br />통장 잔액을 한 화면에</>, text: '잔액, 챙길 것, 결정을 기다리는 지출, 다가오는 감사 일정까지. 다음 학생회에게는 임기별 기록 그대로 넘겨줄 수 있어요.', View: ViewDashboard },
]

function LaptopScreen({ active, only }) {
  const shown = only ?? active
  return (
    <div className="lp-laptop">
      <div className="lp-screen">
        <div className="side">
          <b>짝장부</b>
          {MENU.map((m) => <span key={m} className={m === STEPS[shown].menu ? 'on' : ''}>{m}</span>)}
        </div>
        <div className="main">
          {STEPS.map(({ View }, i) => (
            (only === undefined || only === i) && (
              <div key={i} className={`lp-view ${i === shown ? 'on' : ''}`}><View /></div>
            )
          ))}
        </div>
      </div>
    </div>
  )
}

function Showcase() {
  const [active, setActive] = useState(0)
  const stepRefs = useRef([])

  // 화면 가운데에 온 설명을 '지금 단계'로 정한다
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(Number(e.target.dataset.i))),
      { rootMargin: '-45% 0px -45% 0px' },
    )
    stepRefs.current.forEach((el) => el && observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return (
    <section className="lp-show" id="how">
      <div className="lp-wrap">
        <div>
          {STEPS.map((st, i) => (
            <div key={i} data-i={i} ref={(el) => (stepRefs.current[i] = el)} className={`lp-step ${i === active ? 'on' : ''}`}>
              <div className="lp-num">0{i + 1} · {st.menu}</div>
              <h2>{st.title}</h2>
              <p>{st.text}</p>
              {/* 휴대폰에서는 설명 바로 아래에 해당 화면 */}
              <div className="inline-screen"><LaptopScreen active={i} only={i} /></div>
            </div>
          ))}
        </div>
        <div>
          <div className="lp-sticky"><LaptopScreen active={active} /></div>
        </div>
      </div>
    </section>
  )
}

// ---------------- 랜딩페이지 ----------------
// 상단 바 메뉴: 실제 서비스 화면 이름. 누르면 로그인 안내 창이 뜬다.
// 위 메뉴 이름과 로그인했을 때 이동할 주소
const TOP_MENU = [['대시보드', '/'], ['지출 목록', '/expenses'], ['예산·결산', '/budget'], ['캘린더', '/calendar']]

// 로그인 안내 창 (Esc 키나 바깥을 눌러도 닫힘)
function LoginNotice({ menu, onLogin, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="lp-modal-bg" onClick={onClose}>
      <div className="lp-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="lp-modal-title">로그인 후 이용할 수 있어요</div>
        <p>{menu} 화면은 로그인한 뒤에 볼 수 있어요.</p>
        <div className="lp-modal-actions">
          <button className="lp-btn ghost small" onClick={onClose}>닫기</button>
          <button className="lp-btn primary small" onClick={onLogin}>로그인하기</button>
        </div>
      </div>
    </div>
  )
}

// 소개(랜딩) 페이지. 로그인 전과 로그인 후 두 가지로 쓴다.
// - 로그인 전: 위 메뉴를 누르면 '로그인 후 이용' 안내, 버튼은 로그인
// - 로그인 후(user, onGo가 있음): 위 메뉴를 누르면 그 화면으로 바로 이동, 버튼은 대시보드로
function LandingPage({ onLogin, user, onGo }) {
  const loggedIn = Boolean(user)
  const start = loggedIn ? () => onGo('/') : onLogin
  const [chatRef, chatIn] = useReveal()
  const [aiTextRef, aiTextIn] = useReveal()
  const [notice, setNotice] = useState(null) // 로그인 안내 창에 보여 줄 메뉴 이름

  // 위 메뉴: 주소에 #이 남지 않게 부드럽게 스크롤만
  const go = (id) => (e) => {
    e.preventDefault()
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="lp">
      <header className="lp-top">
        <div className="lp-wrap">
          {/* 로고: 누르면 소개 페이지 맨 처음으로 */}
          <a className="lp-logo" href="#top" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>짝<span>장부</span></a>
          <nav>
            {TOP_MENU.map(([m, path]) => (
              <button key={m} className="lp-navbtn" onClick={() => (loggedIn ? onGo(path) : setNotice(m))}>{m}</button>
            ))}
          </nav>
          {loggedIn ? (
            <button className="lp-btn primary small lp-login" onClick={start}>{user.display_name}님 · 대시보드로</button>
          ) : (
            <button className="lp-btn primary small lp-login" onClick={onLogin}>로그인</button>
          )}
        </div>
      </header>

      {/* 1. 첫 화면 */}
      <section className="lp-hero">
        <div className="lp-wrap">
          <div>
            <span className="lp-eyebrow">학생회 총무를 위한 회계 도우미</span>
            <h1>
              영수증 찍으면<br />
              <em>장부가 됩니다</em>
            </h1>
            <p className="lead">
              지출 기록부터 증빙 정리, 예산 확인, 결산까지. 회계 규정은 AI 동료가 같이 봐 주고, 결정은 총무가 합니다.
            </p>
            <div className="lp-actions">
              <button className="lp-btn primary" onClick={start}>{loggedIn ? '대시보드로 이동' : '시작하기'}</button>
              <a className="lp-btn ghost" href="#how" onClick={go('how')}>어떻게 쓰나요</a>
            </div>
          </div>

          {/* 영수증 → 입력 → AI 점검 장면 (9초마다 반복) */}
          <div className="lp-stage" aria-label="영수증 사진을 읽어 지출을 등록하고 AI가 점검하는 예시 장면">
            <div className="lp-receipt">
              <span className="lp-scan" />
              <b>가나피자</b>
              <div className="row"><span>2026-03-04</span><span>18:05</span></div>
              <hr />
              <div className="row"><span>라지 피자 x16</span><span>320,000</span></div>
              <hr />
              <div className="row"><span>합계</span><span>320,000</span></div>
              <div className="row"><span>체크카드</span><span>승인</span></div>
            </div>

            <div className="lp-panel lp-form">
              <div className="f"><span>날짜</span><span className="lp-type">2026-03-04</span></div>
              <div className="f"><span>금액</span><span className="lp-type d2">320,000원</span></div>
              <div className="f"><span>사업</span><span className="lp-type d3">개강총회 · 식비</span></div>
              <div className="f"><span>내용</span><span className="lp-type d3">피자 16판 [가나피자]</span></div>
            </div>

            <div className="lp-panel lp-ai">
              <div className="who">AI 점검 · 감사지침 제2항</div>
              <div className="st">확인 필요</div>
              <p>식비 집행은 괜찮아요. 다만 이 사업 식비가 예산의 45%를 넘지 않는지 확인이 필요해요.</p>
              <div className="lp-todo">
                <span className="lp-box" />
                <span className="t">사업 식비 비율 확인하기</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. 문제 상황 */}
      <DeskScene />

      {/* 3. 스크롤 장면 */}
      <Showcase />

      {/* 4. AI는 동료 */}
      <section className="lp-sec dark" id="ai">
        <div className="lp-wrap split">
          <div ref={aiTextRef} className={`lp-reveal ${aiTextIn ? 'in' : ''}`}>
            <div className="lp-kicker">AI는 동료</div>
            <h2>AI는 알려 주고,<br />결정은 총무가 해요</h2>
            <p className="desc">
              AI가 회계 규정을 근거로 챙길 것을 짚어 줍니다. 넘어가도 될지는 총무가 정하고, 확정할 때 남긴 메모와 모든 결정은 기록으로 남습니다.
            </p>
          </div>
          <div ref={chatRef} className={`lp-chat ${chatIn ? 'in' : ''}`}>
            <div className="lp-msg ai" style={delay(0, 0.4)}>
              <small>AI 동료 · 감사지침 제4항 ②</small>
              휴학생 환급 2건, 사필영수증은 있는데 받은 사람 학생증 사본이 빠져 있어요.
              <div className="todo">☐ 수령인 학생증 사본 받기</div>
            </div>
            <div className="lp-msg me" style={delay(1, 0.6)}>
              환급 대상자가 휴학 중이라 다음 주에 받기로 했어요. 메모로 남기고 확정할게요.
            </div>
            <div className="lp-decide" style={delay(2, 0.6)}>
              <span>메모: 학생증 사본 다음 주 수령</span>
              <span className="on">확정</span>
            </div>
          </div>
        </div>
      </section>

      {/* 마지막 */}
      <section className="lp-end">
        <div className="lp-wrap">
          <h2>이번 학기 장부,<br />같이 정리해요</h2>
          <button className="lp-btn primary" onClick={start}>{loggedIn ? '대시보드로 이동' : '로그인하고 시작하기'}</button>
          {!loggedIn && <p className="muted" style={{ marginTop: 14 }}>회원가입은 준비 중이에요. 지금은 관리자에게 계정을 받아 시작할 수 있어요.</p>}
        </div>
      </section>

      {notice && <LoginNotice menu={notice} onLogin={onLogin} onClose={() => setNotice(null)} />}

      <footer className="lp-foot">
        <div className="lp-wrap">
          화면 속 예시는 실제 자료를 바탕으로 만든 가상 데이터입니다.
        </div>
      </footer>
    </div>
  )
}

export default LandingPage
