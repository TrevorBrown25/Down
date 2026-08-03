import { describe, expect, test } from 'vitest'
import { makeRng } from './rng'
import { COVERAGES, DEF_FORMATIONS, OFF_FORMATIONS, OFF_PLAYS, type RunPlay } from './cards'
import { NO_MODS, resolveRun } from './resolve'
import { OPPONENTS } from './opponents'
import { resolveSnap, type SnapInput } from './snap'
import {
  addInjury,
  addPractice,
  bonusFor,
  combineTrim,
  describe as describeEffect,
  DRILL_STRENGTH,
  DRILLS,
  EVENTS,
  nextEvent,
  PRACTICE_CAP,
  SPILL,
  wasted,
  type Drill,
  type EventEffect,
  type GroupTrim,
} from './events'
import {
  buyItem,
  chooseEventOption,
  finishGame,
  leaveShop,
  newRun,
  SEASON,
  startGame,
  type Run,
} from './run'
import { ECONOMY } from './shop'

describe('the event pool', () => {
  test('every scenario offers exactly two ways through', () => {
    for (const event of EVENTS) expect(event.options).toHaveLength(2)
  })

  test('no two scenarios share an id', () => {
    expect(new Set(EVENTS.map((e) => e.id)).size).toBe(EVENTS.length)
  })

  test('every option actually does something', () => {
    for (const event of EVENTS) {
      for (const option of event.options) expect(option.effects.length).toBeGreaterThan(0)
    }
  })

  test('the two options are never the same choice twice', () => {
    for (const event of EVENTS) {
      const [a, b] = event.options
      expect(JSON.stringify(a.effects)).not.toBe(JSON.stringify(b.effects))
    }
  })

  test('every effect kind has a description', () => {
    const kinds: EventEffect[] = [
      { kind: 'practice', group: '21', drill: 'blocking' },
      { kind: 'injury', group: '11' },
      { kind: 'offers', extra: 2 },
      { kind: 'cut' },
      { kind: 'scout' },
      { kind: 'chips', extra: 1 },
    ]
    for (const e of kinds) expect(describeEffect(e).length).toBeGreaterThan(0)
  })

  test('every drill is reachable from some scenario', () => {
    // A drill nothing offers is dead vocabulary.
    const offered = new Set<Drill>()
    for (const event of EVENTS) {
      for (const option of event.options) {
        for (const e of option.effects) if (e.kind === 'practice') offered.add(e.drill)
      }
    }
    expect(offered.size).toBe(Object.keys(DRILLS).length)
  })

  test('there are enough scenarios to fill a season without repeating', () => {
    // Seven weeks between games in an eight-game season.
    expect(EVENTS.length).toBeGreaterThanOrEqual(SEASON.games - 1)
  })

  test('never repeats a scenario already seen', () => {
    const seen = EVENTS.slice(0, EVENTS.length - 1).map((e) => e.id)
    for (let seed = 1; seed <= 50; seed++) {
      expect(seen).not.toContain(nextEvent(seen, makeRng(seed)).id)
    }
  })
})

describe('trims', () => {
  test('one drill cannot be run all season', () => {
    let t = {}
    for (let i = 0; i < 5; i++) t = addPractice(t, '21', 'blocking')
    expect(t).toEqual({ '21': { block: PRACTICE_CAP } })
  })

  test('but a second week can go into a different drill', () => {
    // This is the whole point of drills: a practice week is never dead as long
    // as the group has an axis it has not worked on yet.
    let t = addPractice({}, '21', 'blocking')
    t = addPractice(t, '21', 'routes')
    t = addPractice(t, '21', 'film')
    expect(t).toEqual({
      '21': { block: DRILL_STRENGTH.blocking, man: DRILL_STRENGTH.routes, zone: DRILL_STRENGTH.film },
    })
  })

  test('a capped drill is reported as wasted, an open one is not', () => {
    const t = addPractice({}, '21', 'blocking')
    expect(wasted({ kind: 'practice', group: '21', drill: 'blocking' }, t)).toBe(true)
    expect(wasted({ kind: 'practice', group: '21', drill: 'routes' }, t)).toBe(false)
    // And the cap is per group, not global.
    expect(wasted({ kind: 'practice', group: '12', drill: 'blocking' }, t)).toBe(false)
  })

  test('knocks are not capped — they are meant to hurt', () => {
    let t = {}
    for (let i = 0; i < 3; i++) t = addInjury(t, '11')
    expect(t).toEqual({ '11': { block: -3 } })
  })

  test('a blocking week and a knock on the same group cancel out', () => {
    expect(combineTrim(addPractice({}, '12', 'blocking'), addInjury({}, '12'))).toEqual({})
  })

  test('a knock does not touch what a route drill bought', () => {
    // A knock is a blocking problem. It cannot un-teach a route.
    expect(combineTrim(addPractice({}, '11', 'routes'), addInjury({}, '11'))).toEqual({
      '11': { man: DRILL_STRENGTH.routes, block: -1 },
    })
  })

  test('leaves untouched groups out entirely', () => {
    expect(combineTrim(addPractice({}, '21', 'blocking'), {})).toEqual({ '21': { block: 1 } })
  })
})

