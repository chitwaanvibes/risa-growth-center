// Single source of truth for tables, keys and validation.
// Used by the browser, the API and the AI copilot so all three agree on the data.
const f = (type, req = false, extra = {}) => ({ type, req, ...extra });

export const STAGES = ['prospecting', 'contacted', 'proposal_sent', 'negotiating', 'partner_confirmed', 'lost', 'withdrawn'];
export const OPEN_STAGES = ['prospecting', 'contacted', 'proposal_sent', 'negotiating'];
export const QUAL = ['unreviewed', 'engaged', 'qualified', 'unqualified', 'dormant'];
export const EVENTS = ['outreach_sent', 'delivered', 'replied', 'meeting_booked', 'meeting_held', 'opt_out', 'introduction_received', 'web_inbound'];
export const ROOT_EVENTS = ['outreach_sent', 'introduction_received', 'web_inbound'];
export const TASK_STATUS = ['todo', 'in_progress', 'blocked', 'done'];
export const RULE_METRICS = ['brands_worked', 'reply_rate', 'meeting_rate', 'win_rate', 'opt_out_rate', 'stalled_share',
  'pace_brands_pct', 'advance_rate_7d', 'collection_rate', 'signed_cash_inr', 'collected_inr', 'cost_per_signed_inr', 'mature_conv'];

export const TABLES = {
  event: { pk: 'event_id', label: 'Event', fields: {
    event_id: f('id', true), event_name: f('text', true), event_starts_at: f('dt', true),
    campaign_start: f('date'), sim_today: f('date'), history_start: f('date'), history_end: f('date') } },
  targets: { pk: 'target_id', label: 'Targets', time: 'effective_at', fields: {
    target_id: f('id', true), effective_at: f('dt', true), qualified_brands_goal: f('num', true),
    confirmed_partnerships_goal: f('num', true), cash_goal_inr: f('num'), stretch_cash_goal_inr: f('num'),
    signed_cash_goal_inr: f('num'), target_version: f('text') } },
  brands: { pk: 'brand_id', label: 'Brands', time: 'created_at', fields: {
    brand_id: f('id', true), brand_name: f('text', true), industry: f('text'), owner_name: f('text'), created_at: f('dt', true) } },
  contacts: { pk: 'contact_id', label: 'Sponsor contacts', time: 'created_at', fields: {
    contact_id: f('id', true), brand_id: f('id', true, { ref: 'brands' }), contact_name: f('text', true), job_title: f('text'), created_at: f('dt', true) } },
  campaigns: { pk: 'sponsor_campaign_id', label: 'Sponsor campaigns', fields: {
    sponsor_campaign_id: f('id', true), campaign_name: f('text', true), channel: f('text'), owner_name: f('text'),
    campaign_type: f('enum', false, { enum: ['channel', 'enabler'] }), budget_inr: f('num'),
    base_brands: f('num'), stretch_brands: f('num'), plan_meeting_rate: f('num'), plan_cash_conv: f('num'), plan_deal_inr: f('num'),
    base_signed_inr: f('num'), stretch_signed_inr: f('num'), base_incremental_inr: f('num'), stretch_incremental_inr: f('num'),
    rank: f('num'), decision: f('text'), status: f('enum', false, { enum: ['active', 'paused', 'stopped'] }) } },
  interactions: { pk: 'interaction_id', label: 'Sponsor interactions', time: 'occurred_at', fields: {
    interaction_id: f('id', true), brand_id: f('id', true, { ref: 'brands' }), sponsor_campaign_id: f('id', true, { ref: 'campaigns' }),
    event_type: f('enum', true, { enum: EVENTS }), outcome: f('text'), occurred_at: f('dt', true), attempt_id: f('text'), contact_id: f('text') } },
  qualification: { pk: 'history_id', label: 'Brand qualification', time: 'effective_at', history: 'brand_id', fields: {
    history_id: f('id', true), brand_id: f('id', true, { ref: 'brands' }), sponsor_campaign_id: f('id', false, { ref: 'campaigns' }),
    qualification_status: f('enum', true, { enum: QUAL }), effective_at: f('dt', true), reason: f('text') } },
  opportunities: { pk: 'opportunity_id', label: 'Partner opportunities', time: 'created_at', fields: {
    opportunity_id: f('id', true), opportunity_name: f('text', true), brand_id: f('id', true, { ref: 'brands' }),
    sponsor_campaign_id: f('id', true, { ref: 'campaigns' }), support_type: f('enum', true, { enum: ['cash', 'in_kind'] }), created_at: f('dt', true) } },
  opp_history: { pk: 'history_id', label: 'Opportunity history', time: 'effective_at', history: 'opportunity_id', fields: {
    history_id: f('id', true), opportunity_id: f('id', true, { ref: 'opportunities' }), stage: f('enum', true, { enum: STAGES }),
    proposed_value_inr: f('num'), confirmed_value_inr: f('num'), owner_name: f('text'), effective_at: f('dt', true) } },
  activations: { pk: 'activation_id', label: 'Sponsor activations', time: 'linked_at', fields: {
    activation_id: f('id', true), opportunity_id: f('id', true, { ref: 'opportunities' }), linked_at: f('dt', true) } },
  payments: { pk: 'payment_id', label: 'Invoices & payments', time: 'invoiced_at', fields: {
    payment_id: f('id', true), opportunity_id: f('id', true, { ref: 'opportunities' }), kind: f('enum', true, { enum: ['advance', 'balance', 'full'] }),
    amount_inr: f('num', true), invoiced_at: f('dt', true), due_at: f('dt', true), received_at: f('dt'), note: f('text') } },
  spend: { pk: 'spend_id', label: 'Spend ledger', time: 'posted_at', fields: {
    spend_id: f('id', true), sponsor_campaign_id: f('id', true, { ref: 'campaigns' }), amount_inr: f('num', true, { neg: true }),
    posted_at: f('dt', true), note: f('text') } },
  tasks: { pk: 'task_id', label: 'Tasks', fields: {
    task_id: f('id', true), title: f('text', true), sponsor_campaign_id: f('id', false, { ref: 'campaigns' }),
    opportunity_id: f('id', false, { ref: 'opportunities' }), owner_name: f('text', true), due_date: f('date', true),
    status: f('enum', true, { enum: TASK_STATUS }), priority: f('enum', false, { enum: ['P0', 'P1', 'P2'] }),
    notes: f('text'), source: f('text'), created_at: f('dt'), completed_at: f('dt') } },
  rules: { pk: 'rule_id', label: 'Scale / change / stop rules', fields: {
    rule_id: f('id', true), sponsor_campaign_id: f('id', true, { ref: 'campaigns' }), metric: f('enum', true, { enum: RULE_METRICS }),
    direction: f('enum', true, { enum: ['higher', 'lower'] }), scale_at: f('num', true), stop_at: f('num', true),
    min_sample: f('num', true), from_week: f('num'), role: f('enum', true, { enum: ['primary', 'guardrail'] }),
    scale_action: f('text'), change_action: f('text'), stop_action: f('text') } },
  assumptions: { pk: 'key', label: 'Assumptions', fields: {
    key: f('id', true), value: f('num', true), label: f('text'), basis: f('text') } },
  pace: { pk: 'week', label: 'Weekly plan', fields: {
    week: f('id', true), base_brands: f('num'), base_signed_inr: f('num'), base_collected_inr: f('num'),
    stretch_signed_inr: f('num'), stretch_collected_inr: f('num') } },
};

