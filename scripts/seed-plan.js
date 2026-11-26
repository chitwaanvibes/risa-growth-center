// Builds the SIMULATED 2027 next-edition workspace, frozen at the end of week 4.
// Deterministic. Nothing in this file is sourced data; it exists to demo the Growth Center.
// Run: node scripts/seed-plan.js
import { writeFileSync } from 'node:fs';
import H from '../public/lib/data/history-source.js';

const T = Object.fromEntries(['event', 'targets', 'brands', 'contacts', 'campaigns', 'interactions', 'qualification', 'opportunities',
  'opp_history', 'activations', 'payments', 'spend', 'tasks', 'rules', 'assumptions', 'pace'].map(k => [k, []]));
const START = Date.parse('2027-01-18T00:00:00+05:30');
const at = (day, h = 10) => new Date(START + day * 864e5 + h * 36e5 + 19800000).toISOString().slice(0, 19) + '+05:30';
const date = day => at(day).slice(0, 10);
const pad = (n, w = 3) => String(n).padStart(w, '0');

T.event.push({ event_id: 'EVENT', event_name: 'CampusFest Bengaluru 2027 (simulated)', event_starts_at: '2027-04-10T10:00:00+05:30',
  campaign_start: '2027-01-18', sim_today: '2027-02-14', city: 'Bengaluru' });
T.targets.push({ target_id: '2027-01-18', effective_at: at(0, 9), qualified_brands_goal: 70, confirmed_partnerships_goal: 38,
  signed_cash_goal_inr: 3200000, cash_goal_inr: 2720000, stretch_cash_goal_inr: 4510000, target_version: 'Launch plan: collect ₹27.2L base, ₹45.1L stretch' });

// id, name, channel, owner, type, budget, base/stretch brands, meeting rate, base conv, base deal, base signed, stretch signed, base incr, stretch incr, rank, decision
const C = [
  ['P01', 'Cash-First Deal Terms', 'enabler', 'Meera Iyer', 'enabler', 10000, null, null, null, null, null, null, null, 480000, 923000, 1, 'Double down',
    '50% advance on signing, deadline-priced tiers, invoice within 24 hours', 'Every cash sponsor'],
  ['P02', 'Revenue Recovery Sprint', 'recovery', 'Kabir Shah', 'channel', 10000, 32, 32, 0.5, 0.25, 80000, 640000, 864000, 448000, 605000, 2, 'Double down',
    'Re-open qualified 2025 brands that never closed', '18 qualified brands with no opportunity + 14 qualified deals that stalled'],
  ['P03', 'Alumni Intro Engine', 'introduction', 'Riya Kapoor', 'channel', 40000, 25, 36, 0.82, 0.4, 100000, 1000000, 1782000, 252000, 799000, 3, 'Double down',
    'Warm introductions from alumni to budget owners', 'Bengaluru brands where alumni work'],
  ['P04', 'Creator & Community Referrals', 'referral', 'Nisha Rao', 'channel', 45000, 36, 52, 0.8, 0.4, 100000, 1440000, 2184000, 56000, 577000, 4, 'Test, then scale',
    'Creator and club referrals plus the partner interest page', 'Consumer, food and mobility brands that already buy creator or community reach'],
  ['P05', 'Ambassador Precision Outbound', 'outbound', 'Aman Verma', 'channel', 35000, 100, 150, 0.12, 0.02, 60000, 120000, 300000, 84000, 210000, 5, 'Deprioritise: capped test',
    'Two-touch researched outreach by student ambassadors', 'Local Bengaluru brands with a student offer'],
];
for (const c of C) T.campaigns.push({ sponsor_campaign_id: c[0], campaign_name: c[1], channel: c[2], owner_name: c[3], campaign_type: c[4], budget_inr: c[5],
  base_brands: c[6] ?? undefined, stretch_brands: c[7] ?? undefined, plan_meeting_rate: c[8] ?? undefined, plan_cash_conv: c[9] ?? undefined, plan_deal_inr: c[10] ?? undefined,
  base_signed_inr: c[11] ?? undefined, stretch_signed_inr: c[12] ?? undefined, base_incremental_inr: c[13], stretch_incremental_inr: c[14], rank: c[15], decision: c[16],
  objective: c[17], audience: c[18], status: 'active', created_at: at(0, 8) });
