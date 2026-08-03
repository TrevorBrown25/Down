import { pick, type Rng } from './rng'
import { OFF_PLAYS, personnelOf, type Card, type Personnel } from './cards'
import { DRILLS, type Drill } from './events'

/**
 * Coins are earned by putting points on the board, so a game you lost 14-21
 * still pays for something. The loss consolation is the important number: a
 * pure per-point rate is regressive — the player already winning banks the most
 * — and the whole point of the economy is that a bad week is not a dead week.
 */
export const ECONOMY = {
  /** One coin per point scored, win or lose. */
  perPoint: 1,
  /**
   * Banked on top for taking the win. Must stay above the consolation: with it
   * below, a loss paid better than a win at the same score, which is perverse.
   */
  winBonus: 20,
  /**
   * Banked on top for losing. Deliberately close behind the win bonus — the
   * whole point of the economy is that a bad week still buys something.
   */
  lossConsolation: 16,
} as const

export type ShopItem =
  | { kind: 'card'; card: Card; price: number }
  | { kind: 'cut'; price: number }
  | { kind: 'drill'; group: Personnel; drill: Drill; price: number }
  | { kind: 'chips'; extra: number; price: number }

export type ShopOffer = {
  items: ShopItem[]
  /** Indices already bought. Everything is one to a customer. */
  sold: number[]
}

export const PRICES = {
  card: 42,
  cut: 40,
  drill: 48,
  chips: 26,
} as const

export const priceOf = (item: ShopItem) => item.price

/** What a week of shopping is worth to a sheet that lives in this group. */
export function buildShop(
  home: Personnel,
  plays: readonly [import('./cards').OffFormationName, import('./cards').OffPlayName][],
  nextCardId: number,
  rng: Rng,
): { offer: ShopOffer; nextCardId: number } {
  const items: ShopItem[] = []
  let id = nextCardId

  // Two cards, biased toward the group the sheet already lives in — a shop that
  // only sells cards you cannot line up is not a shop.
  const wanted = plays.filter(([form]) => personnelOf(form) === home)
  for (let n = 0; n < 2; n++) {
    const pool = n === 0 && wanted.length > 0 ? wanted : plays
    const [form, play] = pick(pool, rng)
    items.push({
      kind: 'card',
      card: { id, type: 'play', form, play },
      // A stronger play costs more. Keeps the cheap shelf worth looking at.
      price: Math.round(PRICES.card + (OFF_PLAYS[play].base - 4) * 3),
    })
    id++
  }

  // The shelf that actually matters. Measured: without a cut for sale the whole
  // shop is worth +1pp, and with one it is worth +13pp to a run that is behind.
  // Cards, drills and chips are the cheap shelf you browse on the way past.
  items.push({ kind: 'cut', price: PRICES.cut })

  const drill = pick(Object.keys(DRILLS) as Drill[], rng)
  items.push({ kind: 'drill', group: home, drill, price: PRICES.drill })

  items.push({ kind: 'chips', extra: 2, price: PRICES.chips })

  return { offer: { items, sold: [] }, nextCardId: id }
}

export const describeItem = (item: ShopItem): string => {
  switch (item.kind) {
    case 'card':
      return item.card.type === 'play' ? `${item.card.form} · ${item.card.play}` : 'card'
    case 'cut':
      return 'cut a card from the sheet'
    case 'drill':
      return `${item.group} personnel ${DRILLS[item.drill].gain}, all season`
    case 'chips':
      return `+${item.extra} ● in the next game`
  }
}
