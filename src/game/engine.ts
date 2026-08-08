import { makeRng, pick, shuffle, type Rng } from './rng'
import {
  buildStarter,
  canRun,
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
import type { GroupTrim } from './events'
import { OPPONENTS, type Opponent } from './opponents'
import { clamp } from './resolve'
import { resolveSnap, type SnapInput, type SnapOutcome } from './snap'

export const RULES = {
  /**
   * Points needed to win, by opponent tier. A better team scores more, so it
   * takes more to beat them — this is the difficulty ramp, and without it every
   * week plays the same regardless of who is across the field.
   *
   * Tuned per tier rather than as a linear step, because the reachable ladder
   * is coarse — in four possessions it is 14 (2 TD), 17 (+FG), 20-21 (3 TD),
   * 24, 28. Values between rungs demand the same drive chart as the rung above,
   * so do not expect fine control from this dial. Measured, not assumed.
   *
   * These scale with `possessions`: cutting a possession without lowering these
   * makes the game literally unwinnable.
   */
  /**
   * What an encounter is, by opponent tier. Early weeks are a single drive:
   * score or you lose. A one-drive game has only three outcomes — touchdown,
   * field goal, nothing — so no points bar can discriminate inside it, and it
   * IS close to a coin flip however well you play. That is deliberate. The
   * season is where skill accumulates, which is why there are many short
   * encounters rather than a few long ones.
   */
  shape: [
    // Three dials, all pointing the same way. A one-drive bar of 7 was
    // touchdown-or-nothing, which only an explosive deck could pass; 3 asks you
    // to move the chains into range instead. And field position is the dial
    // that makes a grinding offense viable at all in one drive — measured, a
    // grind deck's drive dies at the 61, about twelve yards short of a kickable
    // field goal, so an early encounter starts it most of the way there.
    // The points bar is quantised — in two drives the rungs are 3, 6, 7, 10 and
    // nothing between — so field position is the dial that actually tunes.
    { drives: 1, startAt: 50, target: 3 },
    { drives: 2, startAt: 28, target: 7 },
    { drives: 3, startAt: 22, target: 13 },
  ] as readonly { drives: number; startAt: number; target: number }[],
  targets: [13, 17, 21] as readonly number[],
  /**
   * The tier-1 bar, and the default for a one-off game with no season around
   * it. Deliberately left where the fourth-down decision is genuinely close:
   * one point higher and going for it dominates kicking everywhere.
   */
  target: 13,
  possessions: 4,
  /** Where a drive starts when no encounter shape says otherwise. */
  startAt: 25,
  handSize: 6,
  maxCharge: 4,
  maxChips: 5,
} as const

/** How long an encounter with this tier runs, and what beating them takes. */
export const shapeFor = (tier: number) =>
  RULES.shape[tier - 1] ?? RULES.shape[RULES.shape.length - 1]

/** What it takes to win against an opponent of this tier. */
export const targetFor = (tier: number) => shapeFor(tier).target

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
  /** Points needed to win this one. Rises with the opponent's tier. */
  target: number
  /** Drives you get. Early encounters are one — score or lose. */
  possessions: number
  /** Where every drive starts. Field position is a difficulty dial. */
  startAt: number

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

  /** The formation you lined up in. Personnel is implied by it. */
  formation: OffFormationName | null
  declared: Personnel | null
  defPack: PackageName | null
  defForm: DefFormationName | null
  defCov: CoverageName | null
  defAdj: DefAdjName | null

  /** How many plays in hand each formation could actually run. */
  optionsByFormation: Record<OffFormationName, number>
  tossUsed: boolean
  /** An audible frees the call from the personnel that was declared. */
  audibled: boolean
  quickArmed: boolean
  protectArmed: boolean
  juiceArmed: boolean
  freshArmed: boolean

  /** What this down's adjustment card did, for the panel to report. */
  known: string | null

  lastSnap: SnapOutcome | null
  /**
   * Kept so a challenge can re-roll the identical snap. Deliberately excludes
   * the opponent, which carries functions — Game must stay JSON-serializable
   * for save files.
   */
  lastSnapInput: Omit<SnapInput, 'opponent'> | null
  lastCall: { form: OffFormationName; play: OffPlayName } | null
  revealed: Record<string, boolean>
  /** Drives rules that change once they have burned the defense enough times. */
  ruleFireCounts: Record<string, number>
  /** Blocker adjustments per personnel group, carried in from the run. */
  groupTrim: GroupTrim
  log: LogEntry[]
  notice: string | null
}

