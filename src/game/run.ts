import { makeRng, pick, shuffle, type Rng } from './rng'
import {
  ADJ_TEXT,
  canRun,
  personnelOf,
  STARTERS,
  OFF_FORMATIONS,
  OFF_PLAYS,
  starterDeck,
  type AdjustmentName,
  type Card,
  type OffFormationName,
  type OffPlayName,
  type Personnel,
  type StyleName,
} from './cards'
import { OPPONENTS, opponentsByTier } from './opponents'
import { newGame, shapeFor, targetFor, type Game } from './engine'
import {
  addInjury,
  addPractice,
  combineTrim,
  nextEvent,
  type GameEvent,
  type GroupTrim,
} from './events'
import { buildShop, ECONOMY, type ShopOffer } from './shop'

export const SEASON = {
  /**
   * Many short encounters rather than a few long ones. A single drive is close
   * to a coin flip whatever you call, so skill has to accumulate across the
   * season instead of inside any one game.
   */
  games: 14,
  /** Absorb two and you are still alive. The third ends it: 6-2 or bust. */
  lossesAllowed: 6,
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
  /**
   * How many cards this stop still lets you cut. Counted rather than a flag —
   * an unbounded "you may cut" lets a player strip the sheet to the floor in
   * one week, which is the strongest thing in the game for free.
   */
  cuts: number
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
  /**
   * The week between games runs event first, then draft: an event can widen the
   * card choice or open a cut, so it has to land before the offer is built.
   */
  pendingEvent: GameEvent | null
  /** Some weeks are a shop instead of a scenario. */
  pendingShop: ShopOffer | null
  pending: DraftOffer | null
  history: GameRecord[]
  /** Keeps drafted cards from colliding with the starter's ids. */
  nextCardId: number

  /** Practice weeks. Persists for the rest of the season, capped per drill. */
  conditioning: GroupTrim
  /** Knocks. Applied to the next game, then cleared. */
  injuries: GroupTrim
  /** Extra ● in the next game only. */
  bonusChips: number
  /** Hidden rules a scouting week uncovered, for the next game only. */
  intel: string[]
  /** Scenarios already used, so a season does not repeat one. */
  seenEvents: string[]
  /**
   * Earned by scoring, win or lose. A game you lost 14-21 still paid for
   * something, which is the difference between a bad week and a dead run.
   */
  coins: number
  /** Cuts bought at the shop, handed to the draft screen that follows. */
  shopCuts: number
}

/**
 * Difficulty is expressed as how many hidden rules an opponent runs, so a late
 * season game has more to discover rather than just bigger numbers.
 */
function tierFor(week: number): number {
  if (week <= 5) return 1
  if (week <= 10) return 2
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
  // Training camp: what this team already does well before week one.
  let camp: GroupTrim = {}
  for (const { group, drill } of STARTERS[style].camp) camp = addPractice(camp, group, drill)

  return {
    style,
    seed,
    deck,
    schedule: buildSchedule(rng),
    at: 0,
    wins: 0,
    losses: 0,
    status: 'playing',
    pendingEvent: null,
    pendingShop: null,
    pending: null,
    history: [],
    nextCardId: deck.length,
    conditioning: camp,
    injuries: {},
    bonusChips: 0,
    intel: [],
    seenEvents: [],
    coins: 0,
    shopCuts: 0,
  }
}

/**
 * The personnel group this sheet leans on: whichever group's formations can run
 * the most of what you own. With formation decoupled from the card, a deck no
 * longer *lives* in a group — it just runs better out of one.
 */
export function homeGroup(run: Run): Personnel {
  const owned: Record<Personnel, number> = { '21': 0, '12': 0, '11': 0 }
  for (const form of Object.keys(OFF_FORMATIONS) as OffFormationName[]) {
    const n = run.deck.filter((c) => c.type === 'play' && canRun(form, c.play)).length
    const g = personnelOf(form)
    owned[g] = Math.max(owned[g], n)
  }
  return (Object.keys(owned) as Personnel[]).reduce((a, b) => (owned[a] >= owned[b] ? a : b))
}

