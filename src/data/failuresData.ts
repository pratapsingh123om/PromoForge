export interface FailureItem {
  code: string;
  episode: string;
  timestamp: string;
  observed: string;
  cause: string;
  rule: string;
  status: string;
}

export const FAILURE_LOG_ITEMS: FailureItem[] = [
  {
    code: "F1",
    episode: "EP_002",
    timestamp: "00:02.80",
    observed: 'Soft action hook: Promo opened on physical reaction ("Juliana gasps softly") rather than spoken dialogue.',
    cause: "Action cues scored higher raw intensity than dialogue.",
    rule: "fallback.py: hooks require spoken dialogue in first 3s; action reactions given lower hook weight.",
    status: "Fixed on EP_002; verified across held-out episodes (all 7 top picks open on spoken lines).",
  },
  {
    code: "F2",
    episode: "EP_002",
    timestamp: "00:00.00",
    observed: 'Hook buried: The true catalytic rejection line "I cannot marry you, Juliana." was cut off at 0.0s.',
    cause: "Overlapping camera cue caused generator start boundary to skip 0.0s.",
    rule: "Boundary search anchored to dialogue line start (00:00.00).",
    status: "Fixed and verified on EP_002.",
  },
  {
    code: "F3",
    episode: "EP_002",
    timestamp: "01:47.40",
    observed: 'Fake cliffhanger: Promo #3 ended on Juliana\'s speech finale ("...I was the one who should be ashamed"), creating resolution rather than suspense.',
    cause: "Candidate endpoint selected on speech volume rather than unresolved question/threat.",
    rule: 'Added resolves_question detector rejecting acceptance/closure lines. Promo terminates at 01:42.40 on unresolved vow ("I may leave this chapel without a husband...").',
    status: "Fixed on EP_002; held-out endings verified unresolved.",
  },
  {
    code: "F4",
    episode: "EP_002",
    timestamp: "00:34.30–01:19.20",
    observed: 'Inter-promo spoiler, mid-reply cut, and sentence continuation: Promo #2 started mid-reply at 00:42.50 ("Do not disgrace us further."). Promo #3 completed Promo #2\'s cliffhanger sentence at 01:19.20 ("...because another woman promised you...").',
    cause: "Generator lacked speech-turn boundary enforcement, allowed sentence fragment starts, and did not check if a promo opens inside the resolution/continuation of an earlier promo.",
    rule: "Implemented 4 rules in promos.py: (1) H6: max 20% overlap; (2) H7: suppress cuts that continue or answer an earlier cliffhanger; (3) Fragment ban (no starting with ... or conjunction); (4) Speech-turn integrity.",
    status: "Fixed on EP_002; held-out test confirms zero fragment starts and 0 mid-speech cuts.",
  },
  {
    code: "F5",
    episode: "EP_001/002",
    timestamp: "Global",
    observed: "Flat/default scores: Curiosity was flat (100 or 97.6) and confidence was static across candidate cuts.",
    cause: "Sub-scores were mapped to uniform bucket constants without linguistic variance.",
    rule: "Recalibrated continuous scoring based on sentence structure (interrogative question vs. trailing ellipsis vs. confrontation), tension trajectory, and word punchiness.",
    status: "Fixed on EP_002 and held-out set (scores spread realistically between 76.8 and 85.2).",
  },
  {
    code: "F6",
    episode: "EP_001",
    timestamp: "00:33.80",
    observed: 'Question mark treated as hook: Single-word question "Gerald?" received an automatic high hook score.',
    cause: "Scoring treated ? as an opening shock signal.",
    rule: "Separated hook from cliffhanger scoring; ? now drives cliffhanger curiosity, not opening hook.",
    status: "Fixed in scoring logic; verified on EP_001.",
  },
  {
    code: "F7",
    episode: "EP_001",
    timestamp: "02:13.80",
    observed: "Missed non-dialogue moments: Final defiant close-up was omitted.",
    cause: "Candidate endpoints were originally restricted to dialogue events.",
    rule: "Visual action/camera events re-enabled as valid segment out-points.",
    status: "Fixed in boundary validator; verified on EP_001.",
  },
  {
    code: "F8",
    episode: "EP_001",
    timestamp: "01:14.30",
    observed: "Missed best moments: Event list stopped mid-episode in terminal output.",
    cause: "Terminal display/print truncation during log inspection; parser itself ingested all 47 events through 02:18.00.",
    rule: "Verified that parser reads through full episode runtime without truncation.",
    status: "Verified on EP_001.",
  },
  {
    code: "F9",
    episode: "EP_001/002",
    timestamp: "Global",
    observed: "Variable speaker identities: Same characters appear under different labels (The Former Groom vs. Gerald; Lady in Gold Gown vs. Clarissa).",
    cause: "Screenplay uses descriptive labels across scenes.",
    rule: "Alias normalization mapping canonicalizes aliases using continuity notes.",
    status: "Implemented in preprocessor; verified on EP_001/EP_002.",
  },
  {
    code: "F10",
    episode: "Multi-ep",
    timestamp: "Cross-ep",
    observed: "Missing context for new characters: Character appears without prior role introduction within the clip.",
    cause: "Character appears without prior role introduction within the clip.",
    rule: "Flagged as context_dependency: high to signal human editorial review.",
    status: "Flag only; automated backstory insertion not implemented.",
  },
  {
    code: "F11",
    episode: "EP_001",
    timestamp: "02:15.00",
    observed: 'Cue leakage: Sound FX line "ominous cliffhanger peak" leaked dramatic turn.',
    cause: "SOUND FX was included in narrative scoring input.",
    rule: "SOUND FX blocks excluded from scoring; only spoken dialogue and physical actions drive candidate selection.",
    status: "Fixed; SOUND FX excluded in feature extractor.",
  },
  {
    code: "F12",
    episode: "EP_001/002",
    timestamp: "02:18.00",
    observed: "Cross-episode stitching opportunity: Altar cliffhanger in Ep 1 resolves into Ep 2 opening.",
    cause: "Single-episode windowing evaluates screenplays in isolation.",
    rule: "Sequential episodic bridge links end of Episode 1 directly to opening of Episode 2.",
    status: "Architectural proposal; not implemented in core single-episode pipeline.",
  },
];

