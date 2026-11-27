// Analytics engine. Pure functions over workspace data; no network, no AI.
// The dashboard and the AI copilot both call these, so the numbers always match.
import { TABLES, OPEN_STAGES, ROOT_EVENTS } from './schema.js';

export const DAY = 864e5;
export const ts = s => (s ? Date.parse(s) : NaN);
export const endOfDay = d => Date.parse(`${d}T23:59:59.999+05:30`);
export const startOfDay = d => Date.parse(`${d}T00:00:00+05:30`);
export const istDate = t => new Date((typeof t === 'number' ? t : Date.parse(t)) + 19800000).toISOString().slice(0, 10);
export const addDays = (d, n) => istDate(Date.parse(`${d}T12:00:00+05:30`) + n * DAY);
const STAGE_IDX = { prospecting: 0, contacted: 1, proposal_sent: 2, negotiating: 3, partner_confirmed: 4 };
const stable = o => JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]]));
const sum = (arr, f = x => x) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);
const ratio = (a, b) => (b > 0 ? a / b : null);
const round = (x, d = 4) => (x === null || x === undefined || !Number.isFinite(x) ? x : Math.round(x * 10 ** d) / 10 ** d);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export const DEFAULT_ASSUMPTIONS = {
  p_prospecting: 0.08, p_contacted: 0.15, p_proposal_sent: 0.4, p_negotiating: 0.65,
  stall_days: 7, stall_factor: 0.5, collection_rate: 0.85, safe_days_before_event: 30,
  days_to_sign: 16, min_sample_projection: 10, credibility_k: 10,
};

export function inr(n, { exact = false } = {}) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  n = Number(n);
  const s = n < 0 ? '-' : ''; const a = Math.abs(n);
  if (!exact && a >= 1e7) return `${s}₹${(a / 1e7).toFixed(2)}Cr`;
  if (!exact && a >= 1e5) return `${s}₹${(a / 1e5).toFixed(a >= 1e6 ? 1 : 2).replace(/\.?0+$/, '')}L`;
  return `${s}₹${Math.round(a).toLocaleString('en-IN')}`;
}
export const pct = (x, d = 0) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : `${(x * 100).toFixed(d)}%`);

// ---------- Workspace assembly: seed rows + saved edits, with import-retry de-duplication ----------
export function buildWorkspace(seed, overrides = [], meta = {}) {
  const tables = {}; const quality = { duplicatesRemoved: {}, conflictingIds: {}, missingKeys: {} };
  const editedIds = new Set();
  for (const [t, spec] of Object.entries(TABLES)) {
    const map = new Map();
    for (const r of seed[t] || []) {
      const k = r[spec.pk];
      if (k === undefined || k === null || k === '') { quality.missingKeys[t] = (quality.missingKeys[t] || 0) + 1; continue; }
      if (map.has(k)) {
        if (stable(map.get(k)) === stable(r)) quality.duplicatesRemoved[t] = (quality.duplicatesRemoved[t] || 0) + 1;
        else (quality.conflictingIds[t] ||= []).push(k); // keep the first version, flag the conflict
        continue;
      }
      map.set(k, r);
    }
    tables[t] = map;
  }
  let edits = 0, deletes = 0;
  for (const o of overrides) {
    const m = tables[o.tbl]; if (!m) continue;
    editedIds.add(`${o.tbl}:${o.id}`);
    if (o.deleted) { m.delete(o.id); deletes++; } else { m.set(o.id, { ...o.data }); edits++; }
  }
  return {
    ...meta,
    tables: Object.fromEntries(Object.entries(tables).map(([t, m]) => [t, [...m.values()]])),
    quality, editedIds, editCount: edits, deleteCount: deletes,
  };
}

function latestBy(rows, key) { // full-state history: latest version per entity, ties broken by history id
  const m = new Map();
  for (const r of [...rows].sort((a, b) => ts(a.effective_at) - ts(b.effective_at) || String(a.history_id).localeCompare(String(b.history_id)))) m.set(r[key], r);
  return m;
}
function groupSorted(rows, key) {
  const m = new Map();
  for (const r of [...rows].sort((a, b) => ts(a.effective_at) - ts(b.effective_at) || String(a.history_id).localeCompare(String(b.history_id)))) {
    if (!m.has(r[key])) m.set(r[key], []);
    m.get(r[key]).push(r);
  }
  return m;
}

export function assumptionsOf(W) {
  return { ...DEFAULT_ASSUMPTIONS, ...Object.fromEntries(W.tables.assumptions.map(a => [a.key, Number(a.value)])) };
}

export function calendar(W) {
  const event = W.tables.event[0] || {};
  const A = assumptionsOf(W);
  const eventStart = ts(event.event_starts_at);
  const start = event.campaign_start || event.history_start || '2025-01-15';
  const startTs = startOfDay(start);
  const sourcingEnd = eventStart - A.safe_days_before_event * DAY;
  const lastData = Math.max(...['interactions', 'opp_history', 'qualification', 'payments', 'spend'].flatMap(t =>
    W.tables[t].map(r => ts(r[TABLES[t].time] || r.received_at)).filter(Number.isFinite)), startTs);
  const defaultAsOf = event.sim_today || (Number.isFinite(eventStart) ? istDate(Math.min(eventStart - DAY, lastData)) : istDate(lastData));
  return { event, start, startTs, eventStart, sourcingEnd, sourcingDays: (sourcingEnd - startTs) / DAY, defaultAsOf, lastDataDate: istDate(lastData) };
}

