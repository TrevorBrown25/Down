import { describe, expect, test } from 'vitest'
import { makeRng } from './rng'
import { STARTERS, type StyleName } from './cards'
import { legalPlays, type Game } from './engine'
import {
  SEASON,
  finishGame,
  newRun,
  removeCard,
  skipDraft,
  startGame,
  takeCard,
  type Run,
} from './run'

const STYLES = Object.keys(STARTERS) as StyleName[]

/** Force a finished game without playing one out. */
const finished = (game: Game, won: boolean): Game => ({
  ...game,
  phase: 'over',
  won,
  points: won ? 21 : 10,
})

/** Advance a run by n games, all won or all lost, skipping every draft. */
function march(run: Run, results: boolean[]): Run {
  let r = run
  for (const won of results) {
    if (r.status !== 'playing') break
    const game = startGame(r, makeRng(r.at + 1))
    r = finishGame(r, finished(game, won), makeRng(r.at + 1))
    if (r.pending) r = skipDraft(r)
  }
  return r
}

describe('a new run', () => {
  test.each(STYLES)('%s begins with its 16-card starter', (style) => {
    expect(newRun(style, 1).deck).toHaveLength(16)
  })

  test('schedules a full season', () => {
    expect(newRun('Pro Style', 1).schedule).toHaveLength(SEASON.games)
  })

  test('shows the whole schedule from week one', () => {
    // You draft toward known matchups — the season is never hidden.
    for (const node of newRun('Air Raid', 3).schedule) {
      expect(node.opponentName).toBeTruthy()
      expect(node.week).toBeGreaterThan(0)
    }
  })

  test('opponents get harder as the season goes on', () => {
    const tiers = newRun('Pro Style', 7).schedule.map((n) => n.tier)
    expect(tiers[tiers.length - 1]).toBeGreaterThan(tiers[0])
    for (let i = 1; i < tiers.length; i++) expect(tiers[i]).toBeGreaterThanOrEqual(tiers[i - 1])
  })

  test('is reproducible from its seed', () => {
    expect(newRun('Air Raid', 4242)).toEqual(newRun('Air Raid', 4242))
  })

  test('different seeds give different schedules', () => {
    const a = newRun('Air Raid', 1).schedule.map((n) => n.opponentName).join()
    const b = newRun('Air Raid', 99).schedule.map((n) => n.opponentName).join()
    expect(a).not.toBe(b)
  })
})

describe('playing the season', () => {
  test('hands the run\'s own deck to the game', () => {
    const run = newRun('Ground & Pound', 5)
    const game = startGame(run, makeRng(1))
    expect(game.deck.length + game.hand.length).toBe(run.deck.length)
    expect(game.opponentName).toBe(run.schedule[0].opponentName)
  })

  test('a win advances the week and banks the record', () => {
    const run = newRun('Pro Style', 5)
    const after = finishGame(run, finished(startGame(run, makeRng(1)), true), makeRng(1))
    expect(after.wins).toBe(1)
    expect(after.losses).toBe(0)
    expect(after.at).toBe(1)
    expect(after.history).toHaveLength(1)
  })

  // 6-2 or bust: two losses are survivable, the third ends the season.
  test('a third loss ends the run', () => {
    expect(march(newRun('Pro Style', 5), [false, false, false]).status).toBe('eliminated')
  })

  test('two losses leaves you alive', () => {
    const after = march(newRun('Pro Style', 5), [false, false])
    expect(after.losses).toBe(SEASON.lossesAllowed)
    expect(after.status).toBe('playing')
  })

  test('surviving the whole schedule completes the run', () => {
    const after = march(newRun('Pro Style', 5), [true, false, true, true, false, true, true, true])
    expect(after.status).toBe('complete')
    expect(after.wins + after.losses).toBe(SEASON.games)
  })

  test('an eliminated run cannot start another game', () => {
    const dead = march(newRun('Pro Style', 5), [false, false, false])
    expect(() => startGame(dead, makeRng(1))).toThrow()
  })

  test('every game is playable from the run deck', () => {
    const run = newRun('Air Raid', 11)
    const game = startGame(run, makeRng(2))
    expect(game.groupsInHand.length).toBeGreaterThan(0)
    if (game.phase === 'call') expect(legalPlays(game).length).toBeGreaterThan(0)
  })
})

describe('the draft', () => {
  const offered = (won: boolean) => {
    const run = newRun('Pro Style', 8)
    return finishGame(run, finished(startGame(run, makeRng(1)), won), makeRng(1))
  }

  test('offers three cards after a game', () => {
    expect(offered(true).pending?.cards).toHaveLength(3)
  })

  test('offers a draft after a loss too — you still learn something', () => {
    expect(offered(false).pending).not.toBeNull()
  })

  test('taking a card grows the deck by exactly one', () => {
    const run = offered(true)
    const pick = run.pending?.cards[0]
    if (!pick) throw new Error('expected an offer')
    const after = takeCard(run, pick.id)
    expect(after.deck).toHaveLength(run.deck.length + 1)
    expect(after.pending).toBeNull()
    expect(new Set(after.deck.map((c) => c.id)).size).toBe(after.deck.length)
  })

  test('skipping leaves the deck alone', () => {
    const run = offered(true)
    const after = skipDraft(run)
    expect(after.deck).toHaveLength(run.deck.length)
    expect(after.pending).toBeNull()
  })

  test('removing a card shrinks the deck by exactly one', () => {
    const run = skipDraft(offered(true))
    const victim = run.deck[0]
    const after = removeCard(run, victim.id)
    expect(after.deck).toHaveLength(run.deck.length - 1)
    expect(after.deck.map((c) => c.id)).not.toContain(victim.id)
  })

  test('will not let you cut the deck below a playable size', () => {
    let run = skipDraft(offered(true))
    for (let i = 0; i < 40 && run.deck.length > 0; i++) {
      run = removeCard(run, run.deck[0].id)
    }
    expect(run.deck.length).toBeGreaterThanOrEqual(SEASON.minDeck)
  })

  test('a drafted card actually shows up in the next game', () => {
    const run = offered(true)
    const pick = run.pending?.cards[0]
    if (!pick) throw new Error('expected an offer')
    const after = takeCard(run, pick.id)
    const game = startGame(after, makeRng(3))
    expect([...game.deck, ...game.hand].map((c) => c.id)).toContain(pick.id)
  })
})