for (const c of T.campaigns) for (const k of Object.keys(c)) if (c[k] === undefined) delete c[k];
const camp = id => C.find(c => c[0] === id);

// P02 reuses the real 2025 qualified-but-unclosed brands (18 without an opportunity + 14 stalled qualified deals)
const histBrands = new Map(H.brands.map(b => [b.brand_id, b]));
const qLatest = new Map(); for (const q of [...H.qualification].sort((a, b) => a.effective_at.localeCompare(b.effective_at))) qLatest.set(q.brand_id, q.qualification_status);
const ohLatest = new Map(); for (const h of [...H.opp_history].sort((a, b) => a.effective_at.localeCompare(b.effective_at))) ohLatest.set(h.opportunity_id, h);
const oppBrands = new Set(H.opportunities.map(o => o.brand_id));
const noOpp = [...qLatest].filter(([b, s]) => s === 'qualified' && !oppBrands.has(b)).map(([b]) => b).sort();
const stalledQual = H.opportunities.filter(o => ['proposal_sent', 'negotiating'].includes(ohLatest.get(o.opportunity_id)?.stage) && qLatest.get(o.brand_id) === 'qualified').map(o => o.brand_id).sort();
const recoveryIds = [...new Set([...stalledQual, ...noOpp])].slice(0, 32);

const places = ['Indiranagar', 'Koramangala', 'Jayanagar', 'Whitefield', 'Malleshwaram', 'Hebbal', 'Bellandur', 'Yelahanka', 'Ulsoor', 'Basavanagudi', 'Sarjapur', 'Domlur', 'Banashankari', 'Frazer Town', 'Richmond Town', 'HSR'];
const kinds = [['Coffee Co', 'Food and beverage'], ['Rides', 'Mobility'], ['Learning Labs', 'Education'], ['Wear', 'Consumer products'], ['Media House', 'Media'], ['Care', 'Personal care'], ['Kitchens', 'Food and beverage'], ['Pay', 'Fintech']];
let bn = 0, ia = 0, qn = 0, on = 0, hn = 0, pn = 0, att = 0;
function brand(c, day, idx) {
  let b;
  if (c[0] === 'P02') { const h = histBrands.get(recoveryIds[idx]); b = { brand_id: h.brand_id, brand_name: h.brand_name, industry: h.industry, note: 'Carried over from 2025' }; }
  else { const i = bn++; const [k, ind] = kinds[(i * 3 + Math.floor(i / 16)) % kinds.length]; b = { brand_id: 'N' + pad(i + 1), brand_name: `${places[i % places.length]} ${k}${i >= 128 ? ' ' + (Math.floor(i / 128) + 1) : ''}`, industry: ind }; }
  Object.assign(b, { owner_name: c[3], created_at: at(Math.max(day - 1, 0), 8) });
  T.brands.push(b);
  T.contacts.push({ contact_id: 'C-' + b.brand_id, brand_id: b.brand_id, contact_name: `Partnerships lead, ${b.brand_name}`, job_title: 'Partnerships Manager', created_at: b.created_at });
  return b;
}
const touch = (b, c, day, type, outcome, h, attempt) => T.interactions.push({ interaction_id: 'NI' + pad(++ia, 4), brand_id: b.brand_id, brand_name: b.brand_name,
  contact_id: 'C-' + b.brand_id, sponsor_campaign_id: c[0], campaign_name: c[1], channel: c[2], event_type: type, outcome, occurred_at: at(day, h), attempt_id: attempt });
const qual = (b, c, status, day, h = 15, reason = 'Simulated assessment') => T.qualification.push({ history_id: 'NQ' + pad(++qn, 4), brand_id: b.brand_id,
  brand_name: b.brand_name, sponsor_campaign_id: c[0], qualification_status: status, effective_at: at(day, h), reason });