// ---------- Snapshot: every metric as of the end of a selected India-time day ----------
export function snapshot(W, asOf, { series = true } = {}) {
  const T = W.tables; const cut = endOfDay(asOf); const A = assumptionsOf(W); const cal = calendar(W);
  const excluded = {};
  const filt = (t, field) => { const r = T[t].filter(x => ts(x[field]) <= cut); excluded[t] = T[t].length - r.length; return r; };
  const brands = filt('brands', 'created_at');
  const inter = filt('interactions', 'occurred_at');
  const qual = filt('qualification', 'effective_at');
  const opps = filt('opportunities', 'created_at');
  const oh = filt('opp_history', 'effective_at');
  const pays = filt('payments', 'invoiced_at');
  const spend = filt('spend', 'posted_at');
  const target = [...T.targets].filter(t => ts(t.effective_at) <= cut).sort((a, b) => ts(a.effective_at) - ts(b.effective_at)).pop() || null;
  const qLatest = latestBy(qual, 'brand_id');
  const ohBy = groupSorted(oh, 'opportunity_id');
  const brandById = new Map(T.brands.map(b => [b.brand_id, b]));
  const payBy = new Map();
  for (const p of pays) { if (!payBy.has(p.opportunity_id)) payBy.set(p.opportunity_id, []); payBy.get(p.opportunity_id).push(p); }
  const isRecv = p => p.received_at && ts(p.received_at) <= cut;
  const hasPayments = T.payments.length > 0;
  const hasSpend = T.spend.length > 0;
  const elapsedDays = Math.max(0, (cut - cal.startTs) / DAY);
  const week = Math.max(1, Math.floor(elapsedDays / 7) + 1);
  const planFrac = cal.sourcingDays > 0 ? clamp(elapsedDays / cal.sourcingDays, 0, 1) : 1;

  const deals = opps.map(o => {
    const h = ohBy.get(o.opportunity_id) || [];
    const last = h[h.length - 1];
    const stage = last ? last.stage : 'prospecting';
    const maxIdx = Math.max(-1, ...h.map(x => STAGE_IDX[x.stage] ?? -1));
    const lastChange = last ? last.effective_at : o.created_at;
    const idleDays = Math.floor((cut - ts(lastChange)) / DAY);
    const isOpen = OPEN_STAGES.includes(stage);
    const stalled = isOpen && idleDays > A.stall_days;
    let signedAt = null;
    if (stage === 'partner_confirmed') for (let i = h.length - 1; i >= 0 && h[i].stage === 'partner_confirmed'; i--) signedAt = h[i].effective_at;
    const p = payBy.get(o.opportunity_id) || [];
    const value = Number(last?.proposed_value_inr ?? 0);
    const prob = isOpen ? (A[`p_${stage}`] ?? 0) * (stalled ? A.stall_factor : 1) : 0;
    return {
      opportunity_id: o.opportunity_id, opportunity_name: o.opportunity_name, brand_id: o.brand_id,
      brand_name: brandById.get(o.brand_id)?.brand_name || o.brand_name || o.brand_id,
      campaign_id: o.sponsor_campaign_id, support_type: o.support_type, created_at: o.created_at,
      stage, value, confirmed: stage === 'partner_confirmed' ? Number(last.confirmed_value_inr || 0) : 0,
      reached_proposal: maxIdx >= 2, reached_negotiation: maxIdx >= 3, ever_confirmed: h.some(x => x.stage === 'partner_confirmed'),
      last_change: lastChange, idle_days: idleDays, is_open: isOpen, stalled, signed_at: signedAt,
      owner: last?.owner_name || '', invoiced: sum(p, x => x.amount_inr), received: sum(p.filter(isRecv), x => x.amount_inr),
      prob: round(prob), weighted: o.support_type === 'cash' && isOpen ? Math.round(value * prob) : 0,
      brand_qualification: qLatest.get(o.brand_id)?.qualification_status || 'none',
    };
  });

  const camps = T.campaigns;
  const campById = new Map(camps.map(c => [c.sponsor_campaign_id, c]));
  const firstTouch = new Map(); // brand -> first root event time (portfolio)
  for (const i of inter) if (ROOT_EVENTS.includes(i.event_type)) { const t = ts(i.occurred_at); if (!firstTouch.has(i.brand_id) || t < firstTouch.get(i.brand_id)) firstTouch.set(i.brand_id, t); }

  function measure(cid) {
    const scope = cid && campById.get(cid)?.campaign_type !== 'enabler' ? cid : null;
    const I = scope ? inter.filter(i => i.sponsor_campaign_id === scope) : inter;
    const D = scope ? deals.filter(d => d.campaign_id === scope) : deals;
    const brandsWith = (pred) => new Set(I.filter(pred).map(i => i.brand_id));
    const worked = brandsWith(i => ROOT_EVENTS.includes(i.event_type));
    const replied = brandsWith(i => i.event_type === 'replied');
    const positive = brandsWith(i => i.event_type === 'replied' && i.outcome === 'positive');
    const meetingsHeld = brandsWith(i => i.event_type === 'meeting_held');
    const optOut = brandsWith(i => i.event_type === 'opt_out');
    const outreachBrands = brandsWith(i => i.event_type === 'outreach_sent');
    const recentCut = cut - 14 * DAY;
    const firstInScope = new Map();
    for (const i of I) if (ROOT_EVENTS.includes(i.event_type)) { const t = ts(i.occurred_at); if (!firstInScope.has(i.brand_id) || t < firstInScope.get(i.brand_id)) firstInScope.set(i.brand_id, t); }
    const recentBrands = [...firstInScope.values()].filter(t => t > recentCut).length;
    const qualifiedRows = [...qLatest.values()].filter(q => q.qualification_status === 'qualified' && (!scope || q.sponsor_campaign_id === scope));
    const signed = D.filter(d => d.stage === 'partner_confirmed');
    const signedCash = signed.filter(d => d.support_type === 'cash');
    const closedLost = D.filter(d => d.stage === 'lost' || d.stage === 'withdrawn');
    const open = D.filter(d => d.is_open);
    const openCash = open.filter(d => d.support_type === 'cash');
    const dealIds = new Set(D.map(d => d.opportunity_id));
    const P = pays.filter(p => dealIds.has(p.opportunity_id));
    const due = P.filter(p => ts(p.due_at) <= cut);
    const advDue = due.filter(p => p.kind === 'advance' || p.kind === 'full');
    const advOnTime = advDue.filter(p => p.received_at && ts(p.received_at) <= Math.min(ts(p.due_at), cut));
    const spendRows = scope ? spend.filter(s => s.sponsor_campaign_id === scope) : (cid ? spend.filter(s => s.sponsor_campaign_id === cid) : spend);
    // maturity-adjusted conversion: only meetings old enough to have had time to sign
    const matureCut = cut - A.days_to_sign * DAY;
    const meetTime = new Map();
    for (const i of I) if (i.event_type === 'meeting_held') { const t = ts(i.occurred_at); if (!meetTime.has(i.brand_id) || t < meetTime.get(i.brand_id)) meetTime.set(i.brand_id, t); }
    const matureMeetings = [...meetTime].filter(([, t]) => t <= matureCut).map(([b]) => b);
    const signedCashBrands = new Set(signedCash.map(d => d.brand_id));
    const matureSigned = matureMeetings.filter(b => signedCashBrands.has(b)).length;
    return {
      brands_worked: worked.size, attempts: I.filter(i => ROOT_EVENTS.includes(i.event_type)).length,
      replied: replied.size, positive_replies: positive.size, meetings_held: meetingsHeld.size, opt_outs: optOut.size,
      outreach_brands: outreachBrands.size, recent_brands_14d: recentBrands, qualified: qualifiedRows.length,
      opportunities: D.length, proposals: D.filter(d => d.reached_proposal).length, negotiations: D.filter(d => d.reached_negotiation).length,
      signed: signed.length, signed_cash_deals: signedCash.length, signed_cash_inr: sum(signedCash, d => d.confirmed),
      signed_in_kind_deals: signed.length - signedCash.length, signed_in_kind_inr: sum(signed.filter(d => d.support_type !== 'cash'), d => d.confirmed),
      lost: closedLost.length, open: open.length, stalled: open.filter(d => d.stalled).length,
      open_cash_inr: sum(openCash, d => d.value), weighted_pipeline_inr: sum(openCash, d => d.weighted),
      invoiced_inr: sum(P, p => p.amount_inr), received_inr: sum(P.filter(isRecv), p => p.amount_inr),
      due_inr: sum(due, p => p.amount_inr), due_received_inr: sum(due.filter(isRecv), p => p.amount_inr),
      advances_due: advDue.length, advances_on_time: advOnTime.length,
      spend_inr: sum(spendRows, s => s.amount_inr),
      reply_rate: round(ratio(replied.size, worked.size)), meeting_rate: round(ratio(meetingsHeld.size, worked.size)),
      opt_out_rate: round(ratio(optOut.size, outreachBrands.size)),
      win_rate: round(ratio(signed.length, signed.length + closedLost.length)),
      opp_to_signed: round(ratio(signed.length, D.length)),
      stalled_share: round(ratio(open.filter(d => d.stalled).length, open.length)),
      advance_rate_7d: round(ratio(advOnTime.length, advDue.length)),
      collection_rate: round(ratio(sum(due.filter(isRecv), p => p.amount_inr), sum(due, p => p.amount_inr))),
      mature_meetings: matureMeetings.length, mature_signed: matureSigned, mature_conv: round(ratio(matureSigned, matureMeetings.length)),
    };
  }

  const total = measure(null);
  total.research_brands = brands.length;
  total.qualified_with_opportunity = [...qLatest.values()].filter(q => q.qualification_status === 'qualified' && deals.some(d => d.brand_id === q.brand_id)).length;
  const qualCounts = {}; for (const q of qLatest.values()) qualCounts[q.qualification_status] = (qualCounts[q.qualification_status] || 0) + 1;
  total.qualification_counts = qualCounts;

  const campaigns = camps.map(c => {
    const m = measure(c.sponsor_campaign_id);
    const plannedBrands = c.base_brands ? Math.round(c.base_brands * planFrac * 10) / 10 : null;
    return {
      id: c.sponsor_campaign_id, name: c.campaign_name, channel: c.channel, owner: c.owner_name, type: c.campaign_type || 'channel',
      status: c.status || 'active', rank: c.rank ?? null, decision_plan: c.decision || '',
      budget_inr: c.budget_inr ?? null, plan: { base_brands: c.base_brands ?? null, stretch_brands: c.stretch_brands ?? null,
        meeting_rate: c.plan_meeting_rate ?? null, cash_conv: c.plan_cash_conv ?? null, deal_inr: c.plan_deal_inr ?? null,
        base_signed_inr: c.base_signed_inr ?? null, stretch_signed_inr: c.stretch_signed_inr ?? null,
        base_incremental_inr: c.base_incremental_inr ?? null, stretch_incremental_inr: c.stretch_incremental_inr ?? null },
      planned_brands_to_date: plannedBrands,
      pace_brands_pct: plannedBrands ? round(m.brands_worked / plannedBrands) : null,
      budget_used: c.budget_inr ? round(m.spend_inr / c.budget_inr) : null,
      cost_per_signed_inr: c.campaign_type !== 'enabler' && m.signed_cash_deals > 0 ? Math.round(m.spend_inr / m.signed_cash_deals) : null,
      cash_per_rupee: c.campaign_type !== 'enabler' && m.spend_inr > 0 ? round(m.signed_cash_inr / m.spend_inr, 2) : null,
      ...m,
    };
  });

  // projection: collected so far + expected collection on signed, weighted open and run-rate new business
  const daysLeftSourcing = Math.max(0, (cal.sourcingEnd - cut) / DAY);
  // Each campaign: signed + weighted open deals stay as they are; young brands without a deal and future brands
  // get an expected value per brand. That value blends the observed rate of mature brands (touched at least
  // days_to_sign ago) with the plan rate, weighting the plan as if it were credibility_k brands (shrinkage).
  const future = campaigns.filter(c => c.type !== 'enabler' && c.status !== 'stopped').map(c => {
    const I = inter.filter(i => i.sponsor_campaign_id === c.id && ROOT_EVENTS.includes(i.event_type));
    const first = new Map(); for (const i of I) { const t = ts(i.occurred_at); if (!first.has(i.brand_id) || t < first.get(i.brand_id)) first.set(i.brand_id, t); }
    const D = deals.filter(d => d.campaign_id === c.id && d.support_type === 'cash');
    const dealBrands = new Set(D.map(d => d.brand_id));
    const matureCut = cut - A.days_to_sign * DAY;
    const mature = [...first].filter(([, t]) => t <= matureCut).map(([b]) => b);
    const matureSet = new Set(mature);
    const matureValue = sum(D.filter(d => matureSet.has(d.brand_id)), d => (d.stage === 'partner_confirmed' ? d.confirmed : d.weighted));
    const observed = mature.length ? matureValue / mature.length : null;
    const planned = c.plan.cash_conv && c.plan.deal_inr ? c.plan.cash_conv * c.plan.deal_inr : null;
    const k = A.credibility_k;
    const perBrand = planned === null ? (observed ?? 0) : observed === null ? planned : (mature.length * observed + k * planned) / (mature.length + k);
    // young brands can still sign only if there is time before the event
    const canStillSign = (cal.eventStart - cut) / DAY >= A.days_to_sign;
    const young = canStillSign ? [...first].filter(([b, t]) => t > matureCut && !dealBrands.has(b)).length : 0;
    const weeks = Math.min(2, Math.max(elapsedDays, 1) / 7);
    const weeklyRate = c.recent_brands_14d / weeks;
    let brandsLeft = weeklyRate * daysLeftSourcing / 7;
    if (c.plan.stretch_brands) brandsLeft = Math.min(brandsLeft, Math.max(0, c.plan.stretch_brands - c.brands_worked));
    return { id: c.id, weekly_brand_rate: round(weeklyRate, 2), brands_left: round(brandsLeft, 1), young_brands_without_deal: young,
      mature_brands: mature.length, observed_value_per_brand_inr: observed === null ? null : Math.round(observed), plan_value_per_brand_inr: planned === null ? null : Math.round(planned),
      value_per_brand_inr: Math.round(perBrand), expected_signed_inr: Math.round((brandsLeft + young) * perBrand) };
  });
  const futureSigned = sum(future, f => f.expected_signed_inr);
  const collected = hasPayments ? total.received_inr : null;
  const unpaidSigned = Math.max(0, total.signed_cash_inr - (hasPayments ? sum(deals.filter(d => d.stage === 'partner_confirmed'), d => d.received) : 0));
  const projection = {
    collected_inr: collected,
    signed_cash_inr: total.signed_cash_inr,
    unpaid_signed_inr: unpaidSigned,
    weighted_pipeline_inr: total.weighted_pipeline_inr,
    future_signed_inr: futureSigned,
    future_by_campaign: future,
    days_left_sourcing: round(daysLeftSourcing, 1),
    collection_rate: A.collection_rate,
    projected_signed_inr: Math.round(total.signed_cash_inr + total.weighted_pipeline_inr + futureSigned),
    projected_collected_inr: Math.round((collected || 0) + A.collection_rate * (unpaidSigned + total.weighted_pipeline_inr + futureSigned)),
    basis: hasPayments ? 'payments ledger + assumptions' : 'no payment records: projected collected assumes nothing collected yet',
  };

  // plan pace for this date (linear within the week)
  let pace = null;
  if (T.pace.length) {
    const rows = [...T.pace].sort((a, b) => Number(a.week) - Number(b.week));
    const at = (w, k) => (w <= 0 ? 0 : Number((rows.find(r => Number(r.week) === w) || rows[rows.length - 1])[k] || 0));
    const wf = elapsedDays / 7; const w0 = Math.floor(wf); const fr = wf - w0;
    const interp = k => Math.round(at(w0, k) + (at(w0 + 1, k) - at(w0, k)) * fr);
    pace = { week, plan_brands: interp('base_brands'), plan_signed_inr: interp('base_signed_inr'), plan_collected_inr: interp('base_collected_inr'),
      stretch_signed_inr: interp('stretch_signed_inr'), stretch_collected_inr: interp('stretch_collected_inr'),
      actual_brands: total.brands_worked, actual_signed_inr: total.signed_cash_inr, actual_collected_inr: collected };
  }

  const tasks = T.tasks.map(t => ({ ...t, overdue: t.status !== 'done' && t.due_date && t.due_date < asOf }));
  const budget = { approved_inr: sum(camps, c => c.budget_inr), spent_inr: sum(spend, s => s.amount_inr) };

  const S = {
    workspace: W.id, workspace_name: W.name, simulated: !!W.simulated, as_of: asOf, week,
    calendar: { campaign_start: cal.start, event_starts_at: cal.event.event_starts_at, sourcing_ends: istDate(cal.sourcingEnd), default_as_of: cal.defaultAsOf },
    event: cal.event, target, assumptions: A, totals: total, campaigns, deals, projection, pace, budget, tasks,
    coverage: { has_payments: hasPayments, has_spend: hasSpend, has_budgets: camps.some(c => c.budget_inr > 0), has_plan: camps.some(c => c.base_brands > 0), excluded_after_cutoff: excluded },
    quality: W.quality,
  };
  S.rules = evaluateRules(W, S);
  S.decisions = campaignDecisions(S);
  if (series) S.series = weeklySeries(W, asOf);
  return S;
}

