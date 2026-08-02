import { describe, expect, test } from 'vitest'
import { makeRng, pick, shuffle, weighted } from './rng'

describe('makeRng', () => {
  test('produces an identical sequence for the same seed', () => {
    const a = makeRng(12345)
    const b = makeRng(12345)
    expect([a(), a(), a(), a(), a()]).toEqual([b(), b(), b(), b(), b()])
  })

  test('produces different sequences for different seeds', () => {
    const a = makeRng(1)
    const b = makeRng(2)
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()])
  })

  test('only yields values in [0, 1)', () => {
    const rng = makeRng(99)
    for (let i = 0; i < 10_000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('shuffle', () => {
  test('is deterministic for the same seed', () => {
    const source = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    expect(shuffle(source, makeRng(7))).toEqual(shuffle(source, makeRng(7)))
  })

  test('does not mutate its input', () => {
    const source = [1, 2, 3, 4, 5]
    shuffle(source, makeRng(7))
    expect(source).toEqual([1, 2, 3, 4, 5])
  })

  test('keeps every element exactly once', () => {
    const source = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    expect([...shuffle(source, makeRng(42))].sort((a, b) => a - b)).toEqual(source)
  })
})

describe('pick', () => {
  test('always returns an element of the array', () => {
    const rng = makeRng(3)
    const source = ['a', 'b', 'c']
    for (let i = 0; i < 200; i++) {
      expect(source).toContain(pick(source, rng))
    }
  })
})

describe('weighted', () => {
  test('never returns a zero-weight item', () => {
    const rng = makeRng(11)
    const source = ['never', 'always']
    for (let i = 0; i < 500; i++) {
      expect(weighted(source, (s) => (s === 'never' ? 0 : 1), rng)).toBe('always')
    }
  })

  test('favours heavier items roughly in proportion', () => {
    const rng = makeRng(11)
    const source = ['light', 'heavy']
    let heavy = 0
    for (let i = 0; i < 10_000; i++) {
      if (weighted(source, (s) => (s === 'heavy' ? 3 : 1), rng) === 'heavy') heavy++
    }
    // Expect ~7500. Generous band — this asserts the weighting works, not the exact draw.
    expect(heavy).toBeGreaterThan(7200)
    expect(heavy).toBeLessThan(7800)
  })
})
