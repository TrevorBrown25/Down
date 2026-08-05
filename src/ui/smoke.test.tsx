import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { legalPlays, playableFormations } from '../game/engine'
import { useGame } from './store'
import { Pregame } from './Pregame'
import { Table } from './Table'
import { Season } from './Season'
import { Draft } from './Draft'
import { EventWeek } from './EventWeek'
import { RunOver } from './RunOver'

/**
 * Renders the real components against real engine state. Catches the crashes a
 * typecheck cannot — a null read, a bad lookup key, a phase the view forgot.
 */

const store = () => useGame.getState()

describe('pregame', () => {
  test('renders', () => {
    const html = renderToStaticMarkup(<Pregame />)
    expect(html).toContain('DOWN')
    expect(html).toContain('GROUND &amp; POUND')
  })
})

describe('the table', () => {
  test('renders every phase of a real game without throwing', () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      store().startRun('Pro Style', 12)
      store().kickoff()
      const seen = new Set<string>()
      let steps = 0

      while (steps++ < 400) {
        const game = store().game
        if (!game) break
        seen.add(game.phase)

        // The view must survive being rendered in whatever state it is in.
        expect(() => renderToStaticMarkup(<Table game={game} />)).not.toThrow()
        if (game.phase === 'over') break

        if (game.phase === 'personnel') {
          store().declare(playableFormations(game)[0])
        } else if (game.phase === 'result') {
          store().advance()
        } else {
          const legal = legalPlays(game)
          if (legal.length === 0) store().punt()
          else store().call(legal[0].id)
        }
      }

      expect(seen.has('call')).toBe(true)
      expect(seen.has('result')).toBe(true)
      expect(seen.has('over')).toBe(true)
    }
  })

  test('renders with every optional action exercised', () => {
    store().startRun('Air Raid', 3)
    store().kickoff()
    const game = () => {
      const g = store().game
      if (!g) throw new Error('no game')
      return g
    }

    if (game().phase === 'personnel') store().declare(playableFormations(game())[0])

    // Buy a read, arm chips, toss, hurry up, audible — each must render after.
    const read = game().hand.find(
      (c) => c.type === 'adj' && (c.name === 'Motion' || c.name === 'Hot Read'),
    )
    if (read) store().read(read.id)

    store().arm('protect')
    store().hurry()

    const spare = game().hand.find((c) => c.type === 'play')
    if (spare) store().toss(spare.id)

    const aud = game().hand.find((c) => c.type === 'adj' && c.name === 'Audible')
    if (aud) store().audible(aud.id)

    expect(() => renderToStaticMarkup(<Table game={game()} />)).not.toThrow()

    // Snap it, then render the result and a challenge.
    const legal = legalPlays(game())
    if (legal.length > 0) {
      store().call(legal[0].id)
      expect(game().phase).toBe('result')
      expect(() => renderToStaticMarkup(<Table game={game()} />)).not.toThrow()
      store().flag()
      expect(game().challengeUsed).toBe(true)
      expect(() => renderToStaticMarkup(<Table game={game()} />)).not.toThrow()
    }
  })

  test('the coverage is on screen once personnel is declared', () => {
    // The whole point of showing it: a man/zone card grid is unusable if you
    // cannot see which one you are facing. If this ever regresses, careful play
    // and random play collapse back into the same thing.
    store().startRun('Pro Style', 17)
    store().kickoff()
    const dealt = store().game
    if (!dealt) throw new Error('no game')
    if (dealt.phase === 'personnel') store().declare(playableFormations(dealt)[0])

    const game = store().game
    if (!game) throw new Error('no game')
    expect(game.defCov).not.toBeNull()
    const html = renderToStaticMarkup(<Table game={game} />)
    expect(html).toMatch(/>MAN<|>ZONE</)
    expect(html).toContain(game.defCov as string)
  })

  test('what a practice week bought is on screen at the call', () => {
    // A drill is chosen weeks before it matters. If the table does not say what
    // the group is carrying, the player has to hold it in their head.
    store().startRun('Air Raid', 17)
    store().kickoff()
    const game = store().game
    if (!game) throw new Error('no game')
    // Air Raid comes out of camp with route running and film study banked.
    expect(Object.keys(game.groupTrim).length).toBeGreaterThan(0)
    const html = renderToStaticMarkup(<Table game={game} />)
    expect(html).toContain('what they can do')
    expect(html).toMatch(/vs man|vs zone|blocker/)
  })

  test('renders the fourth-down kick and punt paths', () => {
    store().startRun('Ground & Pound', 5)
    store().kickoff()
    // The kick and punt buttons only exist at the call, so get past personnel.
    const dealt = store().game
    if (!dealt) throw new Error('no game')
    if (dealt.phase === 'personnel') store().declare(playableFormations(dealt)[0])

    const g = store().game
    if (!g) throw new Error('no game')
    useGame.setState({ game: { ...g, down: 4, ballOn: 78, toGo: 6 } })
    const fourth = store().game
    if (!fourth) throw new Error('no game')
    expect(() => renderToStaticMarkup(<Table game={fourth} />)).not.toThrow()
    expect(renderToStaticMarkup(<Table game={fourth} />)).toContain('field goal')
  })
})