export function weeklySeries(W, asOf) {
  const cal = calendar(W); const out = [];
  const cut = endOfDay(asOf);
  for (let d = cal.startTs + 6 * DAY; ; d += 7 * DAY) {
    const day = istDate(Math.min(d, cut));
    const s = snapshot(W, day, { series: false });
    out.push({ week: s.week, date: day, brands: s.totals.brands_worked, meetings: s.totals.meetings_held, signed_cash_inr: s.totals.signed_cash_inr,
      collected_inr: s.coverage.has_payments ? s.totals.received_inr : null, signed: s.totals.signed });
    if (d >= cut || out.length > 30) break;
  }
  return out;
}

// ---------- Scale / change / stop rules ----------
export function metricFor(S, cid, metric) {
  const c = S.campaigns.find(x => x.id === cid);
  if (!c) return { value: null, n: 0 };
  const m = {
    brands_worked: [c.brands_worked, c.brands_worked], reply_rate: [c.reply_rate, c.brands_worked], meeting_rate: [c.meeting_rate, c.brands_worked],
    win_rate: [c.win_rate, c.signed + c.lost], opt_out_rate: [c.opt_out_rate, c.outreach_brands], stalled_share: [c.stalled_share, c.open],
    pace_brands_pct: [c.pace_brands_pct, Math.round(c.planned_brands_to_date || 0)], advance_rate_7d: [c.advance_rate_7d, c.advances_due],
    collection_rate: [c.collection_rate, c.advances_due], signed_cash_inr: [c.signed_cash_inr, c.signed_cash_deals],
    collected_inr: [c.received_inr, c.signed_cash_deals], cost_per_signed_inr: [c.cost_per_signed_inr, c.signed_cash_deals],
    mature_conv: [c.mature_conv, c.mature_meetings],
  }[metric];
  return m ? { value: m[0], n: m[1] } : { value: null, n: 0 };
}

