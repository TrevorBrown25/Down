import { describe, expect, test } from 'vitest'
import { makeRng, type Rng } from '../game/rng'
import {
  canRun,
  OFF_FORMATIONS,
  OFF_PLAYS,
  personnelOf,
  STARTERS,
  type Card,
  type StyleName,
} from '../game/cards'
import {
  callPlay,
  declareFormation,
  fieldGoal,
  legalPlays,
  nextDown,
  punt,
  type Game,
} from '../game/engine'
import { manShare } from '../game/opponents'
import {
  SEASON,
  chooseEventOption,
  currentNode,
  finishGame,
  homeGroup,
  newRun,
  buyItem,
  leaveShop,
  removeCard,
  skipDraft,
  startGame,
  takeCard,
  type Run,
} from '../game/run'
import { SPILL, wasted, type EventOption } from '../game/events'
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
      game = declareFormation(game, policy.formation(game, rng), rng)
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


/** How much this sheet wants a given card. Higher is better. */
function cardValue(run: Run, c: Card): number {
  if (c.type !== 'play') return 4
  const play = OFF_PLAYS[c.play]
  const home = homeGroup(run)
  let v = play.base * 0.4
  // Worth more if a formation in the group this sheet leans on can run it.
  const forms = Object.keys(OFF_FORMATIONS) as (keyof typeof OFF_FORMATIONS)[]
  if (forms.some((f) => personnelOf(f) === home && canRun(f, c.play))) v += 10
  return v
}

function bestOffer(run: Run, offers: readonly Card[]): Card | undefined {
  return [...offers].sort((a, b) => cardValue(run, b) - cardValue(run, a))[0]
}

/**
 * The card a real player cuts: whatever strands them furthest from the group
 * they live in. Without this the sim never cuts at all, which silently prices
 * every cut a week offers at zero.
 */
function worstCard(run: Run): Card | undefined {
  if (run.deck.length <= SEASON.minDeck) return undefined
  return [...run.deck].sort((a, b) => cardValue(run, a) - cardValue(run, b))[0]
}

/**
 * Which way through the week a player takes. Everything is priced against the
 * group the sheet lives in — a knock to a group you never declare is nearly
 * free, and a practice week on one you never declare is nearly worthless.
 */
function scoreOption(run: Run, option: EventOption): number {
  const home = homeGroup(run)
  let v = 0
  for (const e of option.effects) {
    switch (e.kind) {
      case 'practice': {
        // A drill already at its peak gains nothing. Missing this is what made
        // the first version of this scorer worse than a coin flip: it kept
        // buying a dead practice and paying the injury stapled to it.
        if (wasted(e, run.conditioning)) break
        // Blocking reaches every snap that group takes. A coverage drill only
        // cashes against the coverage it was aimed at — so it is worth what
        // next week's opponent actually plays, which the screen now shows.
        const node = currentNode(run)
        const man = node ? manShare(node.opponentName) : 0.5
        const worth =
          e.drill === 'blocking' ? 4 : e.drill === 'routes' ? 5 * man : 5 * (1 - man)
        // A drill off your home group still carries at the spill rate.
        v += e.group === home ? worth : worth * SPILL
        break
      }
      case 'injury':
        // Superlinear on purpose: a knock big enough to lose a game costs a
        // third of the whole season's loss allowance, not a few yards.
        v -= (e.severity ?? 1) ** 2 * (e.group === home ? 4 : 2.5)
        break
      case 'offers':
        v += e.extra * 2
        break
      case 'cut':
        // Concentration is the strongest lever the sim has ever measured, and
        // a week is now the only place to buy it.
        v += 6 * (e.count ?? 1)
        break
      case 'scout':
        v += 2
        break
      case 'chips':
        v += e.extra * 2.5
        break
    }
  }
  return v
}

/**
 * Take the better option, or deliberately the worse one. Both branches score
 * both options, so the choice itself consumes no randomness — the arms stay in
 * the same universe, which the first version of this ablation did not.
 */
