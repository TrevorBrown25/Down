import { shuffle, type Rng } from './rng'

export type Personnel = '21' | '12' | '11'
export type OffFormationName = 'I-Form' | 'Singleback' | 'Gun 12' | 'Gun 11'
export type OffPlayName =
  // runs — the grid is gap x box lean
  | 'Power O'
  | 'Inside Zone'
  | 'Outside Zone'
  | 'Counter'
  | 'Trap'
  | 'Toss Sweep'
  // runs — specials
  | 'Jumbo'
  | 'Draw'
  | 'QB Sneak'
  // passes — the grid is depth x coverage lean
  | 'Slant'
  | 'Stick'
  | 'Crosser'
  | 'Dig'
  | 'Fade'
  | 'Four Verticals'
  // passes — specials
  | 'Play Action'
  | 'Screen'
  | 'TE Leak'
  | 'Boot'
  | 'RPO'

export type DefFormationName = '3-4' | '4-3' | '4-2-5' | 'Dime'
export type PackageName = 'Base' | 'Nickel' | 'Dime'
export type CoverageName = 'Cover 3' | 'Cover 2' | 'Cover 2 Man' | 'Cover 1 Blitz'
export type DefAdjName = 'Run Commit' | 'Creeper' | 'Bail'
export type AdjustmentName = 'Motion' | 'Hot Read' | 'Quick Count' | 'Audible'
export type StyleName = 'Ground & Pound' | 'Pro Style' | 'Air Raid'
/** @deprecated alias kept so the sim and UI read naturally. */
export type DeckName = StyleName

export type OffFormation = {
  blockers: number
  /** Receivers split wide. Thins the box maths on runs. */
  spread: number
  pers: Personnel
}

export const OFF_FORMATIONS: Record<OffFormationName, OffFormation> = {
  'I-Form': { blockers: 8, spread: 0, pers: '21' },
  Singleback: { blockers: 7, spread: 1, pers: '12' },
  'Gun 12': { blockers: 7, spread: 2, pers: '12' },
  'Gun 11': { blockers: 6, spread: 3, pers: '11' },
}

export const PERSONNEL: Record<Personnel, { label: string }> = {
  '21': { label: '21 — two backs, heavy' },
  '12': { label: '12 — one back, two TEs' },
  '11': { label: '11 — three wide' },
}

export type RunPlay = {
  kind: 'run'
  base: number
  /** 1 = attacks the edge: higher variance both ways. */
  width: 0 | 1
  /** Only these formations can run it. */
  forms?: readonly OffFormationName[]
  /**
   * Which look the play wants. -1 takes the numbers against a light box;
   * +1 is misdirection that uses a crowded front's own pursuit against it.
   * The run answer to vsMan, and you can read it off the board for free.
   */
  vsBox: -1 | 0 | 1
  noStuffLight?: boolean
  extraBlocker?: number
  /** A quarterback sneak: short, certain, and useless for anything else. */
  sneak?: boolean
  text: string
}

export type PassPlay = {
  kind: 'pass'
  base: number
  depth: number
  /** How long the QB needs. Feeds sack pressure. */
  time: number
  /** Positive = better against man, negative = worse. */
  vsMan: number
  pa?: boolean
  /** A pass that still banks ◆ charge, as if it were a run. */
  countsAsRun?: boolean
  allOrNothing?: boolean
  /** The rush runs past it: pressure becomes the payoff instead of a sack. */
  screen?: boolean
  /** Moving the pocket. Much harder to bring down. */
  bootleg?: boolean
  /** Only these formations can run it. */
  forms?: readonly OffFormationName[]
  text: string
}

export type OffPlay = RunPlay | PassPlay

const HEAVY = ['I-Form', 'Singleback'] as const
const SPREAD = ['Gun 11', 'Gun 12'] as const
const GUN_OR_BACK = ['Singleback', 'Gun 12', 'Gun 11'] as const
const UNDER_CENTRE = ['I-Form', 'Singleback', 'Gun 12'] as const

/**
 * Every play is either on a grid or has a mechanic nothing else has.
 *
 *   runs   gap x box lean — take the numbers, or use their pursuit against them
 *   passes depth x coverage lean — a man beater and a zone beater at each level
 *
 * The grid is what makes a read worth buying: Motion tells you man or zone, so
 * you know which half of the pair to call. Hot Read names the coverage, so you
 * also know whether the rush is coming and where the help is.
 */
