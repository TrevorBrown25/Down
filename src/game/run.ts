import { makeRng, pick, shuffle, type Rng } from './rng'
import {
  ADJ_TEXT,
  canRun,
  OFF_FORMATIONS,
  OFF_PLAYS,
  starterDeck,
  type AdjustmentName,
  type Card,
  type OffFormationName,
  type OffPlayName,
  type StyleName,
} from './cards'
import { opponentsByTier } from './opponents'
import { newGame, type Game } from './engine'

export const SEASON = {
  games: 8,
  /** Absorb two and you are still alive. The third ends it: 6-2 or bust. */
  lossesAllowed: 2,
  draftSize: 3,
  /** Cutting below this would starve the hand. */
  minDeck: 12,
} as const

export type ScheduleNode = {
  week: number
  opponentName: string
  /** How many hidden rules this opponent brings. Climbs through the season. */
  tier: number
}

export type RunStatus = 'playing' | 'complete' | 'eliminated'

export type DraftOffer = {
  cards: Card[]
  /** Whether this stop also lets you cut a card. */
  mayRemove: boolean
}

export type GameRecord = {
  week: number
  opponentName: string
  won: boolean
  points: number
}

export type Run = {
  style: StyleName
  seed: number
  /** The cards you own. Games are dealt from a shuffle of this. */
  deck: Card[]
  schedule: ScheduleNode[]
  /** Index of the week about to be played. */
  at: number
  wins: number
  losses: number
  status: RunStatus
  pending: DraftOffer | null
  history: GameRecord[]
  /** Keeps drafted cards from colliding with the starter's ids. */
  nextCardId: number
}

/**
 * Difficulty is expressed as how many hidden rules an opponent runs, so a late
 * season game has more to discover rather than just bigger numbers.
 */
function tierFor(week: number): number {
  if (week <= 2) return 1
  if (week <= 5) return 2
  return 3
}

function buildSchedule(rng: Rng): ScheduleNode[] {
  const nodes: ScheduleNode[] = []
  // Each tier has its own pool, drawn without replacement so a season shows you
  // as many different teams as the roster allows before it repeats anyone.
  const pools = new Map<number, string[]>()
  let last = ''

  for (let week = 1; week <= SEASON.games; week++) {
    const tier = tierFor(week)
    let pool = pools.get(tier) ?? []
    if (pool.length === 0) pool = shuffle(opponentsByTier(tier), rng)

    let i = 0
    if (pool.length > 1 && pool[0] === last) i = 1
    const name = pool[i] ?? pool[0]
    pools.set(
      tier,
      pool.filter((_, j) => j !== i),
    )
    last = name
    nodes.push({ week, opponentName: name, tier })
  }
  return nodes
}

export function newRun(style: StyleName, seed: number): Run {
  const rng = makeRng(seed)
  const deck = starterDeck(style)
  return {
    style,
    seed,
    deck,
    schedule: buildSchedule(rng),
    at: 0,
    wins: 0,
    losses: 0,
    status: 'playing',
    pending: null,
    history: [],
    nextCardId: deck.length,
  }
}

export const currentNode = (run: Run): ScheduleNode | null => run.schedule[run.at] ?? null

/** Deal a game from the run's own deck against this week's opponent. */
export function startGame(run: Run, rng: Rng): Game {
  if (run.status !== 'playing') {
    throw new Error(`cannot start a game on a run that is ${run.status}`)
  }
  const node = currentNode(run)
  if (!node) throw new Error('the schedule is finished')

  return newGame(
    {
      seed: run.seed + node.week,
      archetype: run.style,
      opponentName: node.opponentName,
      deck: run.deck,
    },
    rng,
  )
}

/* ------------------------------- the draft ------------------------------- */

const FORMATIONS = Object.keys(OFF_FORMATIONS) as OffFormationName[]
const PLAYS = Object.keys(OFF_PLAYS) as OffPlayName[]
const ADJUSTMENTS = Object.keys(ADJ_TEXT) as AdjustmentName[]

/**
 * Everything you might be offered. For now this is the existing plays in every
 * formation plus the four adjustments; authored play types land here next and
 * nothing else has to change.
 */
export function draftPool(): {
  plays: [OffFormationName, OffPlayName][]
  adjustments: AdjustmentName[]
} {
  const plays: [OffFormationName, OffPlayName][] = []
  for (const form of FORMATIONS) {
    // Only combinations a real offense could line up and run.
    for (const play of PLAYS) if (canRun(form, play)) plays.push([form, play])
  }
  return { plays, adjustments: ADJUSTMENTS }
}

function offer(run: Run, rng: Rng): { offer: DraftOffer; nextCardId: number } {
  const pool = draftPool()
  const cards: Card[] = []
  let id = run.nextCardId

  while (cards.length < SEASON.draftSize) {
    // Adjustments are rarer than plays — roughly one offer in five.
    const card: Card =
      rng() < 0.2
        ? { id, type: 'adj', name: pick(pool.adjustments, rng) }
        : (() => {
            const [form, play] = pick(pool.plays, rng)
            return { id, type: 'play', form, play } as Card
          })()

    const already = cards.some((c) =>
      c.type === 'play' && card.type === 'play'
        ? c.form === card.form && c.play === card.play
        : c.type === 'adj' && card.type === 'adj' && c.name === card.name,
    )
    if (already) continue

    cards.push(card)
    id++
  }

  // Every other week you may also cut instead of adding.
  return { offer: { cards, mayRemove: run.at % 2 === 1 }, nextCardId: id }
}

/* ------------------------------ the season ------------------------------- */

export function finishGame(run: Run, game: Game, rng: Rng): Run {
  if (run.status !== 'playing') return run
  const node = currentNode(run)
  if (!node) return run

  const wins = run.wins + (game.won ? 1 : 0)
  const losses = run.losses + (game.won ? 0 : 1)
  const at = run.at + 1

  const advanced: Run = {
    ...run,
    wins,
    losses,
    at,
    history: [
      ...run.history,
      { week: node.week, opponentName: node.opponentName, won: game.won, points: game.points },
    ],
  }

  // One loss past the allowance ends the season on the spot.
  if (losses > SEASON.lossesAllowed) return { ...advanced, status: 'eliminated', pending: null }
  if (at >= SEASON.games) return { ...advanced, status: 'complete', pending: null }

  const { offer: pending, nextCardId } = offer(advanced, rng)
  return { ...advanced, pending, nextCardId }
}

export function takeCard(run: Run, cardId: number): Run {
  const card = run.pending?.cards.find((c) => c.id === cardId)
  if (!card) return run
  return { ...run, deck: [...run.deck, card], pending: null }
}

export function skipDraft(run: Run): Run {
  if (!run.pending) return run
  return { ...run, pending: null }
}

export function removeCard(run: Run, cardId: number): Run {
  if (run.deck.length <= SEASON.minDeck) return run
  if (!run.deck.some((c) => c.id === cardId)) return run
  return { ...run, deck: run.deck.filter((c) => c.id !== cardId) }
}

/** Shuffled view of the deck, for showing the player what they own. */
export const deckPreview = (run: Run, rng: Rng): Card[] => shuffle(run.deck, rng)

export const seasonRecord = (run: Run) => `${run.wins}-${run.losses}`
