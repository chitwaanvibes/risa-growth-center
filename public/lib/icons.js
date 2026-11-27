// One stroke icon set (24px grid, 1.8px stroke, round caps) used across the Growth Center.
const P = {
  overview: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  diagnose: '<circle cx="11" cy="11" r="7.5"/><path d="m20.5 20.5-4.2-4.2"/><path d="M8 11h1.5l1-2.5 2 5 1-2.5H14"/>',
  decide: '<path d="M12 3v18"/><path d="M5 6h11l3 3-3 3H5z"/><path d="M12 15H8l-2 2 2 2h4"/>',
  execute: '<path d="m3.5 7 2 2 3.5-3.5"/><path d="m3.5 16 2 2 3.5-3.5"/><path d="M13 7.5h7.5"/><path d="M13 16.5h7.5"/>',
  data: '<ellipse cx="12" cy="5.5" rx="8" ry="2.8"/><path d="M4 5.5v13c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8v-13"/><path d="M4 12c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8"/>',
  wallet: '<path d="M19 7V5.5A2.5 2.5 0 0 0 16.5 3H5.5a2.5 2.5 0 0 0 0 5H19a2 2 0 0 1 2 2v3"/><path d="M3 5.5V18a3 3 0 0 0 3 3h13a2 2 0 0 0 2-2v-3"/><path d="M17 12.5h4v4h-4a2 2 0 0 1 0-4z"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trend: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  handshake: '<path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.9-3.9a3 3 0 0 0-4.2 0l-.9.9a1 1 0 1 1-3-3l2.8-2.8a5.8 5.8 0 0 1 7.1-.9l.5.3a4 4 0 0 0 2.8.5L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/><path d="M3 4h8"/>',
  badge: '<path d="M12 2.5 14.3 4l2.8-.2.9 2.7 2.3 1.6-.9 2.7.9 2.7-2.3 1.6-.9 2.7-2.8-.2L12 21.5 9.7 20l-2.8.2-.9-2.7-2.3-1.6.9-2.7-.9-2.7 2.3-1.6.9-2.7 2.8.2z"/><path d="m9 12 2 2 4-4"/>',
  layers: '<path d="m12 3 9 4.5-9 4.5-9-4.5z"/><path d="m3 12 9 4.5 9-4.5"/><path d="m3 16.5 9 4.5 9-4.5"/>',
  coins: '<circle cx="9" cy="9" r="6"/><path d="M18.1 10.4A6 6 0 1 1 10.4 18"/><path d="M8 7h1.5v4"/><path d="m16.7 13.9.8.6-2.8 2.8"/>',
  tasks: '<rect x="3" y="4" width="18" height="17" rx="2.5"/><path d="M8 2.5v3M16 2.5v3M3 9.5h18"/><path d="m8.5 15 2 2 4-4"/>',
  funnel: '<path d="M3 4h18l-7 8.5V19l-4 2v-8.5z"/>',
  chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-7"/>',
  calculator: '<rect x="4" y="2.5" width="16" height="19" rx="2.5"/><path d="M8 6.5h8"/><path d="M8 11h.01M12 11h.01M16 11h.01M8 14.5h.01M12 14.5h.01M8 18h.01M12 18h.01"/><path d="M16 14.5V18"/>',
  signpost: '<path d="M12 3v18"/><path d="M5 6h11l3 3-3 3H5z"/>',
  table: '<rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M3 9h18M3 15h18M9 3v18"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1.5 14h5M9.5 8h5M17.5 16h5"/>',
  shuffle: '<path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="m4 4 5 5"/>',
  rocket: '<path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1z"/><path d="m12 15-3-3a22 22 0 0 1 2-4A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22.4 22.4 0 0 1-4 2z"/><path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  sparkles: '<path d="M12 3.5 13.8 8.2 18.5 10 13.8 11.8 12 16.5 10.2 11.8 5.5 10 10.2 8.2z"/><path d="m18.5 15 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/><path d="m5 3 .5 1.5L7 5l-1.5.5L5 7l-.5-1.5L3 5l1.5-.5z"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6M14 11v6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  reset: '<path d="M3 12a9 9 0 1 0 9-9 9.7 9.7 0 0 0-6.7 2.7L3 8"/><path d="M3 3v5h5"/>',
  calendar: '<rect x="3" y="4" width="18" height="17" rx="2.5"/><path d="M16 2.5v3M8 2.5v3M3 9.5h18"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4.5M12 8h.01"/>',
  receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  megaphone: '<path d="m3 11 15-6v14L3 13z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
};
export const ico = (name, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.target}</svg>`;

// Card headings get an icon from their text.
const HEAD = [
  [/^Sponsor funnel/, 'funnel'], [/^Pace/, 'chart'], [/^How the projection/, 'calculator'], [/^Current calls/, 'signpost'],
  [/^Campaign performance/, 'table'], [/^Portfolio stage/, 'funnel'], [/^Stalled/, 'clock'], [/^Data quality/, 'alert'],
  [/^Rules/, 'sliders'], [/^Budget what-if/, 'shuffle'], [/^The five bets/, 'rocket'], [/^Assumptions/, 'sliders'],
  [/^Activity log/, 'history'], [/^What changed|^Drivers|^Change/, 'trend'], [/^Payments|^Invoices/, 'receipt'],
];
const BTN = [
  [/^\+ ?/, 'plus', true], [/^Edit$/, 'edit'], [/^Delete$/, 'trash'], [/^Turn into task$/, 'tasks'], [/^Mark received$/, 'check'],
  [/^Undo$/, 'undo'], [/^Import CSV/, 'upload'], [/^Export CSV/, 'download'], [/^Reset/, 'reset'], [/^Apply budget move$/, 'shuffle'], [/^Confirm$/, 'check'],
];
export function decorate(html) {
  return html
    .replace(/<h2>([^<]+)/g, (m, t) => { const hit = HEAD.find(([re]) => re.test(t.trim())); return `<h2><span class="hi">${ico(hit ? hit[1] : 'target')}</span>${t}`; })
    .replace(/(<(?:button|label) class="btn[^"]*"[^>]*>)([^<]+?)(<\/button>|<input)/g, (m, open, label, close) => {
      const hit = BTN.find(([re]) => re.test(label.trim()));
      if (!hit) return m;
      return `${open}${ico(hit[1])}${hit[2] ? label.replace(/^\+ ?/, '') : label}${close}`;
    });
}
