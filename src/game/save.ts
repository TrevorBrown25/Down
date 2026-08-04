import { z } from 'zod'
import {
  ADJ_TEXT,
  COVERAGES,
  DEF_FORMATIONS,
  OFF_FORMATIONS,
  OFF_PLAYS,
  PACKAGES,
  PERSONNEL,
  STARTERS,
} from './cards'
import { DRILLS } from './events'
import { OPPONENTS } from './opponents'
import type { Game } from './engine'
import type { Run } from './run'

/**
 * Bumped whenever a change makes older saves unloadable. A run mid-season is
 * forty minutes of someone's evening, so the rule is: validate hard, and when
 * it fails say so plainly rather than resuming into a broken game.
 */
export const SAVE_VERSION = 1

/** Enums come from the real tables, so a schema can never drift from the game. */
const keysOf = <T extends object>(o: T) => Object.keys(o) as [string, ...string[]]

const style = z.enum(keysOf(STARTERS))
const formation = z.enum(keysOf(OFF_FORMATIONS))
const play = z.enum(keysOf(OFF_PLAYS))
const adjustment = z.enum(keysOf(ADJ_TEXT))
const personnel = z.enum(keysOf(PERSONNEL))
const coverage = z.enum(keysOf(COVERAGES))
const defFormation = z.enum(keysOf(DEF_FORMATIONS))
const packageName = z.enum(keysOf(PACKAGES))
const opponentName = z.enum(keysOf(OPPONENTS))
const drill = z.enum(keysOf(DRILLS))
const defAdj = z.enum(['Run Commit', 'Creeper', 'Bail'])

const card = z.discriminatedUnion('type', [
  z.object({ id: z.number(), type: z.literal('play'), form: formation, play }),
  z.object({ id: z.number(), type: z.literal('adj'), name: adjustment }),
])

const groupBonus = z.object({
  block: z.number().optional(),
  man: z.number().optional(),
  zone: z.number().optional(),
})
const groupTrim = z.partialRecord(personnel, groupBonus)

const effect = z.union([
  z.object({ kind: z.literal('practice'), group: personnel, drill }),
  z.object({ kind: z.literal('injury'), group: personnel, severity: z.number().optional() }),
  z.object({ kind: z.literal('offers'), extra: z.number() }),
  z.object({ kind: z.literal('cut'), count: z.number().optional() }),
  z.object({ kind: z.literal('scout') }),
  z.object({ kind: z.literal('chips'), extra: z.number() }),
])

const option = z.object({ label: z.string(), effects: z.array(effect) })

const gameEvent = z.object({
  id: z.string(),
  title: z.string(),
  text: z.string(),
  options: z.tuple([option, option]),
})

const shopItem = z.union([
  z.object({ kind: z.literal('card'), card, price: z.number() }),
  z.object({ kind: z.literal('cut'), price: z.number() }),
  z.object({ kind: z.literal('drill'), group: personnel, drill, price: z.number() }),
  z.object({ kind: z.literal('chips'), extra: z.number(), price: z.number() }),
])

const playResult = z.object({
  yards: z.number(),
  event: z.string(),
  turnover: z.boolean().optional(),
  protected: z.boolean().optional(),
})

const mods = z.object({
  juice: z.boolean(),
  bonusBlockers: z.number(),
  vsMan: z.number(),
  vsZone: z.number(),
})

const snapInput = z.object({
  formName: formation,
  playName: play,
  defFormName: defFormation,
  coverageName: coverage,
  defAdj: defAdj.nullable(),
  charge: z.number(),
  down: z.number(),
  possession: z.number(),
  ballOn: z.number(),
  protect: z.boolean(),
  mods,
  firedCounts: z.record(z.string(), z.number()),
  lastPlayName: play.nullable(),
  groupTrim,
})

