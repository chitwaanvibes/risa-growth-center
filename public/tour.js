// Guided tour: a spotlight walk-through of every module in the Growth Center.
// Shown once on first visit (remembered in localStorage) and on demand from the header or the sidebar.
const KEY = 'gc-tour-v1';
export const tourSeen = () => { try { return localStorage.getItem(KEY) === 'done'; } catch { return true; } };
const markSeen = () => { try { localStorage.setItem(KEY, 'done'); } catch { /* storage unavailable */ } };

const STEPS = [
  { title: 'Welcome to the Sponsor Growth Center',
    body: 'This is the command centre for <b>Challenge B: maximise sponsorship cash collected before the festival</b>. It measures the funnel, diagnoses what is working, supports scale / change / stop decisions, runs execution, and has an AI analyst that reads the live data. This 2-minute tour shows what each module does.' },
  { tab: 'overview', target: '#nav', title: 'Five modules, one per brief requirement',
    body: '<b>Overview</b> measures performance, <b>Diagnose</b> finds bottlenecks and drivers, <b>Decide</b> supports scale / change / stop and budget calls, <b>Execute</b> manages campaigns, deals and tasks, and <b>Data &amp; settings</b> holds every record and assumption.' },
  { tab: 'overview', target: ['.ctl:first-of-type', '.ctl:nth-of-type(2)', '#latest'], title: 'Pick a workspace and a date',
    body: '<b>2027 plan</b> is a simulated campaign running the five bets (frozen at week 4). <b>2025 original</b> is the provided dataset, cleaned. Change <b>As of</b> to rewind: every number is recomputed from records up to that day, so nothing from later leaks in.' },
  { tab: 'overview', target: '[data-tour="kpis"]', title: 'Measure: targets vs actuals',
    body: 'Headline KPIs against plan. The bar shows progress to goal; the dark tick is where plan says you should be today. Projected cash is the forecast against the ₹27.2L base target.' },
  { tab: 'overview', target: '[data-tour="cash-funnel"]', title: 'Funnels in brands and in rupees',
    body: 'The sponsor funnel tracks brands from first touch to signed cash deals with step conversion rates. The cash funnel follows the money: pipeline → expected value → signed → invoiced → collected, with overdue invoices flagged.' },
  { tab: 'overview', target: '[data-tour="projection"]', title: 'How the forecast is built',
    body: 'Collected so far + collection rate × (unpaid signed + weighted pipeline + expected new deals). Every input is shown, and each assumption can be edited in Data &amp; settings.' },
  { tab: 'diagnose', target: '[data-tour="bottlenecks"]', title: 'Diagnose: where each campaign leaks',
    body: 'Each campaign is compared stage by stage with its plan. The coloured bar is actual, the tick is plan, and the weakest stage is named as the bottleneck. Small samples are labelled “too few to judge”.' },
  { tab: 'diagnose', target: '[data-tour="drivers"]', title: 'What changed, and why',
    body: 'Pick any two dates to see what moved by campaign, every deal stage change and every payment in between, plus segment performance by industry just above.' },
  { tab: 'decide', target: '[data-tour="calls"]', title: 'Decide: scale, change or stop',
    body: 'Each campaign gets a call from thresholds set before launch, with a minimum sample. A breached guardrail downgrades the call. One click turns a call into a task with an owner and a due date.' },
  { tab: 'decide', target: '[data-tour="efficiency"]', title: 'Allocate the budget',
    body: 'Budget efficiency ranks campaigns by return per rupee spent. The what-if next to it estimates what moving money would do, capped by how many brands a campaign can still reach.' },
  { tab: 'execute', target: ['[data-tour="workload"]', '[data-tour="exec-tabs"]'], title: 'Execute: run the campaign',
    body: 'See who owns what and what is overdue, then manage tasks, deals, invoices, campaigns and spend. Every edit saves to the database and instantly updates the analytics and the AI analyst.' },
  { tab: 'data', target: '[data-tour="records"]', title: 'Data & settings',
    body: 'Inspect or edit any table, import or export CSV, change assumptions such as win probabilities, and reset the workspace to its seed data.' },
  { tab: 'overview', target: '#copilot', copilot: true, title: 'Your AI Growth Analyst',
    body: 'Ask about performance in plain English. It calls tools on the live data, shows which data it used, separates evidence from assumptions, says when the data cannot answer, and drafts tasks or changes that save only when you click <b>Confirm</b>.' },
  { tab: 'overview', target: ['#theme-toggle', '#tour-btn'], title: 'Night mode and replay',
    body: 'Switch between day and night mode here, and reopen this tour any time with the <b>Tour</b> button.' },
];

let state = null;

export function startTour(api) {
  endTour(false);
  const ov = document.createElement('div'); ov.className = 'tour'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
  ov.innerHTML = '<div class="tour-shade"></div><div class="tour-spot"></div><div class="tour-card" tabindex="-1"></div>';
  document.body.appendChild(ov);
  state = { api, i: 0, ov, spot: ov.querySelector('.tour-spot'), card: ov.querySelector('.tour-card'), shade: ov.querySelector('.tour-shade') };
  state.onKey = e => { if (e.key === 'Escape') endTour(true); else if (e.key === 'ArrowRight' || e.key === 'Enter') go(1); else if (e.key === 'ArrowLeft') go(-1); };
  state.onResize = () => place();
  document.addEventListener('keydown', state.onKey);
  window.addEventListener('resize', state.onResize);
  document.querySelector('main')?.addEventListener('scroll', state.onResize, { passive: true });
  state.card.addEventListener('click', e => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    if (b.dataset.t === 'next') go(1); else if (b.dataset.t === 'back') go(-1); else endTour(true);
  });
  state.shade.addEventListener('click', () => {});
  requestAnimationFrame(() => ov.classList.add('on'));
  show(0);
}

