/**
 * Checkout - address, then payment.
 *
 * Two payment paths behind one button: if Razorpay sandbox keys are configured
 * the real Razorpay checkout opens; otherwise a clearly-labelled demo
 * simulator runs so the journey can be completed during a presentation.
 * Payment is always triggered by the shopper pressing this button - never by
 * the agent.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmptyState, ModeNote, Spinner } from '../components/Primitives';
import { useApp } from '../context/AppContext';
import { errorMessage, formatINR, paymentApi } from '../lib/api';

/** Load the Razorpay script only when we actually need it. */
const loadRazorpay = () =>
  new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

export default function Checkout() {
  const { cart, user, refreshCart, notify, loading } = useApp();
  const navigate = useNavigate();

  const [config, setConfig] = useState(null);
  const [paying, setPaying] = useState(false);
  const [address, setAddress] = useState({
    fullName: user?.name || '',
    line1: '',
    city: '',
    pincode: '',
    phone: '',
  });

  useEffect(() => {
    paymentApi.config().then(setConfig).catch(() => {});
  }, []);

  if (loading) return <Spinner />;
  if (!user) {
    return (
      <div className="container-page py-16">
        <EmptyState title="Sign in to check out" action="Sign in" to="/signin" />
      </div>
    );
  }
  if (!cart?.items?.length) {
    return (
      <div className="container-page py-16">
        <EmptyState
          title="Nothing to check out"
          description="Your cart is empty."
          action="Ask the agent"
          to="/agent"
        />
      </div>
    );
  }

  const valid = address.fullName && address.line1 && address.city && address.pincode.length >= 5;

  const completeOrder = async (payload) => {
    const order = await paymentApi.verify({ ...payload, address });
    await refreshCart();
    navigate('/orders', { state: { justPlaced: order.orderNumber } });
  };

  const pay = async (e) => {
    e.preventDefault();
    if (!valid || paying) return;
    setPaying(true);

    try {
      const paymentOrder = await paymentApi.createOrder();

      /* ---- demo simulator ---- */
      if (paymentOrder.mode === 'demo') {
        await new Promise((r) => setTimeout(r, 900));
        await completeOrder({ razorpay_order_id: paymentOrder.orderId });
        return;
      }

      /* ---- Razorpay sandbox ---- */
      const ready = await loadRazorpay();
      if (!ready) throw new Error('Could not reach the payment gateway. Check your connection.');

      const razorpay = new window.Razorpay({
        key: paymentOrder.keyId,
        amount: paymentOrder.amount,
        currency: paymentOrder.currency,
        name: 'BuyWise AI',
        description: `${cart.count} item(s)`,
        order_id: paymentOrder.orderId,
        prefill: { name: address.fullName, contact: address.phone },
        theme: { color: '#1C4E3A' },
        handler: async (response) => {
          try {
            await completeOrder(response);
          } catch (err) {
            notify(errorMessage(err), 'error');
            setPaying(false);
          }
        },
        modal: { ondismiss: () => setPaying(false) },
      });
      razorpay.open();
    } catch (err) {
      notify(errorMessage(err), 'error');
      setPaying(false);
    }
  };

  const field = (name, label, extra = {}) => (
    <div>
      <label htmlFor={name} className="label">
        {label}
      </label>
      <input
        id={name}
        value={address[name]}
        onChange={(e) => setAddress((a) => ({ ...a, [name]: e.target.value }))}
        className="field"
        {...extra}
      />
    </div>
  );

  return (
    <div className="container-page py-8">
      <h1 className="mb-6 text-3xl text-ink">Checkout</h1>

      <form onSubmit={pay} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="card p-6">
          <h2 className="mb-5 font-display text-lg text-ink">Delivery address</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">{field('fullName', 'Full name', { autoComplete: 'name' })}</div>
            <div className="sm:col-span-2">
              {field('line1', 'Address', { placeholder: 'House / street / area' })}
            </div>
            {field('city', 'City')}
            {field('pincode', 'PIN code', { inputMode: 'numeric', maxLength: 6 })}
            <div className="sm:col-span-2">
              {field('phone', 'Phone (optional)', { inputMode: 'tel' })}
            </div>
          </div>
        </div>

        <aside className="card h-fit p-5 lg:sticky lg:top-24">
          <h2 className="mb-4 font-display text-lg text-ink">Order summary</h2>

          <ul className="mb-4 space-y-2.5">
            {cart.items.map((item) => (
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

          <div className="divider mb-3" />

          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-muted">Subtotal</dt>
              <dd className="text-ink">{formatINR(cart.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">Delivery</dt>
              <dd className="text-ink">{cart.shipping ? formatINR(cart.shipping) : 'Free'}</dd>
            </div>
            <div className="flex items-baseline justify-between pt-2">
              <dt className="font-medium text-ink">Total</dt>
              <dd className="font-display text-2xl text-ink">{formatINR(cart.total)}</dd>
            </div>
          </dl>

          <button type="submit" disabled={!valid || paying} className="btn-primary mt-5 w-full py-3">
            {paying ? 'Processing…' : `Pay ${formatINR(cart.total)}`}
          </button>

          {!valid && (
            <p className="hint text-center">Fill in your address to continue.</p>
          )}

          <div className="mt-4">
            {config?.mode === 'demo' ? (
              <ModeNote>
                Demo payment mode — no gateway is called and no money moves. Add Razorpay sandbox
                keys to <code className="font-mono">server/.env</code> to run the real test flow.
              </ModeNote>
            ) : (
              <ModeNote>
                Razorpay sandbox is active. Use a Razorpay test card; live cards are not charged.
              </ModeNote>
            )}
          </div>
        </aside>
      </form>
    </div>
  );
}
