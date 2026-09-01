import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { EmptyState, Spinner } from '../components/Primitives';
import { useApp } from '../context/AppContext';
import { formatINR, orderApi } from '../lib/api';

export default function Orders() {
  const { user, loading: authLoading } = useApp();
  const location = useLocation();
  const justPlaced = location.state?.justPlaced;

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return setLoading(false);
    orderApi
      .list()
      .then(setOrders)
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, [user]);

  if (authLoading || loading) return <Spinner label="Loading your orders" />;

  if (!user) {
    return (
      <div className="container-page py-16">
        <EmptyState title="Sign in to see your orders" action="Sign in" to="/signin" />
      </div>
    );
  }

  return (
    <div className="container-page py-8">
      {justPlaced && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-forest-200 bg-forest-50 p-5">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#256349" strokeWidth="2"
               strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="m8 12 3 3 5-6" />
          </svg>
          <div>
            <p className="font-display text-lg text-forest-700">Order placed</p>
            <p className="mt-0.5 text-sm text-forest-700/80">
              Your order <strong className="font-semibold">{justPlaced}</strong> is confirmed. This
              is a demo build, so nothing will actually ship.
            </p>
          </div>
        </div>
      )}

      <h1 className="mb-6 text-3xl text-ink">Your orders</h1>

      {orders.length === 0 ? (
        <EmptyState
          title="No orders yet"
          description="When you buy something, it will show up here."
          action="Start shopping"
          to="/agent"
        />
      ) : (
        <ul className="space-y-4">
          {orders.map((order) => (
            <li key={order._id} className="card p-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-line-soft pb-4">
                <div>
                  <p className="font-display text-lg text-ink">{order.orderNumber}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {new Date(order.createdAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                    {' · '}
                    {order.payment?.method === 'demo' ? 'Demo payment' : 'Razorpay test'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {order.source === 'ai_agent' && (
                    <span className="badge bg-forest-50 text-forest-700">Agent assisted</span>
                  )}
                  <span className="badge bg-line-soft text-ink-soft">{order.status}</span>
                </div>
              </div>

              <ul className="space-y-2">
                {order.items.map((item) => (
                  <li key={item.productId} className="flex justify-between gap-3 text-sm">
                    <span className="min-w-0 text-ink-soft">
                      <span className="block truncate">{item.name}</span>
                      <span className="text-xs text-ink-faint">Qty {item.quantity}</span>
                    </span>
                    <span className="shrink-0 font-medium text-ink">
                      {formatINR(item.price * item.quantity)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex items-baseline justify-between border-t border-line-soft pt-4">
                <span className="text-sm text-ink-muted">Total paid</span>
                <span className="font-display text-xl text-ink">{formatINR(order.total)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
