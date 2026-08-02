import { motion } from 'motion/react'
import { useState } from 'react'
import { DECKS, OFF_PLAYS, type DeckName } from '../game/cards'
import { OPPONENTS, OPPONENT_NAMES } from '../game/opponents'
import { useGame } from './store'

export function Pregame() {
  const start = useGame((s) => s.start)
  const [opponent] = useState(
    () => OPPONENT_NAMES[Math.floor(Math.random() * OPPONENT_NAMES.length)],
  )
  const [picked, setPicked] = useState<DeckName | null>(null)
  const visible = Object.entries(OPPONENTS[opponent].rules).filter(([, r]) => r.visible)

  return (
    <div className="chalkboard chalk-smear min-h-screen">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-14"
        >
          <h1 className="font-display text-[clamp(4rem,13vw,9rem)] leading-[0.82] tracking-tight text-chalk">
            DOWN
          </h1>
          <p className="mt-3 max-w-md font-mono text-[11px] leading-relaxed text-chalk-dim">
            You declare personnel. They match it. Only then do you call the play.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="tape mb-8 rounded-sm px-5 py-4"
        >
          <div className="font-mono text-[9px] uppercase tracking-[0.28em] text-chalk-faint">
            tonight you face
          </div>
          <div className="mt-1 font-display text-4xl leading-none tracking-wide text-defense">
            {opponent.toUpperCase()}
          </div>
          <div className="mt-3 space-y-1">
            {visible.map(([key, rule]) => (
              <div key={key} className="font-mono text-[10px] text-chalk-dim">
                <span className="text-charge">{rule.name}</span> — {rule.text}
              </div>
            ))}
            <div className="font-mono text-[10px] text-hash">
              two more tendencies are hidden. you find them by running into them.
            </div>
          </div>
        </motion.div>

        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.24em] text-chalk-faint">
          pick your offense
        </p>

        <div className="grid gap-3 md:grid-cols-3">
          {(Object.keys(DECKS) as DeckName[]).map((name, i) => {
            const counts: Record<string, number> = {}
            let runs = 0
            let passes = 0
            for (const [, play, n] of DECKS[name].list) {
              counts[play] = (counts[play] ?? 0) + n
              if (OFF_PLAYS[play].kind === 'run') runs += n
              else passes += n
            }
            const on = picked === name
            return (
              <motion.button
                key={name}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.22 + i * 0.07 }}
                onMouseEnter={() => setPicked(name)}
                onClick={() => start(name, opponent)}
                className={`flex flex-col rounded-sm border p-4 text-left transition-all ${
                  on
                    ? 'border-charge bg-charge/[0.07]'
                    : 'border-hash bg-board-deep/50 hover:border-chalk-faint'
                }`}
              >
                <div className="font-display text-2xl leading-tight tracking-wide text-chalk">
                  {name.toUpperCase()}
                </div>
                <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-chalk-dim">
                  {DECKS[name].blurb}
                </p>

                <div className="mt-4 flex h-1.5 overflow-hidden rounded-full bg-board-edge">
                  <div className="bg-chip" style={{ width: `${(runs / 20) * 100}%` }} />
                  <div className="bg-skill" style={{ width: `${(passes / 20) * 100}%` }} />
                </div>
                <div className="mt-1.5 flex justify-between font-mono text-[9px] text-chalk-faint">
                  <span className="text-chip">{runs} run</span>
                  <span className="text-skill">{passes} pass</span>
                </div>

                <div className="mt-3 font-mono text-[8.5px] leading-relaxed text-hash">
                  {Object.entries(counts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([p, n]) => `${p} ×${n}`)
                    .join(' · ')}
                </div>
              </motion.button>
            )
          })}
        </div>

        <p className="mt-8 font-mono text-[9px] uppercase tracking-[0.2em] text-hash">
          17 points · 5 drives · click a deck to kick off
        </p>
      </div>
    </div>
  )
}
