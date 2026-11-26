// node test/run.js : checks the engine against hand-audited figures, the copilot tools, validation and the Gemini loop.
import assert from 'node:assert/strict';
import { loadWorkspace, WORKSPACES } from '../public/lib/workspaces.js';
import { snapshot, calendar, drivers } from '../public/lib/metrics.js';
import { validateOps } from '../public/lib/ops.js';
import { makeToolRunner, calc } from '../lib/tools.js';
import { runCopilot } from '../lib/copilot.js';

let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ✓', name); } catch (e) { fail++; console.log('  ✗', name, '\n    ', e.message); } };

console.log('Original 2025 dataset');
const W = loadWorkspace('original');
await t('removes exact import-retry duplicates (3 interactions, 1 qualification, 2 history)', () => assert.deepEqual(W.quality.duplicatesRemoved, { interactions: 3, qualification: 1, opp_history: 2 }));
const S = snapshot(W, '2025-04-11');
await t('funnel as of 11 Apr 2025 matches the audit', () => {
  const x = S.totals;
  assert.deepEqual([x.brands_worked, x.outreach_brands, x.replied, x.meetings_held, x.qualified, x.opportunities, x.proposals, x.signed, x.signed_cash_deals],
    [180, 141, 109, 60, 60, 58, 46, 24, 20]);
  assert.equal(x.signed_cash_inr, 2000000); assert.equal(x.signed_in_kind_inr, 240000); assert.equal(x.open_cash_inr, 1440000); assert.equal(x.stalled, 26);
});
await t('latest-version rule: 15 Mar 2025 snapshot hides later outcomes', () => {
  const m = snapshot(W, '2025-03-15', { series: false }).totals;
  assert.equal(m.qualified, 55); assert.equal(m.signed, 17); assert.equal(m.signed_cash_inr, 1325000); assert.equal(m.opportunities, 51);
});
await t('target in force switches on 15 Mar 2025', () => {
  assert.equal(snapshot(W, '2025-03-14', { series: false }).target.confirmed_partnerships_goal, 20);
  assert.equal(snapshot(W, '2025-03-15', { series: false }).target.confirmed_partnerships_goal, 28);
});
await t('withdrawn-after-confirmed deal is not counted as signed', () => assert.equal(S.deals.find(d => d.opportunity_id === 'O006').stage, 'withdrawn'));
await t('channel split: warm channels hold all 20 cash wins', () => {
  const c = id => S.campaigns.find(x => x.id === id);
  assert.equal(c('SC02').signed_cash_inr + c('SC04').signed_cash_inr + c('SC05').signed_cash_inr, 2000000);
  assert.equal(c('SC01').signed + c('SC03').signed + c('SC06').signed, 0);
});
await t('no payment data → cash collected reported as unavailable', () => { assert.equal(S.coverage.has_payments, false); assert.equal(S.projection.collected_inr, null); });
await t('default view date is the day before the event', () => assert.equal(calendar(W).defaultAsOf, '2025-04-11'));

console.log('Plan workspace (simulated)');
const P = loadWorkspace('plan'); const SP = snapshot(P, '2027-02-14');
await t('week 4 decisions: P02 scale, P05 stop, others change', () => assert.deepEqual(Object.fromEntries(Object.entries(SP.decisions).map(([k, v]) => [k, v.decision])), { P01: 'change', P02: 'scale', P03: 'change', P04: 'change', P05: 'stop' }));
await t('plan totals add up (32.0L base signed, 13.2L base incremental)', () => {
  const sumK = k => P.tables.campaigns.reduce((a, c) => a + (c[k] || 0), 0);
  assert.equal(sumK('base_signed_inr'), 3200000); assert.equal(sumK('base_incremental_inr'), 1320000); assert.equal(sumK('stretch_incremental_inr'), 3114000);
});
await t('collected = sum of received payments', () => assert.equal(SP.totals.received_inr, P.tables.payments.filter(p => p.received_at && p.received_at <= '2027-02-14T23:59:59+05:30').reduce((a, p) => a + p.amount_inr, 0)));
await t('editing data changes analytics (stage → confirmed raises signed cash)', () => {
  const W2 = loadWorkspace('plan', [{ tbl: 'opp_history', id: 'X1', data: { history_id: 'X1', opportunity_id: 'NO013', stage: 'partner_confirmed', proposed_value_inr: 150000, confirmed_value_inr: 150000, effective_at: '2027-02-14T18:00:00+05:30' } }]);
  assert.equal(snapshot(W2, '2027-02-14', { series: false }).totals.signed_cash_inr, SP.totals.signed_cash_inr + 150000);
  assert.equal(snapshot(W2, '2027-02-13', { series: false }).totals.signed_cash_inr, snapshot(P, '2027-02-13', { series: false }).totals.signed_cash_inr, 'no leak into earlier dates');
});
await t('drivers explain the week', () => { const d = drivers(P, '2027-02-07', '2027-02-14'); assert.ok(d.stage_changes_count > 0); assert.ok(d.by_campaign.length === 5); });

