import { useEffect, useRef, useState } from 'react'
import './landing.css'

// 화면에 들어오면 'in' 클래스를 붙여서 등장 애니메이션을 시작한다 (한 번만)
function useReveal() {
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
      { threshold: 0.25 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, shown ? 'in' : '']
}

// 한 줄씩 차례로 나타나게 하는 지연 시간
const delay = (i, step = 0.18) => ({ transitionDelay: `${i * step}s` })

// 예시 데이터 (모두 가상)
const BANK_ROWS = [
  { d: '03.04', name: '가나피자', amount: 320000, ok: true },
  { d: '03.21', name: '다라펜션', amount: 1800000, ok: true },
  { d: '04.16', name: '쿠팡', amount: 23000, ok: true },
  { d: '04.20', name: '편의점', amount: 15600, ok: false },
  { d: '05.15', name: '가나마트', amount: 80000, ok: true },
]
const BUDGETS = [
  { name: '개강총회', spent: 368000, budget: 350000 },
  { name: '중간고사 야식마차', spent: 233000, budget: 280000 },
  { name: '전정대 체육대회', spent: 90000, budget: 150000 },
]

// 랜딩페이지: 로그인 전 첫 화면. onLogin을 누르면 로그인 화면으로 간다.
function LandingPage({ onLogin }) {
  const [bankRef, bankIn] = useReveal()
  const [budgetRef, budgetIn] = useReveal()
  const [chatRef, chatIn] = useReveal()
  const [t1, t1In] = useReveal()
  const [t2, t2In] = useReveal()
  const [t3, t3In] = useReveal()

  return (
    <div className="lp">
      <header className="lp-top">
        <div className="lp-wrap">
          <div className="lp-logo">학생회 회계 <span>동료</span></div>
          <nav>
            <a href="#bank">거래내역 대조</a>
            <a href="#budget">예산</a>
            <a href="#ai">AI 동료</a>
          </nav>
          <button className="lp-btn primary small lp-login" onClick={onLogin}>로그인</button>
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
              <button className="lp-btn primary" onClick={onLogin}>시작하기</button>
              <a className="lp-btn ghost" href="#bank">어떻게 쓰나요</a>
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
              <div className="f"><span>사업</span><span className="lp-type d3">개강총회 · 급량비</span></div>
              <div className="f"><span>내용</span><span className="lp-type d3">피자 16판 [가나피자]</span></div>
            </div>

            <div className="lp-panel lp-ai">
              <div className="who">AI 점검 · 관행 제8항</div>
              <div className="st">확인 필요</div>
              <p>식비 집행은 괜찮아요. 다만 참가자 명단을 학생회비 납부 명단과 대조한 기록이 필요해요.</p>
              <div className="lp-todo">
                <span className="lp-box" />
                <span className="t">참가자 명단 납부 대조하기</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. 거래내역 대조 */}
      <section className="lp-sec gray" id="bank">
        <div className="lp-wrap split">
          <div ref={t1} className={`lp-reveal ${t1In}`}>
            <div className="lp-kicker">거래내역 대조</div>
            <h2>통장에 찍혔는데<br />장부에 없는 돈, 바로 찾아요</h2>
            <p className="desc">
              카카오뱅크·토스뱅크 거래내역 엑셀을 올리면 등록된 지출과 날짜·금액을 맞춰 봅니다. 빠진 지출은 그 자리에서 등록하세요.
            </p>
          </div>
          <div ref={bankRef} className={bankIn}>
            <div className="lp-bank">
              {BANK_ROWS.map((r, i) => (
                <div key={r.d + r.name} className={`r ${r.ok ? '' : 'miss'}`} style={delay(i)}>
                  <span className="d">{r.d}</span>
                  <span>{r.name}</span>
                  <span className="a">−{r.amount.toLocaleString()}</span>
                  <span className={`lp-chip ${r.ok ? 'ok' : 'no'}`} style={delay(i + 3)}>{r.ok ? '등록됨' : '미등록'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 3. 예산 */}
      <section className="lp-sec" id="budget">
        <div className="lp-wrap split rev">
          <div ref={t2} className={`lp-reveal ${t2In}`}>
            <div className="lp-kicker">예산·결산</div>
            <h2>남은 예산은<br />행사 준비 중에 확인해요</h2>
            <p className="desc">
              학기별로 사업·비목 예산을 넣어 두면 쓸 때마다 남은 금액이 줄어듭니다. 넘치면 바로 보이고, 결산보고서는 엑셀로 한 번에 나옵니다.
            </p>
          </div>
          <div ref={budgetRef} className={budgetIn}>
            <div className="lp-budget">
              {BUDGETS.map((b, i) => {
                const rate = Math.round((b.spent / b.budget) * 100)
                const over = rate > 100
                return (
                  <div key={b.name}>
                    <div className="top">
                      <span>{b.name}</span>
                      <span>
                        <b>{b.spent.toLocaleString()}</b> / {b.budget.toLocaleString()}원{' '}
                        {over && <span className="over-tag">초과</span>}
                      </span>
                    </div>
                    <div className="track">
                      <div
                        className={`fill ${over ? 'over' : ''}`}
                        style={{ width: budgetIn ? `${Math.min(rate, 100)}%` : 0, transitionDelay: `${i * 0.2}s` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* 4. AI는 동료 */}
      <section className="lp-sec dark" id="ai">
        <div className="lp-wrap split">
          <div ref={t3} className={`lp-reveal ${t3In}`}>
            <div className="lp-kicker">AI는 동료</div>
            <h2>AI는 알려 주고,<br />결정은 총무가 해요</h2>
            <p className="desc">
              AI가 회계 규정을 근거로 챙길 것을 짚어 줍니다. 확정할지, 소명을 남길지는 총무가 정하고 모든 결정은 기록으로 남습니다.
            </p>
          </div>
          <div ref={chatRef} className={`lp-chat ${chatIn}`}>
            <div className="lp-msg ai" style={delay(0, 0.4)}>
              <small>AI 동료 · 관행 제3항 ③</small>
              휴학생 환급 2건, 사필영수증은 있는데 받은 사람 학생증 사본이 빠져 있어요.
              <div className="todo">☐ 수령인 학생증 사본 받기</div>
            </div>
            <div className="lp-msg me" style={delay(1, 0.6)}>
              환급 대상자가 휴학 중이라 다음 주에 받기로 했어요. 소명으로 남길게요.
            </div>
            <div className="lp-decide" style={delay(2, 0.6)}>
              <span>확정</span>
              <span className="on">소명</span>
            </div>
          </div>
        </div>
      </section>

      {/* 마지막 */}
      <section className="lp-end">
        <div className="lp-wrap">
          <h2>이번 학기 장부,<br />같이 정리해요</h2>
          <button className="lp-btn primary" onClick={onLogin}>로그인하고 시작하기</button>
          <p className="muted" style={{ marginTop: 14 }}>계정은 학생회 관리자가 만들어 줍니다.</p>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-wrap">
          화면 속 예시는 모두 가상 데이터입니다. 현재 AI 점검 기준은 시연용 임시 규정입니다. · 2026 AI 우왕톤
        </div>
      </footer>
    </div>
  )
}

export default LandingPage
