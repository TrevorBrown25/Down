import { describe, expect, test } from 'vitest'
import { makeRng, type Rng } from '../game/rng'
import { OFF_PLAYS, personnelOf, STARTERS, type Card, type StyleName } from '../game/cards'
import {
  callPlay,
  declarePersonnel,
  fieldGoal,
  legalPlays,
  nextDown,
  punt,
  type Game,
} from '../game/engine'
import { SEASON, finishGame, newRun, skipDraft, startGame, takeCard, type Run } from '../game/run'
import { chipsPolicy, coachPolicy, type Policy } from './policy'

/**
 * The per-game balance matrix measures a starter deck against every opponent.
 * A real run is not that: by the title-shot weeks the deck has grown by five or
 * six cards. This plays whole seasons so the number means what it says.
 */

const STYLES = Object.keys(STARTERS) as StyleName[]

function playOut(start: Game, policy: Policy, rng: Rng): Game {
  let game = start
  let steps = 0
  while (game.phase !== 'over' && steps++ < 500) {
    if (game.phase === 'personnel') {
      game = declarePersonnel(game, policy.personnel(game, rng), rng)
      continue
    }
    if (game.phase === 'result') {
      game = nextDown(game, rng)
      continue
    }
    const ready = policy.preSnap?.(game, rng) ?? game
    if (ready.down === 4) {
      const choice = policy.fourthDown(ready)
      if (choice === 'punt') {
        game = punt(ready, rng)
        continue
      }
      if (choice === 'fg') {
        game = fieldGoal(ready, rng)
        continue
      }
    }
    const legal = legalPlays(ready)
    game = legal.length === 0 ? punt(ready, rng) : callPlay(ready, policy.play(ready, legal, rng).id, rng)
  }
  return game
}

/**
 * Which of the three offers a real player takes. Deck concentration is what
 * makes a sheet work — the declaration only frees one personnel group — so the
 * card that deepens the group you already live in beats a stronger card that
 * strands you.
 */
function bestOffer(run: Run, offers: readonly Card[]): Card | undefined {
  const owned: Record<string, number> = { '21': 0, '12': 0, '11': 0 }
  for (const c of run.deck) if (c.type === 'play') owned[personnelOf(c.form)]++
  const home = (Object.keys(owned) as (keyof typeof owned)[]).reduce((a, b) =>
    owned[a] >= owned[b] ? a : b,
  )

  const score = (c: Card) => {
    if (c.type !== 'play') return 4
    const play = OFF_PLAYS[c.play]
    let v = play.base * 0.4
    if (personnelOf(c.form) === home) v += 10
    return v
  }
  return [...offers].sort((a, b) => score(b) - score(a))[0]
}

function playSeason(style: StyleName, seed: number, policy: Policy, draft: boolean): Run {
  const rng = makeRng(seed)
  let run = newRun(style, seed)
  let guard = 0

  while (run.status === 'playing' && guard++ < 40) {
    if (run.pending) {
      const pick = bestOffer(run, run.pending.cards)
      run = draft && pick ? takeCard(run, pick.id) : skipDraft(run)
      continue
    }
    run = finishGame(run, playOut(startGame(run, rng), policy, rng), rng)
  }
  return run
}

describe('whole seasons', () => {
  const RUNS = 120

  test('reports how often a season is actually completed', () => {
    const rows: string[] = []
    let complete = 0
    let total = 0

    for (const style of STYLES) {
      for (const [label, policy, draft] of [
        ['starter deck ', coachPolicy, false],
        ['drafting     ', coachPolicy, true],
        ['+ chips      ', chipsPolicy, true],
      ] as const) {
        let made = 0
        let weeks = 0
        let cards = 0
        for (let seed = 1; seed <= RUNS; seed++) {
          const run = playSeason(style, seed, policy, draft)
          if (run.status === 'complete') made++
          weeks += run.history.length
          cards += run.deck.length
        }
        if (label === '+ chips      ') {
          complete += made
          total += RUNS
        }
        rows.push(
          `  ${style.padEnd(16)}${label} ${((made / RUNS) * 100).toFixed(0).padStart(3)}% complete` +
            `   ${(weeks / RUNS).toFixed(1)} weeks survived` +
            `   ${(cards / RUNS).toFixed(1)}-card sheet`,
        )
      }
    }

    console.log(
      `\n  season completion — ${RUNS} runs per row, ${SEASON.games} games, ` +
        `${SEASON.lossesAllowed} losses allowed\n` +
        rows.join('\n') +
        `\n\n  a chip-spending player completes ${((complete / total) * 100).toFixed(0)}% of seasons`,
    )
    expect(total).toBeGreaterThan(0)
  })

  test('every style can finish a season', () => {
    for (const style of STYLES) {
      let any = false
      for (let seed = 1; seed <= 80 && !any; seed++) {
        if (playSeason(style, seed, chipsPolicy, true).status === 'complete') any = true
      }
      expect(any).toBe(true)
    }
  })
})