type EventPolicy = 'best' | 'worst'

function playSeason(
  style: StyleName,
  seed: number,
  policy: Policy,
  draft: boolean,
  events: EventPolicy = 'best',
  shopping = true,
): Run {
  // The meta layer (which events appear, which cards are offered) and the games
  // themselves are on separate streams. An option that widens a draft draws
  // more cards, and without this that alone would shift every later game into a
  // different universe and swamp the effect being measured.
  const meta = makeRng(seed)
  let run = newRun(style, seed)
  let guard = 0

  while (run.status === 'playing' && guard++ < 60) {
    if (run.pendingEvent) {
      const [a, b] = run.pendingEvent.options
      const better = scoreOption(run, a) >= scoreOption(run, b) ? 0 : 1
      const choice: 0 | 1 = events === 'best' ? better : better === 0 ? 1 : 0
      run = chooseEventOption(run, choice, meta)
      continue
    }
    if (run.pendingShop) {
      // Buy in value order while the coins last: a cut is the strongest thing
      // measured anywhere, then a card for the group the sheet lives in.
      const rank = (i: number) => {
        const item = run.pendingShop?.items[i]
        if (!item) return -1
        if (item.kind === 'cut') return 100
        if (item.kind === 'card') return item.card.type === 'play' ? cardValue(run, item.card) : 4
        if (item.kind === 'drill') return 9
        return 7
      }
      const order = run.pendingShop.items.map((_, i) => i).sort((a, b) => rank(b) - rank(a))
      for (const i of order) run = shopping ? buyItem(run, i) : run
      run = leaveShop(run, meta)
      continue
    }
    if (run.pending) {
      // A week that opens a cut gets used: trim the card that strands the sheet
      // before adding to it.
      const offer = run.pending
      // Use every cut the week paid for, worst card first.
      for (let n = 0; draft && n < offer.cuts; n++) {
        const dud = worstCard(run)
        if (!dud) break
        run = removeCard(run, dud.id)
      }
      const pick = bestOffer(run, offer.cards)
      run = draft && pick ? takeCard(run, pick.id) : skipDraft(run)
      continue
    }
    // Each week is its own seed, so a game depends on the deck and the trim
    // that reach it — never on how much randomness the meta layer used up.
    const week = makeRng(seed * 1009 + run.at)
    run = finishGame(run, playOut(startGame(run, week), policy, week), meta)
  }
  return run
}

