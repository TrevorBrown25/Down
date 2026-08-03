import { describe, expect, test } from 'vitest'
import { makeRng } from '../game/rng'
import { STARTERS, OFF_PLAYS, PACKAGES, type DeckName, type PlayCard } from '../game/cards'
import { OPPONENTS } from '../game/opponents'

/** These sweeps resolve thousands of snaps per option, so they run a slice of
 * the roster rather than all of it — one opponent from each tier. */
const OPPONENT_NAMES = ['The Sandlot', 'The Foundry', 'The Mirror']
import { NO_MODS } from '../game/resolve'
import { resolveSnap } from '../game/snap'
import {
  callPlay,
  declarePersonnel,
  fieldGoal,
  legalPlays,
  newGame,
  nextDown,
  punt,
  type Game,
} from '../game/engine'
import { coachPolicy } from './policy'

/**
 * How much the play call actually matters, measured with no heuristic in the
 * loop: every legal card is resolved through the real resolver many times and
 * scored on true expected value. This answers the question the win-rate
 * ablations cannot — not "does my scoring function find an edge" but "is there
 * an edge there at all".
 */

const TRIALS = 400
/** A turnover ends the drive outright, so it is worth far more than its yards. */
const TURNOVER_COST = 35

function expectedValue(game: Game, card: PlayCard, salt: number): number {
  if (!game.defForm || !game.defCov) return 0
  let total = 0
  for (let i = 0; i < TRIALS; i++) {
    const { result } = resolveSnap(
      {
        opponent: OPPONENTS[game.opponentName],
        formName: card.form,
        playName: card.play,
        defFormName: game.defForm,
        coverageName: game.defCov,
        defAdj: null,
        charge: game.charge,
        down: game.down,
        possession: game.possessionsUsed + 1,
        ballOn: game.ballOn,
        protect: false,
        mods: NO_MODS,
        firedCounts: game.ruleFireCounts,
        lastPlayName: game.lastCall?.play ?? null,
      },
      makeRng(salt * 7919 + i),
    )
    total += result.turnover ? -TURNOVER_COST : result.yards
  }
  return total / TRIALS
}

type Sample = {
  /** EV of the card the situational heuristic called. */
  coach: number
  /** EV of the genuinely best legal card. */
  best: number
  /** EV of the worst legal card. */
  worst: number
  bestCard: PlayCard
  coachCard: PlayCard
  options: number
}

function collectDecisions(archetype: DeckName, opponentName: string, games: number): Sample[] {
  const samples: Sample[] = []

  for (let seed = 1; seed <= games; seed++) {
    const rng = makeRng(seed)
    let game = newGame({ seed, archetype, opponentName }, rng)
    let steps = 0

    while (game.phase !== 'over' && steps++ < 500) {
      if (game.phase === 'personnel') {
        game = declarePersonnel(game, coachPolicy.personnel(game, rng), rng)
        continue
      }
      if (game.phase === 'result') {
        game = nextDown(game, rng)
        continue
      }
      if (game.down === 4) {
        const choice = coachPolicy.fourthDown(game)
        if (choice === 'punt') {
          game = punt(game, rng)
          continue
        }
        if (choice === 'fg') {
          game = fieldGoal(game, rng)
          continue
        }
      }
      const legal = legalPlays(game)
      if (legal.length === 0) {
        game = punt(game, rng)
        continue
      }

      const pick = coachPolicy.play(game, legal, rng)
      if (legal.length > 1) {
        const scored = legal.map((c) => ({ card: c, ev: expectedValue(game, c, seed + steps) }))
        const sorted = [...scored].sort((a, b) => b.ev - a.ev)
        const mine = scored.find((s) => s.card.id === pick.id)
        if (mine) {
          samples.push({
            coach: mine.ev,
            best: sorted[0].ev,
            worst: sorted[sorted.length - 1].ev,
            bestCard: sorted[0].card,
            coachCard: pick,
            options: legal.length,
          })
        }
      }
      game = callPlay(game, pick.id, rng)
    }
  }
  return samples
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1)
const fmt = (n: number) => n.toFixed(2).padStart(6)

