// Tools the AI copilot can call. Every number the copilot reports comes from here,
// computed live from the current workspace data (seed + saved edits) by the same engine as the dashboard.
import { TABLES, STAGES, TASK_STATUS, RULE_METRICS } from '../public/lib/schema.js';
import { snapshot, bottlenecks, drivers, simulateReallocation, dataQuality, endOfDay, ts, istDate, addDays } from '../public/lib/metrics.js';
import { nextId } from '../public/lib/ops.js';

const S_ = (type, description, extra = {}) => ({ type, description, ...extra });
const asOfParam = S_('string', 'Optional snapshot date YYYY-MM-DD (end of that day, India time). Defaults to the dashboard date.');
const VIRTUAL = ['deals', 'campaign_kpis', 'rule_status'];

export const DECLARATIONS = [
  { name: 'get_overview', description: 'Headline status: targets vs actuals, funnel counts, signed cash, cash collected, open pipeline, projection, plan pace, budget, overdue tasks, data gaps. Call first for any general question.',
    parameters: { type: 'object', properties: { as_of: asOfParam } } },
  { name: 'get_campaigns', description: 'Per-campaign KPIs: brands worked, replies, meetings, rates, qualified, opportunities, signed deals and cash, pipeline, received cash, spend, budget, plan vs actual pace, cost per signed deal, and the current scale/change/stop decision.',
    parameters: { type: 'object', properties: { campaign_ids: S_('array', 'Optional campaign IDs, e.g. ["P03"]. Omit for all.', { items: { type: 'string' } }), as_of: asOfParam } } },
  { name: 'diagnose', description: 'Find bottlenecks: for each campaign, compares stage conversion, volume pace, deal velocity and advance collection against plan (or portfolio average) and names the weakest stage. Also returns portfolio stage-to-stage conversion.',
    parameters: { type: 'object', properties: { campaign_id: S_('string', 'Optional campaign ID'), as_of: asOfParam } } },
  { name: 'explain_change', description: 'What changed between two dates and what drove it: deltas by campaign (brands, meetings, signed cash, received cash, pipeline, spend), stage changes and payments in the window, and projection change.',
    parameters: { type: 'object', properties: { from_date: S_('string', 'Start date YYYY-MM-DD'), to_date: S_('string', 'End date YYYY-MM-DD') }, required: ['from_date', 'to_date'] } },
  { name: 'list_deals', description: 'List opportunities with current stage, value, owner, days idle, stalled flag, campaign, cash invoiced/received and weighted value.',
    parameters: { type: 'object', properties: {
      status: S_('string', 'Which deals', { enum: ['open', 'stalled', 'signed', 'lost', 'unpaid', 'all'] }), campaign_id: S_('string', 'Optional campaign ID'),
      owner: S_('string', 'Optional owner name'), min_value_inr: S_('number', 'Optional minimum value'),
      sort_by: S_('string', 'Sort field', { enum: ['value', 'idle_days', 'weighted', 'created_at'] }), limit: S_('integer', 'Max rows (default 15, max 60)'), as_of: asOfParam } } },
  { name: 'evaluate_rules', description: 'Scale / change / stop rules: each rule\'s metric value, sample size, thresholds, status and the action it triggers; plus the combined decision per campaign.',
    parameters: { type: 'object', properties: { campaign_id: S_('string', 'Optional campaign ID'), as_of: asOfParam } } },
  { name: 'query_table', description: 'Flexible query for questions the other tools do not cover. Filter, project, group and aggregate any table. Source tables: ' + Object.keys(TABLES).join(', ') + '. Computed tables: deals (current state per opportunity), campaign_kpis (one row per campaign), rule_status. Time-stamped rows after as_of are excluded.',
    parameters: { type: 'object', properties: {
      table: S_('string', 'Table name', { enum: [...Object.keys(TABLES), ...VIRTUAL] }),
      filters: S_('array', 'Filters, all must match', { items: { type: 'object', properties: { field: { type: 'string' }, op: { type: 'string', enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'in'] }, value: { type: 'string', description: 'Value; for "in" use a comma-separated list' } }, required: ['field', 'op', 'value'] } }),
      fields: S_('array', 'Columns to return', { items: { type: 'string' } }),
      group_by: S_('string', 'Optional column to group by'),
      aggregate: S_('object', 'Optional aggregate per group (or overall)', { properties: { fn: { type: 'string', enum: ['count', 'count_distinct', 'sum', 'avg', 'min', 'max'] }, field: { type: 'string' } }, required: ['fn'] }),
      sort_field: S_('string', 'Optional sort column'), sort_desc: S_('boolean', 'Sort descending'),
      latest_version_only: S_('boolean', 'For history tables (qualification, opp_history): keep only the latest version per entity'),
      limit: S_('integer', 'Max rows (default 25, max 100)'), as_of: asOfParam }, required: ['table'] } },
  { name: 'calculate', description: 'Evaluate an arithmetic expression exactly (+ - * / ^ parentheses, decimals). Use for any maths not already in tool results, e.g. "(2720000-1650000)/6".',
    parameters: { type: 'object', properties: { expression: S_('string', 'Expression') }, required: ['expression'] } },
  { name: 'list_tasks', description: 'Tasks with owner, due date, status, priority, linked campaign/deal and overdue flag.',
    parameters: { type: 'object', properties: { status: S_('string', 'Optional status', { enum: [...TASK_STATUS, 'open'] }), owner: S_('string', 'Optional owner'), campaign_id: S_('string', 'Optional campaign'), overdue_only: S_('boolean', 'Only overdue') } } },
  { name: 'simulate_budget_shift', description: 'What-if: expected change in signed and collected cash from moving budget between two campaigns, using observed return per rupee when the sample is large enough, else plan return.',
    parameters: { type: 'object', properties: { from_campaign: S_('string', 'Campaign ID giving budget'), to_campaign: S_('string', 'Campaign ID receiving budget'), amount_inr: S_('number', 'Amount in INR') }, required: ['from_campaign', 'to_campaign', 'amount_inr'] } },
  { name: 'get_data_catalog', description: 'What data exists: tables, row counts, date ranges, fields, which parts are source data vs simulated vs app-added, data-quality notes and KNOWN GAPS. Call this before saying the data cannot answer something.',
    parameters: { type: 'object', properties: {} } },
  { name: 'propose_action', description: 'Draft a change for the user to confirm (nothing is saved until they click Confirm). Types: create_task, update_task (status/owner/due/priority), update_campaign (budget/status/owner), record_deal_stage (new stage and/or value for an opportunity), record_payment (mark an invoice received), update_rule (thresholds).',
    parameters: { type: 'object', properties: {
      action_type: S_('string', 'Type', { enum: ['create_task', 'update_task', 'update_campaign', 'record_deal_stage', 'record_payment', 'update_rule'] }),
      reason: S_('string', 'One sentence: the evidence behind this action'),
      target_id: S_('string', 'ID to change: task_id, campaign ID, opportunity_id, payment_id or rule_id (not needed for create_task)'),
      title: S_('string', 'Task title'), owner_name: S_('string', 'Owner'), due_date: S_('string', 'Due date YYYY-MM-DD'),
      campaign_id: S_('string', 'Campaign ID to link'), opportunity_id: S_('string', 'Opportunity to link'), priority: S_('string', 'Priority', { enum: ['P0', 'P1', 'P2'] }),
      notes: S_('string', 'Task notes'), status: S_('string', 'Task status', { enum: TASK_STATUS }),
      budget_inr: S_('number', 'New campaign budget'), campaign_status: S_('string', 'Campaign status', { enum: ['active', 'paused', 'stopped'] }),
      stage: S_('string', 'New deal stage', { enum: STAGES }), value_inr: S_('number', 'Deal value'), received_date: S_('string', 'Payment received date YYYY-MM-DD'),
      scale_at: S_('number', 'Rule scale threshold'), stop_at: S_('number', 'Rule stop threshold') }, required: ['action_type', 'reason'] } },
];

