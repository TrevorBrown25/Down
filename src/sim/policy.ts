import { pick, type Rng } from '../game/rng'
import {
  COVERAGES,
  OFF_FORMATIONS,
  OFF_PLAYS,
  personnelOf,
  type Coverage,
  type CoverageName,
  type OffFormationName,
  type Personnel,
  type PlayCard,
} from '../game/cards'
import {
  armChip,
  legalPlays,
  playableFormations,
  playAudible,
  playInfoCard,
  type Game,
} from '../game/engine'

/** How much better the freed option must look before spending the audible. */
const AUDIBLE_THRESHOLD = 3

export type FourthDown = 'go' | 'punt' | 'fg'

export type Policy = {
  name: string
  /** Which formation to line up in. Personnel — and their answer — follows. */
  formation: (game: Game, rng: Rng) => OffFormationName
  play: (game: Game, legal: PlayCard[], rng: Rng) => PlayCard
  fourthDown: (game: Game) => FourthDown
  /** Optional: arm chips, buy a read, toss. Runs before the play is chosen. */
  preSnap?: (game: Game, rng: Rng) => Game
  /** Optional: throw the flag on the result that just came in. */
  challenge?: (game: Game) => boolean
}

/** The floor: no thought at all. Anything a real player does should beat this. */
export const randomPolicy: Policy = {
  name: 'random',
  formation: (game, rng) => pick(playableFormations(game), rng),
  play: (_game, legal, rng) => pick(legal, rng),
  fourthDown: () => 'go',
}

/**
 * A competent player who reads the situation but has not scouted the opponent.
 * Deliberately opponent-blind: if this policy already crushes a matchup, the
 * matchup is easy before anyone has discovered a single hidden rule.
 */
export const coachPolicy: Policy = {
  name: 'coach',
  formation: (game, rng) => {
    // Heavy when it is short, spread when it is long — but never into a
    // formation the hand cannot run anything out of.
    const want: Personnel = game.toGo <= 3 ? '21' : game.toGo >= 8 ? '11' : '12'
    const open = playableFormations(game)
    const match = open.filter((f) => personnelOf(f) === want)
    return match.length > 0 ? match[0] : pick(open, rng)
  },
  play: (game, legal) => {
    const score = (card: PlayCard) => {
      const play = OFF_PLAYS[card.play]
      let s = play.base
      if (play.kind === 'pass' && play.pa && game.charge >= 2) s += 8
      if (game.toGo <= 3) s += play.kind === 'run' ? 4 : -3
      if (game.toGo >= 8) s += play.kind === 'pass' ? 4 : -3
      if (play.kind === 'pass' && play.depth >= 3 && game.down <= 2) s -= 2
      return s
    }
    // Stable sort keeps ties in hand order, so the choice stays reproducible.
    return [...legal].sort((a, b) => score(b) - score(a))[0]
  },
  fourthDown: (game) => {
    const fgDist = 100 - game.ballOn + 17
    if (game.toGo <= 2) return 'go'
    if (fgDist <= 45) return 'fg'
    if (game.ballOn < 55) return 'punt'
    return 'go'
  },
}

/**
 * A player who has scouted The Shell and knows the counter: get into a heavy
 * group and pound it inside. Measures whether a deck can execute an answer it
 * has been told, as opposed to whether it stumbles onto one.
 */
export const grinderPolicy: Policy = {
  name: 'grinder',
  formation: (game, rng) => {
    const open = playableFormations(game)
    for (const want of ['21', '12'] as Personnel[]) {
      const match = open.filter((f) => personnelOf(f) === want)
      if (match.length > 0) return match[0]
    }
    return pick(open, rng)
  },
  play: (_game, legal) => {
    const score = (card: PlayCard) => {
      if (card.play === 'Inside Zone' || card.play === 'Power O' || card.play === 'Trap') return 100
      const play = OFF_PLAYS[card.play]
      return play.base + (play.kind === 'run' ? 5 : 0)
    }
    return [...legal].sort((a, b) => score(b) - score(a))[0]
  },
  fourthDown: () => 'go',
}

/**
 * The coach, except it never surrenders a possession. With only five drives in
 * a game, this exists to measure whether punting and kicking are ever correct.
 */
export const goForItPolicy: Policy = {
  ...coachPolicy,
  name: 'go-for-it',
  fourthDown: () => 'go',
}

