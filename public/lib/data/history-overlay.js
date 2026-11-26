// App-added layer for the ORIGINAL 2025 dataset. None of this is in the source workbook.
// It lets the 2025 view use the same forecast and scale/change/stop logic as the plan.
// Rules here are a retrospective lens: judged on outcomes after the campaign ended.
export default {
  assumptions: [
    { key: 'p_prospecting', value: 0.08, label: 'Win probability: prospecting', basis: 'Assumption' },
    { key: 'p_contacted', value: 0.15, label: 'Win probability: contacted', basis: 'Assumption' },
    { key: 'p_proposal_sent', value: 0.4, label: 'Win probability: proposal sent', basis: 'Assumption' },
    { key: 'p_negotiating', value: 0.65, label: 'Win probability: negotiating', basis: 'Assumption; 25 of 39 negotiating deals confirmed' },
    { key: 'stall_days', value: 7, label: 'Days without a stage change before a deal counts as stalled', basis: 'Negotiation to confirmation always took 2 days' },
    { key: 'stall_factor', value: 0.5, label: 'Win-probability multiplier for stalled deals', basis: 'Assumption' },
    { key: 'collection_rate', value: 0.85, label: 'Share of signed, unpaid cash collected before the event', basis: 'Assumption; no receipt data in the source' },
    { key: 'safe_days_before_event', value: 30, label: 'Stop sourcing this many days before the event', basis: 'About 16 days to sign plus 14 to collect' },
    { key: 'days_to_sign', value: 16, label: 'Typical days from first touch to signature', basis: 'Median in this dataset' },
    { key: 'min_sample_projection', value: 10, label: 'Brands needed before reallocation uses observed returns', basis: 'Assumption' },
    { key: 'credibility_k', value: 10, label: 'Plan weight in projections, in brands', basis: 'Assumption' },
  ],
  rules: [
    { rule_id: 'H01', sponsor_campaign_id: 'SC01', role: 'primary', metric: 'mature_conv', direction: 'higher', scale_at: 0.4, stop_at: 0.15, min_sample: 5, from_week: 4, scale_action: 'Keep investing', change_action: 'Tighten targeting', stop_action: 'Stop bulk discovery email; cap at two touches' },
    { rule_id: 'H02', sponsor_campaign_id: 'SC01', role: 'guardrail', metric: 'opt_out_rate', direction: 'lower', scale_at: 0.02, stop_at: 0.05, min_sample: 30, from_week: 2, scale_action: 'OK', change_action: 'Review list quality', stop_action: 'Pause sends' },
    { rule_id: 'H03', sponsor_campaign_id: 'SC02', role: 'primary', metric: 'mature_conv', direction: 'higher', scale_at: 0.4, stop_at: 0.15, min_sample: 5, from_week: 4, scale_action: 'Find more introducers', change_action: 'Improve the ask', stop_action: 'Stop' },
    { rule_id: 'H04', sponsor_campaign_id: 'SC03', role: 'primary', metric: 'mature_conv', direction: 'higher', scale_at: 0.4, stop_at: 0.15, min_sample: 5, from_week: 4, scale_action: 'Keep investing', change_action: 'Change the offer', stop_action: 'Stop; meetings are not turning into deals' },
    { rule_id: 'H05', sponsor_campaign_id: 'SC04', role: 'primary', metric: 'mature_conv', direction: 'higher', scale_at: 0.4, stop_at: 0.15, min_sample: 5, from_week: 4, scale_action: 'Promote the partner form', change_action: 'Speed up responses', stop_action: 'Stop' },
    { rule_id: 'H06', sponsor_campaign_id: 'SC05', role: 'primary', metric: 'mature_conv', direction: 'higher', scale_at: 0.4, stop_at: 0.15, min_sample: 5, from_week: 4, scale_action: 'Recruit more referral partners', change_action: 'Screen referrals', stop_action: 'Stop' },
    { rule_id: 'H07', sponsor_campaign_id: 'SC06', role: 'primary', metric: 'mature_conv', direction: 'higher', scale_at: 0.4, stop_at: 0.15, min_sample: 5, from_week: 4, scale_action: 'Keep investing', change_action: 'Change the contact', stop_action: 'Stop revival emails after one touch' },
    { rule_id: 'H08', sponsor_campaign_id: 'SC03', role: 'guardrail', metric: 'stalled_share', direction: 'lower', scale_at: 0.2, stop_at: 0.5, min_sample: 5, from_week: 4, scale_action: 'OK', change_action: 'Add dated next steps', stop_action: 'Close out stalled deals' },
  ],
};