const isPlayCard = (c: Card): c is PlayCard => c.type === 'play'
const opponentOf = (game: Game): Opponent => OPPONENTS[game.opponentName]

/**
 * What you can actually call. The formation you lined up in decides it — not
 * which card happened to be printed with which formation. An audible frees the
 * call from the formation entirely.
 */
export const legalPlays = (game: Game): PlayCard[] =>
  game.hand.filter(
    (c): c is PlayCard =>
      c.type === 'play' && (game.audibled || (!!game.formation && canRun(game.formation, c.play))),
  )

/**
 * Formations the hand can actually run something out of. Lining up somewhere
 * with nothing to call is a mistake a player is allowed to make, but it should
 * never be the only thing on offer.
 */
export function playableFormations(game: Game): OffFormationName[] {
  const forms = Object.keys(OFF_FORMATIONS) as OffFormationName[]
  const open = forms.filter((f) => (game.optionsByFormation[f] ?? 0) > 0)
  return open.length > 0 ? open : forms
}

/** How many plays in hand each formation unlocks, so the choice is legible. */
export function optionsFor(hand: readonly Card[]): Record<OffFormationName, number> {
  const out = {} as Record<OffFormationName, number>
  for (const form of Object.keys(OFF_FORMATIONS) as OffFormationName[]) {
    out[form] = hand.filter((c) => c.type === 'play' && canRun(form, c.play)).length
  }
  return out
}

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

