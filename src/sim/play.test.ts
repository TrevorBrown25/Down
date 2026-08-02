import { describe, expect, test } from 'vitest'
import { DECKS, type DeckName } from '../game/cards'
import { OPPONENT_NAMES } from '../game/opponents'
import { RULES } from '../game/engine'
import { playGame } from './play'
import { coachPolicy, randomPolicy } from './policy'

const DECK_NAMES = Object.keys(DECKS) as DeckName[]
const MATCHUPS = DECK_NAMES.flatMap((d) => OPPONENT_NAMES.map((o) => [d, o] as const))

describe('playGame', () => {
  test.each(MATCHUPS)('%s vs %s finishes under both policies', (archetype, opponentName) => {
    for (const policy of [randomPolicy, coachPolicy]) {
      for (let seed = 1; seed <= 25; seed++) {
        const r = playGame({ seed, archetype, opponentName }, policy)
        expect(r.finished).toBe(true)
        expect(r.snaps).toBeGreaterThan(0)
      }
    }
  })

  test('a finished game either hit the target or ran out of possessions', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = playGame(
        { seed, archetype: 'Pro Style', opponentName: 'The Shell' },
        coachPolicy,
      )
      if (r.won) expect(r.points).toBeGreaterThanOrEqual(RULES.target)
      else expect(r.possessionsUsed).toBe(RULES.possessions)
    }
  })

  test('is reproducible from its seed', () => {
    const opts = { seed: 4242, archetype: 'Air Raid' as const, opponentName: 'The Gamblers' }
    expect(playGame(opts, coachPolicy)).toEqual(playGame(opts, coachPolicy))
  })

  test('different seeds do not all play out identically', () => {
    const points = new Set(
      Array.from({ length: 50 }, (_, i) =>
        playGame(
          { seed: i + 1, archetype: 'Ground & Pound', opponentName: 'Steel Curtain' },
          coachPolicy,
        ).points,
      ),
    )
    expect(points.size).toBeGreaterThan(1)
  })

  test('counts every snap it logged', () => {
    const r = playGame({ seed: 9, archetype: 'Pro Style', opponentName: 'The Shell' }, coachPolicy)
    const tallied = Object.values(r.events).reduce((a, b) => a + b, 0)
    expect(tallied).toBe(r.snaps)
  })
})
