import { makeRng, pick, shuffle, type Rng } from './rng'
import {
  buildDeck,
  OFF_FORMATIONS,
  OFF_PLAYS,
  PACKAGES,
  personnelOf,
  type Card,
  type CoverageName,
  type DeckName,
  type DefAdjName,
  type DefFormationName,
  type OffFormationName,
  type OffPlayName,
  type PackageName,
  type Personnel,
  type PlayCard,
} from './cards'
import { OPPONENTS, type Opponent } from './opponents'
import { clamp } from './resolve'
import { resolveSnap, type SnapOutcome } from './snap'

export const RULES = {
  target: 17,
  possessions: 5,
  handSize: 6,
  maxCharge: 4,
  maxChips: 5,
} as const

export type Phase = 'personnel' | 'call' | 'result' | 'over'

export type LogEntry =
  | {
      kind: 'snap'
      down: number
      toGo: number
      at: string
      call: string
      def: string
      charge: number
      event: string
      yards: number
    }
  | { kind: 'divider'; text: string }

export type Game = {
  archetype: DeckName
  opponentName: string

  deck: Card[]
  hand: Card[]
  discard: Card[]

  ballOn: number
  down: number
  toGo: number
  points: number
  possessionsUsed: number
  charge: number
  chips: number
  challengeUsed: boolean

  phase: Phase
  won: boolean

  declared: Personnel | null
  defPack: PackageName | null
  defForm: DefFormationName | null
  defCov: CoverageName | null
  defAdj: DefAdjName | null

  groupsInHand: Personnel[]
  tossUsed: boolean
  quickArmed: boolean
  protectArmed: boolean
  juiceArmed: boolean
  freshArmed: boolean

  /** What a Motion or Hot Read card revealed, if anything. */
  known: string | null
  disguised: boolean

  lastSnap: SnapOutcome | null
  lastCall: { form: OffFormationName; play: OffPlayName } | null
  revealed: Record<string, boolean>
  log: LogEntry[]
  notice: string | null
}

const isPlayCard = (c: Card): c is PlayCard => c.type === 'play'
const opponentOf = (game: Game): Opponent => OPPONENTS[game.opponentName]

export const spot = (y: number) =>
  y <= 50 ? `own ${Math.round(y)}` : `opp ${Math.round(100 - y)}`

type Pile = { deck: Card[]; hand: Card[]; discard: Card[] }

function drawTo(target: number, pile: Pile, rng: Rng): Pile {
  let deck = [...pile.deck]
  const hand = [...pile.hand]
  let discard = [...pile.discard]

  while (hand.length < target) {
    if (deck.length === 0) {
      if (discard.length === 0) break
      deck = shuffle(discard, rng)
      discard = []
    }
    const card = deck.shift()
    if (!card) break
    hand.push(card)
  }
  return { deck, hand, discard }
}

export function declarePersonnel(game: Game, pers: Personnel, rng: Rng): Game {
  const opponent = opponentOf(game)
  const pack = opponent.match(pers)
  const spec = PACKAGES[pack]
  return {
    ...game,
    declared: pers,
    defPack: pack,
    defForm: pick(spec.forms, rng),
    // Reads down/toGo off the state it was handed, so it can never lag a snap
    // behind the way the prototype's closure capture did.
    defCov: opponent.pickCoverage(spec.covs, { down: game.down, toGo: game.toGo }, rng),
    phase: 'call',
  }
}

