import { create } from 'zustand'
import { makeRng, type Rng } from '../game/rng'
import type { DeckName, Personnel } from '../game/cards'
import {
  armChip,
  callPlay,
  challenge,
  declarePersonnel,
  fieldGoal,
  hurryUp,
  newGame,
  nextDown,
  playAudible,
  playInfoCard,
  punt,
  toss,
  type ChipAbility,
  type Game,
} from '../game/engine'

/**
 * A thin shell over the engine. Every rule lives in `src/game`; this only holds
 * the current state and the run's RNG, which is mutable and deliberately not
 * part of the rendered state.
 */
type Store = {
  game: Game | null
  seed: number
  rng: Rng
  start: (archetype: DeckName, opponentName: string, seed?: number) => void
  declare: (pers: Personnel) => void
  call: (cardId: number) => void
  advance: () => void
  toss: (cardId: number) => void
  hurry: () => void
  read: (cardId: number) => void
  audible: (cardId: number) => void
  arm: (which: ChipAbility) => void
  flag: () => void
  kick: () => void
  punt: () => void
  quit: () => void
}

const randomSeed = () => Math.floor(Math.random() * 1_000_000) + 1

export const useGame = create<Store>((set, get) => {
  /** Apply an engine transition, ignoring it when there is no game. */
  const step = (fn: (game: Game, rng: Rng) => Game) => {
    const { game, rng } = get()
    if (!game) return
    set({ game: fn(game, rng) })
  }

  return {
    game: null,
    seed: 0,
    rng: makeRng(1),

    start: (archetype, opponentName, seed = randomSeed()) => {
      const rng = makeRng(seed)
      set({ seed, rng, game: newGame({ seed, archetype, opponentName }, rng) })
    },

    declare: (pers) => step((g, rng) => declarePersonnel(g, pers, rng)),
    call: (cardId) => step((g, rng) => callPlay(g, cardId, rng)),
    advance: () => step((g, rng) => nextDown(g, rng)),
    toss: (cardId) => step((g, rng) => toss(g, cardId, rng)),
    hurry: () => step((g, rng) => hurryUp(g, rng)),
    read: (cardId) => step((g, rng) => playInfoCard(g, cardId, rng)),
    audible: (cardId) => step((g, rng) => playAudible(g, cardId, rng)),
    arm: (which) => step((g) => armChip(g, which)),
    flag: () => step((g, rng) => challenge(g, rng)),
    kick: () => step((g, rng) => fieldGoal(g, rng)),
    punt: () => step((g, rng) => punt(g, rng)),
    quit: () => set({ game: null }),
  }
})