export const GOLD_SET_BENCHMARK = {
  episodes_evaluated: 7,
  episodes_list: ["EP_012", "EP_020", "EP_028", "EP_035", "EP_041", "EP_046", "EP_050"],
  raw_proposals_generated: 195,
  candidates_suppressed_or_rejected: 174,
  rejection_rate: "89.2%",
  strict_match_rate: "71.4% (5 / 7 episodes IoU >= 0.40)",
  editorial_acceptance_rate: "100.0% (7 / 7 episodes IoU >= 0.20)",
  hard_check_violations: 0,
  spoken_hook_rate: "100.0% (7 / 7 top picks open on spoken dialogue)",
  sentence_fragment_start_rate: "0.0% (0 / 7)",
  rows: [
    { episode: "EP_012", duration: "87.2s", pick_window: "00:12.30–00:52.30", pick_dur: "40.0s", iou: "0.53", result: "MATCH", hook: '"Then someone put it there!"', cliffhanger: '"My emerald signet ring fell deep into the frozen blackthorn..."' },
    { episode: "EP_020", duration: "114.8s", pick_window: "00:15.40–00:39.10", pick_dur: "23.7s", iou: "0.88", result: "MATCH", hook: '"\'Practically\' is a word for beggars..."', cliffhanger: '"How much longer can the frail thing survive?"' },
    { episode: "EP_028", duration: "138.5s", pick_window: "01:19.00–01:55.80", pick_dur: "36.8s", iou: "0.31", result: "ACCEPTABLE", hook: '"A witch has no need for family heirlooms..."', cliffhanger: '"Do not speak about my husband!"' },
    { episode: "EP_035", duration: "157.5s", pick_window: "00:59.50–01:46.00", pick_dur: "46.5s", iou: "0.30", result: "ACCEPTABLE", hook: '"They told me you died. They told me your entire regiment..."', cliffhanger: '"And you?"' },
    { episode: "EP_041", duration: "96.1s", pick_window: "00:34.80–01:19.30", pick_dur: "44.5s", iou: "0.86", result: "MATCH", hook: '"Not as a bride this time."', cliffhanger: '"Shall we?"' },
    { episode: "EP_046", duration: "143.9s", pick_window: "00:37.30–01:05.50", pick_dur: "28.2s", iou: "0.63", result: "MATCH", hook: '"The church married a vagrant to a ruined lady..."', cliffhanger: '"I won\'t ask it for permission to love."' },
    { episode: "EP_050", duration: "80.0s", pick_window: "00:12.00–00:56.50", pick_dur: "44.5s", iou: "0.84", result: "MATCH", hook: '"Then let\'s stop pretending this was only appetite."', cliffhanger: '"In another room no one uses?"' },
  ],
};
