import { describe, expect, test } from 'vitest'
import { makeRng } from './rng'
import { OFF_PLAYS, personnelOf } from './cards'
import { callPlay, declarePersonnel, newGame, nextDown, punt, type Game } from './engine'

const start = (over: Partial<Parameters<typeof newGame>[0]> = {}) =>
  newGame({ seed: 1, archetype: 'Ground & Pound', opponentName: 'The Gamblers', ...over })

/** Force a snap outcome so advancement can be tested without fighting the dice. */
const withOutcome = (game: Game, yards: number, turnover = false): Game => ({
  ...game,
  phase: 'result',
  lastSnap: {
    result: { yards, event: 'run', ...(turnover ? { turnover: true } : {}) },
    fired: [],
    chargeUsed: 0,
  },
})

describe('newGame', () => {
  test('deals a full hand', () => {
    expect(start().hand).toHaveLength(6)
  })

  test('is fully determined by its seed', () => {
    expect(start({ seed: 77 })).toEqual(start({ seed: 77 }))
  })

  test('starts on 1st and 10 at the 25', () => {
    const g = start()
    expect([g.down, g.toGo, g.ballOn]).toEqual([1, 10, 25])
  })
})

describe('down and distance', () => {
  test('gaining the sticks resets to 1st and 10 and pays a chip', () => {
    const g = start()
    const before = g.chips
    const next = nextDown(withOutcome({ ...g, down: 2, toGo: 7, ballOn: 40 }, 8), makeRng(2))
    expect([next.down, next.toGo, next.ballOn]).toEqual([1, 10, 48])
    expect(next.chips).toBe(before + 1)
  })

  test('coming up short advances the down and shortens the distance', () => {
    const next = nextDown(withOutcome({ ...start(), down: 1, toGo: 10, ballOn: 40 }, 4), makeRng(2))
    expect([next.down, next.toGo, next.ballOn]).toEqual([2, 6, 44])
  })

  test('failing on 4th down ends the drive', () => {
    const g = { ...start(), down: 4, toGo: 5, ballOn: 40 }
    const next = nextDown(withOutcome(g, 2), makeRng(2))
    expect(next.possessionsUsed).toBe(g.possessionsUsed + 1)
    expect(next.ballOn).toBe(25)
    expect(next.down).toBe(1)
  })
})

describe('scoring', () => {
  test('crossing the goal line is worth 7 and ends the drive', () => {
    const g = { ...start(), ballOn: 95, down: 1, toGo: 5 }
    const next = nextDown(withOutcome(g, 10), makeRng(2))
    expect(next.points).toBe(7)
    expect(next.possessionsUsed).toBe(1)
  })

  test('a turnover ends the drive with nothing', () => {
    const g = { ...start(), ballOn: 60 }
    const next = nextDown(withOutcome(g, 0, true), makeRng(2))
    expect(next.points).toBe(0)
    expect(next.possessionsUsed).toBe(1)
  })

  test('hitting the target ends the game as a win', () => {
    const g = { ...start(), ballOn: 95, points: 14, possessionsUsed: 1 }
    const next = nextDown(withOutcome(g, 10), makeRng(2))
    expect(next.phase).toBe('over')
    expect(next.won).toBe(true)
  })

  test('running out of possessions ends the game as a loss', () => {
    const g = { ...start(), possessionsUsed: 4, down: 4, toGo: 20, ballOn: 30 }
    const next = nextDown(withOutcome(g, 1), makeRng(2))
    expect(next.phase).toBe('over')
    expect(next.won).toBe(false)
  })
})

describe('the ◆ charge', () => {
  test('builds on runs and stops at 4', () => {
    const dealt = { ...start(), charge: 3 }
    const run = dealt.hand.find((c) => c.type === 'play' && OFF_PLAYS[c.play].kind === 'run')
    if (!run || run.type !== 'play') throw new Error('expected a run in the opening hand')
    const g = declarePersonnel(dealt, personnelOf(run.form), makeRng(5))
    expect(callPlay(g, run.id, makeRng(5)).charge).toBe(4)
  })

  test('is spent, not banked, by play action', () => {
    const dealt = { ...start({ archetype: 'Pro Style' }), charge: 3 }
    const pa = dealt.hand.find((c) => c.type === 'play' && c.play === 'Play Action')
    if (!pa || pa.type !== 'play') return // not in this deal; covered by snap tests
    const g = declarePersonnel(dealt, personnelOf(pa.form), makeRng(5))
    expect(callPlay(g, pa.id, makeRng(5)).charge).toBe(0)
  })
})

describe('possession changes', () => {
  test('a punt burns a possession and hands over better field position', () => {
    const g = { ...start(), ballOn: 55, down: 4, toGo: 8 }
    const next = punt(g, makeRng(3))
    expect(next.possessionsUsed).toBe(1)
    expect(next.ballOn).toBeGreaterThan(25)
    expect(next.down).toBe(1)
    expect(next.charge).toBe(0)
  })
})

describe('defensive play-calling', () => {
  // Regression for the prototype bug: the defense picked its coverage from the
  // down that had just finished, because declarePersonnel read a stale closure.
  // The Gamblers always blitz on 3rd down, so a converted 3rd down used to carry
  // the blitz into the following 1st down every single time.
  test('reads the down about to be played, not the one just finished', () => {
    const coverages = new Set<string>()
    for (let seed = 1; seed <= 60; seed++) {
      const g = { ...start({ seed }), down: 3, toGo: 3, ballOn: 40 }
      const next = nextDown(withOutcome(g, 9), makeRng(seed))
      expect(next.down).toBe(1)
      const declared =
        next.phase === 'call' ? next : declarePersonnel(next, next.groupsInHand[0], makeRng(seed))
      coverages.add(declared.defCov ?? 'none')
    }
    // With the bug this set is exactly {'Cover 1 Blitz'} on every seed.
    expect(coverages.size).toBeGreaterThan(1)
  })

  test('still blitzes when it actually is 3rd down', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const g = { ...start({ seed }), down: 2, toGo: 8, ballOn: 40 }
      const next = nextDown(withOutcome(g, 1), makeRng(seed))
      expect(next.down).toBe(3)
      const declared =
        next.phase === 'call' ? next : declarePersonnel(next, next.groupsInHand[0], makeRng(seed))
      expect(declared.defCov).toBe('Cover 1 Blitz')
    }
  })
})
