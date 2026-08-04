import { describe, expect, test } from 'vitest'
import { makeRng, type Rng } from '../game/rng'
import { STARTERS, type StyleName } from '../game/cards'
import {
  callPlay, declareFormation, fieldGoal, legalPlays, nextDown, punt, RULES, type Game,
} from '../game/engine'
import { chooseEventOption, finishGame, leaveShop, newRun, startGame, takeCard } from '../game/run'
import {
  antiOraclePolicy, chipsPolicy, coachPolicy, randomPolicy, oraclePolicy, type Policy,
} from './policy'

/** Same fourth-down rule for everyone, so only the play call varies. */
const alwaysGo = (p: Policy): Policy => ({ ...p, fourthDown: () => 'go' })

const STYLES = Object.keys(STARTERS) as StyleName[]

type Tally = {
  snaps: number
  choices: number[]
  dead: string[]
  handPlays: number[]
  /** Games played and won, by opponent tier — where a season is actually lost. */
  tierGames: number[]
  tierWins: number[]
}
const newTally = (): Tally => ({
  snaps: 0, choices: [], dead: [], handPlays: [], tierGames: [0, 0, 0], tierWins: [0, 0, 0],
})

/** Plays a game, counting how many snaps and how many were a real choice. */
function playOut(start: Game, policy: Policy, rng: Rng, tally: Tally) {
  let game = start
  let steps = 0
  while (game.phase !== 'over' && steps++ < 500) {
    if (game.phase === 'personnel') { game = declareFormation(game, policy.formation(game, rng), rng); continue }
    if (game.phase === 'result') { game = nextDown(game, rng); continue }
    const ready = policy.preSnap?.(game, rng) ?? game
    if (ready.down === 4) {
      const c = policy.fourthDown(ready)
      if (c === 'punt') { game = punt(ready, rng); continue }
      if (c === 'fg') { game = fieldGoal(ready, rng); continue }
    }
    const legal = legalPlays(ready)
    tally.snaps++
    tally.choices.push(legal.length)
    if (legal.length <= 1) {
      // Why was there nothing to choose between? Either the hand held one
      // group, or it held several and the declaration stranded the rest.
      const groups = new Set([ready.formation])
      tally.dead.push(groups.size === 1 ? 'one group in hand' : 'declaration stranded them')
      tally.handPlays.push(ready.hand.filter((c) => c.type === 'play').length)
    }
    game = legal.length === 0 ? punt(ready, rng) : callPlay(ready, policy.play(ready, legal, rng).id, rng)
  }
  return game
}

function season(style: StyleName, seed: number, policy: Policy, tally: Tally) {
  const meta = makeRng(seed)
  let run = newRun(style, seed)
  let guard = 0
  let weeks = 0
  while (run.status === 'playing' && guard++ < 60) {
    if (run.pendingEvent) { run = chooseEventOption(run, 0, meta); weeks++; continue }
    if (run.pendingShop) { run = leaveShop(run, meta); weeks++; continue }
    if (run.pending) { const c = run.pending.cards[0]; run = c ? takeCard(run, c.id) : run; weeks++; continue }
    const wk = makeRng(seed * 1009 + run.at)
    run = finishGame(run, playOut(startGame(run, wk), policy, wk, tally), meta)
  }
  return { run, weeks }
}

/**
 * The question this file exists to answer: does calling plays well beat calling
 * them at random? It was written after a playtest where random picking felt as
 * good as thinking — and it was, because the coverage was hidden. Keep it
 * pointed at that, and keep the ladder monotonic.
 */
describe('is there a game here', () => {
  const N = 120

  test('what does thinking actually buy you', () => {
    const rows: string[] = []
    for (const style of STYLES) {
      const cells: string[] = []
      for (const [label, policy] of [
        ['worst   ', alwaysGo(antiOraclePolicy)],
        ['random  ', alwaysGo(randomPolicy)],
        ['coach   ', alwaysGo(coachPolicy)],
        ['oracle  ', alwaysGo(oraclePolicy)],
      ] as const) {
        let made = 0
        const tally = newTally()
        for (let s = 1; s <= N; s++) {
          const { run } = season(style, s, policy, tally)
          if (run.status === 'complete') made++
          for (const g of run.history) {
            const tier = run.schedule.find((n) => n.week === g.week)?.tier ?? 1
            tally.tierGames[tier - 1]++
            if (g.won) tally.tierWins[tier - 1]++
          }
        }
        const perTier = tally.tierGames
          .map((n, i) => (n ? `${((tally.tierWins[i] / n) * 100).toFixed(0)}` : '--'))
          .join('/')
        cells.push(`${label}${((made / N) * 100).toFixed(0).padStart(3)}% [${perTier}]`)
      }
      rows.push(`  ${style.padEnd(16)}${cells.join('   ')}`)
    }
    console.log('\n  season completion by how hard you think\n' + rows.join('\n'))
    expect(rows).toHaveLength(3)
  }, 30_000)

  test('how much of a season is actually a decision', () => {
    const tally = newTally()
    let weeks = 0
    for (let s = 1; s <= N; s++) weeks += season('Pro Style', s, chipsPolicy, tally).weeks
    const hist: Record<number, number> = {}
    for (const c of tally.choices) hist[Math.min(c, 5)] = (hist[Math.min(c, 5)] ?? 0) + 1
    const total = tally.choices.length
    console.log(
      `\n  a season is ${(tally.snaps / N).toFixed(0)} snaps and ${(weeks / N).toFixed(1)} between-game screens\n` +
      `  legal plays available at the call:\n` +
      Object.entries(hist).sort().map(([k, v]) =>
        `    ${k === '5' ? '5+' : k} option${k === '1' ? ' ' : 's'}  ${((v / total) * 100).toFixed(0).padStart(3)}%`).join('\n') +
      `\n\n  when there was nothing to choose between:\n` +
      Object.entries(
        tally.dead.reduce<Record<string, number>>((a, r) => ((a[r] = (a[r] ?? 0) + 1), a), {}),
      ).map(([k, v]) => `    ${k.padEnd(28)} ${((v / tally.dead.length) * 100).toFixed(0).padStart(3)}%`).join('\n') +
      `\n  plays in hand on those snaps: ${(tally.handPlays.reduce((a, b) => a + b, 0) / tally.handPlays.length).toFixed(1)} of ${RULES.handSize}`,
    )
    expect(total).toBeGreaterThan(0)
  }, 30_000)
})