function startDown(game: Game, rng: Rng, fresh: boolean): Game {
  const pile: Pile = fresh
    ? { deck: game.deck, hand: [], discard: [...game.discard, ...game.hand] }
    : { deck: game.deck, hand: game.hand, discard: game.discard }
  const target = fresh ? RULES.handSize : Math.min(RULES.handSize, game.hand.length + 1)

  let drawn = drawTo(target, pile, rng)
  let ballOn = game.ballOn
  let toGo = game.toGo
  let notice: string | null = null

  if (!drawn.hand.some(isPlayCard)) {
    notice = 'Delay of game — no play in hand. Five yards.'
    ballOn = Math.max(1, ballOn - 5)
    toGo = toGo + 5
    drawn = drawTo(
      RULES.handSize,
      { deck: drawn.deck, hand: [], discard: [...drawn.discard, ...drawn.hand] },
      rng,
    )
  }

  const groups = [...new Set(drawn.hand.filter(isPlayCard).map((c) => personnelOf(c.form)))]

  const next: Game = {
    ...game,
    deck: drawn.deck,
    hand: drawn.hand,
    discard: drawn.discard,
    ballOn,
    toGo,
    notice,
    groupsInHand: groups,
    declared: null,
    defPack: null,
    defForm: null,
    defCov: null,
    defAdj: null,
    tossUsed: false,
    quickArmed: false,
    protectArmed: false,
    juiceArmed: false,
    freshArmed: false,
    known: null,
    disguised: false,
    lastSnap: null,
    lastCall: null,
    phase: 'personnel',
  }

  // Only one group on the field means there is no decision to make.
  return groups.length === 1 ? declarePersonnel(next, groups[0], rng) : next
}

export function newGame(
  opts: { seed: number; archetype: DeckName; opponentName: string },
  rng: Rng = makeRng(opts.seed),
): Game {
  const base: Game = {
    archetype: opts.archetype,
    opponentName: opts.opponentName,
    deck: buildDeck(opts.archetype, rng),
    hand: [],
    discard: [],
    ballOn: 25,
    down: 1,
    toGo: 10,
    points: 0,
    possessionsUsed: 0,
    charge: 0,
    chips: 2,
    challengeUsed: false,
    phase: 'personnel',
    won: false,
    declared: null,
    defPack: null,
    defForm: null,
    defCov: null,
    defAdj: null,
    groupsInHand: [],
    tossUsed: false,
    quickArmed: false,
    protectArmed: false,
    juiceArmed: false,
    freshArmed: false,
    known: null,
    disguised: false,
    lastSnap: null,
    lastCall: null,
    revealed: {},
    log: [],
    notice: null,
  }
  return startDown(base, rng, true)
}

/** How often the defense shows a late wrinkle, and which one. */
function pickDefAdj(form: OffFormationName, rng: Rng): DefAdjName | null {
  if (rng() >= 0.55) return null
  const heavy = OFF_FORMATIONS[form].blockers >= 7
  if (heavy) return rng() < 0.7 ? 'Run Commit' : 'Creeper'
  return rng() < 0.7 ? 'Creeper' : 'Bail'
}

