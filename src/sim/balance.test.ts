import { describe, expect, test } from 'vitest'
import { DECKS, type DeckName } from '../game/cards'
import { OPPONENT_NAMES } from '../game/opponents'
import { playMany, type Summary } from './play'
import {
  chipsFlagPolicy,
  chipsPolicy,
  coachPolicy,
  goForItPolicy,
  grinderPolicy,
  antiOraclePolicy,
  audiblePolicy,
  divergencePolicy,
  informedPolicy,
  oraclePolicy,
  quickCountPolicy,
  randomPolicy,
  veteranPolicy,
  type Policy,
} from './policy'

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
 * These are the opponent-blind numbers. The Shell reads far worse here than it
 * plays, because its counter has to be learned — see the grinder policy, which
 * lifts Air Raid from 9% to 27% by knowing to get heavy and run it inside.
 */
const COACH_WIN_RATE: Record<DeckName, Record<string, number>> = {
  'Ground & Pound': { 'Steel Curtain': 0.48, 'The Shell': 0.6, 'The Gamblers': 0.49 },
  'Pro Style': { 'Steel Curtain': 0.75, 'The Shell': 0.22, 'The Gamblers': 0.62 },
  'Air Raid': { 'Steel Curtain': 0.74, 'The Shell': 0.23, 'The Gamblers': 0.54 },
}

const TOLERANCE = 0.06

