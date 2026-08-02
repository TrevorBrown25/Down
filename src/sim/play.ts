import { makeRng, type Rng } from '../game/rng'
import { personnelOf, type DeckName, type PlayCard } from '../game/cards'
import {
  callPlay,
  declarePersonnel,
  fieldGoal,
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
  /** False means the loop hit its step guard — a stuck state, and a bug. */
  finished: boolean
}

const MAX_STEPS = 2000

function step(game: Game, policy: Policy, rng: Rng): Game {
  if (game.phase === 'personnel') {
    return declarePersonnel(game, policy.personnel(game, rng), rng)
  }
  if (game.phase === 'result') return nextDown(game, rng)
  if (game.phase === 'call') {
    if (game.down === 4) {
      const choice = policy.fourthDown(game)
      if (choice === 'punt') return punt(game, rng)
      if (choice === 'fg') return fieldGoal(game, rng)
    }
    const legal = game.hand.filter(
      (c): c is PlayCard => c.type === 'play' && personnelOf(c.form) === game.declared,
    )
    if (legal.length === 0) return punt(game, rng)
    return callPlay(game, policy.play(game, legal, rng).id, rng)
  }
  return game
}

function summarize(game: Game, finished: boolean): GameResult {
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
    finished,
  }
}

export function playGame(opts: GameOptions, policy: Policy): GameResult {
  const rng = makeRng(opts.seed)
  let game = newGame(opts, rng)
  let steps = 0
  while (game.phase !== 'over' && steps++ < MAX_STEPS) {
    game = step(game, policy, rng)
  }
  return summarize(game, game.phase === 'over')
}

export type Summary = {
  games: number
  winRate: number
  meanPoints: number
  meanSnaps: number
  yardsPerSnap: number
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

  for (let i = 0; i < games; i++) {
    const r = playGame({ ...opts, seed: firstSeed + i }, policy)
    if (r.won) wins++
    points += r.points
    snaps += r.snaps
    yards += r.yards
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
    events,
  }
}
