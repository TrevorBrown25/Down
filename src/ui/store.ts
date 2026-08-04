import { create } from 'zustand'
import { makeRng, type Rng } from '../game/rng'
import type { OffFormationName, StyleName } from '../game/cards'
import { SAVE_VERSION } from '../game/save'
import * as storage from './storage'
import {
  armChip,
  callPlay,
  challenge,
  declareFormation,
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
  buyItem,
  chooseEventOption,
  finishGame,
  leaveShop,
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

  /** Whether a resumable run was found in storage at boot. */
  resumable: boolean
  /** Which pre-run screen is showing. Only meaningful while there is no run. */
  screen: 'menu' | 'choose'

  /* run */
  startRun: (style: StyleName, seed?: number) => void
  /** Menu -> style select. */
  newRunFlow: () => void
  toMenu: () => void
  resume: () => void
  discardSave: () => void
  kickoff: () => void
  finishWeek: () => void
  chooseEvent: (index: 0 | 1) => void
  buy: (index: number) => void
  leaveShop: () => void
  draft: (cardId: number) => void
  passOnDraft: () => void
  cut: (cardId: number) => void
  abandon: () => void

  /* game */
  declare: (form: OffFormationName) => void
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

/** What was in storage when the page loaded, checked exactly once. */
const onDisk = storage.read()

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
    resumable: onDisk.ok,
    screen: 'menu',

    newRunFlow: () => set({ screen: 'choose' }),
    toMenu: () => set({ screen: 'menu' }),

    startRun: (style, seed = randomSeed()) => {
      set({
        rng: makeRng(seed),
        run: newRun(style, seed),
        game: null,
        resumable: false,
        screen: 'menu',
      })
    },

    // Restoring the RNG position matters as much as restoring the run: without
    // it a reload replays the same rolls, which is both wrong and scummable.
    resume: () => {
      const found = storage.read()
      if (!found.ok) {
        set({ resumable: false })
        return
      }
      set({
        run: found.save.run,
        game: found.save.game,
        rng: makeRng(found.save.rngState),
        resumable: false,
      })
    },

    discardSave: () => {
      storage.clear()
      set({ run: null, game: null, resumable: false })
    },


    kickoff: () => {
      const { run, rng } = get()
      if (!run || run.status !== 'playing') return
      set({ game: startGame(run, rng) })
    },

    // Bank the result and clear the field. The week between games is now
    // pending: the scenario first, then the draft it shapes.
    finishWeek: () => {
      const { run, game, rng } = get()
      if (!run || !game || game.phase !== 'over') return
      set({ run: finishGame(run, game, rng), game: null })
    },

    chooseEvent: (index) => onRun((r, rng) => chooseEventOption(r, index, rng)),
    buy: (index) => onRun((r) => buyItem(r, index)),
    leaveShop: () => onRun((r, rng) => leaveShop(r, rng)),
    draft: (cardId) => onRun((r) => takeCard(r, cardId)),
    passOnDraft: () => onRun((r) => skipDraft(r)),
    cut: (cardId) => onRun((r) => removeCard(r, cardId)),
    abandon: () => {
      storage.clear()
      set({ run: null, game: null, resumable: false, screen: 'menu' })
    },

    declare: (form) => step((g, rng) => declareFormation(g, form, rng)),
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

/**
 * Autosave. One subscription rather than a write in every action, so no future
 * action can forget to persist — the only way to lose progress is to not change
 * anything. The RNG position rides along; without it a reload replays the same
 * rolls, which is both wrong and trivially scummable.
 */
useGame.subscribe((state, prev) => {
  if (state.run === prev.run && state.game === prev.game) return
  if (!state.run) return
  storage.write({
    version: SAVE_VERSION,
    run: state.run,
    game: state.game,
    rngState: state.rng.state(),
  })
})