const logEntry = z.union([
  z.object({
    kind: z.literal('snap'),
    down: z.number(),
    toGo: z.number(),
    at: z.string(),
    call: z.string(),
    def: z.string(),
    charge: z.number(),
    event: z.string(),
    yards: z.number(),
  }),
  z.object({ kind: z.literal('divider'), text: z.string() }),
])

const gameSchema = z.object({
  archetype: style,
  opponentName,
  target: z.number(),
  deck: z.array(card),
  hand: z.array(card),
  discard: z.array(card),
  ballOn: z.number(),
  down: z.number(),
  toGo: z.number(),
  points: z.number(),
  possessionsUsed: z.number(),
  charge: z.number(),
  chips: z.number(),
  challengeUsed: z.boolean(),
  phase: z.enum(['personnel', 'call', 'result', 'over']),
  won: z.boolean(),
  declared: personnel.nullable(),
  defPack: packageName.nullable(),
  defForm: defFormation.nullable(),
  defCov: coverage.nullable(),
  defAdj: defAdj.nullable(),
  groupsInHand: z.array(personnel),
  tossUsed: z.boolean(),
  audibled: z.boolean(),
  quickArmed: z.boolean(),
  protectArmed: z.boolean(),
  juiceArmed: z.boolean(),
  freshArmed: z.boolean(),
  known: z.string().nullable(),
  disguised: z.boolean(),
  lastSnap: z
    .object({ result: playResult, fired: z.array(z.string()), chargeUsed: z.number() })
    .nullable(),
  lastSnapInput: snapInput.nullable(),
  lastCall: z.object({ form: formation, play }).nullable(),
  revealed: z.record(z.string(), z.boolean()),
  ruleFireCounts: z.record(z.string(), z.number()),
  groupTrim,
  log: z.array(logEntry),
  notice: z.string().nullable(),
})

const runSchema = z.object({
  style,
  seed: z.number(),
  deck: z.array(card),
  schedule: z.array(z.object({ week: z.number(), opponentName, tier: z.number() })),
  at: z.number(),
  wins: z.number(),
  losses: z.number(),
  status: z.enum(['playing', 'complete', 'eliminated']),
  pendingEvent: gameEvent.nullable(),
  pendingShop: z.object({ items: z.array(shopItem), sold: z.array(z.number()) }).nullable(),
  pending: z.object({ cards: z.array(card), cuts: z.number() }).nullable(),
  history: z.array(
    z.object({ week: z.number(), opponentName, won: z.boolean(), points: z.number() }),
  ),
  nextCardId: z.number(),
  conditioning: groupTrim,
  injuries: groupTrim,
  bonusChips: z.number(),
  intel: z.array(z.string()),
  seenEvents: z.array(z.string()),
  coins: z.number(),
  shopCuts: z.number(),
})

export const saveSchema = z.object({
  version: z.literal(SAVE_VERSION),
  run: runSchema,
  game: gameSchema.nullable(),
  /** Where the run's random stream had got to. Without this a reload re-rolls. */
  rngState: z.number(),
})

export type SaveFile = {
  version: number
  run: Run
  game: Game | null
  rngState: number
}

export const encode = (save: SaveFile): string => JSON.stringify(save)

export type LoadResult =
  | { ok: true; save: SaveFile }
  | { ok: false; reason: 'empty' | 'unreadable' | 'stale' }

/**
 * Never throws and never half-loads. A save written by an older card pool will
 * fail the enum checks and come back as stale, which the menu can explain,
 * rather than resuming into a game that references a play that no longer exists.
 */
export function decode(raw: string | null): LoadResult {
  if (!raw) return { ok: false, reason: 'empty' }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'unreadable' }
  }

  const result = saveSchema.safeParse(parsed)
  if (!result.success) {
    const versioned = z.object({ version: z.number() }).safeParse(parsed)
    return { ok: false, reason: versioned.success ? 'stale' : 'unreadable' }
  }
  return { ok: true, save: result.data as SaveFile }
}
