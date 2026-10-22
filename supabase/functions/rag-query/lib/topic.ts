/**
 * Companion topic label (spec UnifyCN/mobile-app#314).
 *
 * Every question gets exactly one topic from a fixed list. rag-query puts it on
 * `$ai_generation` and returns it to the client next to `queryType`, so the
 * dashboards can show what people ask about without ever storing question text.
 *
 * Deterministic keyword scoring, run at the routing step: no extra model call,
 * no added latency, and the label is known before generation starts (the
 * streaming `metadata` event goes out before the first token). Each topic sums
 * the weights of its patterns that match; multi-word phrases weigh 2 so that,
 * e.g., "work permit" (immigration) beats a bare job word. The highest score
 * wins; ties go to the more specific topic (TIE_ORDER). English keywords only:
 * a question with no match falls back to the earlier context (the previous user
 * turns, the lesson title), then to `other`.
 */

export const TOPICS = [
  'immigration',
  'work',
  'housing',
  'money',
  'taxes',
  'health',
  'education',
  'transportation',
  'settling_in',
  'other',
] as const;

export type Topic = (typeof TOPICS)[number];

type ScoredTopic = Exclude<Topic, 'other'>;

/** [pattern, weight]. Patterns run on lowercased text and carry no `g` flag,
 *  so `.test` keeps no state between calls. */
type Rule = readonly [RegExp, number];

