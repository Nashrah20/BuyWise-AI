/**
 * ProductDetail - a normal product page, plus the thing that makes BuyWise
 * different: the AI Commerce Profile is shown openly. Anyone can see exactly
 * what the shopping agent "knows" about this product.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CategoryArt, EmptyState, Spinner, Stars } from '../components/Primitives';
import { useApp } from '../context/AppContext';
import { formatINR, productApi } from '../lib/api';

const FEATURE_LABELS = {
  anc: 'Active noise cancellation',
  battery: 'Battery life',
  wireless: 'Wireless',
  mic: 'Microphone',
  waterproof: 'Waterproof',
  laptopCompartment: 'Laptop compartment',
  antiTheft: 'Anti-theft',
  capacity: 'Capacity',
  ram: 'RAM',
  storage: 'Storage',
  processor: 'Processor class',
  weightKg: 'Weight',
  camera: 'Camera',
  display: 'Display quality',
  fiveG: '5G',
  waterResistant: 'Water resistant',
  heartRate: 'Heart-rate tracking',
  backlit: 'Backlit keys',
  mechanical: 'Mechanical switches',
};

const UNITS = {
  battery: ' hours',
  laptopCompartment: '"',
  capacity: ' L',
  ram: ' GB',
  storage: ' GB',
  camera: ' MP',
  weightKg: ' kg',
  processor: '/10',
  display: '/10',
};

const formatFeature = (key, value) => {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return `${value}${UNITS[key] || ''}`;
};

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToCart } = useApp();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    productApi
      .get(id)
      .then(setProduct)
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Spinner label="Loading product" />;
  if (!product) {
    return (
      <div className="container-page py-16">
        <EmptyState
          title="Product not found"
          description="It may have been removed from the catalogue."
          action="Back to browsing"
          to="/shop"
        />
      </div>
    );
  }

  const discount =
    product.mrp > product.price
      ? Math.round(((product.mrp - product.price) / product.mrp) * 100)
      : 0;
  const features = Object.entries(product.features || {});

  return (
    <div className="container-page py-8">
      <nav className="mb-5 flex items-center gap-2 text-xs text-ink-muted">
        <Link to="/shop" className="hover:text-ink">
          Browse
        </Link>
        <span>/</span>
        <Link to={`/shop?category=${product.category}`} className="capitalize hover:text-ink">
          {product.category}
        </Link>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2">
        <CategoryArt
          category={product.category}
          size="lg"
          className="h-72 w-full rounded-2xl border border-line"
        />

        <div>
          <h1 className="font-display text-3xl leading-tight text-ink">{product.name}</h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            {product.brand} · sold by {product.merchantName}
          </p>

          <div className="mt-3">
            <Stars rating={product.rating} count={product.ratingCount} />
          </div>

          <div className="mt-5 flex flex-wrap items-baseline gap-3">
            <span className="font-display text-4xl text-ink">{formatINR(product.price)}</span>
            {discount > 0 && (
              <>
                <span className="text-lg text-ink-faint line-through">{formatINR(product.mrp)}</span>
                <span className="badge bg-clay-50 text-clay-500">{discount}% off</span>
              </>
            )}
          </div>

          <p className="mt-4 text-sm leading-relaxed text-ink-soft">{product.description}</p>

          <p className="mt-4 text-sm">
            {product.stock > 0 ? (
              <span className="text-forest-700">In stock — {product.stock} available</span>
            ) : (
              <span className="text-clay-500">Currently out of stock</span>
            )}
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => addToCart(product._id)}
              disabled={product.stock <= 0}
              className="btn-primary flex-1 py-3"
            >
              Add to cart
            </button>
            <button
              type="button"
              onClick={() =>
                navigate('/agent', {
                  state: {
                    initialMessage: `Tell me about the ${product.name} and whether it is a good choice`,
                  },
                })
              }
              className="btn-secondary py-3"
            >
              Ask the agent
            </button>
          </div>

          {product.highlights?.length > 0 && (
            <ul className="mt-6 space-y-2 border-t border-line pt-6">
              {product.highlights.map((h) => (
                <li key={h} className="flex gap-2.5 text-sm text-ink-soft">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2F7D5F"
                       strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                       className="mt-0.5 shrink-0" aria-hidden="true">
                    <path d="m5 13 4 4L19 7" />
                  </svg>
                  {h}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* --------------------------------------------- the AI commerce profile */}
      <section className="mt-12">
        <div className="mb-4">
          <h2 className="text-2xl text-ink">AI Commerce Profile</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            This is the structured record the shopping agent reasons over — not a description it
            has to guess at. It is what lets BuyWise answer "will this survive the monsoon and fit
            my laptop?" instead of just matching words.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="card p-5">
            <p className="eyebrow mb-3">Specifications</p>
            {features.length ? (
              <dl className="divide-y divide-line-soft">
                {features.map(([key, value]) => (
                  <div key={key} className="flex items-baseline justify-between gap-3 py-2">
                    <dt className="text-sm text-ink-muted">{FEATURE_LABELS[key] || key}</dt>
                    <dd className="text-sm font-medium text-ink">{formatFeature(key, value)}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-ink-faint">No structured specs recorded.</p>
            )}
          </div>

          <div className="card p-5">
            <p className="eyebrow mb-3">Good for</p>
            <div className="flex flex-wrap gap-1.5">
              {(product.useCases || []).map((u) => (
                <span
                  key={u}
                  className="rounded-lg border border-forest-200 bg-forest-50 px-2.5 py-1 text-xs font-medium capitalize text-forest-700"
                >
                  {u}
                </span>
              ))}
              {!product.useCases?.length && (
                <p className="text-sm text-ink-faint">Not recorded.</p>
              )}
            </div>

            {product.suitableFor?.length > 0 && (
              <>
                <p className="eyebrow mb-2 mt-5">Suits</p>
                <ul className="space-y-1 text-sm capitalize text-ink-soft">
                  {product.suitableFor.map((s) => (
                    <li key={s}>· {s}</li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="card p-5">
            <p className="eyebrow mb-3">Discoverability tags</p>
            <div className="flex flex-wrap gap-1.5">
              {(product.tags || []).map((t) => (
                <span
                  key={t}
                  className="rounded-lg bg-line-soft px-2.5 py-1 text-xs text-ink-muted"
                >
                  {t}
                </span>
              ))}
            </div>
            <p className="mt-5 text-xs text-ink-faint">
              Profile generated by:{' '}
              <span className="font-medium text-ink-muted">
                {product.aiProfileGeneratedBy === 'rules'
                  ? 'built-in rule engine'
                  : product.aiProfileGeneratedBy === 'seed'
                    ? 'demo catalogue'
                    : product.aiProfileGeneratedBy || 'manual'}
              </span>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