// Simulated week 1-4 results. deals: [value, final stage W(on)/N(egotiating)/P(roposal)/C(ontacted), day of last change]
const SIM = {
  P02: { worked: 28, replied: 17, meet: 12, opt: 0, deals: [[90000, 'W', 6], [110000, 'W', 8], [90000, 'W', 12], [100000, 'W', 22], [110000, 'N', 21], [70000, 'N', 17], [90000, 'P', 15], [55000, 'P', 20], [80000, 'P', 24], [60000, 'C', 23]] },
  P03: { worked: 7, replied: 6, meet: 6, opt: 0, deals: [[125000, 'W', 9], [95000, 'W', 15], [150000, 'N', 20], [90000, 'P', 22], [80000, 'C', 25]] },
  P04: { worked: 17, replied: 12, meet: 9, opt: 0, deals: [[80000, 'W', 10], [80000, 'W', 19], [105000, 'N', 13], [65000, 'P', 21], [90000, 'P', 23], [50000, 'C', 24]] },
  P05: { worked: 52, replied: 8, meet: 2, opt: 4, deals: [[40000, 'P', 18], [25000, 'C', 22]] },
};
// payments for signed deals: advance due 7 days after signing; key = campaign-dayOfSigning
const PAID = { 'P02-6': { adv: 2, bal: 12 }, 'P02-8': { adv: 3 }, 'P03-9': { adv: 4 }, 'P04-10': { adv: 14 } };
for (const c of C.slice(1)) {
  const s = SIM[c[0]]; const list = [];
  for (let i = 0; i < s.worked; i++) {
    const day = Math.floor(i * 24 / s.worked); const b = brand(c, day, i); list.push({ b, day }); const a = 'NA' + pad(++att, 4);
    if (c[2] === 'introduction') touch(b, c, day, 'introduction_received', 'introduced', 9, a);
    else if (c[2] === 'referral') touch(b, c, day, i % 3 === 0 ? 'web_inbound' : 'introduction_received', i % 3 === 0 ? 'interest_submitted' : 'introduced', 9, a);
    else { touch(b, c, day, 'outreach_sent', 'sent', 10, a); touch(b, c, day, 'delivered', 'delivered', 11, a); }
    qual(b, c, c[0] === 'P02' ? 'qualified' : 'unreviewed', Math.max(day - 1, 0), 18, c[0] === 'P02' ? 'Qualified in 2025; carried over' : 'Added to research');
    b.attempt = a;
  }
  for (let i = 0; i < s.replied; i++) { const { b, day } = list[i]; touch(b, c, Math.min(day + 1, 27), 'replied', i < s.meet ? 'positive' : 'neutral', 12, b.attempt); if (i >= s.meet && c[0] !== 'P02') qual(b, c, 'engaged', Math.min(day + 1, 27)); }
  for (let i = 0; i < s.meet; i++) { const { b, day } = list[i]; touch(b, c, Math.min(day + 2, 27), 'meeting_booked', 'scheduled', 10, b.attempt); touch(b, c, Math.min(day + 3, 27), 'meeting_held', 'attended', 11, b.attempt); if (c[0] !== 'P02') qual(b, c, 'qualified', Math.min(day + 3, 27)); }
  for (let i = 0; i < s.opt; i++) { const { b, day } = list[s.worked - 1 - i]; touch(b, c, Math.min(day + 1, 27), 'opt_out', 'do_not_contact', 16, b.attempt); }
  s.deals.forEach(([val, kind, lastDay], di) => {
    const { b } = list[di]; const id = 'NO' + pad(++on);
    const path = { C: ['prospecting', 'contacted'], P: ['prospecting', 'contacted', 'proposal_sent'], N: ['prospecting', 'contacted', 'proposal_sent', 'negotiating'], W: ['prospecting', 'contacted', 'proposal_sent', 'negotiating', 'partner_confirmed'] }[kind];
    const first = Math.max(0, lastDay - (path.length - 1) * 2);
    T.opportunities.push({ opportunity_id: id, opportunity_name: `${b.brand_name} 2027 partnership`, brand_id: b.brand_id, brand_name: b.brand_name, sponsor_campaign_id: c[0], originating_campaign_name: c[1], support_type: 'cash', created_at: at(first, 9) });
    path.forEach((stage, k) => T.opp_history.push({ history_id: 'NH' + pad(++hn, 4), opportunity_id: id, brand_id: b.brand_id, brand_name: b.brand_name, stage, proposed_value_inr: val,
      confirmed_value_inr: stage === 'partner_confirmed' ? val : 0, effective_at: at(k === path.length - 1 ? lastDay : Math.min(first + k * 2, lastDay), k === path.length - 1 ? 13 : 12), owner_name: c[3] }));
    if (kind === 'W') {
      const p = PAID[`${c[0]}-${lastDay}`] || {};
      const add = (kindP, amt, due, rec) => T.payments.push({ payment_id: 'PAY' + pad(++pn), opportunity_id: id, kind: kindP, amount_inr: amt, invoiced_at: at(lastDay, 17), due_at: at(due, 18),
        ...(rec !== undefined ? { received_at: at(rec, 14) } : {}), note: 'Simulated invoice' });
      add('advance', val / 2, lastDay + 7, p.adv !== undefined ? lastDay + p.adv : undefined);
      add('balance', val / 2, 75, p.bal !== undefined ? lastDay + p.bal : undefined);
    }
  });
}
const spends = { P01: [3000], P02: [2500, 1500], P03: [8000, 10000], P04: [6000, 8000], P05: [9000, 10000] };
let sn = 0; for (const [k, v] of Object.entries(spends)) v.forEach((a, i) => T.spend.push({ spend_id: 'SP' + pad(++sn), sponsor_campaign_id: k, amount_inr: a, posted_at: at(5 + i * 12, 18), note: 'Simulated spend' }));