export function evaluateRules(W, S) {
  return W.tables.rules.map(r => {
    const { value, n } = metricFor(S, r.sponsor_campaign_id, r.metric);
    let status, reason;
    const fromWeek = Number(r.from_week || 1);
    if (S.week < fromWeek) { status = 'too_early'; reason = `Rule starts in week ${fromWeek} (now week ${S.week})`; }
    else if (value === null || value === undefined || n < Number(r.min_sample)) { status = 'too_early'; reason = `Sample ${n} is below the minimum of ${r.min_sample}`; }
    else if (r.direction === 'higher') status = value >= r.scale_at ? 'scale' : value <= r.stop_at ? 'stop' : 'change';
    else status = value <= r.scale_at ? 'scale' : value >= r.stop_at ? 'stop' : 'change';
    if (!reason && status !== 'too_early') reason = `${r.metric} = ${round(value, 3)} (scale ${r.direction === 'higher' ? '≥' : '≤'} ${r.scale_at}, stop ${r.direction === 'higher' ? '≤' : '≥'} ${r.stop_at}, n=${n})`;
    const action = status === 'scale' ? r.scale_action : status === 'stop' ? r.stop_action : status === 'change' ? r.change_action : 'Keep collecting data';
    return { rule_id: r.rule_id, campaign_id: r.sponsor_campaign_id, role: r.role, metric: r.metric, direction: r.direction,
      scale_at: r.scale_at, stop_at: r.stop_at, min_sample: r.min_sample, value: round(value), n, status, reason, action };
  });
}