describe('whole seasons', () => {
  const RUNS = 300

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

  test('reports where seasons actually end', () => {
    // A completion rate alone hides the shape. A run that always dies in week 8
    // and a run that dies evenly across the season read the same on one number
    // and feel nothing alike.
    const rows: string[] = []

    for (const style of STYLES) {
      const diedAt = new Array(SEASON.games + 1).fill(0)
      let complete = 0
      const tierGames = [0, 0, 0]
      const tierWins = [0, 0, 0]

      for (let seed = 1; seed <= RUNS; seed++) {
        const run = playSeason(style, seed, chipsPolicy, true)
        if (run.status === 'complete') complete++
        else diedAt[run.history.length]++
        for (const g of run.history) {
          const tier = run.schedule.find((n) => n.week === g.week)?.tier ?? 1
          tierGames[tier - 1]++
          if (g.won) tierWins[tier - 1]++
        }
      }

      const curve = diedAt
        .map((n, week) => (week === 0 ? null : `w${week} ${((n / RUNS) * 100).toFixed(0)}%`))
        .filter(Boolean)
        .join('  ')
      const perTier = tierGames
        .map((g, i) => `t${i + 1} ${g ? ((tierWins[i] / g) * 100).toFixed(0) : '--'}%`)
        .join('  ')

      rows.push(
        `  ${style.padEnd(16)} finished ${((complete / RUNS) * 100).toFixed(0).padStart(3)}%` +
          `   per-game ${perTier}\n` +
          `  ${' '.repeat(16)} died in   ${curve}`,
      )
    }

    console.log(`\n  where seasons end — ${RUNS} runs per style\n` + rows.join('\n'))
    expect(rows).toHaveLength(STYLES.length)
  })

  test('reports whether the shop rescues a run that is behind', () => {
    // The economy exists so a game you lost still bought something. The number
    // that matters is not overall completion — it is completion for the runs
    // that were already down a game, which is who the shop is for.
    const rows: string[] = []

    for (const style of STYLES) {
      const stat = { on: [0, 0], off: [0, 0], behindOn: [0, 0], behindOff: [0, 0], coins: 0 }

      for (let seed = 1; seed <= RUNS; seed++) {
        for (const shopping of [true, false]) {
          const run = playSeason(style, seed, chipsPolicy, true, 'best', shopping)
          const bucket = shopping ? stat.on : stat.off
          bucket[1]++
          if (run.status === 'complete') bucket[0]++
          if (shopping) stat.coins += run.coins

          // "Behind" = dropped one in the first half, so there was a hole to
          // climb out of rather than a clean sheet.
          const early = run.history.slice(0, 4).some((g) => !g.won)
          if (early) {
            const b = shopping ? stat.behindOn : stat.behindOff
            b[1]++
            if (run.status === 'complete') b[0]++
          }
        }
      }

      const pct = ([made, total]: number[]) => (total ? (made / total) * 100 : 0)
      rows.push(
        `  ${style.padEnd(16)} all runs  shop ${pct(stat.on).toFixed(0).padStart(3)}%` +
          ` vs none ${pct(stat.off).toFixed(0).padStart(3)}%` +
          `   (${(pct(stat.on) - pct(stat.off) >= 0 ? '+' : '')}${(pct(stat.on) - pct(stat.off)).toFixed(0)}pp)\n` +
          `  ${' '.repeat(16)} down early  shop ${pct(stat.behindOn).toFixed(0).padStart(3)}%` +
          ` vs none ${pct(stat.behindOff).toFixed(0).padStart(3)}%` +
          `   (${(pct(stat.behindOn) - pct(stat.behindOff) >= 0 ? '+' : '')}${(pct(stat.behindOn) - pct(stat.behindOff)).toFixed(0)}pp)` +
          `   ${(stat.coins / RUNS).toFixed(0)}¢ a season`,
      )
    }

    console.log(`\n  does the shop rescue a run? — ${RUNS} runs per cell\n` + rows.join('\n'))
    expect(rows).toHaveLength(STYLES.length)
  })

  test('reports whether the week between games is a real decision', () => {
    // Same seeds, same play policy, same drafting — the only thing that varies
    // is which way through the event you take. If picking well is worth nothing
    // the two rows land on top of each other and the events are just flavour.
    const rows: string[] = []
    let bestTotal = 0
    let randTotal = 0

    for (const style of STYLES) {
      let best = 0
      let rand = 0
      for (let seed = 1; seed <= RUNS; seed++) {
        if (playSeason(style, seed, chipsPolicy, true, 'best').status === 'complete') best++
        if (playSeason(style, seed, chipsPolicy, true, 'worst').status === 'complete') rand++
      }
      bestTotal += best
      randTotal += rand
      rows.push(
        `  ${style.padEnd(16)}` +
          `choosing well ${((best / RUNS) * 100).toFixed(0).padStart(3)}%` +
          `   choosing badly ${((rand / RUNS) * 100).toFixed(0).padStart(3)}%` +
          `   edge ${(((best - rand) / RUNS) * 100 >= 0 ? '+' : '')}${(((best - rand) / RUNS) * 100).toFixed(0)}pp`,
      )
    }

    console.log(
      `\n  is the week between games a decision? — ${RUNS} runs per cell\n` +
        rows.join('\n') +
        `\n\n  overall  ${(((bestTotal - randTotal) / (RUNS * STYLES.length)) * 100).toFixed(1)}pp ` +
        `for picking the right option`,
    )
    expect(bestTotal + randTotal).toBeGreaterThan(0)
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