// ---------- safe arithmetic ----------
export function calc(expr) {
  const src = String(expr).replace(/,/g, '').replace(/₹/g, '').replace(/(\d+(?:\.\d+)?)\s*%/g, '($1/100)');
  let i = 0;
  const peek = () => src[i], ws = () => { while (src[i] === ' ') i++; };
  function num() { ws(); const m = src.slice(i).match(/^\d+(?:\.\d+)?(?:e[+-]?\d+)?/i); if (!m) throw new Error(`Unexpected "${src.slice(i, i + 8) || 'end'}"`); i += m[0].length; return Number(m[0]); }
  function factor() { ws(); if (peek() === '(') { i++; const v = expr_(); ws(); if (peek() !== ')') throw new Error('Missing )'); i++; return v; } if (peek() === '-') { i++; return -factor(); } if (peek() === '+') { i++; return factor(); } return num(); }
  function power() { let b = factor(); ws(); if (peek() === '^') { i++; return b ** power(); } return b; }
  function term() { let v = power(); for (;;) { ws(); if (peek() === '*') { i++; v *= power(); } else if (peek() === '/') { i++; const d = power(); if (d === 0) throw new Error('Division by zero'); v /= d; } else return v; } }
  function expr_() { let v = term(); for (;;) { ws(); if (peek() === '+') { i++; v += term(); } else if (peek() === '-') { i++; v -= term(); } else return v; } }
  const v = expr_(); ws(); if (i < src.length) throw new Error(`Unexpected "${src.slice(i, i + 8)}"`);
  return v;
}