describe('how much the play call matters', () => {
  const DECK_NAMES = Object.keys(STARTERS) as DeckName[]

  test('measures the real headroom above the situational heuristic', () => {
    const all: Sample[] = []
    for (const deck of DECK_NAMES) {
      for (const o of OPPONENT_NAMES) {
        all.push(...collectDecisions(deck, o, 12))
      }
    }

    const headroom = all.map((s) => s.best - s.coach)
    const spread = all.map((s) => s.best - s.worst)
    const missed = all.filter((s) => s.bestCard.id !== s.coachCard.id)

    console.log(
      `\n  ${all.length} real decisions (more than one legal play), ` +
        `${TRIALS} resolver trials per option\n` +
        `\n  spread between best and worst legal call   ${fmt(mean(spread))} yds EV` +
        `\n  headroom the heuristic leaves on the table ${fmt(mean(headroom))} yds EV` +
        `\n  heuristic picked the true best card        ${(
          (100 * (all.length - missed.length)) /
          all.length
        ).toFixed(0)}% of the time` +
        `\n  headroom when it picked wrong             ${fmt(
          mean(missed.map((s) => s.best - s.coach)),
        )} yds EV`,
    )

    // What does the truly-best call swap to, when the heuristic is wrong?
    const swaps: Record<string, number> = {}
    for (const s of missed) {
      const key = `${s.coachCard.play} → ${s.bestCard.play}`
      swaps[key] = (swaps[key] ?? 0) + 1
    }
    console.log(
      `\n  most common corrections\n` +
        Object.entries(swaps)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([k, n]) => `  ${k.padEnd(34)}${((100 * n) / missed.length).toFixed(0)}%`)
          .join('\n'),
    )

    // Does the man/zone axis actually separate the cards? Every pass but one
    // shares the same vsMan value, so a read cannot discriminate between them.
    const byVsMan: Record<string, string[]> = {}
    for (const [name, play] of Object.entries(OFF_PLAYS)) {
      if (play.kind !== 'pass') continue
      const key = String(play.vsMan)
      byVsMan[key] = [...(byVsMan[key] ?? []), name]
    }
    console.log(
      `\n  passes grouped by vsMan — the only number a man/zone read moves\n` +
        Object.entries(byVsMan)
          .map(([v, names]) => `  vsMan ${v.padStart(2)}  ${names.join(', ')}`)
          .join('\n'),
    )

    expect(all.length).toBeGreaterThan(100)
  })
})

/**
 * Does the headroom actually convert into wins? This policy ignores heuristics
 * entirely and picks by simulated expected value, which is the true ceiling for
 * play selection. If it beats the coach, the call has real strategic depth and
 * the adjustment cards simply lack a payload worth reading for.
 */
const EV_TRIALS = 60

function evMaxPick(game: Game, legal: PlayCard[], salt: number): PlayCard {
  let best = legal[0]
  let bestEv = -Infinity
  for (const card of legal) {
    const ev = evWithTrials(game, card, salt, EV_TRIALS)
    if (ev > bestEv) {
      bestEv = ev
      best = card
    }
  }
  return best
}

function evWithTrials(game: Game, card: PlayCard, salt: number, trials: number): number {
  if (!game.defForm || !game.defCov) return 0
  let total = 0
  for (let i = 0; i < trials; i++) {
    const { result } = resolveSnap(
      {
        opponent: OPPONENTS[game.opponentName],
        formName: card.form,
        playName: card.play,
        defFormName: game.defForm,
        coverageName: game.defCov,
        defAdj: null,
        charge: game.charge,
        down: game.down,
        possession: game.possessionsUsed + 1,
        ballOn: game.ballOn,
        protect: false,
        mods: NO_MODS,
        firedCounts: game.ruleFireCounts,
        lastPlayName: game.lastCall?.play ?? null,
      },
      makeRng(salt * 7919 + i * 31),
    )
    total += result.turnover ? -TURNOVER_COST : result.yards
  }
  return total / trials
}

function winRate(archetype: DeckName, opponentName: string, games: number, evMax: boolean) {
  let wins = 0
  for (let seed = 1; seed <= games; seed++) {
    const rng = makeRng(seed)
    let game = newGame({ seed, archetype, opponentName }, rng)
    let steps = 0
    while (game.phase !== 'over' && steps++ < 500) {
      if (game.phase === 'personnel') {
        game = declarePersonnel(game, coachPolicy.personnel(game, rng), rng)
        continue
      }
      if (game.phase === 'result') {
        game = nextDown(game, rng)
        continue
      }
      if (game.down === 4) {
        const c = coachPolicy.fourthDown(game)
        if (c === 'punt') {
          game = punt(game, rng)
          continue
        }
        if (c === 'fg') {
          game = fieldGoal(game, rng)
          continue
        }
      }
      const legal = legalPlays(game)
      if (legal.length === 0) {
        game = punt(game, rng)
        continue
      }
      const pick = evMax
        ? evMaxPick(game, legal, seed + steps)
        : coachPolicy.play(game, legal, rng)
      game = callPlay(game, pick.id, rng)
    }
    if (game.won) wins++
  }
  return wins / games
}