// weekly plan: brands sourced until 30 days before the event; signing lags first touch by 16 days (2025 median);
// 50% advance 7 days after signing; balances due 2 weeks before the event; 85% of signed cash collected
const totalBrands = 32 + 25 + 36 + 100, sourceDays = 52, baseSigned = 3200000, stretchSigned = 5130000;
const frac = d => Math.min(1, Math.max(0, d / sourceDays));
const signedAt = (d, tot) => tot * frac(d - 16);
const collectedAt = (d, tot, rate) => rate * (0.5 * signedAt(d - 7, tot) + 0.5 * (d >= 75 ? signedAt(d - 7, tot) : signedAt(d - 21, tot)));
for (let w = 1; w <= 12; w++) {
  const d = w * 7;
  T.pace.push({ week: pad(w, 2), base_brands: Math.round(totalBrands * frac(d)), base_signed_inr: Math.round(signedAt(d, baseSigned)), base_collected_inr: Math.round(collectedAt(d, baseSigned, 0.85)),
    stretch_signed_inr: Math.round(signedAt(d, stretchSigned)), stretch_collected_inr: Math.round(collectedAt(d, stretchSigned, 0.88)) });
}

const R = (id, cid, role, metric, direction, scale_at, stop_at, min_sample, from_week, scale_action, change_action, stop_action) =>
  T.rules.push({ rule_id: id, sponsor_campaign_id: cid, role, metric, direction, scale_at, stop_at, min_sample, from_week, scale_action, change_action, stop_action });
R('R01', 'P01', 'primary', 'advance_rate_7d', 'higher', 0.7, 0.4, 5, 3, 'Make 50% advance the default on every proposal', 'Invoice within 24h of signing, add a 7-day price lock and a call from the sponsorship lead on day 5', 'Switch to 30% advance with dated instalments and escalate every unpaid deal');
R('R02', 'P01', 'guardrail', 'win_rate', 'higher', 0.5, 0.3, 10, 4, 'Keep the terms', 'Offer two payment options to hesitant sponsors', 'Terms are blocking closes: relax the advance requirement');
R('R03', 'P02', 'primary', 'meeting_rate', 'higher', 0.35, 0.15, 10, 2, 'Add the next 28 engaged 2025 brands to the sprint', 'Change the contact: ask for the budget owner with a new offer', 'End the sprint and move owner time to warm introductions');
R('R04', 'P02', 'guardrail', 'stalled_share', 'lower', 0.2, 0.5, 5, 3, 'Keep the 7-day follow-up rule', 'Put a dated next step on every open deal', 'Mark deals lost after one final deadline offer');
R('R05', 'P03', 'primary', 'meeting_rate', 'higher', 0.7, 0.45, 8, 3, 'Ask each converting alumnus for two more introductions', 'Tighten the ask: send a forwardable 5-line brief', 'Stop cold alumni lists; ask only alumni with direct budget links');
R('R06', 'P03', 'guardrail', 'pace_brands_pct', 'higher', 0.9, 0.6, 8, 3, 'Keep weekly intro targets', 'Two intro asks per core team member per week', 'Volume rescue: alumni chapter mailer and faculty-led asks; review in 7 days');
R('R07', 'P04', 'primary', 'meeting_rate', 'higher', 0.6, 0.35, 12, 3, 'Add referral partners and raise the reward cap', 'Screen referrals for budget and audience fit before booking meetings', 'Stop paid referral rewards; keep the inbound page');
R('R08', 'P04', 'guardrail', 'cost_per_signed_inr', 'lower', 8000, 15000, 2, 4, 'Release the next budget tranche', 'Pay referral rewards only on cash received', 'Freeze spend');
R('R09', 'P05', 'primary', 'meeting_rate', 'higher', 0.15, 0.05, 40, 3, 'Add ambassadors and widen the list', 'Rewrite the offer and narrow to one segment for one week', 'Stop outreach; move ambassadors to follow-ups and inbound response');
R('R10', 'P05', 'guardrail', 'opt_out_rate', 'lower', 0.02, 0.05, 30, 2, 'Keep the two-touch cap', 'Review targeting and message', 'Pause sends immediately');