const compactCampaign = (c, S) => ({
  id: c.id, name: c.name, type: c.type, owner: c.owner, status: c.status, plan_rank: c.rank, plan_decision: c.decision_plan,
  scope_note: c.type === 'enabler' ? 'Enabler: funnel numbers are portfolio-wide; spend is its own' : undefined,
  brands_worked: c.brands_worked, planned_brands_to_date: c.planned_brands_to_date, pace_brands_pct: c.pace_brands_pct, recent_brands_14d: c.recent_brands_14d,
  replied: c.replied, reply_rate: c.reply_rate, meetings_held: c.meetings_held, meeting_rate: c.meeting_rate, plan_meeting_rate: c.plan.meeting_rate,
  opt_outs: c.opt_outs, opt_out_rate: c.opt_out_rate, qualified: c.qualified, opportunities: c.opportunities, proposals: c.proposals,
  signed_deals: c.signed, signed_cash_deals: c.signed_cash_deals, signed_cash_inr: c.signed_cash_inr, signed_in_kind_inr: c.signed_in_kind_inr,
  lost_or_withdrawn: c.lost, open_deals: c.open, stalled_deals: c.stalled, open_cash_inr: c.open_cash_inr, weighted_pipeline_inr: c.weighted_pipeline_inr,
  mature_meetings: c.mature_meetings, mature_meeting_to_signed: c.mature_conv, plan_meeting_to_signed: c.plan.cash_conv && c.plan.meeting_rate ? +(c.plan.cash_conv / c.plan.meeting_rate).toFixed(3) : null,
  invoiced_inr: c.invoiced_inr, received_inr: c.received_inr, advances_due: c.advances_due, advances_on_time: c.advances_on_time,
  budget_inr: c.budget_inr, spend_inr: c.spend_inr, budget_used: c.budget_used, cost_per_signed_inr: c.cost_per_signed_inr,
  plan_base_signed_inr: c.plan.base_signed_inr, plan_stretch_signed_inr: c.plan.stretch_signed_inr,
  decision: S.decisions[c.id]?.decision, decision_reason: S.decisions[c.id]?.why, decision_action: S.decisions[c.id]?.action,
});
const compactDeal = d => ({ opportunity_id: d.opportunity_id, brand: d.brand_name, campaign_id: d.campaign_id, support_type: d.support_type, stage: d.stage,
  value_inr: d.value, confirmed_inr: d.confirmed, owner: d.owner, last_change: istDate(d.last_change), idle_days: d.idle_days, stalled: d.stalled,
  win_probability: d.prob, weighted_inr: d.weighted, invoiced_inr: d.invoiced, received_inr: d.received, brand_qualification: d.brand_qualification });

