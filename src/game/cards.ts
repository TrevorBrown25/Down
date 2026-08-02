import { shuffle, type Rng } from './rng'

export type Personnel = '21' | '12' | '11'
export type OffFormationName = 'I-Form' | 'Singleback' | 'Gun 12' | 'Gun 11'
export type OffPlayName =
  | 'Inside Run'
  | 'Outside Run'
  | 'Power O'
  | 'Jumbo'
  | 'Quick Pass'
  | 'Deep Pass'
  | 'Four Verticals'
  | 'TE Leak'
  | 'Play Action'
export type DefFormationName = '3-4' | '4-3' | '4-2-5' | 'Dime'
export type PackageName = 'Base' | 'Nickel' | 'Dime'
export type CoverageName = 'Cover 3' | 'Cover 2' | 'Cover 2 Man' | 'Cover 1 Blitz'
export type DefAdjName = 'Run Commit' | 'Creeper' | 'Bail'
export type AdjustmentName = 'Motion' | 'Hot Read' | 'Quick Count'
export type DeckName = 'Ground & Pound' | 'Pro Style' | 'Air Raid'

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
  noStuffLight?: boolean
  extraBlocker?: number
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
  text: string
}

export type OffPlay = RunPlay | PassPlay

export const OFF_PLAYS: Record<OffPlayName, OffPlay> = {
  'Inside Run': { kind: 'run', base: 4, width: 0, text: 'Safe. Wants a light box.' },
  'Outside Run': { kind: 'run', base: 3, width: 1, text: 'Boom or bust off the edge.' },
  'Power O': {
    kind: 'run',
    base: 5,
    width: 0,
    noStuffLight: true,
    text: "Can't be stuffed vs a light box.",
  },
  Jumbo: {
    kind: 'run',
    base: 4,
    width: 0,
    extraBlocker: 1,
    text: 'Extra blocker on the field.',
  },
  'Quick Pass': {
    kind: 'pass',
    base: 6,
    depth: 1,
    time: 1,
    vsMan: 1,
    text: 'Beats man & blitz. Zone sits on it.',
  },
  'Deep Pass': {
    kind: 'pass',
    base: 14,
    depth: 3,
    time: 3,
    vsMan: 1,
    text: 'Home run. Needs time. INT risk.',
  },
  'Four Verticals': {
    kind: 'pass',
    base: 18,
    depth: 3,
    time: 3,
    vsMan: 1,
    allOrNothing: true,
    text: 'All or nothing. Feasts on base defense.',
  },
  'TE Leak': {
    kind: 'pass',
    base: 8,
    depth: 2,
    time: 2,
    vsMan: 0,
    countsAsRun: true,
    text: 'A pass that builds ◆ like a run.',
  },
  'Play Action': {
    kind: 'pass',
    base: 10,
    depth: 2,
    time: 3,
    vsMan: -1,
    pa: true,
    text: 'Cashes ◆. Needs time.',
  },
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
  deepHelp: number
  man: boolean
}

export const COVERAGES: Record<CoverageName, Coverage> = {
  'Cover 3': { rush: 4, boxSupport: 1, deepHelp: 3, man: false },
  'Cover 2': { rush: 4, boxSupport: 0, deepHelp: 2, man: false },
  'Cover 2 Man': { rush: 4, boxSupport: -1, deepHelp: 2, man: true },
  'Cover 1 Blitz': { rush: 6, boxSupport: 1, deepHelp: 1, man: true },
}

export type DefAdj = {
  boxSupport?: number
  deepHelp?: number
  rush?: number
  cov?: number
}

export const DEF_ADJ: Record<DefAdjName, DefAdj> = {
  'Run Commit': { boxSupport: 2, deepHelp: -1 },
  Creeper: { rush: 1, cov: -1 },
  Bail: { boxSupport: -1, cov: 1 },
}

export const ADJ_TEXT: Record<AdjustmentName, string> = {
  Motion: 'Learn MAN or ZONE. They may disguise.',
  'Hot Read': 'See their exact coverage. No disguise.',
  'Quick Count': 'Snap fast — their adjustment never comes.',
}

const ADJ_LIST: readonly (readonly [AdjustmentName, number])[] = [
  ['Motion', 2],
  ['Hot Read', 1],
  ['Quick Count', 1],
]

export type DeckEntry = readonly [OffFormationName, OffPlayName, number]

export const DECKS: Record<DeckName, { blurb: string; list: readonly DeckEntry[] }> = {
  'Ground & Pound': {
    blurb: 'Run it until they cry, then throw it over their heads.',
    list: [
      ['I-Form', 'Inside Run', 3],
      ['I-Form', 'Power O', 2],
      ['I-Form', 'Jumbo', 2],
      ['I-Form', 'Play Action', 2],
      ['Singleback', 'Inside Run', 2],
      ['Singleback', 'Outside Run', 2],
      ['Singleback', 'Play Action', 1],
      ['Gun 12', 'Outside Run', 2],
      ['Gun 12', 'TE Leak', 1],
      ['Gun 12', 'Quick Pass', 1],
      ['Gun 11', 'Quick Pass', 1],
      ['Gun 11', 'Deep Pass', 1],
    ],
  },
  'Pro Style': {
    blurb: 'A little of everything. Take what they give you.',
    list: [
      ['I-Form', 'Inside Run', 2],
      ['I-Form', 'Power O', 1],
      ['I-Form', 'Play Action', 1],
      ['I-Form', 'Jumbo', 1],
      ['Singleback', 'Inside Run', 2],
      ['Singleback', 'Outside Run', 1],
      ['Singleback', 'Play Action', 1],
      ['Singleback', 'TE Leak', 1],
      ['Gun 12', 'Outside Run', 1],
      ['Gun 12', 'Quick Pass', 2],
      ['Gun 12', 'TE Leak', 1],
      ['Gun 11', 'Quick Pass', 3],
      ['Gun 11', 'Deep Pass', 2],
      ['Gun 11', 'Four Verticals', 1],
    ],
  },
  'Air Raid': {
    blurb: 'Throw it. Then throw it again.',
    list: [
      ['Gun 11', 'Quick Pass', 3],
      ['Gun 11', 'Deep Pass', 2],
      ['Gun 11', 'Four Verticals', 2],
      ['Gun 12', 'Quick Pass', 2],
      ['Gun 12', 'TE Leak', 2],
      ['Gun 12', 'Outside Run', 1],
      ['Singleback', 'TE Leak', 1],
      ['Singleback', 'Play Action', 2],
      ['Singleback', 'Inside Run', 2],
      ['Singleback', 'Outside Run', 1],
      ['I-Form', 'Play Action', 1],
      ['I-Form', 'Inside Run', 1],
    ],
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

export function buildDeck(archetype: DeckName, rng: Rng): Card[] {
  const cards: Card[] = []
  let id = 0
  for (const [form, play, count] of DECKS[archetype].list) {
    for (let i = 0; i < count; i++) cards.push({ id: id++, type: 'play', form, play })
  }
  for (const [name, count] of ADJ_LIST) {
    for (let i = 0; i < count; i++) cards.push({ id: id++, type: 'adj', name })
  }
  return shuffle(cards, rng)
}

export const personnelOf = (form: OffFormationName): Personnel => OFF_FORMATIONS[form].pers