describe('does the headroom convert into wins', () => {
  test('an EV-maximising caller versus the situational heuristic', () => {
    const DECK_NAMES = Object.keys(STARTERS) as DeckName[]
    const GAMES = 60
    const rows: string[] = []
    let deltaSum = 0
    let n = 0

    for (const deck of DECK_NAMES) {
      for (const o of OPPONENT_NAMES) {
        const base = winRate(deck, o, GAMES, false)
        const best = winRate(deck, o, GAMES, true)
        deltaSum += best - base
        n++
        rows.push(
          `  ${deck.padEnd(16)}${o.padEnd(16)}coach ${(base * 100).toFixed(0).padStart(3)}%` +
            `   ev-max ${(best * 100).toFixed(0).padStart(3)}%` +
            `   ${((best - base) * 100 >= 0 ? '+' : '') + ((best - base) * 100).toFixed(0)}pp`,
        )
      }
    }
    console.log(
      `\n  win rate, ${GAMES} games per cell, ${EV_TRIALS} resolver trials per option\n` +
        rows.join('\n') +
        `\n\n  mean gain from perfect play selection  ${((deltaSum / n) * 100).toFixed(1)}pp`,
    )
    expect(n).toBe(9)
  })
})

/**
 * The decisive one. Both callers pick by simulated expected value; the only
 * difference is whether they know the coverage. The blind caller sees the
 * package and formation — which the game already shows you — and averages over
 * the coverages that package actually runs. The gap between them IS the value
 * of a Motion or a Hot Read to a player who cannot be outplayed elsewhere.
 */
function evBlindPick(game: Game, legal: PlayCard[], salt: number): PlayCard {
  if (!game.defPack || !game.defForm) return legal[0]
  const pool = PACKAGES[game.defPack].covs
  const opponent = OPPONENTS[game.opponentName]

  let best = legal[0]
  let bestEv = -Infinity
  for (const card of legal) {
    let total = 0
    for (let i = 0; i < EV_TRIALS; i++) {
      const rng = makeRng(salt * 6271 + i * 17)
      // Marginalise over what they might be in, using their real tendencies.
      const cov = opponent.pickCoverage(pool, { down: game.down, toGo: game.toGo }, rng)
      const { result } = resolveSnap(
        {
          opponent,
          formName: card.form,
          playName: card.play,
          defFormName: game.defForm,
          coverageName: cov,
          defAdj: null,
          charge: game.charge,
          down: game.down,
          possession: game.possessionsUsed + 1,
          ballOn: game.ballOn,
          protect: false,
          mods: NO_MODS,
          firedCounts: game.ruleFireCounts,
        lastPlayName: game.lastCall?.play ?? null,
        },
        rng,
      )
      total += result.turnover ? -TURNOVER_COST : result.yards
    }
    const ev = total / EV_TRIALS
    if (ev > bestEv) {
      bestEv = ev
      best = card
    }
  }
  return best
}

function winRateWith(
  archetype: DeckName,
  opponentName: string,
  games: number,
  pick: (game: Game, legal: PlayCard[], salt: number) => PlayCard,
) {
  let wins = 0
  for (let seed = 1; seed <= games; seed++) {
    const rng = makeRng(seed)
    let game = newGame({ seed, archetype, opponentName }, rng)
    let steps = 0
    while (game.phase !== 'over' && steps++ < 500) {
      if (game.phase === 'personnel') {
        game = declarePersonnel(game, coachPolicy.personnel(game, rng), rng)
        continue
      }
      if (game.phase === 'result') {
        game = nextDown(game, rng)
        continue
      }
      if (game.down === 4) {
        const c = coachPolicy.fourthDown(game)
        if (c === 'punt') {
          game = punt(game, rng)
          continue
        }
        if (c === 'fg') {
          game = fieldGoal(game, rng)
          continue
        }
      }
      const legal = legalPlays(game)
      if (legal.length === 0) {
        game = punt(game, rng)
        continue
      }
      game = callPlay(game, pick(game, legal, seed + steps).id, rng)
    }
    if (game.won) wins++
  }
  return wins / games
}

describe('what a coverage read is worth to a perfect caller', () => {
  test('EV-max knowing the coverage versus EV-max blind to it', () => {
    const DECK_NAMES = Object.keys(STARTERS) as DeckName[]
    const GAMES = 80
    const rows: string[] = []
    let sum = 0
    let n = 0

    for (const deck of DECK_NAMES) {
      for (const o of OPPONENT_NAMES) {
        const blind = winRateWith(deck, o, GAMES, evBlindPick)
        const seeing = winRateWith(deck, o, GAMES, evMaxPick)
        sum += seeing - blind
        n++
        rows.push(
          `  ${deck.padEnd(16)}${o.padEnd(16)}blind ${(blind * 100).toFixed(0).padStart(3)}%` +
            `   knows coverage ${(seeing * 100).toFixed(0).padStart(3)}%` +
            `   ${((seeing - blind) * 100 >= 0 ? '+' : '') + ((seeing - blind) * 100).toFixed(0)}pp`,
        )
      }
    }
    console.log(
      `\n  win rate, ${GAMES} games per cell — both callers maximise expected value\n` +
        rows.join('\n') +
        `\n\n  value of knowing the coverage  ${((sum / n) * 100).toFixed(1)}pp`,
    )
    expect(n).toBe(9)
  })
})