export function campaignDecisions(S) {
  const out = {};
  for (const c of S.campaigns) {
    const rs = S.rules.filter(r => r.campaign_id === c.id);
    const primary = rs.find(r => r.role === 'primary');
    const guards = rs.filter(r => r.role !== 'primary');
    let decision = 'no_rule', why = 'No rule set for this campaign';
    if (primary) {
      decision = primary.status; why = `Primary: ${primary.reason}`;
      const gStop = guards.find(g => g.status === 'stop');
      if (primary.status === 'scale' && gStop) { decision = 'change'; why += `; guardrail breached: ${gStop.reason}`; }
      if (primary.status === 'too_early' && gStop) { decision = 'change'; why += `; guardrail breached early: ${gStop.reason}`; }
      if (primary.status === 'change' && gStop) { decision = 'stop'; why += `; guardrail breached: ${gStop.reason}`; }
    }
    out[c.id] = { decision, why, action: decision === 'stop' ? (primary?.status === 'stop' ? primary.action : guards.find(g => g.status === 'stop')?.action)
      : decision === 'change' ? (primary?.status === 'change' ? primary.action : guards.find(g => g.status === 'stop')?.action || primary?.action) : primary?.action || '' };
  }
  return out;
}

// ---------- Diagnosis ----------
export function bottlenecks(S, cid) {
  const P = S.totals;
  const list = S.campaigns.filter(c => c.type !== 'enabler' && (!cid || c.id === cid)).map(c => {
    const stages = [];
    const add = (stage, actual, bench, n, minN, benchLabel, note) => {
      if (actual === null || actual === undefined || bench === null || bench === undefined || !(bench > 0)) return;
      stages.push({ stage, actual: round(actual), benchmark: round(bench), benchmark_type: benchLabel, ratio: round(actual / bench, 2), n, enough_data: n >= minN, note });
    };
    const plan = c.plan;
    add('Volume: brands worked vs plan to date', c.pace_brands_pct, 1, c.planned_brands_to_date || 0, 3, 'plan');
    add('Brand → meeting held', c.meeting_rate, plan.meeting_rate ?? P.meeting_rate, c.brands_worked, 8, plan.meeting_rate ? 'plan' : 'portfolio average');
    const planMeetToDeal = plan.cash_conv && plan.meeting_rate ? plan.cash_conv / plan.meeting_rate : null;
    add('Meeting → signed cash deal (mature meetings only)', c.mature_conv, planMeetToDeal ?? P.mature_conv, c.mature_meetings, 4, planMeetToDeal ? 'plan' : 'portfolio average',
      `Counts meetings held at least ${S.assumptions.days_to_sign} days ago, so young meetings do not drag the rate down`);
    add('Open deals moving (not stalled)', c.stalled_share === null ? null : 1 - c.stalled_share, 0.8, c.open, 3, 'target', `Stalled = no stage change for over ${S.assumptions.stall_days} days`);
    add('Advances paid within 7 days', c.advance_rate_7d, 0.7, c.advances_due, 3, 'target');
    const valid = stages.filter(s => s.enough_data);
    const worst = valid.length ? valid.reduce((a, b) => (b.ratio < a.ratio ? b : a)) : null;
    return { campaign_id: c.id, campaign: c.name, bottleneck: worst && worst.ratio < 0.9 ? worst.stage : worst ? 'None below 90% of benchmark' : 'Not enough data yet', stages };
  });
  const portfolio = [
    { step: 'Brands worked → replied', rate: P.reply_rate, from: P.brands_worked, to: P.replied },
    { step: 'Replied → meeting held', rate: ratio(P.meetings_held, P.replied), from: P.replied, to: P.meetings_held },
    { step: 'Meeting held → opportunity', rate: ratio(new Set(S.deals.map(d => d.brand_id)).size, P.meetings_held), from: P.meetings_held, to: new Set(S.deals.map(d => d.brand_id)).size, note: 'Opportunity brands can include brands without a meeting' },
    { step: 'Opportunity → proposal', rate: ratio(P.proposals, P.opportunities), from: P.opportunities, to: P.proposals },
    { step: 'Proposal → signed (any type)', rate: ratio(P.signed, P.proposals), from: P.proposals, to: P.signed },
  ].map(s => ({ ...s, rate: round(s.rate) }));
  return { campaigns: list, portfolio };
}