export function callPlay(game: Game, cardId: number, rng: Rng): Game {
  const card = game.hand.find((c) => c.id === cardId)
  if (!card || !isPlayCard(card)) return game
  if (!game.defForm || !game.defCov || !game.defPack || !game.declared) return game
  if (personnelOf(card.form) !== game.declared) return game

  let hand = game.hand
  let discard = game.discard

  // Quick Count burns itself to deny the defense its late adjustment.
  let quick = game.quickArmed
  const quickCard = hand.find((c) => c.type === 'adj' && c.name === 'Quick Count')
  if (quick && quickCard) {
    hand = hand.filter((c) => c.id !== quickCard.id)
    discard = [...discard, quickCard]
  } else {
    quick = false
  }

  let chips = game.chips
  const protect = game.protectArmed && chips >= 1
  if (protect) chips -= 1
  const juice = game.juiceArmed && chips >= 2
  if (juice) chips -= 2
  const fresh = game.freshArmed && chips >= 2
  if (fresh) chips -= 2

  const defAdj = quick ? null : pickDefAdj(card.form, rng)

  const outcome = resolveSnap(
    {
      opponent: opponentOf(game),
      formName: card.form,
      playName: card.play,
      defFormName: game.defForm,
      coverageName: game.defCov,
      defAdj,
      charge: game.charge,
      down: game.down,
      possession: game.possessionsUsed + 1,
      ballOn: game.ballOn,
      protect,
      mods: { juice, bonusBlockers: fresh ? 1 : 0 },
    },
    rng,
  )

  const play = OFF_PLAYS[card.play]
  const cashesCharge = play.kind === 'pass' && play.pa === true
  const banksCharge =
    play.kind === 'run' || (play.kind === 'pass' && play.countsAsRun === true)
  const charge = cashesCharge
    ? 0
    : banksCharge
      ? Math.min(RULES.maxCharge, game.charge + 1)
      : game.charge

  const rules = opponentOf(game).rules
  const revealed = { ...game.revealed }
  for (const key of outcome.fired) {
    if (!rules[key]?.visible) revealed[key] = true
  }

  const spent = (protect ? 1 : 0) + (juice ? 2 : 0) + (fresh ? 2 : 0)
  const entry: LogEntry = {
    kind: 'snap',
    down: game.down,
    toGo: game.toGo,
    at: spot(game.ballOn),
    call: `${game.declared} · ${card.form} / ${card.play}`,
    def: `${game.defPack} ${game.defForm} ${game.defCov}${defAdj ? ` +${defAdj}` : ''}${
      quick ? ' (quick)' : ''
    }${spent ? ` [${spent}●]` : ''}`,
    charge: outcome.chargeUsed,
    event: outcome.result.event,
    yards: outcome.result.yards,
  }

  return {
    ...game,
    hand: hand.filter((c) => c.id !== card.id),
    discard: [...discard, card],
    chips,
    charge,
    defAdj,
    revealed,
    lastSnap: outcome,
    lastCall: { form: card.form, play: card.play },
    log: [entry, ...game.log],
    phase: 'result',
  }
}

function endDrive(
  game: Game,
  points: number,
  text: string,
  rng: Rng,
  nextBallOn = 25,
): Game {
  const total = game.points + points
  const possessionsUsed = game.possessionsUsed + 1

  const base: Game = {
    ...game,
    points: total,
    possessionsUsed,
    log: [{ kind: 'divider', text }, ...game.log],
    ballOn: nextBallOn,
    down: 1,
    toGo: 10,
    charge: 0,
  }

  if (total >= RULES.target) return { ...base, phase: 'over', won: true }
  if (possessionsUsed >= RULES.possessions) return { ...base, phase: 'over', won: false }
  return startDown(base, rng, true)
}

export function nextDown(game: Game, rng: Rng): Game {
  const snap = game.lastSnap
  if (!snap) return game
  const { yards, turnover } = snap.result

  if (turnover) return endDrive(game, 0, 'DRIVE ENDS — turnover', rng)

  if (game.ballOn + yards >= 100) {
    const scored = { ...game, chips: Math.min(RULES.maxChips, game.chips + 1) }
    return endDrive(scored, 7, 'DRIVE ENDS — touchdown', rng)
  }

  const ballOn = Math.max(1, game.ballOn + yards)
  const toGo = game.toGo - (ballOn - game.ballOn)

  if (toGo <= 0) {
    return startDown(
      {
        ...game,
        chips: Math.min(RULES.maxChips, game.chips + 1),
        ballOn,
        down: 1,
        toGo: 10,
      },
      rng,
      false,
    )
  }
  if (game.down === 4) return endDrive(game, 0, 'DRIVE ENDS — turnover on downs', rng)

  return startDown({ ...game, ballOn, down: game.down + 1, toGo }, rng, false)
}

export function punt(game: Game, rng: Rng): Game {
  const next = Math.round(clamp(25 + (game.ballOn - 25) * 0.55, 25, 60))
  return endDrive(game, 0, `PUNT — next drive starts at ${spot(next)}`, rng, next)
}

export function fieldGoal(game: Game, rng: Rng): Game {
  const dist = 100 - game.ballOn + 17
  const made = rng() < clamp(1.05 - 0.015 * dist, 0.05, 0.98)
  return endDrive(game, made ? 3 : 0, `${dist}-yard FG — ${made ? 'GOOD' : 'NO GOOD'}`, rng)
}