const RULES: Record<ScoredTopic, readonly Rule[]> = {
  immigration: [
    [/\bimmigra\w*/, 1],
    [/\bvisas?\b/, 1],
    [/\bpermanent resid\w*/, 2],
    [/\bpr\b/, 1],
    [/\bcitizen(ship)?s?\b/, 1],
    [/\bircc\b/, 1],
    [/\bexpress entry\b/, 2],
    [/\b(study|work) permits?\b/, 2],
    [/\bpgwp\b/, 2],
    [/\blmia\b/, 2],
    [/\brefugee\w*/, 1],
    [/\basylum\b/, 1],
    [/\bsponsor\w*/, 1],
    [/\bpassports?\b/, 1],
    [/\b(crs|copr|trv)\b/, 1],
    [/\bbiometrics?\b/, 1],
    [/\b(provincial nominee|pnp)\b/, 2],
    [/\btemporary resident\w*/, 2],
    [/\bimm[\s-]?\d{4}/, 2],
    [/\bdeport\w*/, 1],
  ],
  work: [
    [/\bjobs?\b/, 1],
    [/\b(find|finding|get|getting|looking for|search for) (a )?(work|job)\b/, 1],
    [/\bwork(ing)? (experience|hours|shifts?)\b/, 2],
    [/\bworkplace\b/, 1],
    [/\b(part|full)[- ]time\b/, 1],
    [/\bemploy\w*/, 1],
    [/\bunemploy\w*/, 1],
    [/\bcareers?\b/, 1],
    [/\bhir(e|ed|ing)\b/, 1],
    [/\bsalar(y|ies)\b/, 1],
    [/\bwages?\b/, 1],
    [/\bminimum wage\b/, 2],
    [/\b(paycheque|paycheck|payslip|pay stub)s?\b/, 1],
    [/\binterviews?\b/, 1],
    [/\br[eé]sum[eé]s?\b/, 1],
    [/\bcv\b/, 1],
    [/\bcover letters?\b/, 2],
    [/\blinkedin\b/, 1],
    [/\boccupation\w*/, 1],
    [/\bco-?workers?\b/, 1],
    [/\bboss\b/, 1],
  ],
  housing: [
    [/\brent(s|al|als|ed|ing)?\b/, 1],
    [/\bapartments?\b/, 1],
    [/\bcondos?\b/, 1],
    [/\blandlords?\b/, 1],
    [/\btenan(t|ts|cy)\b/, 1],
    [/\bleases?\b/, 1],
    [/\bhousing\b/, 1],
    [/\bhouses?\b/, 1],
    [/\broommates?\b/, 1],
    [/\bshelters?\b/, 1],
    [/\bmortgages?\b/, 1],
    [/\bevict\w*/, 1],
    [/\bbasement\b/, 1],
    [/\baccommodation\w*/, 1],
    [/\bsublet\w*/, 1],
    [/\butilit(y|ies)\b/, 1],
    [/\bplace to (live|stay)\b/, 2],
  ],
  money: [
    [/\b(?<!food )banks?\b/, 1],
    [/\bbanking\b/, 1],
    [/\bcredit\b/, 1],
    [/\bdebit\b/, 1],
    [/\bloans?\b/, 1],
    [/\bbudget\w*/, 1],
    [/\bsavings?\b/, 1],
    [/\bmoney\b/, 1],
    [/\bcash\b/, 1],
    [/\bfinanc\w*/, 1],
    [/\binvest\w*/, 1],
    [/\b(tfsa|rrsp|fhsa|resp)s?\b/, 1],
    [/\b(?<!social )insurance\b/, 1],
    [/\bbenefits?\b/, 1],
    [/\bchild benefit\b/, 2],
    [/\bccb\b/, 1],
    [/\be-?transfers?\b/, 1],
    [/\binterac\b/, 1],
    [/\bremittance\w*/, 1],
    [/\bexchange rate\b/, 2],
    [/\bcost of living\b/, 2],
    [/\bafford\w*/, 1],
    [/\bsocial assistance\b/, 2],
    [/\bwelfare\b/, 1],
    [/\bontario works\b/, 2],
  ],
  taxes: [
    [/\btax(es|ed|ing|able|ation)?\b/, 1],
    [/\btax returns?\b/, 2],
    [/\bcra\b/, 1],
    [/\b(gst|hst|pst|qst)\b/, 1],
    [/\bt4[a-z]?\b/, 1],
    [/\bnotice of assessment\b/, 2],
    [/\bnetfile\b/, 1],
    [/\bdeductions?\b/, 1],
  ],
  health: [
    [/\bhealth\w*/, 1],
    [/\bdoctors?\b/, 1],
    [/\bfamily (doctor|physician)s?\b/, 2],
    [/\bhospitals?\b/, 1],
    [/\bclinics?\b/, 1],
    [/\bwalk-?in\b/, 1],
    [/\b(ohip|msp|ramq|ahcip|mcp|ifhp)\b/, 1],
    [/\bdent(al|ist|ists)\b/, 1],
    [/\bmedic(al|ine|ines|ation|ations)\b/, 1],
    [/\bprescriptions?\b/, 1],
    [/\bpharmac(y|ies|ist|ists)\b/, 1],
    [/\bsick\w*/, 1],
    [/\billness\w*/, 1],
    [/\bmental\b/, 1],
    [/\btherap(y|ist|ists)\b/, 1],
    [/\bpsycholog\w*/, 1],
    [/\bvaccin\w*/, 1],
    [/\bpregnan\w*/, 1],
    [/\bnurses?\b/, 1],
  ],
  education: [
    [/\bschools?\b/, 1],
    [/\bcolleges?\b/, 1],
    [/\buniversit(y|ies)\b/, 1],
    [/\bstud(y|ies|ying)\b(?! permits?)/, 1],
    [/\bstudents?\b/, 1],
    [/\bstudent loans?\b/, 2],
    [/\bcourses?\b/, 1],
    [/\bclass(es)?\b/, 1],
    [/\b(english|french) (class|classes|course|courses|lessons?)\b/, 2],
    [/\bdegrees?\b/, 1],
    [/\bdiplomas?\b/, 1],
    [/\btuition\b/, 1],
    [/\bcredentials?\b/, 1],
    [/\b(wes|eca)\b/, 1],
    [/\btranscripts?\b/, 1],
    [/\b(esl|linc)\b/, 1],
    [/\b(ielts|celpip|tef|tcf)\b/, 1],
    [/\b(daycare|childcare|child care)\b/, 1],
    [/\bkindergarten\b/, 1],
    [/\benrol(l)?(ment|ling|led|s)?\b/, 1],
    [/\bscholarships?\b/, 1],
    [/\bosap\b/, 1],
  ],
  transportation: [
    [/\btransit\b/, 1],
    [/\bbus(es)?\b/, 1],
    [/\bsubway\b/, 1],
    [/\btrains?\b/, 1],
    [/\bmetro\b/, 1],
    [/\bcars?\b/, 1],
    [/\bdriv(e|es|ing|er|ers)\b/, 1],
    [/\bdriver'?s licen[cs]e\b/, 2],
    [/\blicen[cs]e\b/, 1],
    [/\bcommut\w*/, 1],
    [/\b(presto|opus|compass) card\b/, 2],
    [/\b(uber|lyft|taxi)\b/, 1],
    [/\bflights?\b/, 1],
    [/\bairports?\b/, 1],
    [/\bbik(e|es|ing)\b/, 1],
    [/\bcycling\b/, 1],
    [/\bparking\b/, 1],
    [/\broad test\b/, 2],
    [/\bg[12]\b/, 1],
    [/\btransportation\b/, 1],
  ],
  settling_in: [
    [/\bsin\b/, 1],
    [/\bsocial insurance number\b/, 2],
    [/\b(phone|cell|mobile) (plan|number)s?\b/, 2],
    [/\bsim( card)?\b/, 1],
    [/\bgrocer(y|ies)\b/, 1],
    [/\bwinter\b/, 1],
    [/\bweather\b/, 1],
    [/\bcloth(es|ing)\b/, 1],
    [/\bfood banks?\b/, 2],
    [/\bcultur(e|al)\b/, 1],
    [/\bfriends?\b/, 1],
    [/\bcommunit(y|ies)\b/, 1],
    [/\bsettl(e|ed|ing|ement)\b/, 1],
    [/\barriv(e|al|ing|ed)\b/, 1],
    [/\bfirst (week|weeks|days|month)\b/, 2],
    [/\blibrar(y|ies)\b/, 1],
    [/\bvolunteer\w*/, 1],
    [/\bneighbou?rhoods?\b/, 1],
    [/\bphoto id\b/, 1],
    [/\bcanada post\b/, 2],
    [/\b(mosque|church|temple|gurdwara)s?\b/, 1],
    [/\bhalal\b/, 1],
    [/\b(lonely|loneliness|homesick\w*)\b/, 1],
  ],
};

/** On equal scores the more specific topic wins; the broad `immigration` and
 *  `settling_in` buckets come last. */
const TIE_ORDER: readonly ScoredTopic[] = [
  'taxes',
  'health',
  'education',
  'transportation',
  'housing',
  'money',
  'work',
  'immigration',
  'settling_in',
];

// Long pastes add nothing to the label and only cost regex time.
const MAX_CLASSIFIED_CHARS = 2000;

export function isTopic(value: unknown): value is Topic {
  return (
    typeof value === 'string' && (TOPICS as readonly string[]).includes(value)
  );
}

function classifyText(text: unknown): Topic {
  if (typeof text !== 'string') return 'other';
  const normalized = text
    .slice(0, MAX_CLASSIFIED_CHARS)
    .toLowerCase()
    .replace(/[‘’]/g, "'");
  if (!normalized.trim()) return 'other';

  let best: Topic = 'other';
  let bestScore = 0;
  for (const topic of TIE_ORDER) {
    let score = 0;
    for (const [pattern, weight] of RULES[topic]) {
      if (pattern.test(normalized)) score += weight;
    }
    // Strictly greater: an equal score keeps the earlier (more specific) topic.
    if (score > bestScore) {
      best = topic;
      bestScore = score;
    }
  }
  return best;
}

/**
 * The topic of `prompt`. When the prompt itself names no topic (a follow-up
 * like "How long does that take?"), each `context` string is tried in order
 * and the first one with a topic wins. Pass the most relevant context first.
 */
export function classifyTopic(
  prompt: string,
  context: readonly unknown[] = []
): Topic {
  const direct = classifyText(prompt);
  if (direct !== 'other') return direct;
  for (const text of context) {
    const fromContext = classifyText(text);
    if (fromContext !== 'other') return fromContext;
  }
  return 'other';
}