function go(d) { if (!state) return; const n = state.i + d; if (n >= STEPS.length) return endTour(true); if (n < 0) return; show(n); }

function show(i) {
  state.i = i; const st = STEPS[i];
  if (st.tab) state.api.goTab(st.tab);
  if (st.copilot) state.api.openCopilot();
  const last = i === STEPS.length - 1;
  state.card.innerHTML = `<div class="tour-top"><span class="tour-step">${i + 1} of ${STEPS.length}</span><button class="tour-x" data-t="skip" aria-label="Close tour">×</button></div>
    <h3>${st.title}</h3><p>${st.body}</p>
    <div class="tour-prog">${STEPS.map((_, k) => `<i class="${k < i ? 'done' : k === i ? 'on' : ''}"></i>`).join('')}</div>
    <div class="tour-ft"><button class="tour-skip" data-t="skip">${last ? '' : 'Skip tour'}</button><span>${i ? '<button class="btn sm" data-t="back">Back</button>' : ''}<button class="btn sm primary" data-t="next">${last ? 'Finish' : i === 0 ? 'Start the tour' : 'Next'}</button></span></div>`;
  const els = targets(st);
  if (els.length && els[0].closest('main')) {
    const r = els[0].getBoundingClientRect(), main = document.querySelector('main');
    const mr = main.getBoundingClientRect();
    if (r.top < mr.top + 20 || r.bottom > mr.bottom - 20) els[0].scrollIntoView({ block: r.height > mr.height * 0.6 ? 'start' : 'center', behavior: 'smooth' });
  }
  place(); setTimeout(place, 380); setTimeout(place, 700);
  state.card.querySelector('[data-t="next"]')?.focus({ preventScroll: true });
}

function targets(st) {
  const sel = Array.isArray(st.target) ? st.target : st.target ? [st.target] : [];
  return sel.map(s => document.querySelector(s)).filter(el => el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
}

function place() {
  if (!state) return;
  const st = STEPS[state.i], els = targets(st), vw = window.innerWidth, vh = window.innerHeight;
  const mobile = state.api.isMobile();
  state.ov.classList.toggle('mobile', mobile);
  if (!els.length) {
    state.ov.classList.add('center'); state.spot.style.opacity = '0';
    Object.assign(state.card.style, { left: '', top: '' });
    return;
  }
  state.ov.classList.remove('center');
  const rects = els.map(e => e.getBoundingClientRect());
  const pad = 8;
  let x1 = Math.min(...rects.map(r => r.left)) - pad, y1 = Math.min(...rects.map(r => r.top)) - pad;
  let x2 = Math.max(...rects.map(r => r.right)) + pad, y2 = Math.max(...rects.map(r => r.bottom)) + pad;
  x1 = Math.max(4, x1); y1 = Math.max(4, y1); x2 = Math.min(vw - 4, x2); y2 = Math.min(vh - 4, y2);
  Object.assign(state.spot.style, { opacity: '1', left: `${x1}px`, top: `${y1}px`, width: `${x2 - x1}px`, height: `${y2 - y1}px` });
  if (mobile) { Object.assign(state.card.style, { left: '', top: '' }); state.card.dataset.side = 'sheet'; return; }
  const cw = state.card.offsetWidth || 360, ch = state.card.offsetHeight || 220, gap = 14;
  let side, left, top;
  if (vw - x2 >= cw + gap + 8) { side = 'right'; left = x2 + gap; top = y1; }
  else if (x1 >= cw + gap + 8) { side = 'left'; left = x1 - gap - cw; top = y1; }
  else if (vh - y2 >= ch + gap + 8) { side = 'bottom'; top = y2 + gap; left = x1; }
  else if (y1 >= ch + gap + 8) { side = 'top'; top = y1 - gap - ch; left = x1; }
  else {
    // Target fills the screen: shrink the spotlight to its visible top part and dock the card below or at the bottom.
    const vis = Math.min(y2, vh * 0.55);
    if (vh - vis >= ch + gap + 8) { y2 = vis; Object.assign(state.spot.style, { height: `${y2 - y1}px` }); side = 'bottom'; top = y2 + gap; left = x1; }
    else { side = 'inside'; top = vh - ch - 16; left = vw - cw - 16; }
  }
  left = Math.max(12, Math.min(vw - cw - 12, left)); top = Math.max(12, Math.min(vh - ch - 12, top));
  state.card.dataset.side = side;
  Object.assign(state.card.style, { left: `${left}px`, top: `${top}px` });
}

function endTour(done) {
  if (!state) return;
  if (done) markSeen();
  document.removeEventListener('keydown', state.onKey);
  window.removeEventListener('resize', state.onResize);
  document.querySelector('main')?.removeEventListener('scroll', state.onResize);
  const ov = state.ov; state = null;
  ov.classList.remove('on'); setTimeout(() => ov.remove(), 220);
}
