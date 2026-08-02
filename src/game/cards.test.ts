import { describe, expect, test } from 'vitest'
import {
  buildDeck,
  DECKS,
  OFF_FORMATIONS,
  OFF_PLAYS,
  personnelOf,
  type DeckName,
} from './cards'
import { makeRng } from './rng'

// Characterization tests: these pin the shipped prototype's numbers so a port
// bug or a bad edit shows up as a failure. They are not a spec — if a balance
// change is deliberate, the expected value here moves with it.

const DECK_NAMES = Object.keys(DECKS) as DeckName[]

describe('deck data', () => {
  test.each(DECK_NAMES)('%s is 20 plays plus 4 adjustments', (name) => {
    const deck = buildDeck(name, makeRng(1))
    expect(deck.filter((c) => c.type === 'play')).toHaveLength(20)
    expect(deck.filter((c) => c.type === 'adj')).toHaveLength(4)
  })

  test.each(DECK_NAMES)('%s only references formations and plays that exist', (name) => {
    for (const card of buildDeck(name, makeRng(1))) {
      if (card.type !== 'play') continue
      expect(OFF_FORMATIONS[card.form]).toBeDefined()
      expect(OFF_PLAYS[card.play]).toBeDefined()
    }
  })

  test.each(DECK_NAMES)('%s offers plays in at least two personnel groups', (name) => {
    // The personnel declaration is the core decision. A deck that only ever
    // fields one group would make that choice disappear.
    const groups = new Set(
      buildDeck(name, makeRng(1))
        .filter((c) => c.type === 'play')
        .map((c) => personnelOf(c.form)),
    )
    expect(groups.size).toBeGreaterThanOrEqual(2)
  })

  test('gives every card a unique id', () => {
    const deck = buildDeck('Pro Style', makeRng(1))
    expect(new Set(deck.map((c) => c.id)).size).toBe(deck.length)
  })

  test('shuffles deterministically for a given seed', () => {
    expect(buildDeck('Air Raid', makeRng(99))).toEqual(buildDeck('Air Raid', makeRng(99)))
  })

  test('shuffles differently for different seeds', () => {
    expect(buildDeck('Air Raid', makeRng(1))).not.toEqual(buildDeck('Air Raid', makeRng(2)))
  })
})
