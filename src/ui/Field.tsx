import { AnimatePresence, motion } from 'motion/react'
import type { DefFormationName, OffFormationName } from '../game/cards'
import { DEFENSE, HUDDLE, LOS, OFFENSE, type Man } from './formations'

type Props = {
  formation: OffFormationName | null
  defFormation: DefFormationName | null
  /** Yardage banner after a snap. */
  result: { yards: number; event: string } | null
  ballOn: number
  toGo: number
}

const SPRING = { type: 'spring', stiffness: 210, damping: 22, mass: 0.7 } as const

function Offense({ men }: { men: Man[] }) {
  return (
    <>
      {men.map((m, i) => (
        <motion.g
          key={`o${i}`}
          initial={{ x: 400, y: 340, opacity: 0 }}
          animate={{ x: m.x, y: m.y, opacity: 1 }}
          transition={{ ...SPRING, delay: i * 0.018 }}
        >
          <circle
            r="12"
            fill="none"
            strokeWidth="2.25"
            className="chalk-line"
            stroke={m.skill ? 'var(--color-skill)' : 'var(--color-oline)'}
            opacity={m.skill ? 0.95 : 0.72}
          />
          <text
            textAnchor="middle"
            y="3.5"
            fontSize="8.5"
            fontFamily="var(--font-mono)"
            fontWeight="600"
            fill={m.skill ? 'var(--color-skill)' : 'var(--color-oline)'}
            opacity={m.skill ? 0.95 : 0.6}
          >
            {m.pos}
          </text>
        </motion.g>
      ))}
    </>
  )
}

function Defense({ men }: { men: Man[] }) {
  return (
    <>
      {men.map((m, i) => (
        <motion.g
          key={`d${i}`}
          initial={{ x: m.x, y: 40, opacity: 0 }}
          animate={{ x: m.x, y: m.y, opacity: 1 }}
          transition={{ ...SPRING, delay: i * 0.022 }}
        >
          {/* Defense is drawn as X's — the actual chalkboard convention. */}
          <path
            d="M -8 -8 L 8 8 M 8 -8 L -8 8"
            stroke="var(--color-defense)"
            strokeWidth="2.4"
            className="chalk-line"
            opacity="0.9"
          />
          <text
            textAnchor="middle"
            y="24"
            fontSize="8"
            fontFamily="var(--font-mono)"
            fontWeight="500"
            fill="var(--color-defense)"
            opacity="0.55"
          >
            {m.pos}
          </text>
        </motion.g>
      ))}
    </>
  )
}

export function Field({ formation, defFormation, result, ballOn, toGo }: Props) {
  const offense = formation ? OFFENSE[formation] : HUDDLE
  const defense = defFormation ? DEFENSE[defFormation] : null

  // The sticks, drawn relative to the line of scrimmage.
  const stickOffset = Math.min(toGo * 6.4, 170)

  return (
    <div className="chalkboard chalk-smear relative overflow-hidden rounded-sm border border-hash/60 shadow-[inset_0_0_60px_rgba(0,0,0,0.45)]">
      <svg viewBox="0 0 800 420" className="block w-full">
        {/* yard lines */}
        {[60, 110, 160, 210, 310, 360, 410].map((y) => (
          <line
            key={y}
            x1="24"
            y1={y}
            x2="776"
            y2={y}
            stroke="var(--color-hash)"
            strokeWidth="1"
            opacity="0.5"
          />
        ))}
        {/* hash marks */}
        {Array.from({ length: 26 }, (_, i) => 40 + i * 29).map((x) => (
          <g key={x} opacity="0.4">
            <line x1={x} y1="204" x2={x} y2="212" stroke="var(--color-hash)" strokeWidth="1.5" />
            <line x1={x} y1="330" x2={x} y2="338" stroke="var(--color-hash)" strokeWidth="1.5" />
          </g>
        ))}

        {/* line of scrimmage */}
        <line
          x1="12"
          y1={LOS}
          x2="788"
          y2={LOS}
          stroke="var(--color-chalk)"
          strokeWidth="2"
          opacity="0.75"
          className="chalk-line"
        />
        {/* line to gain */}
        <line
          x1="12"
          y1={LOS - stickOffset}
          x2="788"
          y2={LOS - stickOffset}
          stroke="var(--color-charge)"
          strokeWidth="2"
          strokeDasharray="7 9"
          opacity="0.75"
          className="chalk-line"
        />
        <text
          x="770"
          y={LOS - stickOffset - 8}
          textAnchor="end"
          fontSize="10"
          fontFamily="var(--font-mono)"
          fill="var(--color-charge)"
          opacity="0.8"
        >
          LINE TO GAIN
        </text>

        {defense && <Defense men={defense} />}
        <Offense men={offense} />
      </svg>

      {/* ball spot */}
      <div className="pointer-events-none absolute left-4 top-3 font-mono text-[10px] uppercase tracking-[0.22em] text-chalk-faint">
        ball on the {ballOn <= 50 ? `own ${ballOn}` : `opp ${100 - ballOn}`}
      </div>

      <AnimatePresence>
        {result && (
          <motion.div
            key={`${result.event}-${result.yards}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-board-edge/45"
          >
            <div
              className="font-display text-[clamp(3rem,9vw,7rem)] leading-none tracking-tight"
              style={{
                animation: 'slam 420ms cubic-bezier(.2,1.5,.4,1) both',
                color:
                  result.yards < 0 || result.event === 'interception' || result.event === 'fumble'
                    ? 'var(--color-danger)'
                    : result.yards >= 18
                      ? 'var(--color-charge)'
                      : result.yards === 0
                        ? 'var(--color-chalk-dim)'
                        : 'var(--color-chip)',
                textShadow: '0 8px 40px rgba(0,0,0,.8)',
              }}
            >
              {result.yards === 0
                ? '—'
                : `${result.yards > 0 ? '+' : ''}${result.yards}`}
            </div>
            <div className="mt-1 font-mono text-xs uppercase tracking-[0.4em] text-chalk-dim">
              {result.event}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