const A = (key, value, label, basis) => T.assumptions.push({ key, value, label, basis });
A('p_prospecting', 0.08, 'Win probability: prospecting', 'Assumption');
A('p_contacted', 0.15, 'Win probability: contacted', 'Assumption');
A('p_proposal_sent', 0.4, 'Win probability: proposal sent', 'Assumption; 2025 proposal→signed was 24 of 46 (52%) but skewed to warm leads');
A('p_negotiating', 0.65, 'Win probability: negotiating', 'Assumption; 2025 negotiating→confirmed was 25 of 39 (64%)');
A('stall_days', 7, 'Days without a stage change before a deal counts as stalled', '2025: negotiation to confirmation always took 2 days');
A('stall_factor', 0.5, 'Win-probability multiplier for stalled deals', 'Assumption');
A('collection_rate', 0.85, 'Share of signed, unpaid cash collected before the event', 'Assumption: 50% advance × 90% + 50% balance × 80%; balance due 27 Mar, before the 31 Mar FY close. No 2025 receipt data');
A('safe_days_before_event', 30, 'Stop sourcing new brands this many days before the event', '2025 first touch to signature ≈ 16 days, plus 14 days to collect');
A('days_to_sign', 16, 'Typical days from first touch to signature', '2025 median, first touch to confirmation');
A('min_sample_projection', 10, 'Brands needed before reallocation uses observed returns', 'Assumption');
A('credibility_k', 10, 'Plan weight in projections, in brands (shrinks small samples toward plan)', 'Assumption');

const T1 = (title, cid, owner, due, status, priority, notes = '') => T.tasks.push({ task_id: 'TSK' + pad(T.tasks.length + 1), title, sponsor_campaign_id: cid, owner_name: owner,
  due_date: date(due), status, priority, notes, source: 'plan', created_at: at(0, 9), ...(status === 'done' ? { completed_at: at(due, 18) } : {}) });
T1('Publish tier sheet with 50% advance and price-lock dates', 'P01', 'Meera Iyer', 4, 'done', 'P0');
T1('Set up invoice template and payment links', 'P01', 'Meera Iyer', 6, 'done', 'P0');
T1('Call sponsors with unpaid advances', 'P01', 'Meera Iyer', 26, 'todo', 'P0', 'Overdue: 4 advances past due');
T1('Contact all 32 carried-over qualified brands', 'P02', 'Kabir Shah', 18, 'in_progress', 'P0');
T1('Set a dated next step on stalled recovery deals', 'P02', 'Kabir Shah', 30, 'todo', 'P1');
T1('Build alumni-at-brands list for Bengaluru', 'P03', 'Riya Kapoor', 9, 'done', 'P0');
T1('Send 15 forwardable intro asks to alumni', 'P03', 'Riya Kapoor', 24, 'in_progress', 'P0');
T1('Sign 4 creator and club referral partners', 'P04', 'Nisha Rao', 20, 'in_progress', 'P1');
T1('Launch partner interest page', 'P04', 'Nisha Rao', 12, 'done', 'P1');
T1('Ambassador research sheet: 100 local brands', 'P05', 'Aman Verma', 13, 'done', 'P1');
T1('Review opt-outs and rewrite second-touch message', 'P05', 'Aman Verma', 27, 'todo', 'P1');
T1('Week-4 growth review: apply scale, change, stop rules', 'P01', 'Meera Iyer', 28, 'todo', 'P0');

writeFileSync(new URL('../public/lib/data/plan-seed.js', import.meta.url), '// Generated by scripts/seed-plan.js. SIMULATED data for the 2027 plan workspace.\nexport default ' + JSON.stringify(T) + ';\n');
console.log(Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v.length])), 'recovery brands', recoveryIds.length);