describe('balance matrix', () => {
  const random = matrix(randomPolicy)
  const coach = matrix(coachPolicy)
  const goForIt = matrix(goForItPolicy)
  const grinder = matrix(grinderPolicy)
  const chips = matrix(chipsPolicy)
  const informed = matrix(informedPolicy)
  const veteran = matrix(veteranPolicy)
  const oracle = matrix(oraclePolicy)
  const chipsFlag = matrix(chipsFlagPolicy)
  const antiOracle = matrix(antiOraclePolicy)
  const quickCount = matrix(quickCountPolicy)
  const audible = matrix(audiblePolicy)

  test('prints the current numbers', () => {
    print('random policy   ', random)
    print('coach policy    ', coach)
    print('go-for-it policy', goForIt)
    print('grinder policy  ', grinder)

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

  const cells = DECK_NAMES.flatMap((d) => OPPONENT_NAMES.map((o) => [d, o] as const))
  const delta = (m: Matrix) =>
    cells.reduce((sum, [d, o]) => sum + (m[d][o].winRate - coach[d][o].winRate), 0) / cells.length

  test('prints what the optional mechanics are worth', () => {

    const variants: [string, Matrix][] = [
      ['chips    ', chips],
      ['informed ', informed],
      ['chips+flag', chipsFlag],
      ['oracle   ', oracle],
      ['anti-orcl', antiOracle],
      ['quickcnt ', quickCount],
      ['audible  ', audible],
      ['veteran  ', veteran],
    ]

    const lines = ['\n  mechanic value — win rate delta vs the coach baseline, all 9 matchups']
    for (const [label, m] of variants) {
      const per = cells.map(([d, o]) => m[d][o].winRate - coach[d][o].winRate)
      const best = Math.max(...per)
      const worst = Math.min(...per)
      lines.push(
        `  ${label} ${pct(delta(m)).padStart(6)}  (best ${pct(best)}, worst ${pct(worst)})` +
          `  chips/game ${num(m[DECK_NAMES[0]][OPPONENT_NAMES[0]].meanChipsSpent, 2)}` +
          `  reads/game ${num(m[DECK_NAMES[0]][OPPONENT_NAMES[0]].meanReads, 2)}` +
          `  legal/call ${num(m[DECK_NAMES[0]][OPPONENT_NAMES[0]].meanLegal, 2)}` +
          `  audibles/game ${num(m[DECK_NAMES[0]][OPPONENT_NAMES[0]].meanAudibles, 2)}`,
      )
    }
    console.log(lines.join('\n'))

    const rows = ['\n  per-matchup delta vs coach']
    rows.push(`  ${['', ...OPPONENT_NAMES.map((o) => o.padEnd(16))].join('').padStart(4)}`)
    for (const [label, m] of variants) {
      for (const d of DECK_NAMES) {
        rows.push(
          `  ${label} ${d.padEnd(16)}${OPPONENT_NAMES.map((o) =>
            pct(m[d][o].winRate - coach[d][o].winRate).padEnd(16),
          ).join('')}`,
        )
      }
    }
    console.log(rows.join('\n'))

    const div = { same: 0, diff: 0 }
    for (const d of DECK_NAMES) {
      for (const o of OPPONENT_NAMES) {
        playMany({ archetype: d, opponentName: o }, divergencePolicy(div), GAMES)
      }
    }
    const total = div.same + div.diff
    console.log(
      `\n  how often perfect coverage knowledge would change the call\n` +
        `  (only counting calls where there was more than one legal play)\n` +
        `  same pick ${pct(div.same / total)}   different pick ${pct(div.diff / total)}` +
        `   of ${total} real choices`,
    )
    expect(cells).toHaveLength(9)
  })

  // Control for the oracle result below. If deliberately choosing the worst
  // play against a known coverage were NOT clearly worse, then "perfect
  // information is worth nothing" would only mean "this scorer is noise".
  test('the coverage scorer carries real signal', () => {
    expect(delta(antiOracle)).toBeLessThan(-0.08)
  })

  // This asserted the opposite until every coverage was given a distinct hole
  // and the passes real man/zone identities. A read is now worth ~5pp of win
  // rate to a caller who can use it — and +8pp to one that cannot be outplayed
  // anywhere else. Guard it: flat again means the coverages have drifted back
  // into being interchangeable.
  test('coverage knowledge is worth having', () => {
    expect(delta(oracle)).toBeGreaterThan(0.03)
  })

  // FINDING, not a goal. The coverage rework roughly doubled the audible, but
  // it still only breaks even: the card it costs is worth about what the freed
  // option gains. Priced as a real trade rather than free value.
  test('the audible is a trade, not free value', () => {
    expect(delta(audible)).toBeLessThan(0.05)
  })

  test('chips are worth spending', () => {
    expect(delta(chips)).toBeGreaterThan(0.05)
  })

  test('the challenge flag pays for itself', () => {
    expect(delta(chipsFlag)).toBeGreaterThan(delta(chips))
  })

  test.each(DECK_NAMES)('%s win rates have not drifted', (deck) => {
    for (const o of OPPONENT_NAMES) {
      expect(coach[deck][o].winRate).toBeCloseTo(COACH_WIN_RATE[deck][o], 1)
      expect(Math.abs(coach[deck][o].winRate - COACH_WIN_RATE[deck][o])).toBeLessThan(TOLERANCE)
    }
  })

  // This asserted the opposite until the kicker was fixed: a 42-yarder made 42%
  // and still cost you the drive, so going for it won all nine matchups. Now
  // neither policy dominates, which is what a real fourth down looks like.
  test('fourth down is a genuine choice — neither policy dominates', () => {
    let kicking = 0
    let going = 0
    for (const deck of DECK_NAMES) {
      for (const o of OPPONENT_NAMES) {
        if (coach[deck][o].winRate > goForIt[deck][o].winRate) kicking++
        if (goForIt[deck][o].winRate > coach[deck][o].winRate) going++
      }
    }
    expect(kicking).toBeGreaterThan(0)
    expect(going).toBeGreaterThan(0)
  })

  // The whole premise of hidden rules: knowing the answer has to be worth more
  // than not knowing it, for every deck.
  test('The Shell has a counter that every deck can execute', () => {
    for (const deck of DECK_NAMES) {
      expect(grinder[deck]['The Shell'].winRate).toBeGreaterThan(
        coach[deck]['The Shell'].winRate,
      )
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
