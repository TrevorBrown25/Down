import { describe, expect, test } from 'vitest'
import { makeRng } from './rng'
import { OPPONENTS } from './opponents'
import { NO_MODS } from './resolve'
import { resolveSnap, type SnapInput, type SnapOutcome } from './snap'

const BASE: SnapInput = {
  opponent: OPPONENTS['Steel Curtain'],
  formName: 'I-Form',
  playName: 'Inside Run',
  defFormName: '4-3',
  coverageName: 'Cover 3',
  defAdj: null,
  charge: 0,
  down: 1,
  possession: 1,
  ballOn: 25,
  protect: false,
  mods: NO_MODS,
}

/** Run the same snap across many seeds so probabilistic rules are covered. */
function many(overrides: Partial<SnapInput>, n = 500): SnapOutcome[] {
  const out: SnapOutcome[] = []
  for (let seed = 1; seed <= n; seed++) {
    out.push(resolveSnap({ ...BASE, ...overrides }, makeRng(seed)))
  }
  return out
}

describe('Steel Curtain — Iron Front', () => {
  test('caps 1st-down runs at 2 yards', () => {
    for (const { result } of many({ down: 1, playName: 'Inside Run' })) {
      if (result.turnover) continue
      expect(result.yards).toBeLessThanOrEqual(2)
    }
  })

  test('leaves 2nd-down runs alone', () => {
    const outcomes = many({ down: 2, playName: 'Inside Run' })
    expect(outcomes.some((o) => o.result.yards > 2)).toBe(true)
    expect(outcomes.every((o) => !o.fired.includes('ironFront'))).toBe(true)
  })

  test('reports itself as fired when it bites', () => {
    const outcomes = many({ down: 1, playName: 'Inside Run' })
    expect(outcomes.some((o) => o.fired.includes('ironFront'))).toBe(true)
  })
})

describe('Steel Curtain — Gasses Out', () => {
  test('stops capping 1st-down runs from possession 4', () => {
    const outcomes = many({ down: 1, playName: 'Inside Run', possession: 4 })
    expect(outcomes.some((o) => o.result.yards > 2)).toBe(true)
    expect(outcomes.every((o) => !o.fired.includes('ironFront'))).toBe(true)
  })

  test('fires on every snap from possession 4', () => {
    expect(many({ possession: 4 }).every((o) => o.fired.includes('gassed'))).toBe(true)
  })

  test('does not fire before possession 4', () => {
    expect(many({ possession: 3 }).every((o) => !o.fired.includes('gassed'))).toBe(true)
  })
})

describe('Steel Curtain — No Deep Help', () => {
  test('every deep ball that is not a sack or a pick gains at least 18', () => {
    for (const { result } of many({ playName: 'Deep Pass', formName: 'Gun 11' })) {
      if (result.event === 'sack' || result.turnover) continue
      expect(result.yards).toBeGreaterThanOrEqual(18)
    }
  })
})

describe('The Shell — Two-Deep Shell', () => {
  const shell = { opponent: OPPONENTS['The Shell'] }

  test('no deep pass ever gains more than 12', () => {
    for (const { result } of many({
      ...shell,
      playName: 'Deep Pass',
      formName: 'Gun 11',
      defFormName: 'Dime',
      coverageName: 'Cover 2',
    })) {
      expect(result.yards).toBeLessThanOrEqual(12)
    }
  })

  test('inside runs always gain at least 4 unless they are turned over', () => {
    for (const { result } of many({ ...shell, playName: 'Inside Run', down: 2 })) {
      if (result.turnover) continue
      expect(result.yards).toBeGreaterThanOrEqual(4)
    }
  })
})

describe('The Shell — Red-Zone Teeth', () => {
  const shell = { opponent: OPPONENTS['The Shell'] }

  test('never fires outside the red zone', () => {
    expect(many({ ...shell, ballOn: 79, down: 2 }).every((o) => !o.fired.includes('teeth'))).toBe(
      true,
    )
  })

  test('fires sometimes inside the 20', () => {
    expect(many({ ...shell, ballOn: 85, down: 2 }).some((o) => o.fired.includes('teeth'))).toBe(
      true,
    )
  })
})

describe('The Gamblers', () => {
  const gamblers = { opponent: OPPONENTS['The Gamblers'] }

  test('a quick pass into their blitz always gains at least 8', () => {
    // The rule guarantees a yardage floor, not a particular event: a base roll
    // that was already a big play is passed through untouched.
    for (const { result } of many({
      ...gamblers,
      playName: 'Quick Pass',
      formName: 'Gun 11',
      defFormName: '4-2-5',
      coverageName: 'Cover 1 Blitz',
      down: 3,
    })) {
      expect(result.yards).toBeGreaterThanOrEqual(8)
      expect(result.turnover).toBeFalsy()
      expect(['sack', 'incomplete']).not.toContain(result.event)
    }
  })

  test('Jumpy doubles the charge that play action cashes', () => {
    const [outcome] = many(
      {
        ...gamblers,
        playName: 'Play Action',
        formName: 'I-Form',
        charge: 2,
        defFormName: '4-2-5',
        coverageName: 'Cover 2',
      },
      1,
    )
    expect(outcome.chargeUsed).toBe(4)
    expect(outcome.fired).toContain('jumpy')
  })

  test('Jumpy leaves a single charge alone', () => {
    const [outcome] = many(
      { ...gamblers, playName: 'Play Action', formName: 'I-Form', charge: 1 },
      1,
    )
    expect(outcome.chargeUsed).toBe(1)
    expect(outcome.fired).not.toContain('jumpy')
  })

  test('their third-down blitz is not optional', () => {
    const opp = OPPONENTS['The Gamblers']
    for (let seed = 1; seed <= 100; seed++) {
      const cov = opp.pickCoverage(
        ['Cover 3', 'Cover 2', 'Cover 2 Man', 'Cover 1 Blitz'],
        { down: 3, toGo: 10 },
        makeRng(seed),
      )
      expect(cov).toBe('Cover 1 Blitz')
    }
  })
})

describe('charge', () => {
  test('is only spent by play action', () => {
    const [outcome] = many({ playName: 'Inside Run', charge: 3 }, 1)
    expect(outcome.chargeUsed).toBe(0)
  })
})

describe('Max Protect', () => {
  test('converts every sack and turnover into something survivable', () => {
    for (const { result } of many({
      playName: 'Deep Pass',
      formName: 'Gun 11',
      protect: true,
      down: 2,
    })) {
      expect(result.turnover).toBeFalsy()
      expect(result.event).not.toBe('sack')
    }
  })
})

describe('determinism', () => {
  test('the same seed and input always produce the same snap', () => {
    const input: SnapInput = { ...BASE, playName: 'Deep Pass', formName: 'Gun 11' }
    expect(resolveSnap(input, makeRng(4242))).toEqual(resolveSnap(input, makeRng(4242)))
  })
})
