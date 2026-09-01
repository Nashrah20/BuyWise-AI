/**
 * MerchantDashboard - the business-growth half of BuyWise (spec sections 12, 19).
 *
 * The question this page answers is the one a merchant actually asks:
 * "how much of my revenue did the AI produce?" Everything here is derived from
 * real events written during agent searches, so the funnel moves as you demo.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, Spinner } from '../components/Primitives';
import { useApp } from '../context/AppContext';
import { formatINR, merchantApi } from '../lib/api';

function Stat({ label, value, sub, tone = 'default' }) {
  const tones = {
    default: 'text-ink',
    forest: 'text-forest-700',
    brass: 'text-brass-500',
  };
  return (
    <div className="card p-5">
      <p className="eyebrow">{label}</p>
      <p className={`mt-2 font-display text-3xl ${tones[tone]}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-muted">{sub}</p>}
    </div>
  );
}

/** The AI funnel, drawn as proportional bars so drop-off is obvious. */
function Funnel({ stages }) {
  const top = Math.max(...stages.map((s) => s.value), 1);
  return (
    <div className="space-y-3">
      {stages.map((stage, i) => {
        const previous = i > 0 ? stages[i - 1].value : 0;
        // One search yields several recommendations, so that step is a
        // multiplier, not a drop-off. Showing it as "400% of previous"
        // reads like a bug; showing "4.0x per search" reads like the truth.
        let note = null;
        if (previous > 0) {
          note =
            stage.value > previous
              ? `${(stage.value / previous).toFixed(1)}× per search`
              : `${Math.round((stage.value / previous) * 100)}% of previous`;
        }
        return (
          <div key={stage.stage}>
            <div className="mb-1.5 flex items-baseline justify-between text-sm">
              <span className="text-ink-soft">{stage.stage}</span>
              <span className="flex items-baseline gap-2">
                <span className="font-display text-lg text-ink tabular-nums">{stage.value}</span>
                {note && <span className="text-xs text-ink-faint">{note}</span>}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-line-soft">
              <div
                className="h-full rounded-full bg-forest-500 transition-all duration-500"
                style={{ width: `${Math.max(2, (stage.value / top) * 100)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function MerchantDashboard() {
  const { user, loading: authLoading, isMerchant } = useApp();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isMerchant) return setLoading(false);
    merchantApi
      .dashboard()
      .then(setStats)
      .catch(() => setError('Could not load your dashboard.'))
      .finally(() => setLoading(false));
  }, [isMerchant]);

  if (authLoading || loading) return <Spinner label="Loading your dashboard" />;

  if (!user) {
    return (
      <div className="container-page py-16">
        <EmptyState
          title="Sign in as a merchant"
          description="Use the demo merchant account on the sign-in page to see the dashboard with data."
          action="Sign in"
          to="/signin"
        />
      </div>
    );
  }

  if (!isMerchant) {
    return (
      <div className="container-page py-16">
        <EmptyState
          title="This area is for merchant accounts"
          description="You're signed in as a shopper. Sign out and use the demo merchant account to see how AI-driven sales are tracked."
          action="Back to the agent"
          to="/agent"
        />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="container-page py-16">
        <EmptyState title="Dashboard unavailable" description={error} />
      </div>
    );
  }

  return (
    <div className="container-page py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl text-ink">{user.storeName || 'Your store'}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            How the shopping agent is discovering and selling your products.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/merchant/products" className="btn-secondary">
            My products
          </Link>
          <Link to="/merchant/new" className="btn-primary">
            Add a product
          </Link>
        </div>
      </div>

      {stats.aiSearches === 0 && (
        <div className="card mb-6 border-brass-100 bg-brass-50 p-5">
          <p className="font-display text-lg text-brass-600">No agent activity yet</p>
          <p className="mt-1 text-sm text-brass-600/90">
            Open the{' '}
            <Link to="/agent" className="font-medium underline underline-offset-2">
              shopping agent
            </Link>{' '}
            and search for something in your catalogue — then come back and watch this fill in.
          </p>
        </div>
      )}

      {/* ------------------------------------------------------------- headline */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Products listed" value={stats.products} />
        <Stat
          label="AI searches answered"
          value={stats.aiSearches}
          sub={`of ${stats.platformSearches} on the platform`}
          tone="forest"
        />
        <Stat
          label="AI recommendations"
          value={stats.aiRecommendations}
          sub="times your products made a shortlist"
        />
        <Stat
          label="Revenue via the agent"
          value={formatINR(stats.aiRevenue)}
          sub={`${stats.aiRevenueShare}% of your total revenue`}
          tone="brass"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        {/* ---------------------------------------------------------- funnel */}
        <section className="card p-6">
          <h2 className="mb-1 font-display text-lg text-ink">The AI sales funnel</h2>
          <p className="mb-5 text-sm text-ink-muted">
            Every step a shopper took with the agent, from asking a question to paying.
          </p>

          <Funnel stages={stats.funnel} />

          <div className="mt-6 grid grid-cols-3 gap-3 border-t border-line-soft pt-5">
            <div>
              <p className="eyebrow">Search coverage</p>
              <p className="mt-1 font-display text-xl text-ink">{stats.recommendationRate}%</p>
              <p className="text-[11px] text-ink-muted">of AI searches your catalogue answered</p>
            </div>
            <div>
              <p className="eyebrow">Cart rate</p>
              <p className="mt-1 font-display text-xl text-ink">{stats.cartRate}%</p>
              <p className="text-[11px] text-ink-muted">of those ended in a cart add</p>
            </div>
            <div>
              <p className="eyebrow">Conversion</p>
              <p className="mt-1 font-display text-xl text-ink">{stats.conversionRate}%</p>
              <p className="text-[11px] text-ink-muted">of cart adds were paid for</p>
            </div>
          </div>
        </section>

        {/* --------------------------------------------------------- insights */}
        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="mb-1 font-display text-lg text-ink">What shoppers actually asked</h2>
            <p className="mb-4 text-sm text-ink-muted">
              The real language behind searches your products answered.
            </p>

            {stats.topSearches.length === 0 ? (
              <p className="text-sm text-ink-faint">Nothing yet.</p>
            ) : (
              <ul className="space-y-2">
                {stats.topSearches.map((s) => (
                  <li
                    key={s.query}
                    className="flex items-start justify-between gap-3 rounded-xl bg-paper px-3.5 py-2.5"
                  >
                    <span className="text-sm text-ink-soft">"{s.query}"</span>
                    <span className="shrink-0 text-xs font-medium text-ink-muted tabular-nums">
                      ×{s.count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* The actionable half of the analytics: demand you are missing. */}
          <section className="card border-brass-100 p-6">
            <h2 className="mb-1 font-display text-lg text-ink">Demand you're not serving</h2>
            <p className="mb-4 text-sm text-ink-muted">
              Shoppers asked for these and the catalogue had no good answer. Each one is a
              product worth stocking.
            </p>

            {!stats.unmetDemand?.length ? (
              <p className="text-sm text-ink-faint">
                Nothing so far — every AI search found a decent match.
              </p>
            ) : (
              <ul className="space-y-2">
                {stats.unmetDemand.map((d) => (
                  <li key={d.query} className="rounded-xl bg-brass-50 px-3.5 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-sm text-ink-soft">"{d.query}"</span>
                      <span className="shrink-0 text-xs font-medium text-brass-600 tabular-nums">
                        ×{d.count}
                      </span>
                    </div>
                    {(d.category || d.maxPrice || d.wanted?.length > 0) && (
                      <p className="mt-1 text-[11px] capitalize text-ink-muted">
                        {[
                          d.category,
                          d.maxPrice ? `under ${formatINR(d.maxPrice)}` : null,
                          d.wanted?.length ? d.wanted.join(', ') : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-6">
            <h2 className="mb-1 font-display text-lg text-ink">Your most recommended products</h2>
            <p className="mb-4 text-sm text-ink-muted">
              What the agent picks when it answers on your behalf.
            </p>

            {stats.topProducts.length === 0 ? (
              <p className="text-sm text-ink-faint">Nothing yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {stats.topProducts.map((p) => (
                  <li key={p.productId} className="flex items-center justify-between gap-3">
                    <Link
                      to={`/product/${p.productId}`}
                      className="min-w-0 truncate text-sm text-ink-soft hover:text-forest-700"
                    >
                      {p.name}
                    </Link>
                    <span className="shrink-0 text-xs text-ink-muted">
                      {formatINR(p.price)} · ×{p.count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