/* ------------------------- does a trim reach the field? ------------------- */

const snapWith = (over: Partial<SnapInput>): SnapInput => ({
  opponent: OPPONENTS['The Sandlot'],
  formName: 'I-Form',
  playName: 'Inside Zone',
  defFormName: '4-3',
  coverageName: 'Cover 3',
  defAdj: null,
  charge: 0,
  down: 2,
  possession: 1,
  ballOn: 25,
  protect: false,
  mods: NO_MODS,
  firedCounts: {},
  lastPlayName: null,
  groupTrim: {},
  ...over,
})

const meanSnap = (over: Partial<SnapInput>, n = 3000) => {
  let total = 0
  for (let i = 1; i <= n; i++) total += resolveSnap(snapWith(over), makeRng(i)).result.yards
  return total / n
}

/** A pass from 21 personnel, so a drill on that group reaches it. */
const pass = (coverageName: 'Cover 2 Man' | 'Cover 3', groupTrim: GroupTrim) =>
  meanSnap({ playName: 'Slant', formName: 'I-Form', coverageName, groupTrim })

describe('a blocking drill reaches the field', () => {
  test('makes the group run better', () => {
    expect(meanSnap({ groupTrim: { '21': { block: 1 } } })).toBeGreaterThan(meanSnap({}))
  })

  test('a knock makes the group run worse', () => {
    expect(meanSnap({ groupTrim: { '21': { block: -1 } } })).toBeLessThan(meanSnap({}))
  })

  test('a knock only touches the group it names', () => {
    // I-Form is 21 personnel, so an 11 knock must not reach it. Knocks are the
    // one thing that never carries — that player is hurt, nobody else is.
    expect(meanSnap({ groupTrim: { '11': { block: -1 } } })).toBe(meanSnap({}))
  })

  test('a drill carries partway to the groups it was not aimed at', () => {
    // Otherwise a practice week is dead on every snap you do not declare it.
    const elsewhere = meanSnap({ groupTrim: { '11': { block: 1 } } })
    expect(elsewhere).toBeGreaterThan(meanSnap({}))
    // But its own group still gets more of it than anyone else.
    expect(meanSnap({ groupTrim: { '21': { block: 1 } } })).toBeGreaterThan(elsewhere)
  })

  test('spillover is exactly the declared fraction', () => {
    expect(bonusFor({ '11': { block: 1 }, '12': { block: 1 } }, '21')).toEqual({
      block: 2 * SPILL,
    })
    // Own group at full strength, plus the others' spill on top.
    expect(bonusFor({ '21': { block: 1 }, '11': { block: 1 } }, '21')).toEqual({
      block: 1 + SPILL,
    })
  })

  test('a knock is never diluted by spilling', () => {
    expect(bonusFor({ '21': { block: -2 } }, '12')).toEqual({})
    expect(bonusFor({ '21': { block: -2 } }, '21')).toEqual({ block: -2 })
  })

  test('the blocker it grants is the same one Fresh Legs grants', () => {
    // Anchors the unit: a blocking week is worth exactly one extra blocker.
    const play = OFF_PLAYS['Inside Zone'] as RunPlay
    const def = { form: DEF_FORMATIONS['4-3'], cov: COVERAGES['Cover 3'] }
    const direct = (blockers: number) => {
      let total = 0
      for (let i = 1; i <= 3000; i++) {
        total += resolveRun(
          { ...OFF_FORMATIONS['I-Form'], blockers },
          play,
          def,
          NO_MODS,
          makeRng(i),
        ).yards
      }
      return total / 3000
    }
    expect(meanSnap({ groupTrim: { '21': { block: 1 } } })).toBe(
      direct(OFF_FORMATIONS['I-Form'].blockers + 1),
    )
  })
})

