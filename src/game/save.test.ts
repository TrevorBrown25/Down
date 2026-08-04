import { describe, expect, test } from 'vitest'
import { makeRng } from './rng'
import { legalPlays, nextDown, callPlay, declarePersonnel } from './engine'
import { finishGame, newRun, startGame, type Run } from './run'
import { decode, encode, SAVE_VERSION, type SaveFile } from './save'

describe('the random stream can be resumed', () => {
  test('a restored generator continues exactly where the first left off', () => {
    // This is what stops a reload from replaying the same rolls.
    const original = makeRng(12345)
    for (let i = 0; i < 37; i++) original()

    const restored = makeRng(original.state())
    const a = Array.from({ length: 20 }, () => original())
    const b = Array.from({ length: 20 }, () => restored())
    expect(b).toEqual(a)
  })

  test('a generator restarted from its seed does not', () => {
    // The bug this guards: saving the seed instead of the position.
    const original = makeRng(12345)
    for (let i = 0; i < 37; i++) original()
    const naive = makeRng(12345)
    expect(naive()).not.toBe(original())
  })

  test('state is a plain number, so it fits in a save file', () => {
    const rng = makeRng(7)
    rng()
    expect(Number.isInteger(rng.state())).toBe(true)
    expect(JSON.parse(JSON.stringify({ s: rng.state() })).s).toBe(rng.state())
  })
})

/** A run part-way through a season, with a game in progress. */
function midSeason(): { save: SaveFile; run: Run } {
  const rng = makeRng(99)
  let run = newRun('Pro Style', 99)
  run = finishGame(run, { ...startGame(run, rng), won: true, phase: 'over', points: 21 }, rng)
  run = { ...run, pendingEvent: null, pendingShop: null, pending: null }

  let game = startGame(run, rng)
  if (game.phase === 'personnel') game = declarePersonnel(game, game.groupsInHand[0], rng)
  const legal = legalPlays(game)
  if (legal.length > 0) {
    game = callPlay(game, legal[0].id, rng)
    game = nextDown(game, rng)
  }

  return { save: { version: SAVE_VERSION, run, game, rngState: rng.state() }, run }
}

describe('save round trip', () => {
  test('a mid-game save comes back identical', () => {
    const { save } = midSeason()
    const loaded = decode(encode(save))
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.save.run).toEqual(save.run)
    expect(loaded.save.game).toEqual(save.game)
    expect(loaded.save.rngState).toBe(save.rngState)
  })

  test('a run between games saves with no game at all', () => {
    const rng = makeRng(5)
    let run = newRun('Air Raid', 5)
    run = finishGame(run, { ...startGame(run, rng), won: false, phase: 'over', points: 10 }, rng)
    const loaded = decode(
      encode({ version: SAVE_VERSION, run, game: null, rngState: rng.state() }),
    )
    expect(loaded.ok).toBe(true)
    if (loaded.ok) expect(loaded.save.game).toBeNull()
  })

  test('the loaded run can still be played on', () => {
    // A save that parses but cannot be resumed is no better than a broken one.
    const { save } = midSeason()
    const loaded = decode(encode(save))
    if (!loaded.ok) throw new Error('expected a valid save')
    const resumed = makeRng(loaded.save.rngState)
    expect(() => startGame({ ...loaded.save.run, pending: null }, resumed)).not.toThrow()
  })

  test('every event and shop shape survives the trip', () => {
    const rng = makeRng(3)
    let run = newRun('Ground & Pound', 3)
    for (let i = 0; i < 6; i++) {
      if (run.status !== 'playing') break
      if (run.pendingEvent || run.pendingShop || run.pending) {
        const loaded = decode(encode({ version: SAVE_VERSION, run, game: null, rngState: 1 }))
        expect(loaded.ok).toBe(true)
        if (loaded.ok) expect(loaded.save.run).toEqual(run)
      }
      run = { ...run, pendingEvent: null, pendingShop: null, pending: null }
      run = finishGame(run, { ...startGame(run, rng), won: true, phase: 'over', points: 21 }, rng)
    }
  })
})

describe('a save that cannot be trusted is refused', () => {
  const { save } = midSeason()

  test('nothing stored at all', () => {
    expect(decode(null)).toEqual({ ok: false, reason: 'empty' })
    expect(decode('')).toEqual({ ok: false, reason: 'empty' })
  })

  test('not even JSON', () => {
    expect(decode('{ half a fi')).toEqual({ ok: false, reason: 'unreadable' })
  })

  test('JSON, but not a save', () => {
    expect(decode('{"hello":true}')).toEqual({ ok: false, reason: 'unreadable' })
  })

  test('a save from a different version', () => {
    const older = { ...save, version: SAVE_VERSION - 1 }
    expect(decode(JSON.stringify(older))).toEqual({ ok: false, reason: 'stale' })
  })

  test('a card that no longer exists in the game', () => {
    // The real failure mode: the card pool changed under an old save. Resuming
    // would crash deep in the resolver on a play name that is gone.
    const raw = JSON.parse(encode(save))
    raw.run.deck[0] = { id: 0, type: 'play', form: 'Gun 11', play: 'Statue of Liberty' }
    expect(decode(JSON.stringify(raw))).toEqual({ ok: false, reason: 'stale' })
  })

  test('an opponent that no longer exists', () => {
    const raw = JSON.parse(encode(save))
    raw.run.schedule[0].opponentName = 'The Team That Was Cut'
    expect(decode(JSON.stringify(raw))).toEqual({ ok: false, reason: 'stale' })
  })

  test('a missing field', () => {
    const raw = JSON.parse(encode(save))
    delete raw.run.coins
    expect(decode(JSON.stringify(raw))).toEqual({ ok: false, reason: 'stale' })
  })

  test('a truncated file', () => {
    expect(decode(encode(save).slice(0, 200)).ok).toBe(false)
  })

  test('decode never throws, whatever it is handed', () => {
    for (const junk of ['null', '[]', '0', '"x"', '{"version":"1"}', '{"version":1}']) {
      expect(() => decode(junk)).not.toThrow()
      expect(decode(junk).ok).toBe(false)
    }
  })
})
