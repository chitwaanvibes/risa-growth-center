// Sponsor Growth Center: browser app. All analytics come from lib/metrics.js (same engine the AI copilot uses).
import { TABLES, STAGES, TASK_STATUS, OPEN_STAGES } from './lib/schema.js';
import { snapshot, bottlenecks, drivers, simulateReallocation, dataQuality, calendar, inr, pct, addDays, istDate, ts, endOfDay } from './lib/metrics.js';
import { WORKSPACES, loadWorkspace } from './lib/workspaces.js';
import { validateOps, nextId } from './lib/ops.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LS = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } } };
const num = (x, d = 0) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : Number(x).toLocaleString('en-IN', { maximumFractionDigits: d }));
const STATUS_LABEL = { scale: '▲ Scale', change: '◆ Change', stop: '■ Stop', too_early: '… Too early', no_rule: '– No rule' };
const badge = s => `<span class="badge ${esc(s)}">${STATUS_LABEL[s] || esc(s)}</span>`;
const stageLabel = s => String(s || '').replace(/_/g, ' ');

const st = {
  ws: WORKSPACES[LS.get('ws')] ? LS.get('ws') : 'plan', asOf: null, overrides: [], log: [], W: null, S: null, server: {},
  tab: 'overview', exec: 'tasks', cpOpen: window.innerWidth > 1100, chat: { original: [], plan: [] }, busy: false,
  dataTable: 'tasks', dataSearch: '', taskF: { status: 'open', owner: '', campaign: '' }, drv: { from: null, to: null }, sim: { from: '', to: '', amt: 10000 },
  passcode: LS.get('passcode') || '',
};

// ---------- server calls ----------
async function api(path, body) {
  const opts = body ? { method: 'POST', headers: { 'Content-Type': 'application/json', ...(st.passcode ? { 'x-app-passcode': st.passcode } : {}) }, body: JSON.stringify(body) } : {};
  const r = await fetch(path, opts);
  const j = await r.json().catch(() => ({ error: `Server returned ${r.status}` }));
  if (r.status === 401 && body) {
    const p = await promptText('Passcode needed', 'Enter the edit passcode set in APP_PASSCODE.');
    if (p) { st.passcode = p; LS.set('passcode', p); return api(path, body); }
  }
  if (!r.ok) { const e = new Error(j.error || `Error ${r.status}`); e.details = j.details; e.data = j; throw e; }
  return j;
}
async function save(ops, summary, actor = 'user') {
  const v = validateOps(WORKSPACES[st.ws].seed, st.overrides, ops);
  if (!v.ok) { toast(v.errors.slice(0, 3).join(' · '), true); return false; }
  try {
    const j = await api('/api/data', { ws: st.ws, action: 'save', ops: v.ops, summary, actor });
    st.overrides = j.overrides; st.log = j.log || st.log; recompute(); toast(`Saved: ${summary}`);
    return true;
  } catch (e) { toast(`${e.message}${e.details ? ': ' + e.details.slice(0, 2).join(' · ') : ''}`, true); return false; }
}
async function loadWs(ws) {
  st.ws = ws; LS.set('ws', ws);
  try {
    const j = await api(`/api/data?ws=${ws}`);
    st.overrides = j.overrides || []; st.log = j.log || []; st.server = j;
  } catch (e) { st.overrides = []; st.log = []; st.server = { store: 'offline', error: e.message }; toast(`Could not reach the server: ${e.message}`, true); }
  st.W = loadWorkspace(ws, st.overrides);
  st.asOf = calendar(st.W).defaultAsOf; st.drv = { from: null, to: null };
  recompute(); renderCopilot();
}
function recompute() {
  st.W = loadWorkspace(st.ws, st.overrides);
  st.S = snapshot(st.W, st.asOf);
  render();
}

// ---------- shell ----------
const TABS = [['overview', 'Overview', 'Measure'], ['diagnose', 'Diagnose', 'Diagnose'], ['decide', 'Decide', 'Support decisions'], ['execute', 'Execute', 'Manage execution'], ['data', 'Data & settings', 'Data']];
function render() {
  $('#ws').innerHTML = Object.values(WORKSPACES).map(w => `<option value="${w.id}" ${w.id === st.ws ? 'selected' : ''}>${esc(w.short)}</option>`).join('');
  $('#asof').value = st.asOf;
  const s = st.server.store;
  const pill = $('#store');
  pill.className = `pill ${s === 'supabase' ? 'ok' : s === 'file' ? 'ok' : 'bad'}`;
  pill.textContent = s === 'supabase' ? 'Saved to Supabase' : s === 'file' ? 'Saved locally (dev)' : s === 'memory' ? 'Not persistent: add Supabase' : 'Offline';
  pill.title = st.server.error || (s === 'memory' ? 'SUPABASE_URL / SUPABASE_SECRET_KEY are not set on the server; edits disappear on restart.' : '');
  $('#nav').innerHTML = TABS.map(([id, label]) => `<button data-tab="${id}" class="${st.tab === id ? 'on' : ''}">${label}</button>`).join('') +
    `<div class="hint">${st.W.simulated ? '<span class="tag sim">Simulated</span>' : '<span class="tag src">Source data</span>'}<br><br>${esc(WORKSPACES[st.ws].description)}<br><br>Every number is recomputed from the records as of the selected date. Edits save to the database and update all views and the copilot.</div>`;
  const view = { overview, diagnose, decide, execute, data: dataView }[st.tab];
  $('#main').innerHTML = view();
  $('#copilot').classList.toggle('closed', !st.cpOpen);
}
function banner() {
  const S = st.S;
  if (S.simulated) return `<div class="banner"><b>Simulated plan workspace.</b> A next-edition campaign running the five bets, frozen at the end of week ${S.week}. Use it to test the workflow: change any record and every number updates. The original 2025 data is in the other workspace.</div>`;
  return `<div class="banner src"><b>Original 2025 dataset</b> (synthetic, provided with the brief): import-retry duplicates removed (${Object.entries(S.quality.duplicatesRemoved).map(([k, v]) => `${v} ${k}`).join(', ') || 'none'}), latest version per entity as of the selected date. <b>No payment records exist</b>, so cash collected is not measurable here.</div>`;
}
function tile(k, v, d, barPct, markPct) {
  return `<div class="card tile"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div>${barPct !== undefined && barPct !== null ? `<div class="bar"><i style="width:${Math.min(100, Math.max(0, barPct * 100))}%"></i>${markPct ? `<b style="left:${Math.min(100, markPct * 100)}%" title="Plan to date"></b>` : ''}</div>` : ''}</div>`;
}
const ratioCls = r => (r === null || r === undefined ? '' : r >= 1 ? 'good' : r >= 0.9 ? 'warn' : 'bad');
const campName = id => st.S.campaigns.find(c => c.id === id)?.name || id || '—';

