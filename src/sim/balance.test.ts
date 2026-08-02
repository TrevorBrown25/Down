import { describe, expect, test } from 'vitest'
import { DECKS, type DeckName } from '../game/cards'
import { OPPONENT_NAMES } from '../game/opponents'
import { playMany, type Summary } from './play'
import { coachPolicy, goForItPolicy, randomPolicy, type Policy } from './policy'

const GAMES = 300
const DECK_NAMES = Object.keys(DECKS) as DeckName[]

type Matrix = Record<string, Record<string, Summary>>

function matrix(policy: Policy): Matrix {
  const out: Matrix = {}
  for (const archetype of DECK_NAMES) {
    out[archetype] = {}
    for (const opponentName of OPPONENT_NAMES) {
      out[archetype][opponentName] = playMany({ archetype, opponentName }, policy, GAMES)
    }
  }
  return out
}

const pct = (n: number) => `${(n * 100).toFixed(0)}%`.padStart(4)
const num = (n: number, d = 1) => n.toFixed(d).padStart(5)

function print(label: string, m: Matrix) {
  const lines = [`\n  ${label} — win rate / mean points, ${GAMES} games per cell`]
  lines.push(`  ${['deck'.padEnd(16), ...OPPONENT_NAMES.map((o) => o.padEnd(16))].join('')}`)
  for (const deck of DECK_NAMES) {
    const cells = OPPONENT_NAMES.map((o) =>
      `${pct(m[deck][o].winRate)} ${num(m[deck][o].meanPoints)}`.padEnd(16),
    )
    lines.push(`  ${deck.padEnd(16)}${cells.join('')}`)
  }
  console.log(lines.join('\n'))
}

/**
 * Where the balance actually sits today, measured — not where it should sit.
 * Every seed is fixed, so these are exact and will not flake. When a tuning
 * change moves them, that is the change working; update the table deliberately.
 *
 * Two of these numbers are the open design problem, not a passing grade:
 * the spread runs from 5% to 89%, so for two of three opponents the game is
 * decided at deck select.
 */
const COACH_WIN_RATE: Record<DeckName, Record<string, number>> = {
  'Ground & Pound': { 'Steel Curtain': 0.37, 'The Shell': 0.33, 'The Gamblers': 0.4 },
  'Pro Style': { 'Steel Curtain': 0.75, 'The Shell': 0.05, 'The Gamblers': 0.62 },
  'Air Raid': { 'Steel Curtain': 0.89, 'The Shell': 0.05, 'The Gamblers': 0.59 },
}

const TOLERANCE = 0.06

describe('balance matrix', () => {
  const random = matrix(randomPolicy)
  const coach = matrix(coachPolicy)
  const goForIt = matrix(goForItPolicy)

  test('prints the current numbers', () => {
    print('random policy   ', random)
    print('coach policy    ', coach)
    print('go-for-it policy', goForIt)

    const rows: string[] = []
    for (const deck of DECK_NAMES) {
      for (const o of OPPONENT_NAMES) {
        const s = coach[deck][o]
        rows.push(
          `  ${deck.padEnd(16)}${o.padEnd(16)}${num(s.yardsPerSnap, 2)} yd/snap  ${num(
            s.meanSnaps,
          )} snaps`,
        )
      }
    }
    console.log(`\n  coach policy — yards per snap\n${rows.join('\n')}`)

    const events: Record<string, number> = {}
    for (const deck of DECK_NAMES) {
      for (const o of OPPONENT_NAMES) {
        for (const [e, n] of Object.entries(coach[deck][o].events)) {
          events[e] = (events[e] ?? 0) + n
        }
      }
    }
    const total = Object.values(events).reduce((a, b) => a + b, 0)
    console.log(
      `\n  coach policy — event mix over ${total} snaps\n` +
        Object.entries(events)
          .sort((a, b) => b[1] - a[1])
          .map(([e, n]) => `  ${e.padEnd(14)}${pct(n / total)}`)
          .join('\n'),
    )
    expect(total).toBeGreaterThan(0)
  })

  test.each(DECK_NAMES)('%s win rates have not drifted', (deck) => {
    for (const o of OPPONENT_NAMES) {
      expect(coach[deck][o].winRate).toBeCloseTo(COACH_WIN_RATE[deck][o], 1)
      expect(Math.abs(coach[deck][o].winRate - COACH_WIN_RATE[deck][o])).toBeLessThan(TOLERANCE)
    }
  })

  // FINDING, not a goal. With five possessions and a field goal that misses
  // from 42 yards more than half the time, surrendering a drive is never worth
  // it. If punt and FG are ever rebalanced into real choices, this flips —
  // and it flipping is the signal that the fix landed.
  test('never giving up a possession beats punting and kicking, everywhere', () => {
    for (const deck of DECK_NAMES) {
      for (const o of OPPONENT_NAMES) {
        expect(goForIt[deck][o].winRate).toBeGreaterThanOrEqual(coach[deck][o].winRate)
      }
    }
  })

  test('every game reaches a real conclusion', () => {
    for (const deck of DECK_NAMES) {
      for (const o of OPPONENT_NAMES) {
        expect(coach[deck][o].meanSnaps).toBeGreaterThan(10)
        expect(coach[deck][o].meanPoints).toBeGreaterThan(0)
      }
    }
  })
})