function matches(row, f) {
  const v = row[f.field]; const t = String(f.value ?? '');
  const n = Number(v), m = Number(t); const numeric = v !== null && v !== undefined && v !== '' && !Number.isNaN(n) && t !== '' && !Number.isNaN(m);
  const a = numeric ? n : String(v ?? '').toLowerCase(), b = numeric ? m : t.toLowerCase();
  switch (f.op) {
    case 'eq': return a === b; case 'neq': return a !== b; case 'gt': return a > b; case 'gte': return a >= b; case 'lt': return a < b; case 'lte': return a <= b;
    case 'contains': return String(v ?? '').toLowerCase().includes(t.toLowerCase());
    case 'in': return t.split(',').map(x => x.trim().toLowerCase()).includes(String(v ?? '').toLowerCase());
    default: return false;
  }
}

export function makeToolRunner(W, defaultAsOf, ctx = {}) {
  const cache = new Map();
  const snap = d => { const k = d || defaultAsOf; if (!cache.has(k)) cache.set(k, snapshot(W, k, { series: false })); return cache.get(k); };
  const validDate = d => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(endOfDay(d)) ? d : null);
  const campaignIds = new Set(W.tables.campaigns.map(c => c.sponsor_campaign_id));
  const pending = [];

  const tools = {
    get_overview({ as_of }) {
      const S = snap(validDate(as_of)); const t = S.totals;
      return {
        workspace: S.workspace_name, simulated: S.simulated, as_of: S.as_of, campaign_week: S.week, event_starts_at: S.calendar.event_starts_at, sourcing_window_ends: S.calendar.sourcing_ends,
        targets: S.target, funnel: { research_brands: t.research_brands, brands_worked: t.brands_worked, replied: t.replied, positive_replies: t.positive_replies, meetings_held: t.meetings_held,
          qualified_now: t.qualified, qualification_counts: t.qualification_counts, opportunities: t.opportunities, reached_proposal: t.proposals, signed_partnerships: t.signed,
          signed_cash_deals: t.signed_cash_deals, signed_in_kind_deals: t.signed_in_kind_deals, lost_or_withdrawn: t.lost },
        money: { signed_cash_inr: t.signed_cash_inr, signed_in_kind_inr: t.signed_in_kind_inr, invoiced_inr: t.invoiced_inr,
          cash_collected_inr: S.coverage.has_payments ? t.received_inr : 'NOT AVAILABLE: no payment records in this workspace', open_cash_pipeline_inr: t.open_cash_inr, weighted_pipeline_inr: t.weighted_pipeline_inr,
          open_deals: t.open, stalled_deals: t.stalled },
        projection: { ...S.projection, future_by_campaign: undefined, note: 'collected + collection_rate × (unpaid signed + weighted pipeline + expected new deals). Assumption-driven.' },
        plan_pace: S.pace, budget: S.budget,
        decisions: Object.fromEntries(Object.entries(S.decisions).map(([k, v]) => [k, v.decision])),
        tasks: { open: S.tasks.filter(x => x.status !== 'done').length, overdue: S.tasks.filter(x => x.overdue).length },
        coverage: S.coverage,
      };
    },
    get_campaigns({ campaign_ids, as_of }) {
      const S = snap(validDate(as_of));
      const ids = Array.isArray(campaign_ids) && campaign_ids.length ? campaign_ids : null;
      const bad = ids ? ids.filter(i => !campaignIds.has(i)) : [];
      return { as_of: S.as_of, unknown_ids: bad.length ? bad : undefined, valid_ids: bad.length ? [...campaignIds] : undefined,
        campaigns: S.campaigns.filter(c => !ids || ids.includes(c.id)).map(c => compactCampaign(c, S)),
        portfolio_note: 'A brand touched by several campaigns counts once in the portfolio but once per campaign here.' };
    },
    diagnose({ campaign_id, as_of }) {
      const S = snap(validDate(as_of));
      if (campaign_id && !campaignIds.has(campaign_id)) return { error: `Unknown campaign ${campaign_id}`, valid_ids: [...campaignIds] };
      return { as_of: S.as_of, ...bottlenecks(S, campaign_id), stalled_deals: S.deals.filter(d => d.stalled && (!campaign_id || d.campaign_id === campaign_id)).length };
    },
    explain_change({ from_date, to_date }) {
      const a = validDate(from_date), b = validDate(to_date);
      if (!a || !b) return { error: 'Dates must be YYYY-MM-DD' };
      if (a >= b) return { error: 'from_date must be before to_date' };
      return drivers(W, a, b);
    },
    list_deals({ status = 'open', campaign_id, owner, min_value_inr, sort_by = 'value', limit = 15, as_of }) {
      const S = snap(validDate(as_of));
      let d = S.deals;
      if (status === 'open') d = d.filter(x => x.is_open); else if (status === 'stalled') d = d.filter(x => x.stalled);
      else if (status === 'signed') d = d.filter(x => x.stage === 'partner_confirmed'); else if (status === 'lost') d = d.filter(x => ['lost', 'withdrawn'].includes(x.stage));
      else if (status === 'unpaid') d = d.filter(x => x.stage === 'partner_confirmed' && x.support_type === 'cash' && x.received < x.confirmed);
      if (campaign_id) d = d.filter(x => x.campaign_id === campaign_id);
      if (owner) d = d.filter(x => x.owner.toLowerCase().includes(String(owner).toLowerCase()));
      if (min_value_inr) d = d.filter(x => x.value >= min_value_inr);
      const key = { value: 'value', idle_days: 'idle_days', weighted: 'weighted', created_at: 'created_at' }[sort_by] || 'value';
      d = [...d].sort((x, y) => (key === 'created_at' ? ts(y.created_at) - ts(x.created_at) : (y[key] || 0) - (x[key] || 0)));
      const lim = Math.min(Math.max(1, Number(limit) || 15), 60);
      return { as_of: S.as_of, filter: status, total_matching: d.length, total_value_inr: d.reduce((a, x) => a + x.value, 0), total_weighted_inr: d.reduce((a, x) => a + x.weighted, 0),
        unpaid_note: status === 'unpaid' && !S.coverage.has_payments ? 'No payment records exist, so every signed cash deal shows as unpaid; collection status is unknown.' : undefined,
        deals: d.slice(0, lim).map(compactDeal), truncated: d.length > lim };
    },
    evaluate_rules({ campaign_id, as_of }) {
      const S = snap(validDate(as_of));
      return { as_of: S.as_of, week: S.week, rules: S.rules.filter(r => !campaign_id || r.campaign_id === campaign_id),
        decisions: Object.fromEntries(Object.entries(S.decisions).filter(([k]) => !campaign_id || k === campaign_id)),
        how_decided: 'Primary rule sets the decision; a breached guardrail turns Scale into Change, and Change into Stop. Below min sample = too early.' };
    },
    query_table({ table, filters = [], fields, group_by, aggregate, sort_field, sort_desc, latest_version_only, limit = 25, as_of }) {
      const d = validDate(as_of) || defaultAsOf; const S = snap(d); const cut = endOfDay(d);
      let rows;
      if (table === 'deals') rows = S.deals.map(compactDeal);
      else if (table === 'campaign_kpis') rows = S.campaigns.map(c => compactCampaign(c, S));
      else if (table === 'rule_status') rows = S.rules;
      else if (table === 'tasks') rows = S.tasks;
      else if (TABLES[table]) {
        const spec = TABLES[table]; rows = W.tables[table];
        if (spec.time) rows = rows.filter(r => !r[spec.time] || ts(r[spec.time]) <= cut);
        if (latest_version_only && spec.history) { const m = new Map(); for (const r of [...rows].sort((a, b) => ts(a.effective_at) - ts(b.effective_at) || String(a.history_id).localeCompare(String(b.history_id)))) m.set(r[spec.history], r); rows = [...m.values()]; }
      } else return { error: `Unknown table ${table}`, tables: [...Object.keys(TABLES), ...VIRTUAL] };
      const known = new Set(rows.flatMap(r => Object.keys(r)));
      const badFields = [...(filters || []).map(f => f.field), ...(fields || []), group_by, aggregate?.field, sort_field].filter(f => f && !known.has(f));
      if (badFields.length && rows.length) return { error: `Unknown field(s): ${[...new Set(badFields)].join(', ')}`, available_fields: [...known] };
      rows = rows.filter(r => (filters || []).every(f => matches(r, f)));
      const total = rows.length;
      if (aggregate || group_by) {
        const groups = new Map();
        for (const r of rows) { const k = group_by ? String(r[group_by] ?? '(blank)') : 'all'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
        const fn = aggregate?.fn || 'count'; const fld = aggregate?.field;
        const agg = rs => {
          const vals = rs.map(r => Number(r[fld])).filter(Number.isFinite);
          if (fn === 'count') return rs.length; if (fn === 'count_distinct') return new Set(rs.map(r => r[fld])).size;
          if (!vals.length) return null;
          if (fn === 'sum') return vals.reduce((a, b) => a + b, 0); if (fn === 'avg') return +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(4);
          if (fn === 'min') return Math.min(...vals); if (fn === 'max') return Math.max(...vals); return null;
        };
        const out = [...groups].map(([k, rs]) => ({ [group_by || 'group']: k, [`${fn}${fld ? '_' + fld : ''}`]: agg(rs), rows: rs.length }));
        return { table, as_of: d, total_matching: total, groups: out.slice(0, 100) };
      }
      if (sort_field) rows = [...rows].sort((a, b) => { const x = a[sort_field], y = b[sort_field]; const c = (Number.isFinite(+x) && Number.isFinite(+y)) ? +x - +y : String(x ?? '').localeCompare(String(y ?? '')); return sort_desc ? -c : c; });
      const lim = Math.min(Math.max(1, Number(limit) || 25), 100);
      const proj = r => (fields?.length ? Object.fromEntries(fields.map(f => [f, r[f]])) : r);
      return { table, as_of: d, total_matching: total, rows: rows.slice(0, lim).map(proj), truncated: total > lim,
        note: TABLES[table]?.history && !latest_version_only ? 'History table: rows are versions, not entities. Use latest_version_only for current state.' : undefined };
    },
    calculate({ expression }) {
      try { const v = calc(expression); return { expression, result: Number.isInteger(v) ? v : +v.toFixed(6) }; }
      catch (e) { return { expression, error: e.message }; }
    },
    list_tasks({ status, owner, campaign_id, overdue_only }) {
      const S = snap(null);
      let t = S.tasks;
      if (status === 'open') t = t.filter(x => x.status !== 'done'); else if (status) t = t.filter(x => x.status === status);
      if (owner) t = t.filter(x => String(x.owner_name).toLowerCase().includes(String(owner).toLowerCase()));
      if (campaign_id) t = t.filter(x => x.sponsor_campaign_id === campaign_id);
      if (overdue_only) t = t.filter(x => x.overdue);
      return { as_of: S.as_of, total: t.length, tasks: t.slice(0, 60).map(x => ({ task_id: x.task_id, title: x.title, owner: x.owner_name, due_date: x.due_date, status: x.status, priority: x.priority, campaign_id: x.sponsor_campaign_id, opportunity_id: x.opportunity_id, overdue: x.overdue, source: x.source })) };
    },
    simulate_budget_shift({ from_campaign, to_campaign, amount_inr }) {
      if (!(amount_inr > 0)) return { error: 'amount_inr must be positive' };
      return simulateReallocation(snap(null), from_campaign, to_campaign, Number(amount_inr));
    },
    get_data_catalog() {
      const S = snap(null);
      const tables = Object.entries(TABLES).map(([t, spec]) => {
        const rows = W.tables[t]; const times = spec.time ? rows.map(r => r[spec.time]).filter(Boolean).sort() : [];
        const origin = W.simulated ? 'simulated' : (W.appAdded || []).includes(t) ? 'app-added (not in source)' : ['payments', 'spend', 'tasks', 'pace'].includes(t) ? 'app table (empty unless the team adds rows)' : 'provided source dataset';
        return { table: t, rows: rows.length, origin, date_range: times.length ? [times[0].slice(0, 10), times[times.length - 1].slice(0, 10)] : undefined, fields: Object.keys(spec.fields) };
      }).filter(x => x.rows > 0 || ['payments', 'spend', 'tasks'].includes(x.table));
      const gaps = W.simulated
        ? ['All records are simulated for demonstration; no real sponsor results.', 'No attendee or footfall data.', 'No reasons recorded for lost deals.', 'No sponsor satisfaction or renewal data.', 'Deal values are face values before tax.']
        : ['No cash receipts, invoices or bank data: "cash collected" cannot be measured. confirmed_value_inr is reported partnership value, not money received.',
          'No marketing spend or budget: cost per deal and ROI cannot be calculated.', 'No reasons recorded for lost or withdrawn deals beyond stage changes.',
          'No attendee numbers: sponsor activations only link to attendee campaign IDs from a separate dataset that is not loaded; no causal uplift.',
          'Campaign attribution is observational (source recorded at creation), not causal.', 'No contract terms, payment schedules or sponsor deliverables.', 'All records are synthetic per the brief.'];
      return { workspace: W.name, simulated: !!W.simulated, as_of_default: defaultAsOf, tables, data_quality: dataQuality(W, S).map(n => ({ ...n, ids: n.ids ? n.ids.slice(0, 20) : undefined })), known_gaps: gaps,
        edits_on_top_of_seed: W.editCount + W.deleteCount, definitions: {
          brands_worked: 'distinct brands with an outreach_sent, introduction_received or web_inbound event', meeting_rate: 'brands with meeting_held / brands worked',
          signed: 'opportunities whose latest stage is partner_confirmed', stalled: `open deal with no stage change for more than ${S.assumptions.stall_days} days`,
          weighted_pipeline: 'open cash deal value × stage win probability (× stall factor)', mature_meeting_to_signed: `of meetings held at least ${S.assumptions.days_to_sign} days ago, share whose brand has a signed cash deal` },
        assumptions: W.tables.assumptions.map(a => ({ key: a.key, value: a.value, label: a.label, basis: a.basis })) };
    },
    propose_action(a) {
      const errs = []; let ops = []; let summary = '';
      const S = snap(null);
      const find = (t, id) => W.tables[t].find(r => String(r[TABLES[t].pk]) === String(id));
      const dateOk = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
      switch (a.action_type) {
        case 'create_task': {
          if (!a.title) errs.push('title is required');
          const owner = a.owner_name || (a.campaign_id && find('campaigns', a.campaign_id)?.owner_name);
          if (!owner) errs.push('owner_name is required (or link a campaign so its owner is used)');
          const due = a.due_date || addDays(S.as_of, 3);
          if (!dateOk(due)) errs.push('due_date must be YYYY-MM-DD');
          if (a.campaign_id && !find('campaigns', a.campaign_id)) errs.push(`campaign ${a.campaign_id} does not exist`);
          if (a.opportunity_id && !find('opportunities', a.opportunity_id)) errs.push(`opportunity ${a.opportunity_id} does not exist`);
          const id = nextId([...W.tables.tasks, ...pending.flatMap(p => p.ops.filter(o => o.tbl === 'tasks').map(o => o.data))], 'task_id', 'TSK');
          ops = [{ tbl: 'tasks', id, data: { task_id: id, title: a.title, owner_name: owner, due_date: due, status: 'todo', priority: a.priority || 'P1',
            ...(a.campaign_id ? { sponsor_campaign_id: a.campaign_id } : {}), ...(a.opportunity_id ? { opportunity_id: a.opportunity_id } : {}),
            notes: [a.notes, a.reason ? `Why: ${a.reason}` : ''].filter(Boolean).join('\n'), source: 'copilot', created_at: new Date().toISOString() } }];
          summary = `Create task ${id}: "${a.title}" for ${owner}, due ${due}${a.campaign_id ? `, campaign ${a.campaign_id}` : ''}`;
          break;
        }
        case 'update_task': {
          const t = find('tasks', a.target_id); if (!t) { errs.push(`task ${a.target_id} not found`); break; }
          const ch = {}; if (a.status) ch.status = a.status; if (a.owner_name) ch.owner_name = a.owner_name; if (a.due_date) { if (!dateOk(a.due_date)) errs.push('bad due_date'); ch.due_date = a.due_date; }
          if (a.priority) ch.priority = a.priority; if (a.notes) ch.notes = `${t.notes ? t.notes + '\n' : ''}${a.notes}`;
          if (!Object.keys(ch).length) errs.push('nothing to change');
          if (ch.status === 'done') ch.completed_at = new Date().toISOString();
          ops = [{ tbl: 'tasks', id: t.task_id, data: { ...t, ...ch } }];
          summary = `Update task ${t.task_id}: ${Object.entries(ch).filter(([k]) => k !== 'completed_at').map(([k, v]) => `${k} → ${v}`).join(', ')}`;
          break;
        }
        case 'update_campaign': {
          const c = find('campaigns', a.target_id || a.campaign_id); if (!c) { errs.push(`campaign ${a.target_id || a.campaign_id} not found`); break; }
          const ch = {}; if (a.budget_inr !== undefined) ch.budget_inr = a.budget_inr; if (a.campaign_status) ch.status = a.campaign_status; if (a.owner_name) ch.owner_name = a.owner_name;
          if (!Object.keys(ch).length) errs.push('nothing to change');
          ops = [{ tbl: 'campaigns', id: c.sponsor_campaign_id, data: { ...c, ...ch } }];
          summary = `Update campaign ${c.sponsor_campaign_id} (${c.campaign_name}): ${Object.entries(ch).map(([k, v]) => `${k} ${c[k] ?? '—'} → ${v}`).join(', ')}`;
          break;
        }
        case 'record_deal_stage': {
          const o = find('opportunities', a.target_id || a.opportunity_id); if (!o) { errs.push(`opportunity ${a.target_id || a.opportunity_id} not found`); break; }
          const d = S.deals.find(x => x.opportunity_id === o.opportunity_id);
          const stage = a.stage || d?.stage || 'prospecting'; const value = a.value_inr ?? d?.value ?? 0;
          const last = W.tables.opp_history.filter(h => h.opportunity_id === o.opportunity_id).map(h => ts(h.effective_at)).sort((x, y) => y - x)[0] || 0;
          const when = Math.max(last + 60000, Date.parse(`${S.as_of}T18:00:00+05:30`));
          const hid = `UH${Date.now().toString(36).toUpperCase()}`;
          ops = [{ tbl: 'opp_history', id: hid, data: { history_id: hid, opportunity_id: o.opportunity_id, brand_id: o.brand_id, brand_name: d?.brand_name, stage, proposed_value_inr: value,
            confirmed_value_inr: stage === 'partner_confirmed' ? value : 0, owner_name: d?.owner || '', effective_at: new Date(when + 19800000).toISOString().slice(0, 19) + '+05:30' } }];
          summary = `Record ${d?.brand_name || o.opportunity_id}: ${d?.stage || '—'} → ${stage}${a.value_inr !== undefined ? `, value ₹${value}` : ''}`;
          break;
        }
        case 'record_payment': {
          const p = find('payments', a.target_id); if (!p) { errs.push(`payment ${a.target_id} not found${W.tables.payments.length ? '' : ' (this workspace has no payment records)'}`); break; }
          const rd = a.received_date || S.as_of; if (!dateOk(rd)) errs.push('received_date must be YYYY-MM-DD');
          ops = [{ tbl: 'payments', id: p.payment_id, data: { ...p, received_at: `${rd}T12:00:00+05:30` } }];
          summary = `Mark ${p.payment_id} (${p.kind}, ₹${p.amount_inr}) received on ${rd}`;
          break;
        }
        case 'update_rule': {
          const r = find('rules', a.target_id); if (!r) { errs.push(`rule ${a.target_id} not found`); break; }
          const ch = {}; if (a.scale_at !== undefined) ch.scale_at = a.scale_at; if (a.stop_at !== undefined) ch.stop_at = a.stop_at;
          if (!Object.keys(ch).length) errs.push('nothing to change');
          ops = [{ tbl: 'rules', id: r.rule_id, data: { ...r, ...ch } }];
          summary = `Update rule ${r.rule_id} (${r.metric}): ${Object.entries(ch).map(([k, v]) => `${k} ${r[k]} → ${v}`).join(', ')}`;
          break;
        }
        default: errs.push(`Unknown action_type ${a.action_type}`);
      }
      if (errs.length) return { status: 'invalid', errors: errs, hint: 'Fix the arguments and call propose_action again, or ask the user for the missing detail.' };
      const id = `ACT${pending.length + 1}`;
      pending.push({ id, type: a.action_type, summary, reason: a.reason || '', ops });
      return { status: 'awaiting_user_confirmation', action_id: id, summary, note: 'Shown to the user with Confirm / Cancel buttons. Not saved yet. Tell the user to confirm.' };
    },
  };
  return {
    run(name, args) {
      const fn = tools[name];
      if (!fn) return { error: `Unknown tool ${name}` };
      try { return fn(args || {}); } catch (e) { return { error: e.message || String(e) }; }
    },
    pending,
  };
}