console.log('Validation');
await t('rejects bad enum, missing fields, dangling references', () => {
  const v = validateOps(WORKSPACES.plan.seed, [], [{ tbl: 'tasks', id: 'T9', data: { task_id: 'T9', title: 'x', owner_name: 'A', due_date: '2027-02-20', status: 'bogus' } },
    { tbl: 'tasks', id: 'T8', data: { task_id: 'T8', owner_name: 'A', due_date: '2027-02-20', status: 'todo' } }]);
  assert.equal(v.ok, false); assert.equal(v.errors.length, 2);
  const r = validateOps(WORKSPACES.plan.seed, [], [{ tbl: 'tasks', id: 'T7', data: { task_id: 'T7', title: 'x', owner_name: 'A', due_date: '2027-02-20', status: 'todo', sponsor_campaign_id: 'NOPE' } }]);
  assert.equal(r.ok, false); assert.match(r.errors[0], /does not exist/);
});
await t('blocks deleting a campaign that has records', () => assert.equal(validateOps(WORKSPACES.plan.seed, [], [{ tbl: 'campaigns', id: 'P02', deleted: true }]).ok, false));
await t('confirmed value must be 0 unless confirmed', () => assert.equal(validateOps(WORKSPACES.plan.seed, [], [{ tbl: 'opp_history', id: 'Z', data: { history_id: 'Z', opportunity_id: 'NO013', stage: 'negotiating', confirmed_value_inr: 5, effective_at: '2027-02-14' } }]).ok, false));

console.log('Copilot tools');
const R = makeToolRunner(W, '2025-04-11');
await t('calculate is exact and rejects junk', () => { assert.equal(calc('(2720000-770000)/8'), 243750); assert.equal(calc('10%*500'), 50); assert.throws(() => calc('2+alert(1)')); });
await t('query_table aggregates from live data', () => assert.equal(R.run('query_table', { table: 'opp_history', latest_version_only: true, filters: [{ field: 'stage', op: 'eq', value: 'partner_confirmed' }], aggregate: { fn: 'sum', field: 'confirmed_value_inr' } }).groups[0].sum_confirmed_value_inr, 2240000));
await t('unknown field → explicit error with available fields', () => assert.ok(R.run('query_table', { table: 'brands', filters: [{ field: 'revenue', op: 'gt', value: '1' }] }).available_fields));
await t('catalog states the cash-receipt gap', () => assert.ok(R.run('get_data_catalog', {}).known_gaps.some(g => /cash receipts/i.test(g))));
await t('propose_action drafts but does not save', () => { const r = R.run('propose_action', { action_type: 'create_task', reason: 'x', title: 'Revive Cedar Pantry', campaign_id: 'SC03' }); assert.equal(r.status, 'awaiting_user_confirmation'); assert.equal(W.tables.tasks.length, 0); assert.equal(R.pending.length, 1); });
await t('propose_action rejects unknown ids', () => assert.equal(R.run('propose_action', { action_type: 'record_payment', reason: 'x', target_id: 'PAY1' }).status, 'invalid'));

console.log('Gemini loop (simulated API)');
await t('function call → tool result → answer, with thought signature and id passed back', async () => {
  const bodies = [];
  const fake = async (url, opts) => {
    const body = JSON.parse(opts.body); bodies.push(body);
    const resp = bodies.length === 1
      ? { candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'get_campaigns', args: { campaign_ids: ['SC01'] }, id: 'call-1' }, thoughtSignature: 'SIG-A' }] } }] }
      : { candidates: [{ content: { role: 'model', parts: [{ text: 'Brand Discovery Email: 0 signed deals from 91 brands.' }] }, finishReason: 'STOP' }] };
    return { ok: true, status: 200, text: async () => JSON.stringify(resp), headers: new Map() };
  };
  const out = await runCopilot({ W, asOf: '2025-04-11', messages: [{ role: 'user', text: 'How did cold email do?' }], key: 'test', models: ['m1'], fetchImpl: fake });
  assert.equal(out.reply, 'Brand Discovery Email: 0 signed deals from 91 brands.');
  const second = bodies[1].contents;
  assert.equal(second[1].parts[0].thoughtSignature, 'SIG-A');
  assert.equal(second[2].parts[0].functionResponse.id, 'call-1');
  assert.equal(second[2].parts[0].functionResponse.response.result.campaigns[0].brands_worked, 91);
  assert.equal(out.trace[0].tool, 'get_campaigns');
});
await t('falls back to the next model on quota errors', async () => {
  const seen = [];
  const fake = async url => { seen.push(url); if (url.includes('m1')) return { ok: false, status: 429, text: async () => '{"error":{"message":"quota"}}' }; return { ok: true, status: 200, text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) }; };
  const out = await runCopilot({ W, asOf: '2025-04-11', messages: [{ role: 'user', text: 'hi' }], key: 'k', models: ['m1', 'm2'], fetchImpl: fake });
  assert.equal(out.reply, 'ok'); assert.equal(out.model, 'm2');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