// ---------- OVERVIEW (measure) ----------
function overview() {
  const S = st.S, t = S.totals, T = S.target || {}, P = S.projection, pace = S.pace;
  const daysToEvent = Math.ceil((ts(S.calendar.event_starts_at) - endOfDay(S.as_of)) / 864e5);
  const tiles = [
    tile('Cash collected', S.coverage.has_payments ? inr(t.received_inr) : 'Not in data',
      S.coverage.has_payments ? `Plan to date ${inr(pace?.plan_collected_inr)} · goal ${inr(T.cash_goal_inr)}` : 'No receipt records. Confirmed value is not cash received.',
      S.coverage.has_payments && T.cash_goal_inr ? t.received_inr / T.cash_goal_inr : null, pace && T.cash_goal_inr ? pace.plan_collected_inr / T.cash_goal_inr : null),
    tile('Signed cash', inr(t.signed_cash_inr), `${t.signed_cash_deals} cash deals${t.signed_in_kind_deals ? ` · +${inr(t.signed_in_kind_inr)} in-kind` : ''}${pace ? ` · plan to date ${inr(pace.plan_signed_inr)}` : ''}`,
      T.signed_cash_goal_inr ? t.signed_cash_inr / T.signed_cash_goal_inr : null, pace && T.signed_cash_goal_inr ? pace.plan_signed_inr / T.signed_cash_goal_inr : null),
    tile('Projected cash collected', inr(P.projected_collected_inr), T.cash_goal_inr ? `Base ${inr(T.cash_goal_inr)} (${P.projected_collected_inr >= T.cash_goal_inr ? '<span class="good">on track</span>' : `<span class="bad">gap ${inr(T.cash_goal_inr - P.projected_collected_inr)}</span>`}) · stretch ${inr(T.stretch_cash_goal_inr)}` : `If ${pct(P.collection_rate)} of signed + weighted pipeline is collected (assumption)`,
      T.cash_goal_inr ? P.projected_collected_inr / T.cash_goal_inr : null),
    tile('Partnerships signed', `${t.signed}${T.confirmed_partnerships_goal ? ` <span class="muted small">/ ${T.confirmed_partnerships_goal}</span>` : ''}`, `${t.signed_cash_deals} cash, ${t.signed_in_kind_deals} in-kind · ${t.lost} lost or withdrawn`, T.confirmed_partnerships_goal ? t.signed / T.confirmed_partnerships_goal : null),
    tile('Qualified brands', `${t.qualified}${T.qualified_brands_goal ? ` <span class="muted small">/ ${T.qualified_brands_goal}</span>` : ''}`, `${t.qualified_with_opportunity} have an opportunity · ${t.qualified - t.qualified_with_opportunity} do not`, T.qualified_brands_goal ? t.qualified / T.qualified_brands_goal : null),
    tile('Open pipeline', inr(t.open_cash_inr), `Weighted ${inr(t.weighted_pipeline_inr)} · ${t.open} open, <span class="${t.stalled ? 'bad' : ''}">${t.stalled} stalled</span>`),
    tile('Budget', S.coverage.has_budgets ? `${inr(S.budget.spent_inr)} <span class="muted small">/ ${inr(S.budget.approved_inr)}</span>` : 'Not in data', S.coverage.has_budgets ? `${pct(S.budget.spent_inr / S.budget.approved_inr)} used in week ${S.week}` : 'No spend or budget records in the source', S.coverage.has_budgets ? S.budget.spent_inr / S.budget.approved_inr : null),
    tile('Tasks', `${S.tasks.filter(x => x.status !== 'done').length} open`, `<span class="${S.tasks.some(x => x.overdue) ? 'bad' : ''}">${S.tasks.filter(x => x.overdue).length} overdue</span> · ${S.tasks.filter(x => x.status === 'done').length} done`),
  ];
  return `${banner()}<h1>${esc(S.workspace_name)}</h1>
    <p class="sub">As of ${fmtDate(S.as_of)} · week ${S.week} · ${daysToEvent > 0 ? `${daysToEvent} day${daysToEvent === 1 ? '' : 's'} to the festival` : 'festival date passed'} · sourcing window ${endOfDay(S.as_of) > ts(S.calendar.sourcing_ends + 'T23:59:59+05:30') ? 'closed' : `open until ${fmtDate(S.calendar.sourcing_ends)}`}${S.target ? ` · target: ${esc(S.target.target_version)}` : ''}</p>
    <div class="grid g6">${tiles.join('')}</div>
    <div class="grid g2"><div class="card"><h2>Sponsor funnel</h2>${funnel()}</div><div class="card"><h2>Pace: cumulative cash by week</h2>${paceChart()}</div></div>
    <div class="grid g2"><div class="card"><h2>How the projection is built</h2>${projectionTable()}</div><div class="card"><h2>Current calls by campaign</h2>${decisionList()}</div></div>
    <div class="card"><h2>Campaign performance</h2>${campaignTable()}</div>`;
}
const fmtDate = d => new Date(`${d}T12:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
function funnel() {
  const t = st.S.totals;
  const paid = st.S.deals.filter(d => d.stage === 'partner_confirmed' && d.received > 0).length;
  // [label, value, help, index of the step this one converts from (null = separate population)]
  const steps = [['Brands worked', t.brands_worked, 'Distinct brands with outreach, an introduction or an inbound form', null], ['Replied', t.replied, 'Distinct brands with any reply', 0],
    ['Meetings held', t.meetings_held, 'Distinct brands with a held discovery meeting', 1], ['Qualified now', t.qualified, 'Latest qualification status = qualified. A separate record: can include brands qualified without a meeting', null],
    ['Opportunities', t.opportunities, 'Partnership opportunities created (a brand can have several)', null], ['Reached proposal', t.proposals, 'Opportunities that reached proposal_sent or later', 4],
    ['Signed (latest = confirmed)', t.signed, 'Latest stage partner_confirmed', 5], ['Signed cash deals', t.signed_cash_deals, 'Confirmed with support type cash', 6]];
  if (st.S.coverage.has_payments) steps.push(['Cash deals with money in', paid, 'Signed cash deals with at least one payment received', 7]);
  const max = Math.max(1, steps[0][1]);
  return steps.map(([l, v, h, from], i) => {
    const conv = from !== null && steps[from][1] ? v / steps[from][1] : null;
    return `<div class="stage" title="${esc(h)}"><div>${l}</div><div class="meter"><i style="width:${(v / max) * 100}%;background:var(--s1)"></i></div><div class="n" style="text-align:right"><b>${num(v)}</b> <span class="muted">${conv !== null ? pct(conv) : ''}</span></div></div>`;
  }).join('') + `<p class="small muted">Percent = conversion from the previous step of the same population. Qualified brands and opportunities are separate records, so they show counts only.</p>`;
}
function lineChart(series, { xs, yFmt = inr, height = 230, hline } = {}) {
  const W = 560, H = height, L = 54, R = 70, Tp = 12, B = 26;
  const ys = series.flatMap(s => s.points.map(p => p.y)).filter(Number.isFinite).concat(hline ? [hline.y] : []);
  const ymax = Math.max(1, ...ys) * 1.08;
  const xmin = xs[0], xmax = xs[xs.length - 1];
  const X = x => L + ((x - xmin) / Math.max(1, xmax - xmin)) * (W - L - R);
  const Y = y => Tp + (1 - y / ymax) * (H - Tp - B);
  const ticks = 4; let g = '';
  for (let i = 0; i <= ticks; i++) { const v = (ymax / ticks) * i; g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${yFmt(v)}</text>`; }
  xs.forEach(x => { g += `<text x="${X(x)}" y="${H - 8}" text-anchor="middle">W${x}</text>`; });
  if (hline) g += `<line x1="${L}" x2="${W - R}" y1="${Y(hline.y)}" y2="${Y(hline.y)}" stroke="var(--ink-3)" stroke-dasharray="2 4"/><text x="${L + 4}" y="${Y(hline.y) - 5}" class="lbl">${esc(hline.label)}</text>`;
  let lines = '';
  for (const s of series) {
    const pts = s.points.filter(p => Number.isFinite(p.y));
    if (!pts.length) continue;
    lines += `<polyline fill="none" stroke="${s.color}" stroke-width="2" ${s.dash ? 'stroke-dasharray="5 4"' : ''} stroke-linejoin="round" points="${pts.map(p => `${X(p.x)},${Y(p.y)}`).join(' ')}"/>`;
    if (!s.dash) lines += pts.map(p => `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="3" fill="${s.color}" stroke="var(--surface)" stroke-width="2"/>`).join('');
    const last = pts[pts.length - 1];
    if (s.label !== false) lines += `<text x="${X(last.x) + 6}" y="${Y(last.y) + 4}" class="lbl">${esc(s.short || '')}</text>`;
  }
  const hov = xs.map(x => {
    const rows = series.map(s => { const p = s.points.find(q => q.x === x); return p && Number.isFinite(p.y) ? `${s.name}: ${yFmt(p.y)}` : null; }).filter(Boolean);
    const w = (W - L - R) / Math.max(1, xs.length - 1);
    return rows.length ? `<rect x="${X(x) - w / 2}" y="${Tp}" width="${w}" height="${H - Tp - B}" fill="transparent" data-tip="${esc(`<b>Week ${x}</b><br>${rows.join('<br>')}`)}"/>` : '';
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${g}<line x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--axis)"/>${lines}${hov}</svg>
    <div class="legend">${series.map(s => `<span><i class="${s.dash ? 'dash' : ''}" style="border-color:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`;
}
function paceChart() {
  const S = st.S; const ser = S.series || []; const plan = st.W.tables.pace;
  const maxW = Math.max(ser.length ? ser[ser.length - 1].week : 1, plan.length ? Math.max(...plan.map(p => Number(p.week))) : 0);
  const xs = Array.from({ length: Math.max(2, maxW) }, (_, i) => i + 1);
  const series = [{ name: 'Signed cash (actual)', short: 'Signed', color: 'var(--s1)', points: ser.map(p => ({ x: p.week, y: p.signed_cash_inr })) }];
  if (S.coverage.has_payments) series.push({ name: 'Collected (actual)', short: 'Collected', color: 'var(--s2)', points: ser.map(p => ({ x: p.week, y: p.collected_inr })) });
  if (plan.length) {
    series.push({ name: 'Signed (base plan)', short: '', label: false, color: 'var(--s1)', dash: true, points: plan.map(p => ({ x: Number(p.week), y: p.base_signed_inr })) });
    series.push({ name: 'Collected (base plan)', short: 'Plan', color: 'var(--s2)', dash: true, points: plan.map(p => ({ x: Number(p.week), y: p.base_collected_inr })) });
  }
  const hl = S.target?.cash_goal_inr ? { y: S.target.cash_goal_inr, label: `Goal ${inr(S.target.cash_goal_inr)}` } : null;
  return lineChart(series, { xs, hline: hl }) + `<p class="small muted">${plan.length ? 'Dashed = weekly base plan (assumption). ' : ''}Each point is the snapshot at the end of that campaign week, so later changes never leak into earlier weeks.</p>`;
}
function projectionTable() {
  const P = st.S.projection, T = st.S.target || {}, r = P.collection_rate;
  const rows = [
    ['Cash collected so far', P.collected_inr, st.S.coverage.has_payments ? 'Payments ledger' : 'No payment records: counted as ₹0'],
    [`+ ${pct(r)} of signed, unpaid cash`, Math.round(P.unpaid_signed_inr * r), `${inr(P.unpaid_signed_inr)} unpaid`],
    [`+ ${pct(r)} of weighted open pipeline`, Math.round(P.weighted_pipeline_inr * r), `${inr(P.weighted_pipeline_inr)} = value × stage win probability`],
    [`+ ${pct(r)} of expected new deals`, Math.round(P.future_signed_inr * r), `${inr(P.future_signed_inr)} from run-rate brands until ${fmtDate(st.S.calendar.sourcing_ends)} (${P.days_left_sourcing} days)`],
  ];
  return `<table><tbody>${rows.map(([a, b, c]) => `<tr><td>${a}<div class="small muted">${esc(c)}</div></td><td class="n">${inr(b || 0)}</td></tr>`).join('')}
    <tr><td><b>Projected cash collected</b></td><td class="n"><b>${inr(P.projected_collected_inr)}</b></td></tr>
    ${T.cash_goal_inr ? `<tr><td>Base target / gap</td><td class="n">${inr(T.cash_goal_inr)} / <span class="${P.projected_collected_inr >= T.cash_goal_inr ? 'good' : 'bad'}">${inr(P.projected_collected_inr - T.cash_goal_inr)}</span></td></tr>` : ''}
    </tbody></table>
    ${P.future_by_campaign.some(f => f.expected_signed_inr) ? `<details class="small"><summary class="muted">New-deal estimate by campaign</summary><table><thead><tr><th>Campaign</th><th class="n">Brands/wk</th><th class="n">Young + future brands</th><th class="n">₹/brand (obs · plan → used)</th><th class="n">Expected signed</th></tr></thead><tbody>
    ${P.future_by_campaign.map(f => `<tr><td>${esc(campName(f.id))}</td><td class="n">${f.weekly_brand_rate}</td><td class="n">${num(f.young_brands_without_deal)} + ${num(f.brands_left, 1)}</td><td class="n">${inr(f.observed_value_per_brand_inr)} · ${inr(f.plan_value_per_brand_inr)} → ${inr(f.value_per_brand_inr)}</td><td class="n">${inr(f.expected_signed_inr)}</td></tr>`).join('')}</tbody></table>
    <p class="muted">₹ per brand blends mature brands' observed value with the plan value, weighting plan as ${st.S.assumptions.credibility_k} brands, so small samples do not swing the forecast.</p></details>` : ''}`;
}
function decisionList() {
  const S = st.S;
  return `<table><tbody>${S.campaigns.map(c => { const d = S.decisions[c.id]; return `<tr><td><b>${esc(c.name)}</b><div class="small muted">${esc(d.action || d.why)}</div></td><td class="n">${badge(d.decision)}</td></tr>`; }).join('')}</tbody></table>
  <p class="small muted">From the scale / change / stop rules in Decide. A breached guardrail downgrades the call.</p>`;
}
function campaignTable() {
  const S = st.S;
  return `<div class="tbl"><table class="camp"><thead><tr><th>Campaign</th><th class="n">Brands (plan)</th><th class="n">Meet rate (plan)</th><th class="n">Signed</th><th class="n">Wtd pipeline</th><th class="n">Received</th><th class="n">Spend / budget</th><th class="n">₹ / deal</th><th>Call</th></tr></thead><tbody>
  ${S.campaigns.map(c => `<tr><td><b>${esc(c.name)}</b> <span class="muted small">${esc(c.id)}</span><div class="small muted">${esc(c.owner || '')}${c.type === 'enabler' ? ' · enabler (portfolio-wide)' : ''}${c.status !== 'active' ? ` · ${esc(c.status)}` : ''}</div></td>
    <td class="n">${num(c.brands_worked)}${c.planned_brands_to_date ? ` <span class="small ${ratioCls(c.pace_brands_pct)}">(${num(c.planned_brands_to_date)})</span>` : ''}</td>
    <td class="n">${pct(c.meeting_rate)}${c.plan.meeting_rate ? ` <span class="small ${ratioCls(c.meeting_rate / c.plan.meeting_rate)}">(${pct(c.plan.meeting_rate)})</span>` : ''}</td>
    <td class="n">${inr(c.signed_cash_inr)} <span class="small muted">${c.signed_cash_deals}</span></td><td class="n">${inr(c.weighted_pipeline_inr)}</td>
    <td class="n">${S.coverage.has_payments ? inr(c.received_inr) : '—'}</td><td class="n">${c.budget_inr ? `${inr(c.spend_inr)} / ${inr(c.budget_inr)}` : '—'}</td>
    <td class="n">${c.cost_per_signed_inr ? inr(c.cost_per_signed_inr) : '—'}</td><td>${badge(S.decisions[c.id].decision)}</td></tr>`).join('')}
  </tbody></table></div><p class="small muted">A brand touched by several campaigns counts in each (${st.S.campaigns.reduce((a, c) => a + (c.type === 'enabler' ? 0 : c.brands_worked), 0)} campaign-brands vs ${st.S.totals.brands_worked} distinct brands).</p>`;
}

// ---------- DIAGNOSE ----------
function diagnose() {
  const S = st.S; const B = bottlenecks(S);
  const from = st.drv.from || addDays(S.as_of, -7), to = st.drv.to || S.as_of;
  const D = from < to ? drivers(st.W, from, to) : null;
  const notes = dataQuality(st.W, S);
  const stalled = S.deals.filter(d => d.stalled).sort((a, b) => b.value - a.value);
  return `${banner()}<h1>Diagnose</h1><p class="sub">Which campaigns work, where the funnel leaks and what moved the numbers. As of ${fmtDate(S.as_of)}.</p>
  <div class="grid g2">${B.campaigns.map(c => `<div class="card"><h2>${esc(c.campaign)} <span class="muted small">${esc(c.campaign_id)}</span></h2>
    <p class="small">Bottleneck: <b class="${/None|Not enough/.test(c.bottleneck) ? '' : 'bad'}">${esc(c.bottleneck)}</b></p>
    ${c.stages.map(s => { const w = Math.min(1, s.actual / Math.max(s.benchmark, s.actual, 1e-9)); const m = Math.min(1, s.benchmark / Math.max(s.benchmark, s.actual, 1e-9)); return `<div class="stage" title="${esc(s.note || '')}"><div>${esc(s.stage)}<div class="muted">${s.enough_data ? `n=${num(s.n)}` : `n=${num(s.n)}, too few to judge`} · vs ${esc(s.benchmark_type)}</div></div>
      <div class="meter"><i style="width:${w * 100}%;background:${s.ratio >= 1 ? 'var(--good)' : s.ratio >= 0.9 ? 'var(--warn)' : 'var(--bad)'}"></i><b style="left:${m * 100}%"></b></div>
      <div class="n" style="text-align:right">${pct(s.actual)} <span class="muted">/ ${pct(s.benchmark)}</span></div></div>`; }).join('') || '<p class="muted small">No comparable stages yet.</p>'}
  </div>`).join('')}</div>
  <div class="card"><h2>Portfolio stage conversion</h2><table><thead><tr><th>Step</th><th class="n">From</th><th class="n">To</th><th class="n">Conversion</th></tr></thead><tbody>
    ${B.portfolio.map(p => `<tr><td>${esc(p.step)}${p.note ? `<div class="small muted">${esc(p.note)}</div>` : ''}</td><td class="n">${num(p.from)}</td><td class="n">${num(p.to)}</td><td class="n">${pct(p.rate)}</td></tr>`).join('')}</tbody></table></div>
  <div class="card"><div class="row" style="justify-content:space-between"><h2 style="margin:0">What changed and why</h2>
    <div class="row small">From <input class="in" type="date" data-chg="drv-from" value="${from}"> to <input class="in" type="date" data-chg="drv-to" value="${to}"></div></div>
    ${D ? `<p class="small">Total: brands worked ${sign(D.total.brands_worked)}, meetings ${sign(D.total.meetings_held)}, signed ${sign(D.total.signed)} deals / ${signInr(D.total.signed_cash_inr)}, received ${signInr(D.total.received_inr)}, projection ${signInr(D.projection_change_inr)}.</p>
    <div class="tbl"><table><thead><tr><th>Campaign</th><th class="n">Brands</th><th class="n">Meetings</th><th class="n">Opps</th><th class="n">Signed ₹</th><th class="n">Received ₹</th><th class="n">Weighted pipeline</th><th class="n">Spend</th></tr></thead><tbody>
    ${D.by_campaign.map(c => `<tr><td>${esc(c.name)}</td><td class="n">${sign(c.brands_worked)}</td><td class="n">${sign(c.meetings_held)}</td><td class="n">${sign(c.opportunities)}</td><td class="n">${signInr(c.signed_cash_inr)}</td><td class="n">${signInr(c.received_inr)}</td><td class="n">${signInr(c.weighted_pipeline_inr)}</td><td class="n">${signInr(c.spend_inr)}</td></tr>`).join('')}</tbody></table></div>
    <div class="grid g2" style="margin-top:10px"><div><h3>Deal stage changes (${D.stage_changes_count})</h3><div class="feed">${D.stage_changes.map(m => `<div>${fmtDate(m.date)} · <b>${esc(m.brand)}</b> → ${esc(stageLabel(m.stage))} (${inr(m.value_inr)})</div>`).join('') || '<div class="muted">None</div>'}</div></div>
    <div><h3>Payments received</h3><div class="feed">${D.payments_received.map(p => `<div>${fmtDate(p.date)} · ${esc(p.opportunity_id)} · ${esc(p.kind)} ${inr(p.amount_inr)}</div>`).join('') || `<div class="muted">${S.coverage.has_payments ? 'None' : 'No payment data in this workspace'}</div>`}</div></div></div>`
    : '<p class="muted">Pick a start date before the end date.</p>'}</div>
  <div class="card"><h2>Stalled deals <span class="muted small">no stage change for over ${S.assumptions.stall_days} days · ${stalled.length} deals · ${inr(stalled.reduce((a, d) => a + d.value, 0))}</span></h2>${dealTable(stalled.slice(0, 40), true)}</div>
  <div class="card"><h2>Data quality and limits</h2><table><tbody>${notes.map(n => `<tr><td><span class="tag">${esc(n.type)}</span></td><td>${esc(n.detail)}</td></tr>`).join('')}</tbody></table></div>`;
}
const sign = n => (n > 0 ? `<span class="good">+${num(n)}</span>` : n < 0 ? `<span class="bad">${num(n)}</span>` : '0');
const signInr = n => (n > 0 ? `<span class="good">+${inr(n)}</span>` : n < 0 ? `<span class="bad">${inr(n)}</span>` : '₹0');
function dealTable(rows, withTask) {
  if (!rows.length) return '<p class="muted small">None.</p>';
  return `<div class="tbl"><table><thead><tr><th>Brand</th><th>Campaign</th><th>Stage</th><th class="n">Value</th><th class="n">Idle days</th><th class="n">Weighted</th><th>Owner</th>${withTask ? '<th></th>' : ''}</tr></thead><tbody>
  ${rows.map(d => `<tr><td><b>${esc(d.brand_name)}</b> <span class="small muted">${esc(d.opportunity_id)}</span><div class="small muted">brand: ${esc(d.brand_qualification)}</div></td><td class="small">${esc(campName(d.campaign_id))}</td><td>${esc(stageLabel(d.stage))}</td>
    <td class="n">${inr(d.value)}</td><td class="n ${d.stalled ? 'bad' : ''}">${d.idle_days}</td><td class="n">${inr(d.weighted)}</td><td class="small">${esc(d.owner)}</td>
    ${withTask ? `<td><button class="btn sm" data-act="task-from-deal" data-id="${esc(d.opportunity_id)}">+ Task</button></td>` : ''}</tr>`).join('')}</tbody></table></div>`;
}

// ---------- DECIDE ----------
function decide() {
  const S = st.S;
  const camps = S.campaigns;
  if (!st.sim.from) { st.sim.from = camps[camps.length - 1]?.id || ''; st.sim.to = camps[0]?.id || ''; }
  const sim = st.sim.from && st.sim.to && st.sim.from !== st.sim.to ? simulateReallocation(S, st.sim.from, st.sim.to, Number(st.sim.amt) || 0) : null;
  const opts = sel => camps.map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  const bets = camps.filter(c => c.plan.base_incremental_inr || c.plan.stretch_incremental_inr).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  return `${banner()}<h1>Decide</h1><p class="sub">Scale, change or stop each campaign against thresholds set before launch, then move budget and create the follow-up.</p>
  <div class="grid g6">${camps.map(c => { const d = S.decisions[c.id]; return `<div class="card tile"><div class="k">${esc(c.name)}</div><div style="margin:6px 0">${badge(d.decision)}</div><div class="d">${esc(d.action || '')}</div>
    ${d.action && ['scale', 'change', 'stop'].includes(d.decision) ? `<button class="btn sm" style="margin-top:8px" data-act="task-from-decision" data-id="${esc(c.id)}">Turn into task</button>` : ''}</div>`; }).join('')}</div>
  <div class="card"><h2>Rules <span class="muted small">primary rule decides; a breached guardrail turns Scale into Change and Change into Stop</span></h2><div class="tbl"><table>
    <thead><tr><th>Campaign</th><th>Role</th><th>Metric</th><th class="n">Value</th><th class="n">n / min</th><th class="n">Scale at</th><th class="n">Stop at</th><th>Status</th><th>Triggered action</th><th></th></tr></thead><tbody>
    ${S.rules.map(r => `<tr><td class="small">${esc(campName(r.campaign_id))}</td><td class="small">${esc(r.role)}</td><td class="small">${esc(r.metric)}<div class="muted">${r.direction === 'higher' ? 'higher is better' : 'lower is better'}</div></td>
      <td class="n">${fmtMetric(r.metric, r.value)}</td><td class="n">${num(r.n)} / ${num(r.min_sample)}</td><td class="n">${fmtMetric(r.metric, r.scale_at)}</td><td class="n">${fmtMetric(r.metric, r.stop_at)}</td>
      <td>${badge(r.status)}</td><td class="small">${esc(r.action)}</td><td><button class="btn sm" data-act="edit-rule" data-id="${esc(r.rule_id)}">Edit</button></td></tr>`).join('')}</tbody></table></div>
    ${st.W.appAdded?.includes('rules') ? '<p class="small muted"><span class="tag app">App-added</span> These rules are not in the source data. They judge the finished 2025 campaigns on outcomes (meeting → signed for mature meetings).</p>' : ''}</div>
  <div class="grid g2"><div class="card"><h2>Budget what-if</h2>
    <div class="form"><label>Move from<select class="in" data-chg="sim-from">${opts(st.sim.from)}</select></label><label>To<select class="in" data-chg="sim-to">${opts(st.sim.to)}</select></label><label>Amount (₹)<input class="in" type="number" min="0" step="1000" data-chg="sim-amt" value="${esc(st.sim.amt)}"></label></div>
    ${sim ? (sim.error ? `<p class="small bad">${esc(sim.error)}</p>` : `<p>Expected change: <b>${signInr(sim.expected_signed_change_inr)}</b> signed, <b>${signInr(sim.expected_collected_change_inr)}</b> collected.</p>
      <p class="small muted">${esc(sim.from.name)}: ${num(sim.from.per_rupee, 2)} ₹ per ₹ (${esc(sim.from.basis)}). ${esc(sim.to.name)}: ${num(sim.to.per_rupee, 2)} ₹ per ₹ (${esc(sim.to.basis)}).</p>
      ${sim.warnings.map(w => `<p class="small warn">⚠ ${esc(w)}</p>`).join('')}
      <button class="btn primary sm" data-act="apply-shift">Apply budget move</button>`) : '<p class="muted small">Pick two different campaigns.</p>'}</div>
  <div class="card"><h2>The five bets</h2>${bets.length ? `<table><thead><tr><th>#</th><th>Bet</th><th class="n">Incremental collected (base / stretch)</th><th class="n">Budget</th><th>Plan call</th></tr></thead><tbody>
    ${bets.map(c => `<tr><td>${c.rank ?? ''}</td><td><b>${esc(c.name)}</b></td><td class="n">${inr(c.plan.base_incremental_inr)} / ${inr(c.plan.stretch_incremental_inr)}</td><td class="n">${inr(c.budget_inr)}</td><td class="small">${esc(c.decision_plan)}</td></tr>`).join('')}
    <tr><td></td><td><b>Total vs ₹14L "repeat 2025" baseline</b></td><td class="n"><b>${inr(bets.reduce((a, c) => a + (c.plan.base_incremental_inr || 0), 0))} / ${inr(bets.reduce((a, c) => a + (c.plan.stretch_incremental_inr || 0), 0))}</b></td><td class="n">${inr(bets.reduce((a, c) => a + (c.budget_inr || 0), 0))}</td><td></td></tr></tbody></table>
    <p class="small muted">Ranked by expected incremental cash × confidence ÷ cost. Incremental = lift over repeating 2025 (₹20L signed × 70% assumed collection). All figures are plan assumptions.</p>` : '<p class="muted small">No plan figures in this workspace. Switch to the 2027 plan workspace to see the bets.</p>'}</div></div>`;
}
const fmtMetric = (m, v) => (v === null || v === undefined ? '—' : /_inr$/.test(m) ? inr(v) : m === 'brands_worked' ? num(v) : pct(v));

// ---------- EXECUTE ----------
function execute() {
  const sub = { tasks: tasksView, deals: dealsView, payments: paymentsView, campaigns: campaignsView, spend: spendView }[st.exec]();
  return `${banner()}<h1>Execute</h1><p class="sub">Campaigns, deals, payments, spend and tasks. Every change saves to the database and updates the analytics.</p>
  <div class="tabs">${[['tasks', 'Tasks'], ['deals', 'Deals'], ['payments', 'Invoices & payments'], ['campaigns', 'Campaigns & budgets'], ['spend', 'Spend']].map(([k, l]) => `<button data-exec="${k}" class="${st.exec === k ? 'on' : ''}">${l}</button>`).join('')}</div>${sub}`;
}
const owners = () => [...new Set([...st.W.tables.campaigns.map(c => c.owner_name), ...st.W.tables.tasks.map(t => t.owner_name), ...st.W.tables.brands.map(b => b.owner_name)].filter(Boolean))].sort();
function tasksView() {
  const f = st.taskF; let rows = st.S.tasks;
  if (f.status === 'open') rows = rows.filter(t => t.status !== 'done'); else if (f.status === 'overdue') rows = rows.filter(t => t.overdue); else if (f.status) rows = rows.filter(t => t.status === f.status);
  if (f.owner) rows = rows.filter(t => t.owner_name === f.owner); if (f.campaign) rows = rows.filter(t => t.sponsor_campaign_id === f.campaign);
  rows = [...rows].sort((a, b) => (a.status === 'done') - (b.status === 'done') || String(a.priority).localeCompare(String(b.priority)) || String(a.due_date).localeCompare(String(b.due_date)));
  return `<div class="card"><div class="row" style="justify-content:space-between;margin-bottom:10px"><div class="row small">
    <select class="in" data-chg="tf-status">${[['open', 'Open'], ['overdue', 'Overdue'], ['', 'All'], ...TASK_STATUS.map(s => [s, stageLabel(s)])].map(([v, l]) => `<option value="${v}" ${f.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <select class="in" data-chg="tf-owner"><option value="">All owners</option>${owners().map(o => `<option ${f.owner === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>
    <select class="in" data-chg="tf-campaign"><option value="">All campaigns</option>${st.S.campaigns.map(c => `<option value="${c.id}" ${f.campaign === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
    <button class="btn primary" data-act="new-task">+ New task</button></div>
  <div class="tbl"><table><thead><tr><th>Task</th><th>Campaign / deal</th><th>Owner</th><th>Due</th><th>Priority</th><th>Status</th><th></th></tr></thead><tbody>
  ${rows.map(t => `<tr><td><b>${esc(t.title)}</b> <span class="small muted">${esc(t.task_id)}</span>${t.source === 'copilot' ? ' <span class="tag app">AI</span>' : ''}${t.notes ? `<div class="small muted">${esc(t.notes).replace(/\n/g, '<br>')}</div>` : ''}</td>
    <td class="small">${esc(campName(t.sponsor_campaign_id))}${t.opportunity_id ? `<div class="muted">${esc(t.opportunity_id)}</div>` : ''}</td>
    <td><select class="in" data-chg="task-owner" data-id="${esc(t.task_id)}">${[...new Set([t.owner_name, ...owners()])].map(o => `<option ${o === t.owner_name ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></td>
    <td><input class="in ${t.overdue ? 'bad' : ''}" type="date" value="${esc(t.due_date)}" data-chg="task-due" data-id="${esc(t.task_id)}"></td>
    <td><select class="in" data-chg="task-priority" data-id="${esc(t.task_id)}">${['P0', 'P1', 'P2'].map(p => `<option ${p === t.priority ? 'selected' : ''}>${p}</option>`).join('')}</select></td>
    <td><select class="in" data-chg="task-status" data-id="${esc(t.task_id)}">${TASK_STATUS.map(s => `<option value="${s}" ${s === t.status ? 'selected' : ''}>${stageLabel(s)}</option>`).join('')}</select></td>
    <td class="row"><button class="btn sm" data-act="edit-task" data-id="${esc(t.task_id)}">Edit</button><button class="btn sm danger" data-act="del" data-tbl="tasks" data-id="${esc(t.task_id)}">Delete</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted">No tasks match.</td></tr>'}
  </tbody></table></div></div>`;
}
function dealsView() {
  const ds = [...st.S.deals].sort((a, b) => (b.is_open - a.is_open) || b.value - a.value);
  return `<div class="card"><div class="row" style="justify-content:space-between;margin-bottom:10px"><span class="small muted">${ds.filter(d => d.is_open).length} open · ${ds.filter(d => d.stage === 'partner_confirmed').length} signed · changing a stage records a new dated version (history is never overwritten)</span><button class="btn primary" data-act="new-deal">+ New deal</button></div>
  <div class="tbl"><table><thead><tr><th>Brand / deal</th><th>Campaign</th><th>Type</th><th>Stage</th><th class="n">Value (₹)</th><th class="n">Idle</th><th class="n">Received</th><th></th></tr></thead><tbody>
  ${ds.map(d => `<tr><td><b>${esc(d.brand_name)}</b> <span class="small muted">${esc(d.opportunity_id)}</span><div class="small muted">${esc(d.owner)}</div></td><td class="small">${esc(campName(d.campaign_id))}</td><td class="small">${esc(d.support_type)}</td>
    <td><select class="in" data-chg="deal-stage" data-id="${esc(d.opportunity_id)}">${STAGES.map(s => `<option value="${s}" ${s === d.stage ? 'selected' : ''}>${stageLabel(s)}</option>`).join('')}</select></td>
    <td class="n"><input class="in" style="width:100px;text-align:right" type="number" min="0" step="5000" value="${d.value}" data-chg="deal-value" data-id="${esc(d.opportunity_id)}"></td>
    <td class="n ${d.stalled ? 'bad' : ''}">${d.is_open ? d.idle_days + 'd' : ''}</td><td class="n">${st.S.coverage.has_payments ? inr(d.received) : '—'}</td>
    <td><button class="btn sm" data-act="task-from-deal" data-id="${esc(d.opportunity_id)}">+ Task</button></td></tr>`).join('')}</tbody></table></div></div>`;
}
function paymentsView() {
  const P = st.W.tables.payments; const cut = endOfDay(st.asOf);
  const deal = id => st.S.deals.find(d => d.opportunity_id === id);
  return `<div class="card"><div class="row" style="justify-content:space-between;margin-bottom:10px"><span class="small muted">${P.length ? `${P.filter(p => p.received_at && ts(p.received_at) <= cut).length} of ${P.length} invoices received as of ${fmtDate(st.asOf)}` : 'No invoices yet. The original dataset has no payment records; add invoices here to start tracking cash collected.'}</span><button class="btn primary" data-act="new-payment">+ New invoice</button></div>
  <div class="tbl"><table><thead><tr><th>Invoice</th><th>Deal</th><th>Kind</th><th class="n">Amount</th><th>Due</th><th>Received</th><th></th></tr></thead><tbody>
  ${P.map(p => { const recv = p.received_at && ts(p.received_at) <= cut; const late = !recv && ts(p.due_at) < cut; return `<tr><td class="small">${esc(p.payment_id)}</td><td><b>${esc(deal(p.opportunity_id)?.brand_name || p.opportunity_id)}</b></td><td class="small">${esc(p.kind)}</td><td class="n">${inr(p.amount_inr)}</td>
    <td class="small ${late ? 'bad' : ''}">${fmtDate(istDate(p.due_at))}${late ? ' · overdue' : ''}</td><td class="small">${recv ? `<span class="good">✓ ${fmtDate(istDate(p.received_at))}</span>` : '—'}</td>
    <td class="row">${recv ? `<button class="btn sm" data-act="unpay" data-id="${esc(p.payment_id)}">Undo</button>` : `<button class="btn sm primary" data-act="pay" data-id="${esc(p.payment_id)}">Mark received</button>`}<button class="btn sm" data-act="task-from-payment" data-id="${esc(p.payment_id)}">+ Task</button></td></tr>`; }).join('')}
  </tbody></table></div></div>`;
}
function campaignsView() {
  return `<div class="card"><div class="row" style="justify-content:space-between;margin-bottom:10px"><span class="small muted">Edit owner, status, budget and plan assumptions. Plan numbers drive pace, bottleneck benchmarks and the forecast.</span><button class="btn primary" data-act="new-campaign">+ New campaign</button></div>
  <div class="tbl"><table><thead><tr><th>Campaign</th><th>Owner</th><th>Status</th><th class="n">Budget</th><th class="n">Spent</th><th class="n">Plan brands</th><th class="n">Plan meeting rate</th><th class="n">Plan brand → cash deal</th><th class="n">Plan deal size</th><th></th></tr></thead><tbody>
  ${st.S.campaigns.map(c => `<tr><td><b>${esc(c.name)}</b> <span class="small muted">${esc(c.id)} · ${esc(c.channel)}</span></td><td class="small">${esc(c.owner)}</td><td>${esc(c.status)}</td><td class="n">${inr(c.budget_inr)}</td><td class="n">${inr(c.spend_inr)}</td>
    <td class="n">${num(c.plan.base_brands)}</td><td class="n">${pct(c.plan.meeting_rate)}</td><td class="n">${pct(c.plan.cash_conv)}</td><td class="n">${inr(c.plan.deal_inr)}</td><td><button class="btn sm" data-act="edit-campaign" data-id="${esc(c.id)}">Edit</button></td></tr>`).join('')}</tbody></table></div></div>`;
}
function spendView() {
  const rows = [...st.W.tables.spend].sort((a, b) => ts(b.posted_at) - ts(a.posted_at));
  return `<div class="card"><div class="row" style="justify-content:space-between;margin-bottom:10px"><span class="small muted">Net posted spend in whole ₹. Use a negative amount for a credit or refund.</span><button class="btn primary" data-act="new-spend">+ Add spend</button></div>
  <div class="tbl"><table><thead><tr><th>Date</th><th>Campaign</th><th class="n">Amount</th><th>Note</th><th></th></tr></thead><tbody>
  ${rows.map(s => `<tr><td class="small">${fmtDate(istDate(s.posted_at))}${ts(s.posted_at) > endOfDay(st.asOf) ? ' <span class="tag">after view date</span>' : ''}</td><td>${esc(campName(s.sponsor_campaign_id))}</td><td class="n">${inr(s.amount_inr, { exact: true })}</td><td class="small">${esc(s.note || '')}</td><td><button class="btn sm danger" data-act="del" data-tbl="spend" data-id="${esc(s.spend_id)}">Delete</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">No spend records.</td></tr>'}
  </tbody></table></div></div>`;
}

// ---------- DATA ----------
function dataView() {
  const t = st.dataTable; const spec = TABLES[t]; const all = st.W.tables[t];
  const q = st.dataSearch.toLowerCase();
  const rows = q ? all.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(q))) : all;
  const cols = [...new Set([spec.pk, ...Object.keys(spec.fields), ...all.slice(0, 30).flatMap(r => Object.keys(r))])].slice(0, 9);
  const origin = st.W.simulated ? '<span class="tag sim">Simulated</span>' : st.W.appAdded?.includes(t) ? '<span class="tag app">App-added</span>' : ['payments', 'spend', 'tasks', 'pace'].includes(t) ? '<span class="tag">App table</span>' : '<span class="tag src">Source data</span>';
  const edited = all.filter(r => st.W.editedIds.has(`${t}:${r[spec.pk]}`)).length;
  return `${banner()}<h1>Data & settings</h1><p class="sub">Inspect and edit any record, import a CSV, change assumptions, or reset. ${st.W.editCount + st.W.deleteCount} saved edit(s) on top of the seed data in this workspace.</p>
  <div class="card"><div class="row" style="justify-content:space-between;margin-bottom:10px"><div class="row"><select class="in" data-chg="data-table">${Object.entries(TABLES).map(([k, s]) => `<option value="${k}" ${k === t ? 'selected' : ''}>${esc(s.label)} (${st.W.tables[k].length})</option>`).join('')}</select>${origin}${edited ? `<span class="tag">${edited} edited</span>` : ''}
    <input class="in" placeholder="Search…" value="${esc(st.dataSearch)}" data-chg="data-search"></div>
    <div class="row"><button class="btn sm" data-act="row-new">+ Row</button><label class="btn sm">Import CSV<input type="file" accept=".csv,text/csv" hidden data-chg="csv"></label><button class="btn sm" data-act="csv-export">Export CSV</button></div></div>
    ${spec.history ? `<p class="small muted">History table: each row is a full-state version. Analytics use the latest version per ${esc(spec.history)} on or before the view date. Add a new version rather than editing old ones.</p>` : ''}
    <div class="tbl"><table><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}<th></th></tr></thead><tbody>
    ${rows.slice(0, 200).map(r => `<tr>${cols.map(c => `<td class="small">${esc(fmtCell(r[c]))}</td>`).join('')}<td class="row"><button class="btn sm" data-act="row-edit" data-id="${esc(r[spec.pk])}">Edit</button><button class="btn sm danger" data-act="del" data-tbl="${t}" data-id="${esc(r[spec.pk])}">Delete</button></td></tr>`).join('')}
    </tbody></table></div><p class="small muted">${rows.length > 200 ? `Showing 200 of ${rows.length}. Search to narrow.` : `${rows.length} rows.`} CSV import upserts by ${esc(spec.pk)}; dates may be ISO text or Excel dates.</p></div>
  <div class="grid g2"><div class="card"><h2>Assumptions ${st.W.appAdded?.includes('assumptions') ? '<span class="tag app">App-added</span>' : ''}</h2><table><tbody>
    ${st.W.tables.assumptions.map(a => `<tr><td>${esc(a.label || a.key)}<div class="small muted">${esc(a.basis || '')}</div></td><td class="n"><input class="in" style="width:90px;text-align:right" type="number" step="any" value="${esc(a.value)}" data-chg="assumption" data-id="${esc(a.key)}"></td></tr>`).join('')}</tbody></table></div>
  <div class="card"><h2>Activity log</h2><div class="feed">${st.log.map(l => `<div><span class="muted">${new Date(l.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span> · <b>${esc(l.actor)}</b> · ${esc(l.summary)}</div>`).join('') || '<div class="muted">No changes yet.</div>'}</div>
    <div class="row" style="margin-top:12px"><button class="btn danger" data-act="reset">Reset this workspace to seed data</button></div></div></div>`;
}
const fmtCell = v => (v === undefined || v === null ? '' : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? v.slice(0, 16).replace('T', ' ') : String(v).slice(0, 80));

// ---------- forms ----------
function openForm({ title, fields, submit = 'Save', onSubmit }) {
  const d = $('#dlg');
  d.innerHTML = `<form method="dialog"><div class="hd">${esc(title)}</div><div class="bd"><div class="form">${fields.map(f => {
    const v = f.value ?? '';
    const input = f.type === 'select' ? `<select class="in" name="${f.key}">${f.options.map(o => { const [ov, ol] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(ov)}" ${String(ov) === String(v) ? 'selected' : ''}>${esc(ol)}</option>`; }).join('')}</select>`
      : f.type === 'textarea' ? `<textarea class="in" name="${f.key}">${esc(v)}</textarea>`
      : `<input class="in" name="${f.key}" type="${f.type || 'text'}" ${f.type === 'number' ? 'step="any"' : ''} value="${esc(v)}" ${f.list ? `list="dl-${f.key}"` : ''} ${f.readonly ? 'readonly' : ''}>${f.list ? `<datalist id="dl-${f.key}">${f.list.map(o => `<option value="${esc(o)}">`).join('')}</datalist>` : ''}`;
    return `<label class="${f.type === 'textarea' || f.wide ? 'wide' : ''}">${esc(f.label)}${f.required ? ' *' : ''}${input}${f.help ? `<span class="muted">${esc(f.help)}</span>` : ''}</label>`;
  }).join('')}</div><p class="small bad" id="form-err"></p></div><div class="ft"><button class="btn" value="cancel" formnovalidate>Cancel</button><button class="btn primary" value="ok" id="form-ok">${esc(submit)}</button></div></form>`;
  d.showModal();
  $('#form-ok').onclick = async e => {
    e.preventDefault();
    const vals = Object.fromEntries(new FormData(d.querySelector('form')).entries());
    for (const f of fields) if (f.required && !String(vals[f.key] ?? '').trim()) { $('#form-err').textContent = `${f.label} is required`; return; }
    const ok = await onSubmit(vals);
    if (ok !== false) d.close();
  };
}
function promptText(title, help) {
  return new Promise(res => openForm({ title, fields: [{ key: 'v', label: help, type: 'password' }], submit: 'OK', onSubmit: v => { res(v.v); } }));
}
function confirmDlg(title, text) {
  return new Promise(res => { const d = $('#dlg'); d.innerHTML = `<form method="dialog"><div class="hd">${esc(title)}</div><div class="bd">${esc(text)}</div><div class="ft"><button class="btn" value="no">Cancel</button><button class="btn primary" value="yes">Confirm</button></div></form>`; d.onclose = () => res(d.returnValue === 'yes'); d.showModal(); });
}
const campOpts = (blank = true) => [...(blank ? [['', '—']] : []), ...st.S.campaigns.map(c => [c.id, c.name])];
function taskForm(prefill = {}, existing) {
  const t = existing || {};
  openForm({ title: existing ? `Edit ${t.task_id}` : 'New task', fields: [
    { key: 'title', label: 'Title', value: t.title ?? prefill.title, required: true, wide: true },
    { key: 'owner_name', label: 'Owner', value: t.owner_name ?? prefill.owner_name, list: owners(), required: true },
    { key: 'due_date', label: 'Due date', type: 'date', value: t.due_date ?? prefill.due_date ?? addDays(st.asOf, 3), required: true },
    { key: 'priority', label: 'Priority', type: 'select', options: ['P0', 'P1', 'P2'], value: t.priority ?? prefill.priority ?? 'P1' },
    { key: 'status', label: 'Status', type: 'select', options: TASK_STATUS, value: t.status ?? 'todo' },
    { key: 'sponsor_campaign_id', label: 'Campaign', type: 'select', options: campOpts(), value: t.sponsor_campaign_id ?? prefill.sponsor_campaign_id ?? '' },
    { key: 'opportunity_id', label: 'Deal', type: 'select', options: [['', '—'], ...st.S.deals.map(d => [d.opportunity_id, `${d.brand_name} (${d.opportunity_id})`])], value: t.opportunity_id ?? prefill.opportunity_id ?? '' },
    { key: 'notes', label: 'Notes', type: 'textarea', value: t.notes ?? prefill.notes ?? '' },
  ], onSubmit: v => {
    const id = t.task_id || nextId(st.W.tables.tasks, 'task_id', 'TSK');
    const row = { ...t, ...v, task_id: id, source: t.source || prefill.source || 'user', created_at: t.created_at || new Date().toISOString() };
    if (v.status === 'done' && t.status !== 'done') row.completed_at = new Date().toISOString();
    for (const k of ['sponsor_campaign_id', 'opportunity_id']) if (!row[k]) delete row[k];
    return save([{ tbl: 'tasks', id, data: row }], `${existing ? 'Updated' : 'Created'} task ${id}: ${v.title}`);
  } });
}
function stageOp(oppId, stage, value) {
  const d = st.S.deals.find(x => x.opportunity_id === oppId); const o = st.W.tables.opportunities.find(x => x.opportunity_id === oppId);
  const last = Math.max(0, ...st.W.tables.opp_history.filter(h => h.opportunity_id === oppId).map(h => ts(h.effective_at)));
  const when = Math.max(last + 60000, Date.parse(`${st.asOf}T18:00:00+05:30`));
  const hid = `UH${Date.now().toString(36).toUpperCase()}`;
  return { op: { tbl: 'opp_history', id: hid, data: { history_id: hid, opportunity_id: oppId, brand_id: o.brand_id, brand_name: d?.brand_name, stage, proposed_value_inr: value, confirmed_value_inr: stage === 'partner_confirmed' ? value : 0, owner_name: d?.owner || '', effective_at: new Date(when + 19800000).toISOString().slice(0, 19) + '+05:30' } }, late: when > endOfDay(st.asOf), d };
}
function csvParse(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter(r => r.some(x => x.trim() !== ''));
  return (body || []).map(r => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ''])));
}
function download(name, text) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
function rowForm(t, existing) {
  const spec = TABLES[t]; const keys = [...new Set([...Object.keys(spec.fields), ...Object.keys(existing || {})])];
  openForm({ title: `${existing ? 'Edit' : 'New'} ${spec.label} row`, fields: keys.map(k => { const f = spec.fields[k] || { type: 'text' }; return { key: k, label: k, value: existing?.[k] ?? '', type: f.type === 'num' ? 'number' : f.type === 'enum' ? 'select' : 'text', options: f.enum ? ['', ...f.enum] : undefined, required: f.req, readonly: existing && k === spec.pk, help: f.type === 'dt' ? 'YYYY-MM-DDTHH:MM (India time)' : f.ref ? `ID from ${TABLES[f.ref].label}` : '' }; }),
    onSubmit: v => { const data = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== '')); return save([{ tbl: t, id: data[spec.pk], data }], `${existing ? 'Edited' : 'Added'} ${spec.label.toLowerCase()} ${data[spec.pk]}`); } });
}

// ---------- events ----------
const actions = {
  'new-task': () => taskForm(),
  'edit-task': b => taskForm({}, st.W.tables.tasks.find(t => t.task_id === b.dataset.id)),
  'task-from-deal': b => { const d = st.S.deals.find(x => x.opportunity_id === b.dataset.id); taskForm({ title: `${d.stalled ? 'Revive' : 'Follow up'} ${d.brand_name}: ${d.stalled ? `idle ${d.idle_days} days at ${stageLabel(d.stage)}` : `move ${stageLabel(d.stage)} forward`}`, owner_name: d.owner || st.W.tables.campaigns.find(c => c.sponsor_campaign_id === d.campaign_id)?.owner_name, sponsor_campaign_id: d.campaign_id, opportunity_id: d.opportunity_id, priority: d.value >= 90000 ? 'P0' : 'P1', notes: `Value ${inr(d.value)}, weighted ${inr(d.weighted)}.` }); },
  'task-from-payment': b => { const p = st.W.tables.payments.find(x => x.payment_id === b.dataset.id); const d = st.S.deals.find(x => x.opportunity_id === p.opportunity_id); taskForm({ title: `Collect ${p.kind} ${inr(p.amount_inr)} from ${d?.brand_name || p.opportunity_id}`, owner_name: d?.owner, sponsor_campaign_id: d?.campaign_id, opportunity_id: p.opportunity_id, priority: 'P0', notes: `Invoice ${p.payment_id}, due ${istDate(p.due_at)}.` }); },
  'task-from-decision': b => { const c = st.S.campaigns.find(x => x.id === b.dataset.id); const d = st.S.decisions[c.id]; taskForm({ title: `${STATUS_LABEL[d.decision].replace(/^\W+/, '')} ${c.name}: ${d.action}`, owner_name: c.owner, sponsor_campaign_id: c.id, priority: d.decision === 'stop' ? 'P0' : 'P1', notes: d.why }); },
  'edit-rule': b => { const r = st.W.tables.rules.find(x => x.rule_id === b.dataset.id); openForm({ title: `Rule ${r.rule_id}: ${r.metric}`, fields: [
    { key: 'scale_at', label: 'Scale at', type: 'number', value: r.scale_at, required: true }, { key: 'stop_at', label: 'Stop at', type: 'number', value: r.stop_at, required: true },
    { key: 'min_sample', label: 'Minimum sample', type: 'number', value: r.min_sample, required: true }, { key: 'from_week', label: 'From week', type: 'number', value: r.from_week ?? 1 },
    { key: 'scale_action', label: 'Scale action', value: r.scale_action, wide: true }, { key: 'change_action', label: 'Change action', value: r.change_action, wide: true }, { key: 'stop_action', label: 'Stop action', value: r.stop_action, wide: true }],
    onSubmit: v => save([{ tbl: 'rules', id: r.rule_id, data: { ...r, ...v } }], `Updated rule ${r.rule_id} thresholds (scale ${v.scale_at}, stop ${v.stop_at})`) }); },
  'apply-shift': async () => {
    const { from, to, amt } = st.sim; const A = st.W.tables.campaigns.find(c => c.sponsor_campaign_id === from), B = st.W.tables.campaigns.find(c => c.sponsor_campaign_id === to);
    const a = Number(amt) || 0; if (!(a > 0)) return toast('Enter an amount', true);
    if (!(await confirmDlg('Move budget', `Move ${inr(a)} from ${A.campaign_name} (${inr(A.budget_inr || 0)}) to ${B.campaign_name} (${inr(B.budget_inr || 0)})?`))) return;
    if ((A.budget_inr || 0) < a) return toast(`${A.campaign_name} only has ${inr(A.budget_inr || 0)} budget`, true);
    save([{ tbl: 'campaigns', id: from, data: { ...A, budget_inr: (A.budget_inr || 0) - a } }, { tbl: 'campaigns', id: to, data: { ...B, budget_inr: (B.budget_inr || 0) + a } }], `Moved ${inr(a)} budget from ${A.campaign_name} to ${B.campaign_name}`);
  },
  'new-deal': () => openForm({ title: 'New deal', fields: [
    { key: 'brand', label: 'Brand (pick or type a new name)', list: st.W.tables.brands.map(b => b.brand_name), required: true, wide: true },
    { key: 'campaign', label: 'Source campaign', type: 'select', options: campOpts(false), required: true },
    { key: 'support_type', label: 'Type', type: 'select', options: ['cash', 'in_kind'] }, { key: 'stage', label: 'Stage', type: 'select', options: STAGES.slice(0, 5), value: 'prospecting' },
    { key: 'value', label: 'Value (₹)', type: 'number', value: 50000, required: true }],
    onSubmit: v => {
      const ops = []; let b = st.W.tables.brands.find(x => x.brand_name.toLowerCase() === v.brand.trim().toLowerCase());
      const when = `${st.asOf}T12:00:00+05:30`;
      if (!b) { const id = nextId(st.W.tables.brands, 'brand_id', 'U'); b = { brand_id: id, brand_name: v.brand.trim(), owner_name: st.W.tables.campaigns.find(c => c.sponsor_campaign_id === v.campaign)?.owner_name, created_at: when }; ops.push({ tbl: 'brands', id, data: b }); }
      const oid = nextId(st.W.tables.opportunities, 'opportunity_id', 'UO'); const val = Number(v.value);
      ops.push({ tbl: 'opportunities', id: oid, data: { opportunity_id: oid, opportunity_name: `${b.brand_name} partnership`, brand_id: b.brand_id, brand_name: b.brand_name, sponsor_campaign_id: v.campaign, support_type: v.support_type, created_at: when } });
      const hid = `UH${Date.now().toString(36).toUpperCase()}`;
      ops.push({ tbl: 'opp_history', id: hid, data: { history_id: hid, opportunity_id: oid, brand_id: b.brand_id, brand_name: b.brand_name, stage: v.stage, proposed_value_inr: val, confirmed_value_inr: v.stage === 'partner_confirmed' ? val : 0, owner_name: st.W.tables.campaigns.find(c => c.sponsor_campaign_id === v.campaign)?.owner_name || '', effective_at: `${st.asOf}T12:05:00+05:30` } });
      return save(ops, `New deal ${oid}: ${b.brand_name}, ${stageLabel(v.stage)}, ${inr(val)}`);
    } }),
  'new-payment': () => { const signed = st.S.deals.filter(d => d.stage === 'partner_confirmed' && d.support_type === 'cash'); if (!signed.length) return toast('No signed cash deals to invoice as of this date', true);
    openForm({ title: 'New invoice', fields: [{ key: 'opportunity_id', label: 'Signed deal', type: 'select', options: signed.map(d => [d.opportunity_id, `${d.brand_name}: ${inr(d.confirmed)} (received ${inr(d.received)})`]), required: true },
      { key: 'kind', label: 'Kind', type: 'select', options: ['advance', 'balance', 'full'] }, { key: 'amount_inr', label: 'Amount (₹)', type: 'number', required: true },
      { key: 'invoiced', label: 'Invoice date', type: 'date', value: st.asOf, required: true }, { key: 'due', label: 'Due date', type: 'date', value: addDays(st.asOf, 7), required: true }, { key: 'received', label: 'Received date (blank if unpaid)', type: 'date' }],
      onSubmit: v => { const id = nextId(st.W.tables.payments, 'payment_id', 'PAY'); return save([{ tbl: 'payments', id, data: { payment_id: id, opportunity_id: v.opportunity_id, kind: v.kind, amount_inr: Number(v.amount_inr), invoiced_at: `${v.invoiced}T17:00:00+05:30`, due_at: `${v.due}T18:00:00+05:30`, ...(v.received ? { received_at: `${v.received}T14:00:00+05:30` } : {}), note: 'Added in app' } }], `Invoice ${id}: ${v.kind} ${inr(Number(v.amount_inr))}`); } }); },
  pay: b => { const p = st.W.tables.payments.find(x => x.payment_id === b.dataset.id); openForm({ title: `Mark ${p.payment_id} received`, fields: [{ key: 'd', label: 'Received on', type: 'date', value: st.asOf, required: true }], onSubmit: v => save([{ tbl: 'payments', id: p.payment_id, data: { ...p, received_at: `${v.d}T14:00:00+05:30` } }], `Payment ${p.payment_id} received (${inr(p.amount_inr)})`) }); },
  unpay: b => { const p = { ...st.W.tables.payments.find(x => x.payment_id === b.dataset.id) }; delete p.received_at; save([{ tbl: 'payments', id: p.payment_id, data: p }], `Payment ${p.payment_id} marked unpaid`); },
  'edit-campaign': b => campaignForm(st.W.tables.campaigns.find(c => c.sponsor_campaign_id === b.dataset.id)),
  'new-campaign': () => campaignForm(null),
  'new-spend': () => openForm({ title: 'Add spend', fields: [{ key: 'c', label: 'Campaign', type: 'select', options: campOpts(false), required: true }, { key: 'a', label: 'Amount (₹, negative for credit)', type: 'number', required: true }, { key: 'd', label: 'Posted on', type: 'date', value: st.asOf, required: true }, { key: 'n', label: 'Note', wide: true }],
    onSubmit: v => { const id = nextId(st.W.tables.spend, 'spend_id', 'SP'); return save([{ tbl: 'spend', id, data: { spend_id: id, sponsor_campaign_id: v.c, amount_inr: Number(v.a), posted_at: `${v.d}T18:00:00+05:30`, note: v.n } }], `Spend ${inr(Number(v.a))} on ${campName(v.c)}`); } }),
  del: async b => { const t = b.dataset.tbl, id = b.dataset.id; if (!(await confirmDlg('Delete', `Delete ${TABLES[t].label.toLowerCase()} ${id}?`))) return; save([{ tbl: t, id, deleted: true }], `Deleted ${TABLES[t].label.toLowerCase()} ${id}`); },
  'row-new': () => rowForm(st.dataTable, null),
  'row-edit': b => rowForm(st.dataTable, st.W.tables[st.dataTable].find(r => String(r[TABLES[st.dataTable].pk]) === b.dataset.id)),
  'csv-export': () => { const rows = st.W.tables[st.dataTable]; const cols = [...new Set(rows.flatMap(r => Object.keys(r)))]; const q = v => (v === undefined || v === null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v)); download(`${st.ws}_${st.dataTable}.csv`, [cols.join(','), ...rows.map(r => cols.map(c => q(r[c])).join(','))].join('\n')); },
  reset: async () => { if (!(await confirmDlg('Reset workspace', 'Remove every saved edit in this workspace and return to the seed data? This cannot be undone.'))) return; try { await api('/api/data', { ws: st.ws, action: 'reset' }); await loadWs(st.ws); toast('Workspace reset'); } catch (e) { toast(e.message, true); } },
};
function campaignForm(c) {
  const x = c || {};
  openForm({ title: c ? `Edit ${x.campaign_name}` : 'New campaign', fields: [
    { key: 'sponsor_campaign_id', label: 'ID', value: x.sponsor_campaign_id || nextId(st.W.tables.campaigns, 'sponsor_campaign_id', 'UC', 2), readonly: !!c, required: true },
    { key: 'campaign_name', label: 'Name', value: x.campaign_name, required: true }, { key: 'channel', label: 'Channel', value: x.channel || 'introduction' },
    { key: 'owner_name', label: 'Owner', value: x.owner_name, list: owners() }, { key: 'status', label: 'Status', type: 'select', options: ['active', 'paused', 'stopped'], value: x.status || 'active' },
    { key: 'campaign_type', label: 'Type', type: 'select', options: ['channel', 'enabler'], value: x.campaign_type || 'channel' },
    { key: 'budget_inr', label: 'Budget (₹)', type: 'number', value: x.budget_inr }, { key: 'base_brands', label: 'Plan brands (base)', type: 'number', value: x.base_brands },
    { key: 'stretch_brands', label: 'Plan brands (stretch)', type: 'number', value: x.stretch_brands }, { key: 'plan_meeting_rate', label: 'Plan meeting rate (0-1)', type: 'number', value: x.plan_meeting_rate },
    { key: 'plan_cash_conv', label: 'Plan brand → cash deal (0-1)', type: 'number', value: x.plan_cash_conv }, { key: 'plan_deal_inr', label: 'Plan deal size (₹)', type: 'number', value: x.plan_deal_inr }],
    onSubmit: v => { const data = { ...x }; for (const [k, val] of Object.entries(v)) { if (val === '') delete data[k]; else data[k] = val; } return save([{ tbl: 'campaigns', id: data.sponsor_campaign_id, data }], `${c ? 'Updated' : 'Created'} campaign ${data.campaign_name}`); } });
}
async function onChange(el) {
  const k = el.dataset.chg, id = el.dataset.id, v = el.value;
  const task = () => st.W.tables.tasks.find(t => t.task_id === id);
  switch (k) {
    case 'drv-from': st.drv.from = v; return render(); case 'drv-to': st.drv.to = v; return render();
    case 'sim-from': st.sim.from = v; return render(); case 'sim-to': st.sim.to = v; return render(); case 'sim-amt': st.sim.amt = v; return render();
    case 'tf-status': st.taskF.status = v; return render(); case 'tf-owner': st.taskF.owner = v; return render(); case 'tf-campaign': st.taskF.campaign = v; return render();
    case 'data-table': st.dataTable = v; st.dataSearch = ''; return render(); case 'data-search': st.dataSearch = v; return render();
    case 'task-status': { const t = task(); return save([{ tbl: 'tasks', id, data: { ...t, status: v, ...(v === 'done' ? { completed_at: new Date().toISOString() } : {}) } }], `Task ${id} → ${stageLabel(v)}`); }
    case 'task-owner': return save([{ tbl: 'tasks', id, data: { ...task(), owner_name: v } }], `Task ${id} owner → ${v}`);
    case 'task-due': return save([{ tbl: 'tasks', id, data: { ...task(), due_date: v } }], `Task ${id} due → ${v}`);
    case 'task-priority': return save([{ tbl: 'tasks', id, data: { ...task(), priority: v } }], `Task ${id} priority → ${v}`);
    case 'deal-stage': case 'deal-value': {
      const d = st.S.deals.find(x => x.opportunity_id === id);
      const { op, late } = stageOp(id, k === 'deal-stage' ? v : d.stage, k === 'deal-value' ? Number(v) : d.value);
      const ops = [op]; let extra = '';
      // Cash-first terms: a newly confirmed cash deal gets a 50% advance invoice (due in 7 days) and a balance invoice (due 14 days before the event)
      if (k === 'deal-stage' && v === 'partner_confirmed' && d.support_type === 'cash' && st.S.coverage.has_payments && !st.W.tables.payments.some(p => p.opportunity_id === id)) {
        const val = op.data.proposed_value_inr; const day = op.data.effective_at.slice(0, 10);
        const balDue = istDate(ts(st.S.calendar.event_starts_at) - 14 * 864e5);
        const id1 = nextId(st.W.tables.payments, 'payment_id', 'PAY'); const id2 = 'PAY' + String(Number(id1.slice(3)) + 1).padStart(3, '0');
        ops.push({ tbl: 'payments', id: id1, data: { payment_id: id1, opportunity_id: id, kind: 'advance', amount_inr: Math.round(val / 2), invoiced_at: `${day}T18:30:00+05:30`, due_at: `${addDays(day, 7)}T18:00:00+05:30`, note: 'Auto-raised on signing (cash-first terms)' } });
        ops.push({ tbl: 'payments', id: id2, data: { payment_id: id2, opportunity_id: id, kind: 'balance', amount_inr: val - Math.round(val / 2), invoiced_at: `${day}T18:30:00+05:30`, due_at: `${balDue}T18:00:00+05:30`, note: 'Auto-raised on signing (cash-first terms)' } });
        extra = ' + advance and balance invoices raised';
      }
      const ok = await save(ops, `${d.brand_name}: ${k === 'deal-stage' ? `${stageLabel(d.stage)} → ${stageLabel(v)}` : `value ${inr(d.value)} → ${inr(Number(v))}`}${extra}`);
      if (ok && late) toast(`Saved, dated ${op.data.effective_at.slice(0, 10)} because the deal changed after your view date. Move "As of" forward to see it.`);
      return;
    }
    case 'assumption': { const a = st.W.tables.assumptions.find(x => x.key === id); return save([{ tbl: 'assumptions', id, data: { ...a, value: Number(v) } }], `Assumption ${id} ${a.value} → ${v}`); }
    case 'csv': {
      const file = el.files?.[0]; if (!file) return;
      const rows = csvParse(await file.text()); const spec = TABLES[st.dataTable];
      if (!rows.length) return toast('No rows found in CSV', true);
      const ops = rows.map(r => ({ tbl: st.dataTable, id: r[spec.pk], data: Object.fromEntries(Object.entries(r).filter(([, x]) => x !== '')) }));
      if (!(await confirmDlg('Import CSV', `Upsert ${rows.length} row(s) into ${spec.label} by ${spec.pk}?`))) return;
      return save(ops, `Imported ${rows.length} ${spec.label.toLowerCase()} row(s) from ${file.name}`);
    }
  }
}

// ---------- copilot ----------
const SUGGEST = {
  plan: ['Are we on track to hit the cash target? What is the gap?', 'Which campaign should we stop, and what evidence supports that?', 'Why is the alumni channel behind and what should we do?', 'Which advances are overdue? Draft a follow-up task.', 'What changed in the last 7 days and what drove it?', 'If we move ₹15,000 from outbound to alumni intros, what happens?', 'What is our sponsor renewal rate from last year?'],
  original: ['Which channels produced the confirmed partnerships?', 'How much sponsorship cash was actually collected before the festival?', 'Why did we miss the 28 partnerships target?', 'Which stalled deals are worth reviving? Create a task for the biggest one.', 'Compare cold email with warm introductions.', 'What changed between 1 and 15 March 2025?', 'What was the average deal size by industry?'],
};
function md(text) {
  const lines = esc(text).split('\n'); let html = '', list = null;
  const inline = s => s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>');
  for (const l of lines) {
    const m = l.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (m) { if (!list) { list = l.trim().match(/^\d/) ? 'ol' : 'ul'; html += `<${list}>`; } html += `<li>${inline(m[1])}</li>`; continue; }
    if (list) { html += `</${list}>`; list = null; }
    if (l.trim().match(/^#{1,4}\s/)) html += `<p><b>${inline(l.replace(/^#+\s*/, ''))}</b></p>`; else if (l.trim()) html += `<p>${inline(l)}</p>`;
  }
  if (list) html += `</${list}>`;
  return html;
}
function renderCopilot() {
  const msgs = st.chat[st.ws];
  $('#copilot').innerHTML = `<div class="cp-hd"><b>AI Growth Analyst</b><span class="tag">${st.server.ai === false ? 'not configured' : 'Gemini · live data'}</span><button class="btn sm" data-cp="clear">Clear</button><button class="btn sm" data-cp="close">✕</button></div>
  <div class="cp-msgs" id="cp-msgs">${msgs.length ? '' : `<div class="msg model"><p>I answer from this workspace's live records as of the dashboard date (${fmtDate(st.asOf)}), show which data I used, and draft tasks or changes for you to confirm. I'll say so when the data can't answer.</p></div>`}
  ${msgs.map((m, i) => `<div class="msg ${m.role}">${m.role === 'model' ? md(m.text) : esc(m.text)}
    ${m.trace?.length ? `<details class="trace"><summary>Data used: ${[...new Set(m.trace.map(t => t.tool))].join(', ')}</summary>${m.trace.map(t => `<div>${esc(t.tool)}(${esc(JSON.stringify(t.args))}) → ${esc(t.summary)}</div>`).join('')}</details>` : ''}
    ${m.model ? `<div class="trace">${esc(m.model)}</div>` : ''}</div>
    ${(m.actions || []).map((a, j) => `<div class="action"><b>Proposed:</b> ${esc(a.summary)}<div class="why">${esc(a.reason)}</div>${a.state === 'pending' ? `<div class="row"><button class="btn primary sm" data-cp="confirm" data-i="${i}" data-j="${j}">Confirm</button>${a.ops[0]?.tbl === 'tasks' ? `<button class="btn sm" data-cp="edit" data-i="${i}" data-j="${j}">Edit</button>` : ''}<button class="btn sm" data-cp="cancel" data-i="${i}" data-j="${j}">Cancel</button></div>` : `<div class="small ${a.state === 'confirmed' ? 'good' : 'muted'}">${a.state === 'confirmed' ? '✓ Confirmed and saved' : 'Cancelled'}</div>`}</div>`).join('')}`).join('')}
  ${st.busy ? '<div class="typing">Analysing live data…</div>' : ''}</div>
  ${msgs.length ? '' : `<div class="chips">${SUGGEST[st.ws].map(s => `<button data-cp="ask" data-q="${esc(s)}">${esc(s)}</button>`).join('')}</div>`}
  <form class="cp-in" id="cp-form"><textarea id="cp-text" placeholder="Ask about performance, bottlenecks, what to scale or stop…" ${st.busy ? 'disabled' : ''}></textarea><button class="btn primary" ${st.busy ? 'disabled' : ''}>Send</button></form>`;
  const box = $('#cp-msgs'); box.scrollTop = box.scrollHeight;
}
function history(extraUser) {
  const out = []; let notes = [];
  for (const m of st.chat[st.ws]) {
    if (m.role === 'sys' && m.note) notes.push(m.note);
    if (m.role === 'user') { out.push({ role: 'user', text: [...notes, m.text].join('\n') }); notes = []; }
    if (m.role === 'model') out.push({ role: 'model', text: m.text + (m.actions?.length ? `\n[Drafted: ${m.actions.map(a => a.summary).join('; ')}]` : '') });
  }
  if (extraUser) out.push({ role: 'user', text: [...notes, extraUser].join('\n') });
  return out;
}
async function ask(q) {
  if (!q.trim() || st.busy) return;
  const msgs = st.chat[st.ws];
  const hist = history(q);
  msgs.push({ role: 'user', text: q }); st.busy = true; renderCopilot();
  try {
    const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ws: st.ws, asOf: st.asOf, messages: hist }) });
    const j = await r.json().catch(() => ({ error: `Server returned ${r.status}` }));
    if (j.reply) msgs.push({ role: 'model', text: j.reply, trace: j.trace, model: j.model, actions: (j.pendingActions || []).map(a => ({ ...a, state: 'pending' })) });
    else msgs.push({ role: 'err', text: j.error || 'No answer', trace: j.trace });
  } catch (e) { msgs.push({ role: 'err', text: `Could not reach the copilot: ${e.message}` }); }
  st.busy = false; renderCopilot();
}
async function cpAction(b) {
  const k = b.dataset.cp; const msgs = st.chat[st.ws];
  if (k === 'close') { st.cpOpen = false; return render(); }
  if (k === 'clear') { st.chat[st.ws] = []; return renderCopilot(); }
  if (k === 'ask') return ask(b.dataset.q);
  const a = msgs[Number(b.dataset.i)]?.actions?.[Number(b.dataset.j)]; if (!a) return;
  if (k === 'cancel') { a.state = 'cancelled'; msgs.push({ role: 'sys', text: `Cancelled: ${a.summary}`, note: `[Cancelled action] ${a.summary}` }); return renderCopilot(); }
  if (k === 'edit') { const op = a.ops[0]; return taskEditForCopilot(a, op); }
  if (k === 'confirm') {
    const ok = await save(a.ops, a.summary, 'copilot (confirmed by user)');
    if (ok) { a.state = 'confirmed'; msgs.push({ role: 'sys', text: `Saved: ${a.summary}`, note: `[Confirmed action] ${a.summary}` }); }
    renderCopilot();
  }
}
function taskEditForCopilot(a, op) {
  const t = op.data;
  openForm({ title: 'Edit before confirming', submit: 'Confirm and save', fields: [
    { key: 'title', label: 'Title', value: t.title, required: true, wide: true }, { key: 'owner_name', label: 'Owner', value: t.owner_name, list: owners(), required: true },
    { key: 'due_date', label: 'Due', type: 'date', value: t.due_date, required: true }, { key: 'priority', label: 'Priority', type: 'select', options: ['P0', 'P1', 'P2'], value: t.priority || 'P1' },
    { key: 'notes', label: 'Notes', type: 'textarea', value: t.notes || '' }],
    onSubmit: async v => { op.data = { ...t, ...v }; a.summary = `${a.type === 'create_task' ? 'Create' : 'Update'} task ${t.task_id}: "${v.title}" for ${v.owner_name}, due ${v.due_date}`;
      const ok = await save(a.ops, a.summary, 'copilot (edited and confirmed by user)'); if (ok) { a.state = 'confirmed'; st.chat[st.ws].push({ role: 'sys', text: `Saved: ${a.summary}`, note: `[Confirmed action] ${a.summary}` }); } renderCopilot(); return ok; } });
}

// ---------- misc ----------
let toastTimer;
function toast(text, err) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const d = document.createElement('div'); d.className = `toast ${err ? 'err' : ''}`; d.textContent = text; document.body.appendChild(d);
  clearTimeout(toastTimer); toastTimer = setTimeout(() => d.remove(), err ? 6000 : 3000);
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-tab]'); if (t) { st.tab = t.dataset.tab; render(); $('#main').scrollTop = 0; return; }
  const x = e.target.closest('[data-exec]'); if (x) { st.exec = x.dataset.exec; render(); return; }
  const a = e.target.closest('[data-act]'); if (a && actions[a.dataset.act]) { actions[a.dataset.act](a, e); return; }
  const c = e.target.closest('[data-cp]'); if (c) { cpAction(c); }
});
document.addEventListener('change', e => { const el = e.target.closest('[data-chg]'); if (el) onChange(el); });
document.addEventListener('submit', e => { if (e.target.id === 'cp-form') { e.preventDefault(); const t = $('#cp-text'); const q = t.value; t.value = ''; ask(q); } });
document.addEventListener('keydown', e => { if (e.target.id === 'cp-text' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#cp-form').requestSubmit(); } });
document.addEventListener('mousemove', e => {
  const tip = $('#tip'); const el = e.target.closest?.('[data-tip]');
  if (!el) { tip.style.display = 'none'; return; }
  tip.innerHTML = el.dataset.tip; tip.style.display = 'block';
  tip.style.left = `${Math.min(e.clientX + 14, window.innerWidth - 270)}px`; tip.style.top = `${e.clientY + 14}px`;
});
$('#ws').addEventListener('change', e => loadWs(e.target.value));
$('#asof').addEventListener('change', e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) { st.asOf = e.target.value; st.drv = { from: null, to: null }; recompute(); renderCopilot(); } });
$('#latest').addEventListener('click', () => { st.asOf = calendar(st.W).defaultAsOf; recompute(); renderCopilot(); });
$('#cp-toggle').addEventListener('click', () => { st.cpOpen = !st.cpOpen; render(); if (st.cpOpen) renderCopilot(); });
loadWs(st.ws);