// Splits a change in projected collected cash into its parts, so a drop can be explained rather than just reported.
function projectionBridge(a, b) {
  const pa = a.projection || {}, pb = b.projection || {}, r = pb.collection_rate ?? pa.collection_rate ?? 1;
  const d = k => Math.round((pb[k] || 0) - (pa[k] || 0));
  const fa = new Map((pa.future_by_campaign || []).map(f => [f.id, f]));
  return {
    note: 'projected collected = collected + collection_rate × (unpaid signed + weighted pipeline + expected new deals). Expected new deals = remaining brands at the recent weekly run-rate (capped by plan) × value per brand (blend of observed and plan).',
    collected_change_inr: d('collected_inr'),
    unpaid_signed_change_x_rate_inr: Math.round(d('unpaid_signed_inr') * r),
    weighted_pipeline_change_x_rate_inr: Math.round(d('weighted_pipeline_inr') * r),
    expected_new_deals_change_x_rate_inr: Math.round(d('future_signed_inr') * r),
    days_left_sourcing: { from: pa.days_left_sourcing, to: pb.days_left_sourcing },
    expected_new_deals_by_campaign: (pb.future_by_campaign || []).map(f => {
      const o = fa.get(f.id) || {};
      return { id: f.id, expected_signed_from_inr: o.expected_signed_inr ?? null, expected_signed_to_inr: f.expected_signed_inr,
        weekly_brand_rate: { from: o.weekly_brand_rate ?? null, to: f.weekly_brand_rate }, brands_left: { from: o.brands_left ?? null, to: f.brands_left },
        value_per_brand_inr: { from: o.value_per_brand_inr ?? null, to: f.value_per_brand_inr }, mature_brands: { from: o.mature_brands ?? null, to: f.mature_brands } };
    }),
  };
}

