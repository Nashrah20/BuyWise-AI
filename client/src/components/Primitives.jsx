/**
 * Small shared building blocks. Kept in one file so the visual language
 * (category art, score rings, empty states) stays consistent everywhere.
 */
import { Link } from 'react-router-dom';

/* --------------------------------------------------------------- category art */

/**
 * Products in the demo have no photography, so each category gets its own
 * quiet, hand-drawn mark on a tinted ground. This looks deliberate rather than
 * like a broken image, and it keeps the whole grid calm.
 */
const CATEGORY_ART = {
  headphones: { tint: '#EEF4F1', stroke: '#2F7D5F', path: 'M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v6H5a1 1 0 0 1-1-1v-5Zm16 0h-3v6h2a1 1 0 0 0 1-1v-5Z' },
  backpack: { tint: '#F6F1E8', stroke: '#B8863B', path: 'M7 9V7a5 5 0 0 1 10 0v2m-11 0h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Zm3 4h6' },
  laptop: { tint: '#EEF2F6', stroke: '#3D6183', path: 'M5 6h14a1 1 0 0 1 1 1v9H4V7a1 1 0 0 1 1-1ZM2 18h20' },
  smartphone: { tint: '#F2EFF6', stroke: '#6B5B95', path: 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm2.5 15h3' },
  smartwatch: { tint: '#FCF1EE', stroke: '#B4553F', path: 'M9 7V4h6v3m-6 10v3h6v-3M6 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8Z' },
  keyboard: { tint: '#F0F4F0', stroke: '#4A7A4E', path: 'M3 7h18a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Zm4 3h.01M11 10h.01M15 10h.01M8 14h8' },
  monitor: { tint: '#EFF3F7', stroke: '#456B8C', path: 'M3 5h18a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm6 15h6m-3-4v4' },
  speaker: { tint: '#F5F1EA', stroke: '#8A6B3D', path: 'M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm5 4h.01M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z' },
};

export function CategoryArt({ category, className = '', size = 'md' }) {
  const art = CATEGORY_ART[category] || CATEGORY_ART.headphones;
  const dimension = { sm: 28, md: 44, lg: 72 }[size] || 44;
  return (
    <div
      className={`flex items-center justify-center ${className}`}
      style={{ backgroundColor: art.tint }}
      aria-hidden="true"
    >
      <svg
        width={dimension}
        height={dimension}
        viewBox="0 0 24 24"
        fill="none"
        stroke={art.stroke}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      >
        <path d={art.path} />
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------- indicators */

/** A compact match-score ring. The single most glanceable number on the page. */
export function ScoreRing({ value, size = 56, label = 'match' }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (Math.max(0, Math.min(100, value)) / 100) * circumference;
  const tone = value >= 85 ? '#256349' : value >= 65 ? '#B8863B' : '#B4553F';

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#EFECE4" strokeWidth="4" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={tone}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-bold leading-none" style={{ color: tone }}>
          {value}
        </span>
        <span className="text-[8px] uppercase tracking-wider text-ink-faint">{label}</span>
      </div>
    </div>
  );
}

export function RankBadge({ rank, badge }) {
  const tone =
    rank === 1
      ? 'bg-forest-700 text-white'
      : rank === 2
        ? 'bg-brass-100 text-brass-600'
        : 'bg-line-soft text-ink-muted';
  return <span className={`badge ${tone}`}>{badge}</span>;
}

export function Stars({ rating, count }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="#B8863B" aria-hidden="true">
        <path d="m12 17.3-6.2 3.7 1.7-7L2 9.2l7.1-.6L12 2l2.9 6.6 7.1.6-5.5 4.8 1.7 7z" />
      </svg>
      <span className="font-medium text-ink-soft">{Number(rating).toFixed(1)}</span>
      {count ? <span>({count.toLocaleString('en-IN')})</span> : null}
    </span>
  );
}

/* ----------------------------------------------------------------- feedback UI */

export function Spinner({ label = 'Loading' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-ink-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-forest-500" />
      {label}
    </div>
  );
}

export function ThinkingDots({ label = 'BuyWise is thinking' }) {
  return (
    <div className="flex items-center gap-2.5 text-sm text-ink-muted">
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-forest-500"
            style={{ animationDelay: `${i * 0.16}s` }}
          />
        ))}
      </span>
      {label}
    </div>
  );
}

export function EmptyState({ title, description, action, to }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-line-soft">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7A776E" strokeWidth="1.5" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </div>
      <h3 className="text-lg text-ink">{title}</h3>
      {description && <p className="max-w-sm text-sm text-ink-muted">{description}</p>}
      {action && to && (
        <Link to={to} className="btn-primary mt-2">
          {action}
        </Link>
      )}
    </div>
  );
}

export function Toast({ toast }) {
  if (!toast) return null;
  const isError = toast.tone === 'error';
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div
        role="status"
        className={`animate-fade-up rounded-xl px-4 py-3 text-sm font-medium shadow-lift ${
          isError ? 'bg-clay-500 text-white' : 'bg-ink text-white'
        }`}
      >
        {toast.message}
      </div>
    </div>
  );
}

/** Shown wherever the demo's zero-config fallbacks are worth explaining. */
export function ModeNote({ children }) {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-brass-100 bg-brass-50 px-3.5 py-2.5 text-xs text-brass-600">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="mt-px shrink-0">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8h.01M11 12h1v4h1" strokeLinecap="round" />
      </svg>
      <span>{children}</span>
    </p>
  );
}
