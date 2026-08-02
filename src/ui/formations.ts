import type { DefFormationName, OffFormationName } from '../game/cards'

/**
 * Chalkboard coordinates in a 800x420 viewBox. The line of scrimmage sits at
 * y = 260: offense below it driving up the board, defense above it.
 *
 * Keyed on formation rather than personnel — I-Form and Gun 12 field different
 * bodies in wildly different places, and watching the shift is the point.
 */
export const LOS = 260

export type Man = { pos: string; x: number; y: number; skill?: boolean }

const OL = (y = 248): Man[] =>
  [310, 355, 400, 445, 490].map((x) => ({ pos: x === 400 ? 'C' : 'G', x, y }))

export const OFFENSE: Record<OffFormationName, Man[]> = {
  // 21 personnel: two backs, one tight end, two receivers.
  'I-Form': [
    ...OL(),
    { pos: 'TE', x: 537, y: 248, skill: true },
    { pos: 'WR', x: 142, y: 248, skill: true },
    { pos: 'WR', x: 688, y: 248, skill: true },
    { pos: 'QB', x: 400, y: 282, skill: true },
    { pos: 'FB', x: 400, y: 320, skill: true },
    { pos: 'RB', x: 400, y: 356, skill: true },
  ],
  // 12 personnel under center: two tight ends, one back.
  Singleback: [
    ...OL(),
    { pos: 'TE', x: 537, y: 248, skill: true },
    { pos: 'TE', x: 263, y: 248, skill: true },
    { pos: 'WR', x: 126, y: 248, skill: true },
    { pos: 'WR', x: 702, y: 248, skill: true },
    { pos: 'QB', x: 400, y: 282, skill: true },
    { pos: 'RB', x: 400, y: 332, skill: true },
  ],
  // Same eleven as Singleback, flexed out of the gun.
  'Gun 12': [
    ...OL(),
    { pos: 'TE', x: 537, y: 248, skill: true },
    { pos: 'TE', x: 616, y: 254, skill: true },
    { pos: 'WR', x: 106, y: 248, skill: true },
    { pos: 'WR', x: 716, y: 248, skill: true },
    { pos: 'QB', x: 400, y: 334, skill: true },
    { pos: 'RB', x: 454, y: 334, skill: true },
  ],
  // 11 personnel: three wide, gun.
  'Gun 11': [
    ...OL(),
    { pos: 'TE', x: 537, y: 248, skill: true },
    { pos: 'WR', x: 94, y: 248, skill: true },
    { pos: 'WR', x: 178, y: 264, skill: true },
    { pos: 'WR', x: 722, y: 248, skill: true },
    { pos: 'QB', x: 400, y: 334, skill: true },
    { pos: 'RB', x: 454, y: 334, skill: true },
  ],
}

export const DEFENSE: Record<DefFormationName, Man[]> = {
  '3-4': [
    { pos: 'DE', x: 355, y: 228 },
    { pos: 'NT', x: 400, y: 228 },
    { pos: 'DE', x: 445, y: 228 },
    { pos: 'LB', x: 306, y: 186 },
    { pos: 'LB', x: 366, y: 184 },
    { pos: 'LB', x: 436, y: 184 },
    { pos: 'LB', x: 496, y: 186 },
    { pos: 'CB', x: 150, y: 220 },
    { pos: 'CB', x: 680, y: 220 },
    { pos: 'S', x: 328, y: 108 },
    { pos: 'S', x: 472, y: 108 },
  ],
  '4-3': [
    { pos: 'DE', x: 328, y: 228 },
    { pos: 'DT', x: 375, y: 228 },
    { pos: 'DT', x: 425, y: 228 },
    { pos: 'DE', x: 472, y: 228 },
    { pos: 'LB', x: 320, y: 186 },
    { pos: 'LB', x: 400, y: 182 },
    { pos: 'LB', x: 480, y: 186 },
    { pos: 'CB', x: 150, y: 220 },
    { pos: 'CB', x: 680, y: 220 },
    { pos: 'S', x: 328, y: 108 },
    { pos: 'S', x: 472, y: 108 },
  ],
  '4-2-5': [
    { pos: 'DE', x: 328, y: 228 },
    { pos: 'DT', x: 375, y: 228 },
    { pos: 'DT', x: 425, y: 228 },
    { pos: 'DE', x: 472, y: 228 },
    { pos: 'LB', x: 352, y: 186 },
    { pos: 'LB', x: 448, y: 186 },
    { pos: 'CB', x: 144, y: 220 },
    { pos: 'NB', x: 226, y: 204 },
    { pos: 'CB', x: 686, y: 220 },
    { pos: 'S', x: 328, y: 106 },
    { pos: 'S', x: 472, y: 106 },
  ],
  Dime: [
    { pos: 'DE', x: 328, y: 228 },
    { pos: 'DT', x: 375, y: 228 },
    { pos: 'DT', x: 425, y: 228 },
    { pos: 'DE', x: 472, y: 228 },
    { pos: 'LB', x: 400, y: 188 },
    { pos: 'CB', x: 128, y: 220 },
    { pos: 'NB', x: 216, y: 200 },
    { pos: 'NB', x: 596, y: 200 },
    { pos: 'CB', x: 700, y: 220 },
    { pos: 'S', x: 328, y: 104 },
    { pos: 'S', x: 472, y: 104 },
  ],
}

/** Shown before the snap, when only the personnel group has been declared. */
export const HUDDLE: Man[] = [
  { pos: '', x: 360, y: 320 },
  { pos: '', x: 400, y: 306 },
  { pos: '', x: 440, y: 320 },
  { pos: '', x: 452, y: 350 },
  { pos: '', x: 420, y: 368 },
  { pos: '', x: 380, y: 368 },
  { pos: '', x: 348, y: 350 },
  { pos: '', x: 372, y: 292 },
  { pos: '', x: 428, y: 292 },
  { pos: '', x: 400, y: 344 },
  { pos: '', x: 400, y: 380 },
]
