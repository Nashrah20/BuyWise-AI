import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CategoryArt, EmptyState, Spinner, Stars } from '../components/Primitives';
import { useApp } from '../context/AppContext';
import { formatINR, productApi } from '../lib/api';

const SORTS = [
  { value: 'rating', label: 'Best rated' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'newest', label: 'Newest' },
];

export default function Shop() {
  const [params, setParams] = useSearchParams();
  const { addToCart } = useApp();

  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(params.get('q') || '');

  const filters = useMemo(
    () => ({
      q: params.get('q') || '',
      category: params.get('category') || '',
      maxPrice: params.get('maxPrice') || '',
      sort: params.get('sort') || 'rating',
    }),
    [params]
  );

  useEffect(() => {
    productApi.categories().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    productApi
      .list(filters)
      .then((data) => setItems(data.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [filters]);

  const update = (patch) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next);
  };

  return (
    <div className="container-page py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl text-ink">Browse the catalogue</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {loading ? 'Loading…' : `${items.length} products`}
            {filters.category ? ` in ${filters.category}` : ''}
          </p>
        </div>
        <Link to="/agent" className="btn-secondary">
          Let the agent choose instead
        </Link>
      </div>

      {/* ------------------------------------------------------------ filters */}
      <div className="card mb-6 flex flex-col gap-4 p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            update({ q: search });
          }}
          className="flex gap-2"
        >
          <label htmlFor="shop-q" className="sr-only">
            Search products
          </label>
          <input
            id="shop-q"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, feature or use case…"
            className="field"
          />
          <button type="submit" className="btn-primary shrink-0">
            Search
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => update({ category: '' })}
              className={`chip ${!filters.category ? 'border-forest-300 bg-forest-50 text-forest-700' : ''}`}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c.category}
                type="button"
                onClick={() => update({ category: c.category })}
                className={`chip capitalize ${
                  filters.category === c.category ? 'border-forest-300 bg-forest-50 text-forest-700' : ''
                }`}
              >
                {c.category}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <label htmlFor="sort" className="text-xs text-ink-muted">
              Sort
            </label>
            <select
              id="sort"
              value={filters.sort}
              onChange={(e) => update({ sort: e.target.value })}
              className="field w-auto py-2 text-xs"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------- grid */}
      {loading ? (
        <Spinner label="Loading products" />
      ) : items.length === 0 ? (
        <EmptyState
          title="No products match that"
          description="Try a different category, or describe what you need to the agent and let it widen the search for you."
          action="Ask the agent"
          to="/agent"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((product) => (
            <article key={product._id} className="card card-hover flex flex-col overflow-hidden">
              <Link to={`/product/${product._id}`}>
                <CategoryArt category={product.category} size="lg" className="h-36 w-full" />
              </Link>

              <div className="flex flex-1 flex-col p-4">
                <Link
                  to={`/product/${product._id}`}
                  className="font-display text-base leading-snug text-ink hover:text-forest-700"
                >
                  {product.name}
                </Link>
                <p className="mt-0.5 text-xs text-ink-muted">{product.brand}</p>

                {product.highlights?.length > 0 && (
                  <ul className="mt-2.5 space-y-1">
                    {product.highlights.slice(0, 2).map((h) => (
                      <li key={h} className="truncate text-xs text-ink-muted">
                        · {h}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-auto pt-3">
                  <div className="mb-3 flex items-baseline gap-2">
                    <span className="font-display text-lg text-ink">{formatINR(product.price)}</span>
                    {product.mrp > product.price && (
                      <span className="text-xs text-ink-faint line-through">
                        {formatINR(product.mrp)}
                      </span>
                    )}
                  </div>
                  <div className="mb-3">
                    <Stars rating={product.rating} count={product.ratingCount} />
                  </div>
                  <button
                    type="button"
                    onClick={() => addToCart(product._id)}
                    disabled={product.stock <= 0}
                    className="btn-primary w-full"
                  >
                    {product.stock > 0 ? 'Add to cart' : 'Out of stock'}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
