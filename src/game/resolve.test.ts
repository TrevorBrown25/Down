import { describe, expect, test } from 'vitest'
import { makeRng } from './rng'
import {
  COVERAGES,
  DEF_FORMATIONS,
  OFF_FORMATIONS,
  OFF_PLAYS,
  type Coverage,
  type PassPlay,
  type RunPlay,
} from './cards'
import { NO_MODS, resolvePass, resolveRun } from './resolve'

const form = OFF_FORMATIONS['Gun 11']
const asPass = (name: 'Slant' | 'Fade' | 'TE Leak') => OFF_PLAYS[name] as PassPlay

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
    expect(meanYards(asPass('Slant'), soft)).toBeGreaterThan(
      meanYards(asPass('Slant'), tight),
    )
  })

  test('the underneath has no say over a deep ball', () => {
    expect(meanYards(asPass('Fade'), soft)).toBe(meanYards(asPass('Fade'), tight))
  })

  test('an intermediate route splits the difference', () => {
    const mid = meanYards(asPass('TE Leak'), soft)
    expect(mid).toBeGreaterThan(meanYards(asPass('TE Leak'), tight))
    // But less swung than the quick game, which lives entirely underneath.
    const quickSwing =
      meanYards(asPass('Slant'), soft) - meanYards(asPass('Slant'), tight)
    expect(mid - meanYards(asPass('TE Leak'), tight)).toBeLessThan(quickSwing)
  })
})

describe('man and zone identities', () => {
  const zone: Coverage = { rush: 4, boxSupport: 0, deepHelp: 2, underneath: 1, man: false }
  const man: Coverage = { ...zone, man: true }

  test('the slant feasts on man and dies against zone', () => {
    expect(meanYards(asPass('Slant'), man)).toBeGreaterThan(
      meanYards(asPass('Slant'), zone),
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

describe('the run axis', () => {
  const heavy = { form: { box: 8, rushBonus: 0, cov: 0 }, cov: COVERAGES['Cover 3'] }
  const light = { form: { box: 5, rushBonus: 0, cov: 0 }, cov: COVERAGES['Cover 2 Man'] }

  const meanRun = (name: 'Power O' | 'Counter' | 'Inside Zone', def: typeof heavy, n = 3000) => {
    const play = OFF_PLAYS[name] as RunPlay
    let total = 0
    for (let i = 1; i <= n; i++) {
      total += resolveRun(OFF_FORMATIONS['I-Form'], play, def, NO_MODS, makeRng(i)).yards
    }
    return total / n
  }

  test('misdirection uses a crowded front against itself', () => {
    // Counter wants them to over-pursue; it should do better into a heavy box
    // than a numbers play does.
    const counterSwing = meanRun('Counter', heavy) - meanRun('Counter', light)
    const powerSwing = meanRun('Power O', heavy) - meanRun('Power O', light)
    expect(counterSwing).toBeGreaterThan(powerSwing)
  })

  test('a numbers play wants them light', () => {
    expect(meanRun('Power O', light)).toBeGreaterThan(meanRun('Power O', heavy))
  })

  test('the two leans genuinely disagree about the same look', () => {
    // Against a stacked box, misdirection should beat taking the numbers.
    expect(meanRun('Counter', heavy)).toBeGreaterThan(meanRun('Power O', heavy))
    expect(meanRun('Power O', light)).toBeGreaterThan(meanRun('Counter', light))
  })
})

describe('screens', () => {
  const screen = OFF_PLAYS.Screen as PassPlay
  const rush = (n: number) => ({
    form: { box: 6, rushBonus: 0, cov: 0 },
    cov: { ...COVERAGES['Cover 2'], rush: n },
  })

  const meanScreen = (r: number, n = 3000) => {
    let total = 0
    for (let i = 1; i <= n; i++) {
      total += resolvePass(OFF_FORMATIONS['Gun 11'], screen, rush(r), NO_MODS, makeRng(i)).yards
    }
    return total / n
  }

  test('the harder they rush, the further it goes', () => {
    expect(meanScreen(8)).toBeGreaterThan(meanScreen(4))
  })

  test('is never sacked — they have run past it', () => {
    for (let i = 1; i <= 800; i++) {
      const r = resolvePass(OFF_FORMATIONS['Gun 11'], screen, rush(9), NO_MODS, makeRng(i))
      expect(r.event).not.toBe('sack')
    }
  })
})

describe('moving the pocket', () => {
  test('a boot is much harder to bring down than a dropback of the same depth', () => {
    const heat = { form: { box: 6, rushBonus: 2, cov: 0 }, cov: COVERAGES['Cover 1 Blitz'] }
    const sacks = (name: 'Boot' | 'Dig') => {
      let n = 0
      for (let i = 1; i <= 1500; i++) {
        const play = OFF_PLAYS[name] as PassPlay
        if (resolvePass(OFF_FORMATIONS['Singleback'], play, heat, NO_MODS, makeRng(i)).event === 'sack') n++
      }
      return n
    }
    expect(sacks('Boot')).toBeLessThan(sacks('Dig'))
  })
})

describe('the sneak', () => {
  const sneak = OFF_PLAYS['QB Sneak'] as RunPlay
  const wall = { form: { box: 9, rushBonus: 0, cov: 0 }, cov: COVERAGES['Cover 3'] }

  test('always gets the yard, even into a wall', () => {
    for (let i = 1; i <= 600; i++) {
      const r = resolveRun(OFF_FORMATIONS['I-Form'], sneak, wall, NO_MODS, makeRng(i))
      if (r.turnover) continue
      expect(r.yards).toBeGreaterThanOrEqual(1)
      // And never anything more. That is the whole card.
      expect(r.yards).toBeLessThanOrEqual(2)
    }
  })
})
