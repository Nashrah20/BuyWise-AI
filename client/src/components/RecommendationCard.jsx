/**
 * RecommendationCard - the "Why this product?" card.
 *
 * This is the component the whole project is really about (spec section 17).
 * It never just says "buy this": it shows the match score, what the agent
 * counted in the product's favour, what it counted against, and - on request -
 * the exact points breakdown behind the number. A shopper (or a judge) can
 * check the agent's reasoning instead of trusting it.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatINR } from '../lib/api';
import { CategoryArt, RankBadge, ScoreRing, Stars } from './Primitives';

export default function RecommendationCard({ entry, onAddToCart, compact = false }) {
  const [showWorking, setShowWorking] = useState(false);
  const { product, matchPercent, pros, cons, breakdown, rank, badge, versusBest, basis } = entry;
  // With no requirements to match against, the number is a general quality
  // score, not a match - saying "match" there would be meaningless.
  const isGeneral = basis === 'general';
  const discount = product.mrp > product.price
    ? Math.round(((product.mrp - product.price) / product.mrp) * 100)
    : 0;

  return (
    <article
      className={`card card-hover overflow-hidden ${rank === 1 ? 'ring-1 ring-forest-200' : ''}`}
    >
      {/* ---- header ---- */}
      <div className="flex gap-4 p-4">
        <Link to={`/product/${product._id}`} className="shrink-0">
          <CategoryArt
            category={product.category}
            size={compact ? 'sm' : 'md'}
            className={`rounded-xl ${compact ? 'h-16 w-16' : 'h-24 w-24'}`}
          />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <RankBadge rank={rank} badge={badge} />
            {discount > 0 && (
              <span className="badge bg-clay-50 text-clay-500">{discount}% off</span>
            )}
          </div>

          <Link
            to={`/product/${product._id}`}
            className="block font-display text-lg leading-snug text-ink hover:text-forest-700"
          >
            {product.name}
          </Link>

          <p className="mt-0.5 text-xs text-ink-muted">
            {product.brand} · {product.merchantName}
          </p>

          <div className="mt-2 flex flex-wrap items-baseline gap-2">
            <span className="font-display text-xl text-ink">{formatINR(product.price)}</span>
            {discount > 0 && (
              <span className="text-sm text-ink-faint line-through">{formatINR(product.mrp)}</span>
            )}
            <Stars rating={product.rating} count={product.ratingCount} />
          </div>
        </div>

        <ScoreRing value={matchPercent} size={compact ? 48 : 58} label={isGeneral ? 'rated' : 'match'} />
      </div>

      {/* ---- why ---- */}
      <div className="border-t border-line-soft bg-paper/60 px-4 py-3.5">
        <p className="eyebrow mb-2.5">{isGeneral ? 'About this one' : 'Why this one'}</p>

        {isGeneral && (
          <p className="mb-2.5 rounded-lg bg-brass-50 px-3 py-2 text-xs text-brass-600">
            You haven't told me your budget or what you need it for yet, so this is
            ranked on overall rating and value. Tell me more for a real match score.
          </p>
        )}

        {/* Two columns once there are enough reasons to be worth splitting. */}
        <ul
          className={`gap-x-6 gap-y-1.5 ${
            pros.length + cons.length > 3 && !compact ? 'sm:columns-2' : 'space-y-1.5'
          }`}
        >
          {pros.map((pro, i) => (
            <li key={i} className="flex break-inside-avoid gap-2 pb-1.5 text-sm text-ink-soft">
              <Check /> <span>{pro}</span>
            </li>
          ))}
          {cons.map((con, i) => (
            <li key={`c${i}`} className="flex break-inside-avoid gap-2 pb-1.5 text-sm text-ink-muted">
              <Warn /> <span>{con}</span>
            </li>
          ))}
        </ul>

        {versusBest && (
          <p className="mt-2.5 rounded-lg bg-line-soft px-3 py-2 text-xs text-ink-muted">
            <span className="font-medium text-ink-soft">Compared with the top pick:</span>{' '}
            {versusBest}
          </p>
        )}

        {/* ---- the actual arithmetic ---- */}
        {breakdown?.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowWorking((v) => !v)}
              className="mt-3 text-xs font-semibold text-forest-700 underline-offset-2 hover:underline"
              aria-expanded={showWorking}
            >
              {showWorking ? 'Hide the scoring' : 'See how this score was calculated'}
            </button>

            {showWorking && (
              <div className="mt-2.5 animate-fade-up space-y-2 rounded-xl border border-line bg-card p-3">
                {breakdown.map((row) => (
                  <div key={row.pillar}>
                    <div className="mb-1 flex items-baseline justify-between text-xs">
                      <span className="text-ink-soft">{row.pillar}</span>
                      <span className="font-medium tabular-nums text-ink-muted">
                        {row.earned} / {row.max}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-line-soft">
                      <div
                        className="h-full rounded-full bg-forest-500"
                        style={{ width: `${row.max ? (row.earned / row.max) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
                <p className="pt-1 text-[11px] text-ink-faint">
                  {isGeneral
                    ? 'Only what you tell the agent is scored. Add a budget or a use case and these become real match criteria.'
                    : 'Only the things you actually told me are scored, and the weights shift with the priorities you set.'}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ---- actions ---- */}
      <div className="flex items-center gap-2 border-t border-line-soft px-4 py-3">
        <button
          type="button"
          onClick={() => onAddToCart?.(product._id)}
          disabled={product.stock <= 0}
          className="btn-primary flex-1 sm:flex-initial sm:px-6"
        >
          {product.stock > 0 ? 'Add to cart' : 'Out of stock'}
        </button>
        <Link to={`/product/${product._id}`} className="btn-secondary">
          See full details
        </Link>
        {product.stock > 0 && product.stock <= 5 && (
          <span className="ml-auto text-xs text-clay-500">Only {product.stock} left</span>
        )}
      </div>
    </article>
  );
}

const Check = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2F7D5F" strokeWidth="2.2"
       strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" aria-hidden="true">
    <path d="m5 13 4 4L19 7" />
  </svg>
);

const Warn = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#B8863B" strokeWidth="2"
       strokeLinecap="round" className="mt-0.5 shrink-0" aria-hidden="true">
    <path d="M12 8v5m0 3h.01" />
    <circle cx="12" cy="12" r="9" />
  </svg>
);
