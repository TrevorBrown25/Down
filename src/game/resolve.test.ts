import { describe, expect, test } from 'vitest'
import { makeRng } from './rng'
import {
  COVERAGES,
  DEF_FORMATIONS,
  OFF_FORMATIONS,
  OFF_PLAYS,
  type Coverage,
  type PassPlay,
} from './cards'
import { NO_MODS, resolvePass } from './resolve'

const form = OFF_FORMATIONS['Gun 11']
const asPass = (name: 'Quick Pass' | 'Deep Pass' | 'TE Leak') => OFF_PLAYS[name] as PassPlay

/** Average yards over many seeds, holding everything but the coverage fixed. */
const meanYards = (play: PassPlay, cov: Coverage, n = 3000) => {
  let total = 0
  for (let i = 1; i <= n; i++) {
    total += resolvePass(
      form,
      play,
      { form: DEF_FORMATIONS['4-3'], cov },
      NO_MODS,
      makeRng(i),
    ).yards
  }
  return total / n
}

describe('coverage depth', () => {
  // Deep help does not police the quick game. A coverage with three defenders
  // over the top and nobody underneath should surrender the short throw, which
  // is the entire trade Cover 3 makes.
  const soft: Coverage = { ...COVERAGES['Cover 3'], underneath: 0 }
  const tight: Coverage = { ...COVERAGES['Cover 3'], underneath: 3 }

  test('a soft underneath surrenders the quick game', () => {
    expect(meanYards(asPass('Quick Pass'), soft)).toBeGreaterThan(
      meanYards(asPass('Quick Pass'), tight),
    )
  })

  test('the underneath has no say over a deep ball', () => {
    expect(meanYards(asPass('Deep Pass'), soft)).toBe(meanYards(asPass('Deep Pass'), tight))
  })

  test('an intermediate route splits the difference', () => {
    const mid = meanYards(asPass('TE Leak'), soft)
    expect(mid).toBeGreaterThan(meanYards(asPass('TE Leak'), tight))
    // But less swung than the quick game, which lives entirely underneath.
    const quickSwing =
      meanYards(asPass('Quick Pass'), soft) - meanYards(asPass('Quick Pass'), tight)
    expect(mid - meanYards(asPass('TE Leak'), tight)).toBeLessThan(quickSwing)
  })
})

describe('man and zone identities', () => {
  const zone: Coverage = { rush: 4, boxSupport: 0, deepHelp: 2, underneath: 1, man: false }
  const man: Coverage = { ...zone, man: true }

  test('the quick game feasts on man and dies against zone', () => {
    expect(meanYards(asPass('Quick Pass'), man)).toBeGreaterThan(
      meanYards(asPass('Quick Pass'), zone),
    )
  })

  test('four verticals is a zone beater', () => {
    const verts = OFF_PLAYS['Four Verticals'] as PassPlay
    expect(meanYards(verts, zone)).toBeGreaterThan(meanYards(verts, man))
  })

  test('play action wants the linebackers reading run, not a man defender', () => {
    const pa = OFF_PLAYS['Play Action'] as PassPlay
    expect(meanYards(pa, zone)).toBeGreaterThan(meanYards(pa, man))
  })
})
