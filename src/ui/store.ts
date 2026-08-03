import { create } from 'zustand'
import { makeRng, type Rng } from '../game/rng'
import type { Personnel, StyleName } from '../game/cards'
import {
  armChip,
  callPlay,
  challenge,
  declarePersonnel,
  fieldGoal,
  hurryUp,
  nextDown,
  playAudible,
  playInfoCard,
  punt,
  toss,
  type ChipAbility,
  type Game,
} from '../game/engine'
import {
  finishGame,
  newRun,
  removeCard,
  skipDraft,
  startGame,
  takeCard,
  type Run,
} from '../game/run'

/**
 * A thin shell over the engine and the run. Every rule lives in `src/game`;
 * this holds the current state and the run's RNG, which is mutable and
 * deliberately not part of the rendered state.
 */
type Store = {
  run: Run | null
  game: Game | null
  rng: Rng

  /* run */
  startRun: (style: StyleName, seed?: number) => void
  kickoff: () => void
  finishWeek: () => void
  draft: (cardId: number) => void
  passOnDraft: () => void
  cut: (cardId: number) => void
  abandon: () => void

  /* game */
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
}

const randomSeed = () => Math.floor(Math.random() * 1_000_000) + 1

export const useGame = create<Store>((set, get) => {
  /** Apply an engine transition to the live game. */
  const step = (fn: (game: Game, rng: Rng) => Game) => {
    const { game, rng } = get()
    if (!game) return
    set({ game: fn(game, rng) })
  }

  /** Apply a transition to the run. */
  const onRun = (fn: (run: Run, rng: Rng) => Run) => {
    const { run, rng } = get()
    if (!run) return
    set({ run: fn(run, rng) })
  }

  return {
    run: null,
    game: null,
    rng: makeRng(1),

    startRun: (style, seed = randomSeed()) => {
      set({ rng: makeRng(seed), run: newRun(style, seed), game: null })
    },

    kickoff: () => {
      const { run, rng } = get()
      if (!run || run.status !== 'playing') return
      set({ game: startGame(run, rng) })
    },

    // Bank the result and clear the field. The draft, if any, is now pending.
    finishWeek: () => {
      const { run, game, rng } = get()
      if (!run || !game || game.phase !== 'over') return
      set({ run: finishGame(run, game, rng), game: null })
    },

    draft: (cardId) => onRun((r) => takeCard(r, cardId)),
    passOnDraft: () => onRun((r) => skipDraft(r)),
    cut: (cardId) => onRun((r) => removeCard(r, cardId)),
    abandon: () => set({ run: null, game: null }),

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
  }
})