describe('route running and film study cash on opposite coverages', () => {
  const routes: GroupTrim = { '21': { man: 1 } }
  const film: GroupTrim = { '21': { zone: 1 } }

  test('route detail helps against man', () => {
    expect(pass('Cover 2 Man', routes)).toBeGreaterThan(pass('Cover 2 Man', {}))
  })

  test('route detail is worth nothing against zone', () => {
    expect(pass('Cover 3', routes)).toBe(pass('Cover 3', {}))
  })

  test('film study helps against zone', () => {
    expect(pass('Cover 3', film)).toBeGreaterThan(pass('Cover 3', {}))
  })

  test('film study is worth nothing against man', () => {
    expect(pass('Cover 2 Man', film)).toBe(pass('Cover 2 Man', {}))
  })

  test('neither one does anything to a run', () => {
    // They are coverage drills. A handoff should not care.
    expect(meanSnap({ groupTrim: routes })).toBe(meanSnap({}))
    expect(meanSnap({ groupTrim: film })).toBe(meanSnap({}))
  })
})

/* ------------------------------- in a run -------------------------------- */

/** Play the current week badly but legally, so the run advances to an event. */
function finishAWeek(run: Run, won: boolean): Run {
  const rng = makeRng(run.at + 1)
  const game = { ...startGame(run, rng), won, phase: 'over' as const, points: won ? 21 : 3 }
  return finishGame(run, game, rng)
}

describe('events in a run', () => {
  test('a week between games offers a scenario before the draft', () => {
    const run = finishAWeek(newRun('Pro Style', 7), true)
    expect(run.pendingEvent).not.toBeNull()
    // The draft has not been built yet — the event shapes it.
    expect(run.pending).toBeNull()
  })

  test('choosing an option opens the draft', () => {
    const run = chooseEventOption(finishAWeek(newRun('Pro Style', 7), true), 0, makeRng(1))
    expect(run.pendingEvent).toBeNull()
    expect(run.pending).not.toBeNull()
  })

  test('an eliminated run gets no event', () => {
    let run = newRun('Air Raid', 3)
    for (let i = 0; i <= SEASON.lossesAllowed; i++) {
      run = finishAWeek(run, false)
      if (run.status !== 'playing') break
      run = chooseEventOption(run, 0, makeRng(i))
    }
    expect(run.status).toBe('eliminated')
    expect(run.pendingEvent).toBeNull()
  })

  test('practice carries to later games but a knock does not', () => {
    let run = finishAWeek(newRun('Ground & Pound', 11), true)
    run = { ...run, pendingEvent: EVENTS.find((e) => e.id === 'contract') ?? run.pendingEvent }
    // "Feature the back": a blocking week for 21, a knock for 11.
    run = chooseEventOption(run, 0, makeRng(2))
    expect(run.conditioning).toEqual({ '21': { block: 1 } })
    expect(run.injuries).toEqual({ '11': { block: -1 } })

    const after = finishAWeek(run, true)
    expect(after.conditioning).toEqual({ '21': { block: 1 } })
    expect(after.injuries).toEqual({})
  })

  test('a wider choice really puts more cards on the table', () => {
    let run = finishAWeek(newRun('Pro Style', 5), true)
    run = { ...run, pendingEvent: EVENTS.find((e) => e.id === 'rain') ?? run.pendingEvent }
    // "Move it indoors" is offers +2.
    const wide = chooseEventOption(run, 1, makeRng(3))
    expect(wide.pending?.cards).toHaveLength(SEASON.draftSize + 2)
  })

  test('a cut week lets you cut even on a week that would not have', () => {
    let run = finishAWeek(newRun('Pro Style', 5), true)
    // at is now 1, so run.at % 2 === 1 would already allow a cut. Force the
    // other parity so the effect is the only thing that could open it.
    run = { ...run, at: 2, pendingEvent: EVENTS.find((e) => e.id === 'cutday') ?? null }
    const cut = chooseEventOption(run, 0, makeRng(4))
    expect(cut.pending?.cuts).toBe(1)
  })

  test('extra chips reach the next game and then expire', () => {
    let run = finishAWeek(newRun('Pro Style', 9), true)
    run = { ...run, pendingEvent: EVENTS.find((e) => e.id === 'cutday') ?? null }
    // "Keep everyone happy" is chips +2.
    run = chooseEventOption(run, 1, makeRng(5))
    expect(run.bonusChips).toBe(2)
    expect(startGame(run, makeRng(6)).chips).toBe(4)

    const after = finishAWeek(run, true)
    expect(after.bonusChips).toBe(0)
  })

  test('scouting hands you a hidden rule before kickoff', () => {
    let run = finishAWeek(newRun('Pro Style', 13), true)
    run = { ...run, pendingEvent: EVENTS.find((e) => e.id === 'film') ?? null }
    run = chooseEventOption(run, 0, makeRng(7))
    expect(run.intel.length).toBe(1)

    const game = startGame(run, makeRng(8))
    const rules = OPPONENTS[game.opponentName].rules
    const known = Object.keys(game.revealed)
    expect(known).toHaveLength(1)
    // And it has to be one you could not already see.
    expect(rules[known[0]].visible).toBe(false)
  })

  test('a scouted rule does not leak into the game after', () => {
    let run = finishAWeek(newRun('Pro Style', 13), true)
    run = { ...run, pendingEvent: EVENTS.find((e) => e.id === 'film') ?? null }
    run = chooseEventOption(run, 0, makeRng(7))
    const after = finishAWeek(run, true)
    expect(after.intel).toEqual([])
    expect(Object.keys(startGame(after, makeRng(9)).revealed)).toHaveLength(0)
  })

  test('the same seed always walks the same week', () => {
    const once = chooseEventOption(finishAWeek(newRun('Air Raid', 42), true), 0, makeRng(1))
    const twice = chooseEventOption(finishAWeek(newRun('Air Raid', 42), true), 0, makeRng(1))
    expect(once).toEqual(twice)
  })

  test('a run stays JSON-serializable, so it can still be saved', () => {
    const run = chooseEventOption(finishAWeek(newRun('Pro Style', 7), true), 0, makeRng(1))
    expect(JSON.parse(JSON.stringify(run))).toEqual(run)
  })
})