/** A shop week lands on a fixed cadence, so the schedule can be planned around. */
export const isShopWeek = (at: number) => at > 0 && at % 2 === 0

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
      groupTrim: combineTrim(run.conditioning, run.injuries),
      bonusChips: run.bonusChips,
      intel: run.intel,
      target: targetFor(node.tier),
      possessions: shapeFor(node.tier).drives,
    },
    rng,
  )
}

/* ------------------------------- the draft ------------------------------- */

const PLAYS = Object.keys(OFF_PLAYS) as OffPlayName[]
const ADJUSTMENTS = Object.keys(ADJ_TEXT) as AdjustmentName[]

/** Everything you might be offered. */
export function draftPool(): { plays: OffPlayName[]; adjustments: AdjustmentName[] } {
  // Just the plays. Which formation you run one from is a decision at the line,
  // not a property of the card, so the pool is the playbook itself.
  return { plays: [...PLAYS], adjustments: ADJUSTMENTS }
}

function offer(
  run: Run,
  rng: Rng,
  shape: { extra: number; cuts: number } = { extra: 0, cuts: 0 },
): { offer: DraftOffer; nextCardId: number } {
  const pool = draftPool()
  const cards: Card[] = []
  let id = run.nextCardId
  const size = SEASON.draftSize + shape.extra

  while (cards.length < size) {
    // Adjustments are rarer than plays — roughly one offer in five.
    const card: Card =
      rng() < 0.2
        ? { id, type: 'adj', name: pick(pool.adjustments, rng) }
        : { id, type: 'play', play: pick(pool.plays, rng) }

    const already = cards.some((c) =>
      c.type === 'play' && card.type === 'play'
        ? c.play === card.play
        : c.type === 'adj' && card.type === 'adj' && c.name === card.name,
    )
    if (already) continue

    cards.push(card)
    id++
  }

  // A cut is only ever bought by a week. Handing one out free on alternate
  // weeks was giving away the strongest lever in the run, and then selling it
  // back through an event that was already redundant half the time.
  return { offer: { cards, cuts: shape.cuts }, nextCardId: id }
}

/* ------------------------------ the season ------------------------------- */

export function finishGame(run: Run, game: Game, rng: Rng): Run {
  if (run.status !== 'playing') return run
  const node = currentNode(run)
  if (!node) return run

  const wins = run.wins + (game.won ? 1 : 0)
  const losses = run.losses + (game.won ? 0 : 1)
  const at = run.at + 1

  // Every point is a coin, win or lose, plus a flat bump either way. The
  // consolation is what stops a loss from being a dead week.
  const earned =
    game.points * ECONOMY.perPoint + (game.won ? ECONOMY.winBonus : ECONOMY.lossConsolation)

  const advanced: Run = {
    ...run,
    wins,
    losses,
    at,
    coins: run.coins + earned,
    history: [
      ...run.history,
      { week: node.week, opponentName: node.opponentName, won: game.won, points: game.points },
    ],
    // A knock, a chip bump and a scouting report each covered exactly the game
    // that just finished. Conditioning is the only one that carries.
    injuries: {},
    bonusChips: 0,
    intel: [],
  }

  // One loss past the allowance ends the season on the spot.
  if (losses > SEASON.lossesAllowed) {
    return { ...advanced, status: 'eliminated', pending: null, pendingEvent: null, pendingShop: null }
  }
  if (at >= SEASON.games) {
    return { ...advanced, status: 'complete', pending: null, pendingEvent: null, pendingShop: null }
  }

  if (isShopWeek(at)) {
    const { offer: shop, nextCardId } = buildShop(
      homeGroup(advanced),
      draftPool().plays,
      advanced.nextCardId,
      rng,
    )
    return { ...advanced, pendingShop: shop, nextCardId }
  }

  const event = nextEvent(advanced.seenEvents, rng)
  return { ...advanced, pendingEvent: event, seenEvents: [...advanced.seenEvents, event.id] }
}