export const OFF_PLAYS: Record<OffPlayName, OffPlay> = {
  /* ------------------------- runs: the grid --------------------------- */
  'Power O': {
    kind: 'run',
    base: 5,
    width: 0,
    vsBox: -1,
    noStuffLight: true,
    forms: HEAVY,
    text: 'Pull and lead. Takes the numbers against a light box.',
  },
  'Inside Zone': {
    kind: 'run',
    base: 4,
    width: 0,
    vsBox: -1,
    text: 'Safe. Wants a light box.',
  },
  'Outside Zone': {
    kind: 'run',
    base: 4,
    width: 1,
    vsBox: -1,
    forms: GUN_OR_BACK,
    text: 'Stretch the edge. Boom or bust when they are thin.',
  },
  Counter: {
    kind: 'run',
    base: 5,
    width: 0,
    vsBox: 1,
    forms: UNDER_CENTRE,
    text: 'Misdirection. The heavier the box, the further it goes.',
  },
  Trap: {
    kind: 'run',
    base: 4,
    width: 0,
    vsBox: 1,
    forms: HEAVY,
    text: 'Invite the penetrator, then block him out. Punishes aggression.',
  },
  'Toss Sweep': {
    kind: 'run',
    base: 3,
    width: 1,
    vsBox: 1,
    forms: UNDER_CENTRE,
    text: 'Outruns a crashing front. Dies against a light box.',
  },

  /* ----------------------- runs: the specials ------------------------- */
  Jumbo: {
    kind: 'run',
    base: 4,
    width: 0,
    vsBox: -1,
    extraBlocker: 1,
    forms: ['I-Form'],
    text: 'An extra body on the field. One more blocker than they expect.',
  },
  Draw: {
    kind: 'run',
    base: 5,
    width: 0,
    vsBox: 1,
    forms: SPREAD,
    text: 'Let them rush, then run through where they were.',
  },
  'QB Sneak': {
    kind: 'run',
    base: 2,
    width: 0,
    vsBox: 0,
    sneak: true,
    forms: HEAVY,
    text: 'A yard, near enough guaranteed. Nothing more, ever.',
  },

  /* ------------------------ passes: the grid -------------------------- */
  Slant: {
    kind: 'pass',
    base: 6,
    depth: 1,
    time: 1,
    vsMan: 2,
    text: 'Rub release across leverage. Kills man. Zone sits on it.',
  },
  Stick: {
    kind: 'pass',
    base: 6,
    depth: 1,
    time: 1,
    vsMan: -2,
    text: 'Sits down in the void. Kills zone. Man is all over it.',
  },
  Crosser: {
    kind: 'pass',
    base: 9,
    depth: 2,
    time: 2,
    vsMan: 2,
    forms: GUN_OR_BACK,
    text: 'Runs away from a trailing defender. Wants man.',
  },
  Dig: {
    kind: 'pass',
    base: 9,
    depth: 2,
    time: 2,
    vsMan: -2,
    forms: GUN_OR_BACK,
    text: 'Settles in the hole between the levels. Wants zone.',
  },
  Fade: {
    kind: 'pass',
    base: 15,
    depth: 3,
    time: 3,
    vsMan: 2,
    forms: SPREAD,
    text: 'One-on-one on the boundary. Needs time. INT risk.',
  },
  'Four Verticals': {
    kind: 'pass',
    base: 17,
    depth: 3,
    time: 3,
    vsMan: -2,
    allOrNothing: true,
    forms: SPREAD,
    text: 'Floods the deep zones. All or nothing against a base defense.',
  },

  /* ---------------------- passes: the specials ------------------------ */
  'Play Action': {
    kind: 'pass',
    base: 10,
    depth: 2,
    time: 3,
    vsMan: -1,
    pa: true,
    forms: UNDER_CENTRE,
    text: 'Linebackers bite in zone. Cashes ◆. Needs time.',
  },
  Screen: {
    kind: 'pass',
    base: 4,
    depth: 1,
    time: 1,
    vsMan: 0,
    screen: true,
    text: 'They rush past it. The harder they come, the further it goes.',
  },
  'TE Leak': {
    kind: 'pass',
    base: 8,
    depth: 2,
    time: 2,
    vsMan: -1,
    countsAsRun: true,
    forms: ['Singleback', 'Gun 12'],
    text: 'Sits in the hole in zone. Builds ◆ like a run.',
  },
  Boot: {
    kind: 'pass',
    base: 9,
    depth: 2,
    time: 2,
    vsMan: 1,
    bootleg: true,
    forms: UNDER_CENTRE,
    text: 'Moves the pocket. Very hard to bring down.',
  },
  RPO: {
    kind: 'pass',
    base: 5,
    depth: 1,
    time: 1,
    vsMan: 0,
    countsAsRun: true,
    forms: GUN_OR_BACK,
    text: 'Read it and throw it. Quick, safe, and builds ◆.',
  },
}

