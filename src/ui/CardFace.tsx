import { ADJ_TEXT, OFF_PLAYS, personnelOf, type Card } from '../game/cards'

const RUN_FACE = 'linear-gradient(168deg,#2c3b30,#1d2822)'
const PASS_FACE = 'linear-gradient(168deg,#293646,#1b2530)'
const ADJ_FACE = 'linear-gradient(168deg,#3a3427,#241f18)'

/** One card face, shared by the hand and the draft so they never drift apart. */
export function CardFace({ card, dim = false }: { card: Card; dim?: boolean }) {
  if (card.type === 'adj') {
    return (
      <div
        className="flex h-full w-full flex-col justify-between rounded-[3px] border border-charge/30 p-2.5"
        style={{ background: ADJ_FACE, opacity: dim ? 0.42 : 1 }}
      >
        <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-charge">
          adjustment
        </span>
        <div className="font-display text-[15px] leading-[1.05] tracking-wide text-chalk">
          {card.name.toUpperCase()}
        </div>
        <p className="font-mono text-[8.5px] leading-[1.35] text-chalk-dim">
          {ADJ_TEXT[card.name]}
        </p>
      </div>
    )
  }

  const play = OFF_PLAYS[card.play]
  const isRun = play.kind === 'run'
  return (
    <div
      className="flex h-full w-full flex-col justify-between rounded-[3px] border p-2.5"
      style={{
        borderColor: dim ? 'rgba(106,122,102,.35)' : 'rgba(238,243,230,.22)',
        background: isRun ? RUN_FACE : PASS_FACE,
        opacity: dim ? 0.42 : 1,
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