/* --------------------------------- coins --------------------------------- */

describe('the economy', () => {
  const finished = (run: Run, won: boolean, points: number) => {
    const rng = makeRng(run.at + 1)
    return finishGame(run, { ...startGame(run, rng), won, phase: 'over' as const, points }, rng)
  }

  /** Play forward to a week that is actually a shop. */
  const atShop = (seed: number) => {
    let run = newRun('Pro Style', seed)
    for (let i = 0; i < SEASON.games && !run.pendingShop; i++) {
      run = finished({ ...run, pendingShop: null, pendingEvent: null, pending: null }, true, 21)
    }
    if (!run.pendingShop) throw new Error('never reached a shop')
    return { ...run, coins: 9999 }
  }

  test('a loss still pays', () => {
    // The whole point: a week you lost is not a dead week.
    const run = finished(newRun('Pro Style', 4), false, 14)
    expect(run.coins).toBe(14 * ECONOMY.perPoint + ECONOMY.lossConsolation)
    expect(run.coins).toBeGreaterThan(0)
  })

  test('a win pays more than a loss for the same points', () => {
    const win = finished(newRun('Pro Style', 4), true, 17)
    const loss = finished(newRun('Pro Style', 4), false, 17)
    expect(win.coins).toBeGreaterThan(loss.coins)
  })

  test('scoring more pays more, even in defeat', () => {
    const close = finished(newRun('Pro Style', 4), false, 20)
    const blowout = finished(newRun('Pro Style', 4), false, 3)
    expect(close.coins).toBeGreaterThan(blowout.coins)
  })

  test('coins accumulate across weeks', () => {
    const one = finished(newRun('Pro Style', 4), true, 21)
    const two = finished({ ...one, pendingShop: null, pendingEvent: null }, true, 21)
    expect(two.coins).toBe(one.coins * 2)
  })

  test('you cannot buy what you cannot afford', () => {
    const broke = { ...atShop(4), coins: 0 }
    expect(buyItem(broke, 0).coins).toBe(0)
    expect(buyItem(broke, 0).pendingShop?.sold).toEqual([])
  })

  test('everything on the shelf is one to a customer', () => {
    const run = atShop(4)
    const first = buyItem(run, 0)
    const second = buyItem(first, 0)
    expect(second.coins).toBe(first.coins)
    expect(second.pendingShop?.sold).toEqual([0])
  })

  test('buying spends exactly the sticker price', () => {
    const run = atShop(4)
    const price = run.pendingShop?.items[0].price ?? 0
    expect(buyItem(run, 0).coins).toBe(run.coins - price)
  })

  test('a shop week hands the draft whatever cuts it sold', () => {
    let run = atShop(4)
    const cutIndex = run.pendingShop?.items.findIndex((i) => i.kind === 'cut') ?? -1
    expect(cutIndex).toBeGreaterThanOrEqual(0)
    run = buyItem(run, cutIndex)
    expect(run.shopCuts).toBe(1)
    const after = leaveShop(run, makeRng(1))
    expect(after.pending?.cuts).toBe(1)
    expect(after.shopCuts).toBe(0)
  })

  test('a run with a shop in it still serialises for a save file', () => {
    expect(JSON.parse(JSON.stringify(atShop(4)))).toEqual(atShop(4))
  })
})