export function drivers(W, fromDate, toDate) {
  const a = snapshot(W, fromDate, { series: false }); const b = snapshot(W, toDate, { series: false });
  const keys = ['brands_worked', 'meetings_held', 'qualified', 'opportunities', 'signed', 'signed_cash_inr', 'received_inr', 'weighted_pipeline_inr', 'spend_inr'];
  const delta = (x, y) => Object.fromEntries(keys.map(k => [k, (y?.[k] || 0) - (x?.[k] || 0)]));
  const byCampaign = b.campaigns.map(c => ({ id: c.id, name: c.name, ...delta(a.campaigns.find(x => x.id === c.id), c) }))
    .sort((x, y) => Math.abs(y.signed_cash_inr) - Math.abs(x.signed_cash_inr) || Math.abs(y.brands_worked) - Math.abs(x.brands_worked));
  const lo = endOfDay(fromDate), hi = endOfDay(toDate);
  const stageMoves = W.tables.opp_history.filter(h => ts(h.effective_at) > lo && ts(h.effective_at) <= hi)
    .sort((x, y) => ts(x.effective_at) - ts(y.effective_at))
    .map(h => ({ date: istDate(h.effective_at), opportunity_id: h.opportunity_id, brand: h.brand_name || h.opportunity_id, stage: h.stage, value_inr: h.proposed_value_inr }));
  const received = W.tables.payments.filter(p => p.received_at && ts(p.received_at) > lo && ts(p.received_at) <= hi).map(p => ({ date: istDate(p.received_at), opportunity_id: p.opportunity_id, amount_inr: p.amount_inr, kind: p.kind }));
  return { from: fromDate, to: toDate, total: delta(a.totals, b.totals), by_campaign: byCampaign, stage_changes: stageMoves.slice(0, 60), stage_changes_count: stageMoves.length, payments_received: received,
    projection_change_inr: (b.projection.projected_collected_inr || 0) - (a.projection.projected_collected_inr || 0),
    projection_bridge: projectionBridge(a, b) };
}

