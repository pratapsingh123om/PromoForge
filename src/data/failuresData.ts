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
    observed: "Invented fixture: promo opened on a soft physical reaction rather than spoken dialogue.",
    cause: "Action cues scored higher raw intensity than dialogue.",
    rule: "Current client scorer gives action openings lower weight and raises a soft-hook flag.",
    status: "Mitigated, not re-verified on a user-labelled held-out set.",
  },
  {
    code: "F2",
    episode: "EP_002",
    timestamp: "00:00.00",
    observed: "Invented fixture: a stronger spoken hook immediately before the selected opening was omitted.",
    cause: "Overlapping camera cue caused generator start boundary to skip 0.0s.",
    rule: "Boundary search anchored to dialogue line start (00:00.00).",
    status: "Verified structurally: the 50-file audit found zero invalid boundaries and zero hook-evidence mismatches.",
  },
  {
    code: "F3",
    episode: "EP_002",
    timestamp: "01:47.40",
    observed: "Invented fixture: the ending completed a speech instead of leaving an unresolved question or threat.",
    cause: "Candidate endpoint selected on speech volume rather than unresolved question/threat.",
    rule: "Current client scorer flags endings without a question, interruption, exclamation, or cliffhanger term as a possible fake cliffhanger.",
    status: "Flagged for editor review; semantic resolution detection is still open.",
  },
  {
    code: "F4",
    episode: "EP_002",
    timestamp: "00:34.30–01:19.20",
    observed: "Invented fixture: one cut began mid-reply and a later cut continued the first cut's final sentence.",
    cause: "Generator lacked speech-turn boundary enforcement, allowed sentence fragment starts, and did not check if a promo opens inside the resolution/continuation of an earlier promo.",
    rule: "Implemented 4 rules in promos.py: (1) H6: max 20% overlap; (2) H7: suppress cuts that continue or answer an earlier cliffhanger; (3) Fragment ban (no starting with ... or conjunction); (4) Speech-turn integrity.",
    status: "Verified structurally across all 50 files: zero fragment starts and zero overlap-pair violations in produced shortlists.",
  },
  {
    code: "F5",
    episode: "EP_001/002",
    timestamp: "Global",
    observed: "Flat/default scores: Curiosity was flat (100 or 97.6) and confidence was static across candidate cuts.",
    cause: "Sub-scores were mapped to uniform bucket constants without linguistic variance.",
    rule: "Recalibrated continuous scoring based on sentence structure (interrogative question vs. trailing ellipsis vs. confrontation), tension trajectory, and word punchiness.",
    status: "Fixed in the active demo and exports; scores remain uncalibrated ranking signals, not probabilities.",
  },
  {
    code: "F6",
    episode: "EP_001",
    timestamp: "00:33.80",
    observed: "Invented fixture: a one-word question received too much opening-hook weight.",
    cause: "Scoring treated ? as an opening shock signal.",
    rule: "Separated hook from cliffhanger scoring; ? now drives cliffhanger curiosity, not opening hook.",
    status: "Open: punctuation still contributes a small hook signal in the current rule scorer.",
  },
  {
    code: "F7",
    episode: "EP_001",
    timestamp: "02:13.80",
    observed: "Missed non-dialogue moments: Final defiant close-up was omitted.",
    cause: "Candidate endpoints were originally restricted to dialogue events.",
    rule: "Visual action/camera events re-enabled as valid segment out-points.",
    status: "Partially implemented: action boundaries are supported; camera boundaries are intentionally excluded.",
  },
  {
    code: "F8",
    episode: "EP_001",
    timestamp: "01:14.30",
    observed: "Missed best moments: Event list stopped mid-episode in terminal output.",
    cause: "Terminal display/print truncation during log inspection; parser itself ingested all 47 events through 02:18.00.",
    rule: "Verified that parser reads through full episode runtime without truncation.",
    status: "Verified across 50 files: all parsed successfully, totaling 3,727 events.",
  },
  {
    code: "F9",
    episode: "EP_001/002",
    timestamp: "Global",
    observed: "Invented fixture: the same character appeared under a proper name and a descriptive alias.",
    cause: "Screenplay uses descriptive labels across scenes.",
    rule: "Alias normalization mapping canonicalizes aliases using continuity notes.",
    status: "Partial heuristic only; unresolved labels remain visible and full alias verification is pending.",
  },
  {
    code: "F10",
    episode: "Multi-ep",
    timestamp: "Cross-ep",
    observed: "Missing context for new characters: Character appears without prior role introduction within the clip.",
    cause: "Character appears without prior role introduction within the clip.",
    rule: "Flagged as context_dependency: high to signal human editorial review.",
    status: "Open: no reliable new-character context detector is implemented.",
  },
  {
    code: "F11",
    episode: "EP_001",
    timestamp: "02:15.00",
    observed: "Invented fixture: a SOUND FX description leaked the intended dramatic turn into scoring evidence.",
    cause: "SOUND FX was included in narrative scoring input.",
    rule: "SOUND FX blocks excluded from scoring; only spoken dialogue and physical actions drive candidate selection.",
    status: "Verified in the live no-API prompt; SOUND FX and CAMERA are excluded from scoring evidence.",
  },
  {
    code: "F12",
    episode: "EP_001/002",
    timestamp: "02:18.00",
    observed: "Invented fixture: an episode-ending question resolves in the next episode's opening.",
    cause: "Single-episode windowing evaluates screenplays in isolation.",
    rule: "Sequential episodic bridge links end of Episode 1 directly to opening of Episode 2.",
    status: "Architectural proposal; not implemented in core single-episode pipeline.",
  },
];
