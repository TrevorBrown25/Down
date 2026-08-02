import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import {
  ADJ_TEXT,
  OFF_PLAYS,
  personnelOf,
  type AdjustmentCard,
  type Card,
  type PlayCard,
} from '../game/cards'
import type { Game } from '../game/engine'

type Props = {
  game: Game
  playable: boolean
  onCall: (id: number) => void
  onToss: (id: number) => void
  onRead: (id: number) => void
  onAudible: (id: number) => void
  onArmQuick: () => void
}

const RUN_FACE = 'linear-gradient(168deg,#2c3b30,#1d2822)'
const PASS_FACE = 'linear-gradient(168deg,#293646,#1b2530)'
const ADJ_FACE = 'linear-gradient(168deg,#3a3427,#241f18)'

function PlayFace({ card, locked }: { card: PlayCard; locked: boolean }) {
  const play = OFF_PLAYS[card.play]
  const isRun = play.kind === 'run'
  return (
    <div
      className="flex h-full w-full flex-col justify-between rounded-[3px] border p-2.5"
      style={{
        borderColor: locked ? 'rgba(106,122,102,.35)' : 'rgba(238,243,230,.22)',
        background: isRun ? RUN_FACE : PASS_FACE,
        opacity: locked ? 0.42 : 1,
      }}
    >
      <div className="flex items-baseline justify-between">
        <span
          className="font-mono text-[8px] uppercase tracking-[0.2em]"
          style={{ color: isRun ? 'var(--color-chip)' : 'var(--color-skill)' }}
        >
          {play.kind}
        </span>
        <span className="font-mono text-[8px] tracking-widest text-chalk-faint">
          {personnelOf(card.form)}
        </span>
      </div>

      <div>
        <div className="font-display text-[15px] leading-[1.05] tracking-wide text-chalk">
          {card.play.toUpperCase()}
        </div>
        <div className="mt-0.5 font-mono text-[9px] text-chalk-faint">{card.form}</div>
      </div>

      <p className="font-mono text-[8.5px] leading-[1.35] text-chalk-dim">{play.text}</p>
    </div>
  )
}

function AdjFace({ card }: { card: AdjustmentCard }) {
  return (
    <div
      className="flex h-full w-full flex-col justify-between rounded-[3px] border border-charge/30 p-2.5"
      style={{ background: ADJ_FACE }}
    >
      <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-charge">
        adjustment
      </span>
      <div className="font-display text-[15px] leading-[1.05] tracking-wide text-chalk">
        {card.name.toUpperCase()}
      </div>
      <p className="font-mono text-[8.5px] leading-[1.35] text-chalk-dim">{ADJ_TEXT[card.name]}</p>
    </div>
  )
}

export function Hand({
  game,
  playable,
  onCall,
  onToss,
  onRead,
  onAudible,
  onArmQuick,
}: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const cards = game.hand
  const mid = (cards.length - 1) / 2

  const isLegal = (c: Card) =>
    c.type === 'play' && (game.audibled || personnelOf(c.form) === game.declared)

  const act = (card: Card) => {
    if (!playable) return
    if (card.type === 'play') {
      if (isLegal(card)) onCall(card.id)
      return
    }
    if (card.name === 'Motion' || card.name === 'Hot Read') onRead(card.id)
    else if (card.name === 'Audible') onAudible(card.id)
    else onArmQuick()
  }

  return (
    <div className="relative h-[248px] select-none">
      <AnimatePresence mode="popLayout">
        {cards.map((card, i) => {
          const offset = i - mid
          const lifted = hover === i
          const locked = card.type === 'play' && !isLegal(card)
          const armed = card.type === 'adj' && card.name === 'Quick Count' && game.quickArmed

          return (
            <motion.div
              key={card.id}
              layout
              initial={{ opacity: 0, y: 200, scale: 0.7, rotate: 0 }}
              animate={{
                opacity: 1,
                x: offset * 118,
                y: Math.abs(offset) ** 2 * 4.5 + (lifted ? -40 : 0),
                rotate: lifted ? 0 : offset * 5.5,
                scale: lifted ? 1.1 : 1,
              }}
              exit={{ opacity: 0, y: -420, scale: 1.25, transition: { duration: 0.42 } }}
              transition={{ type: 'spring', stiffness: 340, damping: 28 }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => act(card)}
              className="absolute left-1/2 top-6 h-[164px] w-[116px] -translate-x-1/2 cursor-pointer"
              style={{
                zIndex: lifted ? 60 : i,
                transformOrigin: '50% 135%',
                filter: lifted
                  ? 'drop-shadow(0 18px 34px rgba(0,0,0,.7))'
                  : 'drop-shadow(0 6px 14px rgba(0,0,0,.5))',
              }}
            >
              <div
                className="h-full w-full rounded-[3px]"
                style={{
                  outline: armed
                    ? '1.5px solid var(--color-charge)'
                    : lifted && !locked
                      ? '1.5px solid rgba(246,196,69,.75)'
                      : 'none',
                  outlineOffset: '2px',
                }}
              >
                {card.type === 'play' ? (
                  <PlayFace card={card} locked={locked} />
                ) : (
                  <AdjFace card={card} />
                )}
              </div>

              {lifted && playable && !game.tossUsed && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onToss(card.id)
                  }}
                  className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.18em] text-chalk-faint transition-colors hover:text-danger"
                >
                  toss
                </button>
              )}
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
