import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CategoryArt } from '../components/Primitives';
import { aiApi, productApi } from '../lib/api';

const EXAMPLES = [
  'A waterproof college backpack under ₹2,000 that fits a 15.6 inch laptop',
  'Wireless headphones for studying under ₹3,000 with noise cancellation and 30+ hours battery',
  'A phone under ₹25,000 with a good camera and battery',
  'A laptop for coding under ₹60,000',
];

const STEPS = [
  {
    n: '1',
    title: 'You describe the need',
    body: 'Write it the way you would say it to a friend. No filters, no dropdowns, no product codes.',
  },
  {
    n: '2',
    title: 'BuyWise works it out',
    body: 'It turns your sentence into structured requirements, searches the catalogue, and scores every candidate against what you asked for.',
  },
  {
    n: '3',
    title: 'You see the reasoning',
    body: 'Every recommendation comes with why it won, what it gives up, and how the score was calculated. Then it can add it to your cart.',
  },
];

export default function Home() {
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  const [categories, setCategories] = useState([]);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    productApi.categories().then(setCategories).catch(() => {});
    aiApi.status().then(setStatus).catch(() => {});
  }, []);

  const start = (text) => {
    const query = (text ?? message).trim();
    if (!query) return navigate('/agent');
    navigate('/agent', { state: { initialMessage: query } });
  };

  return (
    <div>
      {/* ------------------------------------------------------------- hero */}
      <section className="relative overflow-hidden border-b border-line bg-gradient-to-b from-forest-50/60 via-paper to-paper">
        <div className="container-page py-16 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <p className="eyebrow mb-4">Autonomous AI shopping agent</p>

            <h1 className="text-balance font-display text-4xl leading-[1.1] text-ink sm:text-6xl">
              Stop comparing products.
              <br />
              <span className="text-forest-700">Just say what you need.</span>
            </h1>

            <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-ink-soft sm:text-lg">
              Ordinary shopping makes you do the thinking — search, filter, compare, doubt.
              BuyWise understands the whole requirement, evaluates what is available, and
              explains the best match in plain language.
            </p>

            {/* the one input that matters */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                start();
              }}
              className="mx-auto mt-9 max-w-2xl"
            >
              <div className="flex flex-col gap-2 rounded-2xl border border-line bg-card p-2 shadow-lift sm:flex-row sm:items-center">
                <label htmlFor="need" className="sr-only">
                  What do you need?
                </label>
                <input
                  id="need"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="I need a waterproof backpack under ₹2,000 for college…"
                  className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm text-ink placeholder:text-ink-faint focus:outline-none"
                />
                <button type="submit" className="btn-primary shrink-0 px-6 py-3">
                  Ask BuyWise
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                       strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12h14m-6-6 6 6-6 6" />
                  </svg>
                </button>
              </div>
            </form>

            <div className="mt-5">
              <p className="mb-2.5 text-xs text-ink-muted">Or try one of these</p>
              <div className="flex flex-wrap justify-center gap-2">
                {EXAMPLES.map((example) => (
                  <button key={example} type="button" onClick={() => start(example)} className="chip">
                    {example}
                  </button>
                ))}
              </div>
            </div>

            {status && (
              <p className="mt-8 inline-flex items-center gap-2 rounded-full border border-line bg-card px-3.5 py-1.5 text-xs text-ink-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-forest-500" />
                Reasoning engine: <strong className="font-semibold text-ink-soft">{status.mode}</strong>
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------- the problem framing */}
      <section className="container-page py-16">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="card p-6">
            <p className="eyebrow mb-3 text-clay-500">Shopping today</p>
            <ol className="space-y-2 text-sm text-ink-muted">
              {['Search', '100+ products', 'Filters', 'Compare', 'Reviews', 'Confusion', 'Purchase'].map(
                (step, i) => (
                  <li key={step} className="flex items-center gap-3">
                    <span className="w-5 text-xs tabular-nums text-ink-faint">{i + 1}</span>
                    <span className={step === 'Confusion' ? 'font-medium text-clay-500' : ''}>{step}</span>
                  </li>
                )
              )}
            </ol>
            <p className="mt-4 border-t border-line-soft pt-4 text-sm text-ink-soft">
              You do the thinking.
            </p>
          </div>

          <div className="card border-forest-200 bg-forest-50/40 p-6">
            <p className="eyebrow mb-3 text-forest-700">Shopping with BuyWise</p>
            <ol className="space-y-2 text-sm text-ink-soft">
              {[
                'You describe the need',
                'AI understands it',
                'AI searches',
                'AI compares',
                'AI recommends and explains',
                'You buy',
              ].map((step, i) => (
                <li key={step} className="flex items-center gap-3">
                  <span className="w-5 text-xs tabular-nums text-forest-500">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 border-t border-forest-200 pt-4 text-sm font-medium text-forest-700">
              The agent does the thinking.
            </p>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- how it works */}
      <section className="border-y border-line bg-card">
        <div className="container-page py-16">
          <h2 className="mb-2 text-center text-3xl text-ink">How it works</h2>
          <p className="mx-auto mb-10 max-w-lg text-center text-sm text-ink-muted">
            Three steps, and you can inspect every one of them.
          </p>

          <div className="grid gap-6 md:grid-cols-3">
            {STEPS.map((step) => (
              <div key={step.n} className="rounded-2xl border border-line bg-paper p-6">
                <span className="mb-4 flex h-9 w-9 items-center justify-center rounded-full bg-forest-700 font-display text-sm font-semibold text-white">
                  {step.n}
                </span>
                <h3 className="mb-2 text-lg text-ink">{step.title}</h3>
                <p className="text-sm leading-relaxed text-ink-muted">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------- browse */}
      {categories.length > 0 && (
        <section className="container-page py-16">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl text-ink">Or browse the catalogue</h2>
              <p className="mt-1 text-sm text-ink-muted">
                Every product carries an AI-readable profile, not just a description.
              </p>
            </div>
            <Link to="/shop" className="btn-secondary shrink-0">
              See everything
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {categories.map((c) => (
              <Link
                key={c.category}
                to={`/shop?category=${c.category}`}
                className="card card-hover flex items-center gap-3 p-3"
              >
                <CategoryArt category={c.category} size="sm" className="h-12 w-12 rounded-lg" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium capitalize text-ink">{c.category}</p>
                  <p className="text-xs text-ink-muted">{c.count} products</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------ merchants */}
      <section className="container-page pb-20">
        <div className="card flex flex-col items-start gap-6 p-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl">
            <p className="eyebrow mb-2">For merchants</p>
            <h2 className="mb-2 text-2xl text-ink">Make your products understandable to AI</h2>
            <p className="text-sm leading-relaxed text-ink-muted">
              Paste an ordinary listing and BuyWise generates an AI Commerce Profile — structured
              features, use cases and audiences — so the agent can reason about your product.
              Then watch the funnel: AI searches, recommendations, carts and revenue.
            </p>
          </div>
          <Link to="/merchant" className="btn-brass shrink-0">
            Open merchant dashboard
          </Link>
        </div>
      </section>
    </div>
  );
}