describe('a full season', () => {
  test('plays eight weeks end to end, rendering every screen', () => {
    store().startRun('Pro Style', 21)
    const seen = new Set<string>()
    let guard = 0

    while (guard++ < 60) {
      const run = store().run
      if (!run) break

      if (run.status !== 'playing') {
        seen.add('over')
        expect(() => renderToStaticMarkup(<RunOver run={run} />)).not.toThrow()
        break
      }
      if (run.pendingEvent) {
        seen.add('event')
        expect(() => renderToStaticMarkup(<EventWeek run={run} />)).not.toThrow()
        // Alternate the two options so both branches get exercised.
        store().chooseEvent(run.at % 2 === 0 ? 0 : 1)
        continue
      }
      if (run.pending) {
        seen.add('draft')
        expect(() => renderToStaticMarkup(<Draft run={run} />)).not.toThrow()
        // Alternate taking and passing so both paths get exercised.
        if (run.at % 2 === 0) store().draft(run.pending.cards[0].id)
        else store().passOnDraft()
        continue
      }

      seen.add('season')
      expect(() => renderToStaticMarkup(<Season run={run} />)).not.toThrow()

      store().kickoff()
      let steps = 0
      while (steps++ < 400) {
        const game = store().game
        if (!game || game.phase === 'over') break
        if (game.phase === 'personnel') store().declare(playableFormations(game)[0])
        else if (game.phase === 'result') store().advance()
        else {
          const legal = legalPlays(game)
          if (legal.length === 0) store().punt()
          else store().call(legal[0].id)
        }
      }
      store().finishWeek()
    }

    const run = store().run
    if (!run) throw new Error('run vanished')
    expect(seen.has('season')).toBe(true)
    expect(seen.has('event')).toBe(true)
    expect(seen.has('draft')).toBe(true)
    expect(seen.has('over')).toBe(true)
    expect(run.history.length).toBeGreaterThan(0)
    expect(['complete', 'eliminated']).toContain(run.status)
  })

  test('the deck actually grows when you draft', () => {
    store().startRun('Air Raid', 33)
    const before = store().run?.deck.length ?? 0
    store().kickoff()
    let steps = 0
    while (steps++ < 400) {
      const game = store().game
      if (!game || game.phase === 'over') break
      if (game.phase === 'personnel') store().declare(playableFormations(game)[0])
      else if (game.phase === 'result') store().advance()
      else {
        const legal = legalPlays(game)
        if (legal.length === 0) store().punt()
        else store().call(legal[0].id)
      }
    }
    store().finishWeek()
    // The scenario comes first; the draft is on the other side of it.
    if (store().run?.pendingEvent) store().chooseEvent(0)
    const offer = store().run?.pending
    if (!offer) throw new Error('expected a draft offer')
    store().draft(offer.cards[0].id)
    expect(store().run?.deck.length).toBe(before + 1)
  })
})
