// Two workspaces share one engine.
import HISTORY from './data/history-source.js';
import OVERLAY from './data/history-overlay.js';
import PLAN from './data/plan-seed.js';
import { buildWorkspace } from './metrics.js';

export const WORKSPACES = {
  original: {
    id: 'original', name: 'CampusFest 2025: original dataset', short: '2025 original data', simulated: false,
    description: 'The provided sponsorship dataset, unchanged (synthetic per the brief). Rules and assumptions are app-added.',
    seed: { ...HISTORY, assumptions: OVERLAY.assumptions, rules: OVERLAY.rules, campaigns: HISTORY.campaigns.map(c => ({ ...c, campaign_type: 'channel', status: 'active' })) },
    appAdded: ['assumptions', 'rules'],
  },
  plan: {
    id: 'plan', name: 'CampusFest Bengaluru 2027: growth plan (simulated week 4)', short: '2027 plan (simulated)', simulated: true,
    description: 'Simulated next-edition campaign running the five bets, frozen at the end of week 4. Use it to test the workflow.',
    seed: PLAN, appAdded: [],
  },
};
export function loadWorkspace(id, overrides = []) {
  const w = WORKSPACES[id];
  if (!w) throw new Error(`Unknown workspace ${id}`);
  return buildWorkspace(w.seed, overrides, { id: w.id, name: w.name, simulated: w.simulated, appAdded: w.appAdded });
}