/** Line up. They see the personnel that implies, and answer it. */
export function declareFormation(game: Game, form: OffFormationName, rng: Rng): Game {
  const pers = personnelOf(form)
  const opponent = opponentOf(game)
  const pack = opponent.match(pers)
  const spec = PACKAGES[pack]
  return {
    ...game,
    formation: form,
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

  const options = optionsFor(drawn.hand)

  const next: Game = {
    ...game,
    deck: drawn.deck,
    hand: drawn.hand,
    discard: drawn.discard,
    ballOn,
    toGo,
    notice,
    optionsByFormation: options,
    formation: null,
    declared: null,
    defPack: null,
    defForm: null,
    defCov: null,
    defAdj: null,
    tossUsed: false,
    audibled: false,
    quickArmed: false,
    protectArmed: false,
    juiceArmed: false,
    freshArmed: false,
    known: null,
    lastSnap: null,
    lastSnapInput: null,
    lastCall: null,
    phase: 'personnel',
  }

  return next
}

export function newGame(
  opts: {
    seed: number
    archetype: DeckName
    opponentName: string
    /** A run owns its deck, so it hands one in rather than building from style. */
    deck?: readonly Card[]
    /** Practice weeks and knocks, carried in from the run. */
    groupTrim?: GroupTrim
    /** Chips beyond the standing allowance, from an event. */
    bonusChips?: number
    /** Opponent rules a scouting week already uncovered. */
    intel?: readonly string[]
    /** Points needed to win. Defaults to the tier-1 bar. */
    target?: number
    /** Drives available. Defaults to the standing rule. */
    possessions?: number
    /** Where drives start. Defaults to the standing rule. */
    startAt?: number
  },
  rng: Rng = makeRng(opts.seed),
): Game {
  const base: Game = {
    archetype: opts.archetype,
    opponentName: opts.opponentName,
    target: opts.target ?? RULES.target,
    possessions: opts.possessions ?? RULES.possessions,
    startAt: opts.startAt ?? RULES.startAt,
    deck: opts.deck ? shuffle(opts.deck, rng) : buildStarter(opts.archetype, rng),
    hand: [],
    discard: [],
    ballOn: opts.startAt ?? RULES.startAt,
    down: 1,
    toGo: 10,
    points: 0,
    possessionsUsed: 0,
    charge: 0,
    chips: 2 + (opts.bonusChips ?? 0),
    challengeUsed: false,
    phase: 'personnel',
    won: false,
    formation: null,
    declared: null,
    defPack: null,
    defForm: null,
    defCov: null,
    defAdj: null,
    optionsByFormation: optionsFor([]),
    tossUsed: false,
    audibled: false,
    quickArmed: false,
    protectArmed: false,
    juiceArmed: false,
    freshArmed: false,
    known: null,
    lastSnap: null,
    lastSnapInput: null,
    lastCall: null,
    revealed: Object.fromEntries((opts.intel ?? []).map((key) => [key, true])),
    ruleFireCounts: {},
    groupTrim: opts.groupTrim ?? {},
    log: [],
    notice: null,
  }
  return startDown(base, rng, true)
}

/** Throw one card back and redraw. Once per down. */
export function toss(game: Game, cardId: number, rng: Rng): Game {
  if (game.tossUsed) return game
  const card = game.hand.find((c) => c.id === cardId)
  if (!card) return game

  // Never let the player strand themselves: the prototype happily let you toss
  // the only play your declared personnel could run, leaving the down unplayable.
  if (game.declared && isPlayCard(card)) {
    const survivors = legalPlays(game).filter((c) => c.id !== cardId)
    if (survivors.length === 0) return game
  }

  const drawn = drawTo(
    game.hand.length,
    {
      deck: game.deck,
      hand: game.hand.filter((c) => c.id !== cardId),
      discard: [...game.discard, card],
    },
    rng,
  )
  return { ...game, ...drawn, tossUsed: true }
}

/** Spend a chip for one extra card, right now. */
export function hurryUp(game: Game, rng: Rng): Game {
  if (game.chips < 1) return game
  const drawn = drawTo(
    game.hand.length + 1,
    { deck: game.deck, hand: game.hand, discard: game.discard },
    rng,
  )
  // Deck and discard both empty — do not charge for a card that never arrives.
  if (drawn.hand.length === game.hand.length) return game
  return { ...game, ...drawn, chips: game.chips - 1 }
}

/** Motion or Hot Read: buy information about the coverage. One read per down. */
/**
 * The coverage is on screen from the moment personnel is declared, so these two
 * no longer buy information — they change the picture instead. A card that only
 * told you what you can already see would be a dead draw.
 */
export function playInfoCard(game: Game, cardId: number, rng: Rng): Game {
  if (game.known !== null || !game.defCov || !game.defPack) return game
  const card = game.hand.find((c) => c.id === cardId)
  if (!card || card.type !== 'adj') return game
  if (card.name !== 'Motion' && card.name !== 'Hot Read') return game

  const spend = (note: string, extra: Partial<Game> = {}): Game => ({
    ...game,
    hand: game.hand.filter((c) => c.id !== cardId),
    discard: [...game.discard, card],
    known: note,
    ...extra,
  })

  if (card.name === 'Hot Read') {
    // Film room: uncover something they were hiding. Refuses rather than
    // wasting itself when there is nothing left to find.
    const rules = opponentOf(game).rules
    const hidden = Object.keys(rules).filter((k) => !rules[k].visible && !game.revealed[k])
    if (hidden.length === 0) return game
    const found = hidden[0]
    return spend(`film — ${rules[found].name}`, { revealed: { ...game.revealed, [found]: true } })
  }

  // Motion: they drop this coverage and show a different one. Always a real
  // change, and never guaranteed to be a better one.
  const pool = PACKAGES[game.defPack].covs.filter((c) => c !== game.defCov)
  if (pool.length === 0) return game
  const shifted = opponentOf(game).pickCoverage(pool, { down: game.down, toGo: game.toGo }, rng)
  return spend(`motion — they rotated to ${shifted}`, { defCov: shifted })
}

/**
 * Change the call at the line. Reads are quick adjustments and resolve first,
 * so motioning to diagnose the coverage and then audibling to beat it both fit
 * inside one down.
 */
export function playAudible(game: Game, cardId: number, rng: Rng): Game {
  if (game.audibled || !game.declared) return game
  const card = game.hand.find((c) => c.id === cardId)
  if (!card || card.type !== 'adj' || card.name !== 'Audible') return game
  void rng
  return {
    ...game,
    hand: game.hand.filter((c) => c.id !== cardId),
    discard: [...game.discard, card],
    audibled: true,
  }
}

export type ChipAbility = 'protect' | 'juice' | 'fresh' | 'quick'

const armedCost = (game: Game) =>
  (game.protectArmed ? 1 : 0) + (game.juiceArmed ? 2 : 0) + (game.freshArmed ? 2 : 0)

const affords = (game: Game, cost: number) => armedCost(game) + cost <= game.chips

/**
 * Toggle a chip ability before the snap. Refuses anything the stack cannot pay
 * for, rather than the prototype's behaviour of arming it and then silently
 * dropping it at the snap.
 */
export function armChip(game: Game, which: ChipAbility): Game {
  switch (which) {
    case 'quick': {
      if (game.quickArmed) return { ...game, quickArmed: false }
      const holding = game.hand.some((c) => c.type === 'adj' && c.name === 'Quick Count')
      return holding ? { ...game, quickArmed: true } : game
    }
    case 'protect':
      if (game.protectArmed) return { ...game, protectArmed: false }
      return affords(game, 1) ? { ...game, protectArmed: true } : game
    case 'juice':
      if (game.juiceArmed) return { ...game, juiceArmed: false }
      return affords(game, 2) ? { ...game, juiceArmed: true } : game
    case 'fresh':
      if (game.freshArmed) return { ...game, freshArmed: false }
      return affords(game, 2) ? { ...game, freshArmed: true } : game
  }
}

/** Throw the flag: re-roll the snap that just happened. Once per game. */
export function challenge(game: Game, rng: Rng): Game {
  const input = game.lastSnapInput
  if (game.challengeUsed || !input) return game

  const outcome = resolveSnap({ opponent: opponentOf(game), ...input }, rng)
  const rules = opponentOf(game).rules
  // The re-roll replaces the snap, so rebuild the fire counts from the pre-snap
  // snapshot the input carries instead of stacking on the original's fires.
  const ruleFireCounts = { ...input.firedCounts }
  const revealed = { ...game.revealed }
  for (const key of outcome.fired) {
    if (!rules[key]?.visible) revealed[key] = true
    ruleFireCounts[key] = (ruleFireCounts[key] ?? 0) + 1
  }

  const sign = outcome.result.yards >= 0 ? '+' : ''
  return {
    ...game,
    challengeUsed: true,
    lastSnap: outcome,
    revealed,
    ruleFireCounts,
    log: [
      {
        kind: 'divider',
        text: `CHALLENGE — rerolled to ${outcome.result.event} ${sign}${outcome.result.yards}`,
      },
      ...game.log,
    ],
  }
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
  if (!game.defForm || !game.defCov || !game.defPack || !game.formation) return game
  // The formation you lined up in is what gates the call, not the card.
  if (!game.audibled && !canRun(game.formation, card.play)) return game
  const form = game.formation

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

  const defAdj = quick ? null : pickDefAdj(form, rng)

  const input: Omit<SnapInput, 'opponent'> = {
    formName: form,
    playName: card.play,
    defFormName: game.defForm,
    coverageName: game.defCov,
    defAdj,
    charge: game.charge,
    down: game.down,
    possession: game.possessionsUsed + 1,
    ballOn: game.ballOn,
    protect,
    mods: { juice, bonusBlockers: fresh ? 1 : 0, vsMan: 0, vsZone: 0 },
    firedCounts: game.ruleFireCounts,
    lastPlayName: game.lastCall?.play ?? null,
    groupTrim: game.groupTrim,
  }
  const outcome = resolveSnap({ opponent: opponentOf(game), ...input }, rng)

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
  const ruleFireCounts = { ...game.ruleFireCounts }
  for (const key of outcome.fired) {
    if (!rules[key]?.visible) revealed[key] = true
    ruleFireCounts[key] = (ruleFireCounts[key] ?? 0) + 1
  }

  const spent = (protect ? 1 : 0) + (juice ? 2 : 0) + (fresh ? 2 : 0)
  const entry: LogEntry = {
    kind: 'snap',
    down: game.down,
    toGo: game.toGo,
    at: spot(game.ballOn),
    call: `${game.declared} · ${form} / ${card.play}`,
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
    ruleFireCounts,
    lastSnap: outcome,
    lastSnapInput: input,
    lastCall: { form, play: card.play },
    log: [entry, ...game.log],
    phase: 'result',
  }
}

function endDrive(
  game: Game,
  points: number,
  text: string,
  rng: Rng,
  nextBallOn?: number,
): Game {
  const total = game.points + points
  const possessionsUsed = game.possessionsUsed + 1

  const base: Game = {
    ...game,
    points: total,
    possessionsUsed,
    log: [{ kind: 'divider', text }, ...game.log],
    ballOn: nextBallOn ?? game.startAt,
    down: 1,
    toGo: 10,
    charge: 0,
  }

  if (total >= game.target) return { ...base, phase: 'over', won: true }
  if (possessionsUsed >= game.possessions) return { ...base, phase: 'over', won: false }
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
  // Roughly real-world: ~95% from 27, ~85% from 35, ~78% from 42, ~68% from 50.
  // The old curve was about half of this, which made kicking strictly wrong.
  const made = rng() < clamp(1.26 - 0.0115 * dist, 0.2, 0.97)
  return endDrive(game, made ? 3 : 0, `${dist}-yard FG — ${made ? 'GOOD' : 'NO GOOD'}`, rng)
}