/** The coach, plus a sense of when a chip is worth burning. */
export const chipsPolicy: Policy = {
  ...coachPolicy,
  name: 'chips',
  preSnap: (game, rng) => {
    const legal = legalPlays(game)
    if (legal.length === 0) return game
    const intended = OFF_PLAYS[coachPolicy.play(game, legal, rng).play]

    let g = game
    // A pick on a deep shot costs the whole drive, and drives are scarce.
    if (intended.kind === 'pass' && intended.depth >= 3) g = armChip(g, 'protect')
    // Short yardage is a leverage problem: buy a blocker.
    if (intended.kind === 'run' && game.toGo <= 3) g = armChip(g, 'fresh')
    // Late and long — nothing but a chunk play saves this down.
    if (game.down >= 3 && game.toGo >= 8) g = armChip(g, 'juice')
    return g
  },
}

/** What the coverage read resolves to: man, zone, or nothing learned. */
const readManZone = (game: Game): boolean | null => {
  if (game.known === null) return null
  if (game.known === 'man') return true
  if (game.known === 'zone') return false
  const exact = COVERAGES[game.known as CoverageName]
  return exact ? exact.man : null
}

/** The exact coverage, which only Hot Read gives you. */
const readExact = (game: Game) =>
  game.known && game.known in COVERAGES ? COVERAGES[game.known as CoverageName] : null

/** How good a card looks, given whatever is known about the coverage. */
export function scoreAgainst(
  game: Game,
  card: PlayCard,
  man: boolean | null,
  exact: Coverage | null,
): number {
  const play = OFF_PLAYS[card.play]
  let s = play.base
  if (play.kind === 'pass' && play.pa && game.charge >= 2) s += 8
  if (game.toGo <= 3) s += play.kind === 'run' ? 4 : -3
  if (game.toGo >= 8) s += play.kind === 'pass' ? 4 : -3

  if (man === null) {
    // No read — fall back to the coach's blind caution about deep shots.
    if (play.kind === 'pass' && play.depth >= 3 && game.down <= 2) s -= 2
    return s
  }

  if (play.kind === 'pass') {
    // vsMan cuts both ways: quick game feasts on man, play action does not.
    s += (man ? play.vsMan : -play.vsMan) * 4
    // A six-man rush eats anything that needs time.
    if (exact && exact.rush >= 6) s -= play.time * 3
    // Help over the top means the deep shot simply is not there.
    if (exact && exact.deepHelp >= 3) s -= play.depth * 2
  } else if (exact) {
    // Man coverage pulls defenders out of the box.
    s += (exact.man ? 3 : 0) - exact.boxSupport * 2
  }
  return s
}

function pickAgainst(
  game: Game,
  legal: PlayCard[],
  man: boolean,
  exact: Coverage | null,
): PlayCard {
  return [...legal].sort(
    (a, b) => scoreAgainst(game, b, man, exact) - scoreAgainst(game, a, man, exact),
  )[0]
}

/** The coach, plus buying a look at the coverage and actually using it. */
export const informedPolicy: Policy = {
  ...coachPolicy,
  name: 'informed',
  preSnap: (game, rng) => {
    if (game.known !== null) return game
    // Hot Read never lies, so prefer it when both are in hand.
    const read =
      game.hand.find((c) => c.type === 'adj' && c.name === 'Hot Read') ??
      game.hand.find((c) => c.type === 'adj' && c.name === 'Motion')
    return read ? playInfoCard(game, read.id, rng) : game
  },
  play: (game, legal, rng) => {
    const man = readManZone(game)
    if (man === null) return coachPolicy.play(game, legal, rng)
    return pickAgainst(game, legal, man, readExact(game))
  },
}

/**
 * Cheats: reads the coverage straight off the state, paying no card and never
 * being lied to. Separates "is this information worth anything" from "are the
 * info cards priced correctly" — if the oracle cannot beat the coach, the
 * problem is the information, not the price.
 */
export const oraclePolicy: Policy = {
  ...coachPolicy,
  name: 'oracle',
  play: (game, legal, rng) => {
    if (!game.defCov) return coachPolicy.play(game, legal, rng)
    const cov = COVERAGES[game.defCov]
    return pickAgainst(game, legal, cov.man, cov)
  },
}

/**
 * Control for the oracle: same perfect information, used to pick the WORST
 * play available. If this is not clearly worse than the coach, then the scoring
 * function carries no signal and the oracle's result proves nothing.
 */