/** Whether this formation is allowed to run this play at all. */
export const canRun = (form: OffFormationName, play: OffPlayName): boolean => {
  const forms = OFF_PLAYS[play].forms
  return !forms || forms.includes(form)
}

export type DefFormation = { box: number; rushBonus: number; cov: number }

export const DEF_FORMATIONS: Record<DefFormationName, DefFormation> = {
  '3-4': { box: 7, rushBonus: 1, cov: -1 },
  '4-3': { box: 7, rushBonus: 0, cov: 0 },
  '4-2-5': { box: 6, rushBonus: 0, cov: 1 },
  Dime: { box: 5, rushBonus: -1, cov: 2 },
}

export const PACKAGES: Record<
  PackageName,
  { forms: readonly DefFormationName[]; covs: readonly CoverageName[] }
> = {
  Base: { forms: ['3-4', '4-3'], covs: ['Cover 3', 'Cover 2', 'Cover 1 Blitz'] },
  Nickel: {
    forms: ['4-2-5'],
    covs: ['Cover 3', 'Cover 2', 'Cover 2 Man', 'Cover 1 Blitz'],
  },
  Dime: { forms: ['Dime'], covs: ['Cover 2', 'Cover 2 Man', 'Cover 3'] },
}

export type Coverage = {
  rush: number
  boxSupport: number
  /** Defenders over the top. Polices deep routes. */
  deepHelp: number
  /** Defenders sitting short. Polices the quick game. */
  underneath: number
  man: boolean
}

/**
 * Every coverage buys one thing by selling another, and the hole is what makes
 * it worth reading. Cover 3 stops the run and the bomb and hands you the quick
 * game; Cover 1 Blitz brings pressure and tight man with nothing over the top.
 */
export const COVERAGES: Record<CoverageName, Coverage> = {
  'Cover 3': { rush: 4, boxSupport: 1, deepHelp: 3, underneath: 0, man: false },
  'Cover 2': { rush: 4, boxSupport: 0, deepHelp: 2, underneath: 1, man: false },
  'Cover 2 Man': { rush: 4, boxSupport: -1, deepHelp: 2, underneath: 2, man: true },
  'Cover 1 Blitz': { rush: 6, boxSupport: 1, deepHelp: 1, underneath: 2, man: true },
}

export type DefAdj = {
  boxSupport?: number
  deepHelp?: number
  underneath?: number
  rush?: number
  cov?: number
}

export const DEF_ADJ: Record<DefAdjName, DefAdj> = {
  // Everyone crashes the run, so both levels of coverage thin out.
  'Run Commit': { boxSupport: 2, deepHelp: -1, underneath: -1 },
  Creeper: { rush: 1, cov: -1 },
  // Drop out of the box and sit on the routes.
  Bail: { boxSupport: -1, underneath: 1, cov: 1 },
}

/** Reads are quick adjustments: play one, then still get your audible. */
export const QUICK_ADJUSTMENTS: readonly AdjustmentName[] = ['Motion', 'Hot Read']

export const ADJ_TEXT: Record<AdjustmentName, string> = {
  Motion: 'Learn MAN or ZONE. They may disguise.',
  'Hot Read': 'See their exact coverage. No disguise.',
  'Quick Count': 'Snap fast — their adjustment never comes.',
  Audible: 'Change the call at the line. Any play in your hand, whatever they matched.',
}

export type DeckEntry = readonly [OffFormationName, OffPlayName, number]
export type AdjEntry = readonly [AdjustmentName, number]

/**
 * The nine plays every coach in the league has in the call sheet, spread across
 * all three personnel groups so the declaration is always a real choice.
 */