/* -------------------------------- the shop ------------------------------- */

/** Buy one thing. Everything is one to a customer, and coins have to cover it. */
export function buyItem(run: Run, index: number): Run {
  const shop = run.pendingShop
  if (!shop) return run
  const item = shop.items[index]
  if (!item || shop.sold.includes(index) || run.coins < item.price) return run

  const spent: Run = {
    ...run,
    coins: run.coins - item.price,
    pendingShop: { ...shop, sold: [...shop.sold, index] },
  }

  switch (item.kind) {
    case 'card':
      return { ...spent, deck: [...spent.deck, item.card] }
    case 'drill':
      return { ...spent, conditioning: addPractice(spent.conditioning, item.group, item.drill) }
    case 'chips':
      return { ...spent, bonusChips: spent.bonusChips + item.extra }
    case 'cut':
      // Banked as a cut on the draft that follows, where the sheet is on screen.
      return { ...spent, shopCuts: spent.shopCuts + 1 }
  }
}

/** Done shopping — the draft that follows carries anything the shop bought. */
export function leaveShop(run: Run, rng: Rng): Run {
  if (!run.pendingShop) return run
  const staged: Run = { ...run, pendingShop: null, shopCuts: 0 }
  const { offer: pending, nextCardId } = offer(staged, rng, { extra: 0, cuts: run.shopCuts })
  return { ...staged, pending, nextCardId }
}

/**
 * Take one of the two ways through the week. Effects land immediately, then the
 * draft offer is built in whatever shape they left it.
 */
export function chooseEventOption(run: Run, index: 0 | 1, rng: Rng): Run {
  const event = run.pendingEvent
  if (!event) return run
  const option = event.options[index]
  if (!option) return run

  let conditioning = run.conditioning
  let injuries = run.injuries
  let bonusChips = run.bonusChips
  let intel = run.intel
  const shape = { extra: 0, cuts: 0 }

  for (const effect of option.effects) {
    switch (effect.kind) {
      case 'practice':
        conditioning = addPractice(conditioning, effect.group, effect.drill)
        break
      case 'injury':
        injuries = addInjury(injuries, effect.group, effect.severity ?? 1)
        break
      case 'offers':
        shape.extra += effect.extra
        break
      case 'cut':
        shape.cuts += effect.count ?? 1
        break
      case 'chips':
        bonusChips += effect.extra
        break
      case 'scout': {
        const learned = scoutable(run)
        if (learned) intel = [...intel, learned]
        break
      }
    }
  }

  const staged: Run = { ...run, conditioning, injuries, bonusChips, intel, pendingEvent: null }
  const { offer: pending, nextCardId } = offer(staged, rng, shape)
  return { ...staged, pending, nextCardId }
}

/** A hidden rule of next week's opponent that is not already known. */
function scoutable(run: Run): string | null {
  const node = currentNode(run)
  if (!node) return null
  const rules = OPPONENTS[node.opponentName]?.rules ?? {}
  const hidden = Object.keys(rules).filter((key) => !rules[key].visible && !run.intel.includes(key))
  return hidden[0] ?? null
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
  // Every cut has to be paid for by a week that granted one.
  if (!run.pending || run.pending.cuts <= 0) return run
  if (run.deck.length <= SEASON.minDeck) return run
  if (!run.deck.some((c) => c.id === cardId)) return run
  return {
    ...run,
    deck: run.deck.filter((c) => c.id !== cardId),
    pending: { ...run.pending, cuts: run.pending.cuts - 1 },
  }
}

/** Shuffled view of the deck, for showing the player what they own. */
export const deckPreview = (run: Run, rng: Rng): Card[] => shuffle(run.deck, rng)

export const seasonRecord = (run: Run) => `${run.wins}-${run.losses}`
