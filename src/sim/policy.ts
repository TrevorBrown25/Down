import { pick, type Rng } from '../game/rng'
import { OFF_PLAYS, type Personnel, type PlayCard } from '../game/cards'
import type { Game } from '../game/engine'

export type FourthDown = 'go' | 'punt' | 'fg'

export type Policy = {
  name: string
  personnel: (game: Game, rng: Rng) => Personnel
  play: (game: Game, legal: PlayCard[], rng: Rng) => PlayCard
  fourthDown: (game: Game) => FourthDown
}

/** The floor: no thought at all. Anything a real player does should beat this. */
export const randomPolicy: Policy = {
  name: 'random',
  personnel: (game, rng) => pick(game.groupsInHand, rng),
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
  personnel: (game, rng) => {
    const want: Personnel = game.toGo <= 3 ? '21' : game.toGo >= 8 ? '11' : '12'
    return game.groupsInHand.includes(want) ? want : pick(game.groupsInHand, rng)
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
 * The coach, except it never surrenders a possession. With only five drives in
 * a game, this exists to measure whether punting and kicking are ever correct.
 */
export const goForItPolicy: Policy = {
  ...coachPolicy,
  name: 'go-for-it',
  fourthDown: () => 'go',
}

export const POLICIES = [randomPolicy, coachPolicy, goForItPolicy]
