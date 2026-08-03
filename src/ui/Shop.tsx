import { describeItem, type ShopItem } from '../game/shop'
import { type Run } from '../game/run'
import { CardFace } from './CardFace'
import { NextUp } from './NextUp'
import { useGame } from './store'

const KIND_LABEL: Record<ShopItem['kind'], string> = {
  card: 'play',
  cut: 'roster move',
  drill: 'practice',
  chips: 'preparation',
}

function Item({
  item,
  sold,
  affordable,
  onBuy,
}: {
  item: ShopItem
  sold: boolean
  affordable: boolean
  onBuy: () => void
}) {
  const dead = sold || !affordable

  return (
    <button
      onClick={onBuy}
      disabled={dead}
      className={`flex flex-col rounded-sm border p-4 text-left transition-all ${
        sold
          ? 'border-hash/40 opacity-35'
          : affordable
            ? 'border-hash hover:border-chip hover:bg-chip/[0.07]'
            : 'border-hash/40 opacity-45'
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-chalk-faint">
          {KIND_LABEL[item.kind]}
        </span>
        <span
          className={`font-mono text-[11px] ${sold ? 'text-hash' : affordable ? 'text-chip' : 'text-danger'}`}
        >
          {sold ? 'sold' : `${item.price}¢`}
        </span>
      </div>

      {item.kind === 'card' ? (
        <div className="mt-3 h-[132px] w-[94px] self-center">
          <CardFace card={item.card} />
        </div>
      ) : (
        <div className="mt-3 flex h-[132px] items-center">
          <span className="font-display text-xl leading-tight tracking-wide text-chalk">
            {describeItem(item).toUpperCase()}
          </span>
        </div>
      )}

      {item.kind === 'card' && (
        <div className="mt-2 font-mono text-[9px] text-chalk-dim">{describeItem(item)}</div>
      )}
    </button>
  )
}

export function Shop({ run }: { run: Run }) {
  const { buy, leaveShop } = useGame()
  const shop = run.pendingShop
  if (!shop) return null

  return (
    <div className="mx-auto max-w-4xl px-6 py-14">
      <div className="reveal flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-chalk-faint">
            the facility · {run.wins}-{run.losses}
          </div>
          <h2 className="mt-1 font-display text-4xl leading-none tracking-tight text-chalk">
            SPEND THE BUDGET
          </h2>
          <p className="mt-2 font-mono text-[10px] text-chalk-dim">
            Every point you put on the board earned this — win or lose.
          </p>
        </div>
        <div className="text-right">
          <div className="font-display text-4xl leading-none text-chip">{run.coins}¢</div>
          <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-chalk-faint">
            on hand
          </div>
        </div>
      </div>

      <div className="mt-8">
        <NextUp run={run} />
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shop.items.map((item, i) => (
          <div key={i} className="reveal flex" style={{ animationDelay: `${100 + i * 70}ms` }}>
            <div className="flex-1">
              <Item
                item={item}
                sold={shop.sold.includes(i)}
                affordable={run.coins >= item.price}
                onBuy={() => buy(i)}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10 flex items-center gap-4">
        <button
          onClick={leaveShop}
          className="rounded-[2px] border border-hash px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-chalk-dim transition-colors hover:border-chalk-faint hover:text-chalk"
        >
          done — on to the draft →
        </button>
        {run.shopCuts > 0 && (
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-chip">
            {run.shopCuts} cut{run.shopCuts > 1 ? 's' : ''} banked for the draft
          </span>
        )}
      </div>
    </div>
  )
}
