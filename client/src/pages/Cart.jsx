import { Link, useNavigate } from 'react-router-dom';
import { CategoryArt, EmptyState, Spinner } from '../components/Primitives';
import { useApp } from '../context/AppContext';
import { cartApi, errorMessage, formatINR } from '../lib/api';

export default function Cart() {
  const { cart, setCart, user, loading, notify } = useApp();
  const navigate = useNavigate();

  if (loading) return <Spinner label="Loading your cart" />;

  if (!user) {
    return (
      <div className="container-page py-16">
        <EmptyState
          title="Sign in to see your cart"
          description="Your cart is saved to your account so the agent can add things for you."
          action="Sign in"
          to="/signin"
        />
      </div>
    );
  }

  const change = async (productId, quantity) => {
    try {
      setCart(await cartApi.update(productId, quantity));
    } catch (err) {
      notify(errorMessage(err), 'error');
    }
  };

  const remove = async (productId) => {
    try {
      setCart(await cartApi.remove(productId));
      notify('Removed from cart.');
    } catch (err) {
      notify(errorMessage(err), 'error');
    }
  };

  if (!cart?.items?.length) {
    return (
      <div className="container-page py-16">
        <EmptyState
          title="Your cart is empty"
          description="Tell the agent what you need and it can put the best match straight in here."
          action="Ask the agent"
          to="/agent"
        />
      </div>
    );
  }

  const agentPicked = cart.items.filter((i) => i.addedByAgent).length;

  return (
    <div className="container-page py-8">
      <h1 className="mb-1 text-3xl text-ink">Your cart</h1>
      <p className="mb-6 text-sm text-ink-muted">
        {cart.count} item{cart.count === 1 ? '' : 's'}
        {agentPicked > 0 && ` · ${agentPicked} chosen by the agent`}
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <ul className="space-y-3">
          {cart.items.map((item) => (
            <li key={item.productId} className="card flex gap-4 p-4">
              <Link to={`/product/${item.productId}`} className="shrink-0">
                <CategoryArt
                  category={item.category || 'headphones'}
                  size="sm"
                  className="h-20 w-20 rounded-xl"
                />
              </Link>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      to={`/product/${item.productId}`}
                      className="font-display text-base text-ink hover:text-forest-700"
                    >
                      {item.name}
                    </Link>
                    <p className="mt-0.5 text-xs text-ink-muted">{item.brand}</p>
                  </div>
                  {item.addedByAgent && (
                    <span className="badge bg-forest-50 text-forest-700">Agent's pick</span>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-1 rounded-lg border border-line">
                    <button
                      type="button"
                      onClick={() => change(item.productId, item.quantity - 1)}
                      className="px-3 py-1.5 text-ink-muted hover:text-ink"
                      aria-label={`Decrease quantity of ${item.name}`}
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-sm font-medium tabular-nums">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => change(item.productId, item.quantity + 1)}
                      className="px-3 py-1.5 text-ink-muted hover:text-ink"
                      aria-label={`Increase quantity of ${item.name}`}
                    >
                      +
                    </button>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="font-display text-lg text-ink">
                      {formatINR(item.price * item.quantity)}
                    </span>
                    <button
                      type="button"
                      onClick={() => remove(item.productId)}
                      className="text-xs text-ink-muted underline-offset-2 hover:text-clay-500 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <aside className="card h-fit p-5 lg:sticky lg:top-24">
          <h2 className="mb-4 font-display text-lg text-ink">Summary</h2>

          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-muted">Subtotal</dt>
              <dd className="font-medium text-ink">{formatINR(cart.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">Delivery</dt>
              <dd className="font-medium text-ink">
                {cart.shipping ? formatINR(cart.shipping) : 'Free'}
              </dd>
            </div>
            <div className="divider my-3" />
            <div className="flex items-baseline justify-between">
              <dt className="font-medium text-ink">Total</dt>
              <dd className="font-display text-2xl text-ink">{formatINR(cart.total)}</dd>
            </div>
          </dl>

          <button
            type="button"
            onClick={() => navigate('/checkout')}
            className="btn-primary mt-5 w-full py-3"
          >
            Proceed to checkout
          </button>

          <Link to="/shop" className="btn-ghost mt-2 w-full">
            Keep browsing
          </Link>
        </aside>
      </div>
    </div>
  );
}
