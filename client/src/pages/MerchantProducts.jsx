import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CategoryArt, EmptyState, Spinner } from '../components/Primitives';
import { useApp } from '../context/AppContext';
import { errorMessage, formatINR, merchantApi } from '../lib/api';

export default function MerchantProducts() {
  const { isMerchant, notify } = useApp();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isMerchant) return setLoading(false);
    merchantApi
      .products()
      .then(setProducts)
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [isMerchant]);

  const remove = async (id, name) => {
    if (!window.confirm(`Remove "${name}" from your store? This cannot be undone.`)) return;
    try {
      await merchantApi.deleteProduct(id);
      setProducts((list) => list.filter((p) => p._id !== id));
      notify('Product removed.');
    } catch (err) {
      notify(errorMessage(err), 'error');
    }
  };

  if (loading) return <Spinner label="Loading your products" />;

  if (!isMerchant) {
    return (
      <div className="container-page py-16">
        <EmptyState title="Merchant accounts only" action="Sign in" to="/signin" />
      </div>
    );
  }

  return (
    <div className="container-page py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl text-ink">My products</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {products.length} listed · each one carries an AI Commerce Profile
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/merchant" className="btn-secondary">
            Dashboard
          </Link>
          <Link to="/merchant/new" className="btn-primary">
            Add a product
          </Link>
        </div>
      </div>

      {products.length === 0 ? (
        <EmptyState
          title="No products yet"
          description="Add your first product and BuyWise will make it discoverable to the shopping agent."
          action="Add a product"
          to="/merchant/new"
        />
      ) : (
        <ul className="space-y-3">
          {products.map((product) => (
            <li key={product._id} className="card flex flex-wrap items-center gap-4 p-4">
              <CategoryArt
                category={product.category}
                size="sm"
                className="h-14 w-14 shrink-0 rounded-xl"
              />

              <div className="min-w-0 flex-1">
                <Link
                  to={`/product/${product._id}`}
                  className="font-display text-base text-ink hover:text-forest-700"
                >
                  {product.name}
                </Link>
                <p className="mt-0.5 text-xs capitalize text-ink-muted">
                  {product.category} · {product.brand} · {product.stock} in stock
                </p>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Object.entries(product.features || {})
                    .slice(0, 4)
                    .map(([key, value]) => (
                      <span
                        key={key}
                        className="rounded bg-line-soft px-2 py-0.5 font-mono text-[10px] text-ink-muted"
                      >
                        {key}
                        {value !== true && `: ${value}`}
                      </span>
                    ))}
                </div>
              </div>

              <div className="text-right">
                <p className="font-display text-lg text-ink">{formatINR(product.price)}</p>
                <button
                  type="button"
                  onClick={() => remove(product._id, product.name)}
                  className="mt-1 text-xs text-ink-muted underline-offset-2 hover:text-clay-500 hover:underline"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