export const antiOraclePolicy: Policy = {
  ...coachPolicy,
  name: 'anti-oracle',
  play: (game, legal, rng) => {
    if (!game.defCov) return coachPolicy.play(game, legal, rng)
    const cov = COVERAGES[game.defCov]
    const best = pickAgainst(game, legal, cov.man, cov)
    const rest = legal.filter((c) => c.id !== best.id)
    return rest.length ? pickAgainst(game, rest.reverse(), cov.man, cov) : best
  },
}

/**
 * The coach, plus Quick Count. The defense shows a late wrinkle 55% of the
 * time, and out of a heavy formation it is Run Commit (+2 box) 70% of the time
 * — exactly what kills a run. Snapping fast denies it.
 */
export const quickCountPolicy: Policy = {
  ...coachPolicy,
  name: 'quick-count',
  preSnap: (game, rng) => {
    const legal = legalPlays(game)
    if (legal.length === 0) return game
    const intended = coachPolicy.play(game, legal, rng)
    const play = OFF_PLAYS[intended.play]
    // Only worth a card when the adjustment we are denying would have hurt.
    const form = game.formation
    if (play.kind !== 'run' || !form || OFF_FORMATIONS[form].blockers < 7) return game
    return armChip(game, 'quick')
  },
}

/**
 * The full sequence the adjustment cards were designed for: play a quick
 * adjustment to diagnose the coverage, then audible off the personnel you are
 * stuck with if the hand holds a better answer.
 */
export const audiblePolicy: Policy = {
  ...coachPolicy,
  name: 'audible',
  preSnap: (game, rng) => {
    let g = game

    // Quick adjustment first — reads resolve before the audible.
    if (g.known === null) {
      const read =
        g.hand.find((c) => c.type === 'adj' && c.name === 'Hot Read') ??
        g.hand.find((c) => c.type === 'adj' && c.name === 'Motion')
      if (read) g = playInfoCard(g, read.id, rng)
    }

    const card = g.hand.find((c) => c.type === 'adj' && c.name === 'Audible')
    if (!card || g.audibled) return g

    const man = readManZone(g)
    const exact = readExact(g)
    const best = (cards: PlayCard[]) =>
      cards.reduce((hi, c) => Math.max(hi, scoreAgainst(g, c, man, exact)), -Infinity)

    const bound = best(legalPlays(g))
    const freed = best(g.hand.filter((c): c is PlayCard => c.type === 'play'))
    // Only burn the card when the personnel is genuinely holding you back.
    return freed - bound >= AUDIBLE_THRESHOLD ? playAudible(g, card.id, rng) : g
  },
  play: (game, legal, rng) => {
    const man = readManZone(game)
    if (man === null) return coachPolicy.play(game, legal, rng)
    return pickAgainst(game, legal, man, readExact(game))
  },
}

/**
 * Diagnostic, not a strategy: plays the coach's call while also computing what
 * perfect coverage knowledge would have chosen, and tallies how often the two
 * disagree. If they rarely disagree, the situation already determines the call
 * and no amount of information can be worth anything.
 */
export function divergencePolicy(tally: { same: number; diff: number }): Policy {
  return {
    ...coachPolicy,
    name: 'divergence',
    play: (game, legal, rng) => {
      const coachPick = coachPolicy.play(game, legal, rng)
      if (game.defCov && legal.length > 1) {
        const cov = COVERAGES[game.defCov]
        if (pickAgainst(game, legal, cov.man, cov).id === coachPick.id) tally.same++
        else tally.diff++
      }
      return coachPick
    },
  }
}

/** Chips and the flag, but no reads — isolates what a challenge is worth. */
export const chipsFlagPolicy: Policy = {
  ...chipsPolicy,
  name: 'chips+flag',
  challenge: (game) => game.lastSnap?.result.turnover === true,
}

/** Everything at once: chips, reads, and the flag. */
export const veteranPolicy: Policy = {
  ...informedPolicy,
  name: 'veteran',
  preSnap: (game, rng) => {
    const read = informedPolicy.preSnap?.(game, rng) ?? game
    return chipsPolicy.preSnap?.(read, rng) ?? read
  },
  // A turnover ends the drive outright — nothing else is worth a re-roll.
  challenge: (game) => game.lastSnap?.result.turnover === true,
}

export const POLICIES = [
  randomPolicy,
  coachPolicy,
  goForItPolicy,
  grinderPolicy,
  chipsPolicy,
  informedPolicy,
  veteranPolicy,
]