export function normDate(v, type) {
  if (v === null || v === undefined || v === '') return undefined;
  if (typeof v === 'number') { // Excel serial date, naive India time
    const s = new Date(Math.round((v - 25569) * 86400) * 1000).toISOString().slice(0, 19);
    return type === 'date' ? s.slice(0, 10) : s + '+05:30';
  }
  const s = String(v).trim().replace(' ', 'T');
  const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2})(:\d{2})?(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/);
  if (!m) return null;
  if (type === 'date') return m[1];
  const local = `${m[1]}T${m[2] || '00:00'}${m[3] || ':00'}`;
  const tz = m[4] ? (m[4] === 'Z' ? 'Z' : m[4].replace(/^([+-]\d{2}):?(\d{2})$/, '$1:$2')) : '+05:30';
  if (tz === '+05:30') return local + '+05:30';
  const d = new Date(local + tz);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + 19800000).toISOString().slice(0, 19) + '+05:30';
}

// Validate and normalise one row. Returns { row, errors }. Unknown columns are kept as text.
export function cleanRow(table, input) {
  const spec = TABLES[table];
  if (!spec) return { row: null, errors: [`Unknown table "${table}"`] };
  const errors = [];
  const row = {};
  for (const [k, v] of Object.entries(input || {})) {
    if (k === '__proto__' || k === 'constructor' || v === '' || v === null || v === undefined) continue;
    row[k] = typeof v === 'string' ? v.trim().slice(0, 2000) : v;
  }
  for (const [k, s] of Object.entries(spec.fields)) {
    let v = row[k];
    if (v === undefined || v === '') { delete row[k]; if (s.req) errors.push(`${k} is required`); continue; }
    if (s.type === 'num') {
      v = Number(typeof v === 'string' ? v.replace(/[,₹\s]/g, '') : v);
      if (!Number.isFinite(v)) errors.push(`${k} must be a number`);
      else if (v < 0 && !s.neg) errors.push(`${k} cannot be negative`);
    } else if (s.type === 'dt' || s.type === 'date') {
      v = normDate(v, s.type);
      if (!v) errors.push(`${k} is not a valid date (use YYYY-MM-DD or YYYY-MM-DDTHH:MM)`);
    } else v = String(v);
    if (s.type === 'enum' && !s.enum.includes(v)) errors.push(`${k} must be one of: ${s.enum.join(', ')}`);
    row[k] = v;
  }
  if (table === 'opp_history') {
    if (row.stage !== 'partner_confirmed' && row.confirmed_value_inr > 0) errors.push('confirmed_value_inr must be 0 unless the stage is partner_confirmed');
    if (row.stage === 'partner_confirmed' && !(row.confirmed_value_inr > 0)) errors.push('a confirmed partnership needs confirmed_value_inr above 0');
  }
  if (table === 'rules' && row.direction && row.scale_at !== undefined && row.stop_at !== undefined) {
    if (row.direction === 'higher' && !(row.scale_at > row.stop_at)) errors.push('for "higher is better" rules, scale_at must be above stop_at');
    if (row.direction === 'lower' && !(row.scale_at < row.stop_at)) errors.push('for "lower is better" rules, scale_at must be below stop_at');
  }
  return { row, errors };
}