// what-if: move budget between campaigns, using observed return when the sample is big enough
export function simulateReallocation(S, fromId, toId, amount) {
  // Marginal model, not average return: money buys extra brands at plan cost per brand; each extra brand is worth the
  // credibility-weighted blend of observed and plan value per brand, discounted because marginal brands are weaker.
  // The receiver is capped at its stretch headroom; the giver only loses brands it has not worked yet.
  const K = S.assumptions.credibility_k ?? 10, MARG = S.assumptions.marginal_brand_quality ?? 0.75;
  const A = S.campaigns.find(c => c.id === fromId), B = S.campaigns.find(c => c.id === toId);
  if (!A || !B) return { error: 'Unknown campaign id' };
  const unit = c => {
    const p = c.plan || {};
    if (!(c.budget_inr > 0) || !(p.base_brands > 0)) return { error: `${c.name} has no brand plan or budget (it is ${c.type === 'enabler' ? 'an enabler that changes deal terms, not a sourcing channel' : 'not costed per brand'}), so a budget move cannot be valued for it` };
    const cost = c.budget_inr / p.base_brands;
    const planV = (p.cash_conv || 0) * (p.deal_inr || 0);
    const n = c.brands_worked || 0;
    const obsV = n > 0 ? (c.signed_cash_inr + c.weighted_pipeline_inr) / n : null;
    const v = obsV === null ? planV : (n * obsV + K * planV) / (n + K);
    return { cost_per_brand_inr: Math.round(cost), value_per_brand_inr: Math.round(v), observed_value_per_brand_inr: obsV === null ? null : Math.round(obsV), plan_value_per_brand_inr: Math.round(planV), brands_worked: n,
      basis: `blend of observed (n=${n}) and plan value per brand, plan weighted as ${K} brands` };
  };
  const ua = unit(A), ub = unit(B);
  if (ua.error || ub.error) return { error: ua.error || ub.error };
  const unspentA = Math.max(0, (A.budget_inr || 0) - (A.spend_inr || 0));
  const moved = Math.min(amount, unspentA);
  const headroomB = Math.max(0, (B.plan.stretch_brands || B.plan.base_brands) - Math.max(B.plan.base_brands, B.brands_worked));
  const unworkedA = Math.max(0, A.plan.base_brands - A.brands_worked);
  const brandsB = Math.min(moved / ub.cost_per_brand_inr, headroomB);
  const brandsA = Math.min(moved / ua.cost_per_brand_inr, unworkedA);
  const gain = brandsB * ub.value_per_brand_inr * MARG, loss = brandsA * ua.value_per_brand_inr * MARG;
  const net = gain - loss;
  return {
    from: { id: A.id, name: A.name, ...ua, unspent_budget_inr: unspentA, unworked_planned_brands: unworkedA, brands_given_up: +brandsA.toFixed(1), signed_lost_inr: Math.round(loss), per_rupee: moved ? loss / moved : 0 },
    to: { id: B.id, name: B.name, ...ub, headroom_brands: headroomB, extra_brands: +brandsB.toFixed(1), signed_gained_inr: Math.round(gain), per_rupee: moved ? gain / moved : 0 },
    amount_inr: amount, amount_movable_inr: moved, marginal_brand_quality: MARG,
    expected_signed_change_inr: Math.round(net), expected_collected_change_inr: Math.round(net * S.assumptions.collection_rate),
    warnings: [moved < amount ? `Only ${inr(unspentA)} of ${A.name}'s budget is unspent, so only that much can move` : null,
      headroomB === 0 ? `${B.name} has no headroom: its plan already funds every reachable brand (${B.plan.stretch_brands || B.plan.base_brands}), so extra money buys nothing` : null,
      headroomB > 0 && moved / ub.cost_per_brand_inr > headroomB ? `${B.name} can only use about ${inr(headroomB * ub.cost_per_brand_inr)} before it runs out of brands` : null,
      B.brands_worked < S.assumptions.min_sample_projection ? `${B.name} has worked only ${B.brands_worked} brands, so its value per brand leans on the plan` : null,
      'Value per extra brand is signed + weighted pipeline, discounted to 75% for weaker marginal brands; brands added late may not sign before the deadline. Directional only.'].filter(Boolean) };
}

export function dataQuality(W, S) {
  const notes = [];
  for (const [t, n] of Object.entries(W.quality.duplicatesRemoved)) notes.push({ type: 'deduplicated', table: t, count: n, detail: `${n} identical import-retry row(s) removed` });
  for (const [t, ids] of Object.entries(W.quality.conflictingIds)) notes.push({ type: 'conflict', table: t, count: ids.length, detail: `Same ID with different values: ${ids.slice(0, 5).join(', ')} (first kept)` });
  if (!S.coverage.has_payments) notes.push({ type: 'gap', table: 'payments', detail: 'No invoice or bank receipt records. Cash collected cannot be measured; confirmed value is not cash received.' });
  if (!S.coverage.has_spend) notes.push({ type: 'gap', table: 'spend', detail: 'No spend or budget records. Cost per deal and return on spend cannot be calculated.' });
  const qual = W.tables.qualification;
  const unq = S.deals.filter(d => {
    const v = qual.filter(q => q.brand_id === d.brand_id && ts(q.effective_at) <= ts(d.created_at)).sort((a, b) => ts(a.effective_at) - ts(b.effective_at)).pop();
    return !v || v.qualification_status !== 'qualified';
  });
  if (unq.length) notes.push({ type: 'process', table: 'opportunities', count: unq.length, detail: `${unq.length} opportunities were opened before the brand was qualified` });
  const qualNoOpp = [...new Set(W.tables.qualification.map(q => q.brand_id))].filter(b => {
    const l = qual.filter(q => q.brand_id === b && ts(q.effective_at) <= endOfDay(S.as_of)).sort((x, y) => ts(x.effective_at) - ts(y.effective_at)).pop();
    return l && l.qualification_status === 'qualified' && !S.deals.some(d => d.brand_id === b);
  });
  if (qualNoOpp.length) notes.push({ type: 'opportunity', table: 'qualification', count: qualNoOpp.length, detail: `${qualNoOpp.length} qualified brands have no opportunity yet`, ids: qualNoOpp });
  const multi = {}; for (const i of W.tables.interactions) if (ts(i.occurred_at) <= endOfDay(S.as_of)) (multi[i.brand_id] ||= new Set()).add(i.sponsor_campaign_id);
  const overlap = Object.values(multi).filter(s => s.size > 1).length;
  if (overlap) notes.push({ type: 'attribution', table: 'interactions', count: overlap, detail: `${overlap} brands were touched by more than one campaign; campaign totals add up to more than the portfolio total` });
  const ex = Object.entries(S.coverage.excluded_after_cutoff).filter(([, n]) => n > 0);
  if (ex.length) notes.push({ type: 'cutoff', detail: `Rows after ${S.as_of} hidden from this view: ${ex.map(([t, n]) => `${t} ${n}`).join(', ')}` });
  return notes;
}