const CORE_PLAYS: readonly DeckEntry[] = [
  ['I-Form', 'Power O', 1],
  ['I-Form', 'Inside Zone', 1],
  ['Singleback', 'Inside Zone', 1],
  ['Singleback', 'Counter', 1],
  ['Singleback', 'Play Action', 1],
  // One complete man/zone pair in the core, so the concept teaches itself.
  ['Gun 12', 'Slant', 1],
  ['Gun 12', 'Stick', 1],
  ['Gun 11', 'Slant', 1],
  ['Gun 11', 'Fade', 1],
]

/** Hot Read is deliberately NOT here — it never lies, so you draft it. */
const CORE_ADJUSTMENTS: readonly AdjEntry[] = [
  ['Motion', 1],
  ['Quick Count', 1],
  ['Audible', 1],
]

export type Starter = {
  blurb: string
  /** What the four identity cards actually buy you. */
  identity: string
  plays: readonly DeckEntry[]
  adjustments: readonly AdjEntry[]
  /**
   * What this team already does well on day one, as a practice week they never
   * had to spend. This is the per-style difficulty dial: a deck that lives in
   * 11 personnel blocks with six bodies and eats sacks the heavy styles never
   * see, so it starts with something that pays that back.
   */
  camp: { group: Personnel; drill: 'blocking' | 'routes' | 'film' }[]
}

/**
 * Sixteen cards: the twelve-card core plus four that make you someone. Runs
 * grow this deck by drafting, so it starts lean on purpose.
 *
 * Each style concentrates in one personnel group, because the declaration only
 * frees one group at a time — a deck spread evenly across three can never
 * reliably field the one the situation calls for.
 */
export const STARTERS: Record<StyleName, Starter> = {
  'Ground & Pound': {
    blurb: 'Run it until they cry, then throw it over their heads.',
    identity: 'Lives in 21 personnel and banks ◆ faster than anyone.',
    camp: [{ group: '21', drill: 'blocking' }],
    plays: [
      ['I-Form', 'Jumbo', 1],
      ['I-Form', 'Counter', 1],
      ['I-Form', 'Play Action', 1],
      ['I-Form', 'Trap', 1],
    ],
    adjustments: [],
  },
  'Air Raid': {
    blurb: 'Throw it. Then throw it again.',
    identity: 'Lives in 11 personnel and punishes anyone who stays heavy.',
    camp: [
      { group: '11', drill: 'routes' },
      { group: '11', drill: 'blocking' },
      { group: '11', drill: 'film' },
    ],
    plays: [
      ['Gun 11', 'Stick', 1],
      ['Gun 11', 'Four Verticals', 1],
      ['Gun 11', 'Crosser', 1],
      ['Gun 11', 'Screen', 1],
    ],
    adjustments: [],
  },
  'Pro Style': {
    blurb: 'Everything out of one look. Take what they give you.',
    identity: 'Lives in 12 personnel. Your substitutions never tip what is coming.',
    camp: [{ group: '12', drill: 'film' }],
    plays: [
      ['Singleback', 'Outside Zone', 1],
      ['Singleback', 'Dig', 1],
      ['Gun 12', 'Crosser', 1],
      ['Gun 12', 'TE Leak', 1],
    ],
    adjustments: [],
  },
}

export type PlayCard = {
  id: number
  type: 'play'
  form: OffFormationName
  play: OffPlayName
}

export type AdjustmentCard = {
  id: number
  type: 'adj'
  name: AdjustmentName
}

export type Card = PlayCard | AdjustmentCard

/** Assign ids in a stable order, then shuffle. */
export function makeCards(
  plays: readonly DeckEntry[],
  adjustments: readonly AdjEntry[],
  firstId = 0,
): Card[] {
  const cards: Card[] = []
  let id = firstId
  for (const [form, play, count] of plays) {
    for (let i = 0; i < count; i++) cards.push({ id: id++, type: 'play', form, play })
  }
  for (const [name, count] of adjustments) {
    for (let i = 0; i < count; i++) cards.push({ id: id++, type: 'adj', name })
  }
  return cards
}

/** The sixteen cards a run begins with. */
export function starterDeck(style: StyleName): Card[] {
  const s = STARTERS[style]
  return makeCards([...CORE_PLAYS, ...s.plays], [...CORE_ADJUSTMENTS, ...s.adjustments])
}

export function buildStarter(style: StyleName, rng: Rng): Card[] {
  return shuffle(starterDeck(style), rng)
}

export const personnelOf = (form: OffFormationName): Personnel => OFF_FORMATIONS[form].pers
