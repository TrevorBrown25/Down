import { makeRng, type Rng } from '../game/rng'
import { type DeckName } from '../game/cards'
import {
  callPlay,
  challenge,
  declareFormation,
  fieldGoal,
  legalPlays,
  newGame,
  nextDown,
  punt,
  type Game,
} from '../game/engine'
import type { Policy } from './policy'

export type GameOptions = {
  seed: number
  archetype: DeckName
  opponentName: string
}

export type GameResult = {
  won: boolean
  points: number
  possessionsUsed: number
  snaps: number
  yards: number
  events: Record<string, number>
  chipsSpent: number
  reads: number
  challenges: number
  audibles: number
  /** Mean size of the legal-play set at the moment of the call. */
  meanLegal: number
  /** False means the loop hit its step guard — a stuck state, and a bug. */
  finished: boolean
}

const MAX_STEPS = 2000

function step(game: Game, policy: Policy, rng: Rng, tally: Tally): Game {
  if (game.phase === 'personnel') {
    return declareFormation(game, policy.formation(game, rng), rng)
  }
  if (game.phase === 'result') {
    if (!game.challengeUsed && policy.challenge?.(game)) return challenge(game, rng)
    return nextDown(game, rng)
  }
  if (game.phase === 'call') {
    const ready = policy.preSnap?.(game, rng) ?? game
    if (ready.down === 4) {
      const choice = policy.fourthDown(ready)
      if (choice === 'punt') return punt(ready, rng)
      if (choice === 'fg') return fieldGoal(ready, rng)
    }
    const legal = legalPlays(ready)
    if (legal.length === 0) return punt(ready, rng)
    tally.legalSeen += legal.length
    tally.calls++
    return callPlay(ready, policy.play(ready, legal, rng).id, rng)
  }
  return game
}

type Tally = {
  chipsSpent: number
  reads: number
  challenges: number
  audibles: number
  legalSeen: number
  calls: number
}

function summarize(game: Game, finished: boolean, tally: Tally): GameResult {
  const events: Record<string, number> = {}
  let yards = 0
  let snaps = 0
  for (const entry of game.log) {
    if (entry.kind !== 'snap') continue
    snaps++
    yards += entry.yards
    events[entry.event] = (events[entry.event] ?? 0) + 1
  }
  return {
    won: game.won,
    points: game.points,
    possessionsUsed: game.possessionsUsed,
    snaps,
    yards,
    events,
    chipsSpent: tally.chipsSpent,
    reads: tally.reads,
    challenges: tally.challenges,
    audibles: tally.audibles,
    meanLegal: tally.calls ? tally.legalSeen / tally.calls : 0,
    finished,
  }
}

export function playGame(opts: GameOptions, policy: Policy): GameResult {
  const rng = makeRng(opts.seed)
  let game = newGame(opts, rng)
  const tally: Tally = { chipsSpent: 0, reads: 0, challenges: 0, audibles: 0, legalSeen: 0, calls: 0 }
  let steps = 0

  while (game.phase !== 'over' && steps++ < MAX_STEPS) {
    const before = game
    game = step(game, policy, rng, tally)
    // Diff across the step rather than instrumenting the engine for metrics.
    if (game.chips < before.chips) tally.chipsSpent += before.chips - game.chips
    if (game.known !== null && before.known === null) tally.reads++
    if (game.challengeUsed && !before.challengeUsed) tally.challenges++
    if (game.audibled && !before.audibled) tally.audibles++
  }
  return summarize(game, game.phase === 'over', tally)
}

export type Summary = {
  games: number
  winRate: number
  meanPoints: number
  meanSnaps: number
  yardsPerSnap: number
  meanLegal: number
  meanChipsSpent: number
  meanReads: number
  meanAudibles: number
  events: Record<string, number>
}

export function playMany(
  opts: Omit<GameOptions, 'seed'>,
  policy: Policy,
  games: number,
  firstSeed = 1,
): Summary {
  const events: Record<string, number> = {}
  let wins = 0
  let points = 0
  let snaps = 0
  let yards = 0
  let chipsSpent = 0
  let reads = 0
  let audibles = 0
  let legal = 0

  for (let i = 0; i < games; i++) {
    const r = playGame({ ...opts, seed: firstSeed + i }, policy)
    if (r.won) wins++
    points += r.points
    snaps += r.snaps
    yards += r.yards
    chipsSpent += r.chipsSpent
    reads += r.reads
    audibles += r.audibles
    legal += r.meanLegal
    for (const [event, n] of Object.entries(r.events)) {
      events[event] = (events[event] ?? 0) + n
    }
  }

  return {
    games,
    winRate: wins / games,
    meanPoints: points / games,
    meanSnaps: snaps / games,
    yardsPerSnap: snaps ? yards / snaps : 0,
    meanLegal: legal / games,
    meanChipsSpent: chipsSpent / games,
    meanReads: reads / games,
    meanAudibles: audibles / games,
    events,
  }
}
