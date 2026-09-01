/**
 * MerchantAddProduct - the merchant-side AI (spec section 11).
 *
 * The merchant types what they always type. Before saving, BuyWise shows the
 * AI Commerce Profile it generated so they can SEE what the shopping agent
 * will understand - and correct it if it got something wrong. That preview
 * step is the whole point: the merchant stays in control of their listing.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmptyState, ModeNote } from '../components/Primitives';
import { useApp } from '../context/AppContext';
import { errorMessage, merchantApi } from '../lib/api';

const CATEGORIES = [
  'headphones', 'backpack', 'laptop', 'smartphone',
  'smartwatch', 'keyboard', 'monitor', 'speaker',
];

const EXAMPLE = {
  name: 'College Backpack',
  price: '1499',
  description: 'Waterproof backpack with a padded 15.6 inch laptop compartment and anti-theft pocket.',
};

export default function MerchantAddProduct() {
  const { isMerchant, notify } = useApp();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    brand: '',
    price: '',
    mrp: '',
    stock: '25',
    category: '',
    description: '',
  });
  const [profile, setProfile] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!isMerchant) {
    return (
      <div className="container-page py-16">
        <EmptyState
          title="Merchant accounts only"
          description="Sign in with the demo merchant account to add products."
          action="Sign in"
          to="/signin"
        />
      </div>
    );
  }

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setProfile(null); // the listing changed, so the profile is stale
  };

  const generate = async () => {
    if (!form.name) return setError('Give the product a name first.');
    setError('');
    setGenerating(true);
    try {
      setProfile(
        await merchantApi.generateProfile({
          name: form.name,
          description: form.description,
          price: Number(form.price) || 0,
          category: form.category || undefined,
        })
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setGenerating(false);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.name || !form.price) return setError('Name and price are required.');
    setError('');
    setSaving(true);
    try {
      await merchantApi.createProduct({
        ...form,
        price: Number(form.price),
        mrp: Number(form.mrp || form.price),
        stock: Number(form.stock),
        profile: profile || undefined,
      });
      notify('Product published and now discoverable by the agent.');
      navigate('/merchant/products');
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <div className="container-page py-8">
      <div className="mb-6">
        <h1 className="text-3xl text-ink">Add a product</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Fill in the listing as you normally would. BuyWise converts it into an AI Commerce
          Profile so the shopping agent can reason about your product instead of guessing from a
          description.
        </p>
      </div>

      <form onSubmit={save} className="grid gap-6 lg:grid-cols-2">
        {/* ------------------------------------------------------ the listing */}
        <div className="card p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-display text-lg text-ink">Your listing</h2>
            <button
              type="button"
              onClick={() => {
                setForm((f) => ({ ...f, ...EXAMPLE }));
                setProfile(null);
              }}
              className="text-xs font-medium text-forest-700 underline-offset-2 hover:underline"
            >
              Fill in an example
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="label">
                Product name *
              </label>
              <input id="name" value={form.name} onChange={set('name')} className="field" required />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="price" className="label">
                  Price (₹) *
                </label>
                <input
                  id="price"
                  type="number"
                  min="1"
                  value={form.price}
                  onChange={set('price')}
                  className="field"
                  required
                />
              </div>
              <div>
                <label htmlFor="mrp" className="label">
                  MRP (₹)
                </label>
                <input id="mrp" type="number" min="1" value={form.mrp} onChange={set('mrp')} className="field" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="brand" className="label">
                  Brand
                </label>
                <input id="brand" value={form.brand} onChange={set('brand')} className="field" />
              </div>
              <div>
                <label htmlFor="stock" className="label">
                  Stock
                </label>
                <input
                  id="stock"
                  type="number"
                  min="0"
                  value={form.stock}
                  onChange={set('stock')}
                  className="field"
                />
              </div>
            </div>

            <div>
              <label htmlFor="category" className="label">
                Category
              </label>
              <select id="category" value={form.category} onChange={set('category')} className="field">
                <option value="">Let BuyWise work it out</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c} className="capitalize">
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="description" className="label">
                Description
              </label>
              <textarea
                id="description"
                rows={4}
                value={form.description}
                onChange={set('description')}
                className="field resize-none"
                placeholder="Describe it in plain language — mention features, materials and who it suits."
              />
              <p className="hint">
                The more concrete you are here, the better the generated profile will be.
              </p>
            </div>
          </div>

          {error && (
            <p className="mt-4 rounded-xl border border-clay-200 bg-clay-50 px-3.5 py-2.5 text-sm text-clay-500">
              {error}
            </p>
          )}

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={generate}
              disabled={generating || !form.name}
              className="btn-secondary flex-1"
            >
              {generating ? 'Analysing…' : profile ? 'Regenerate profile' : 'Generate AI profile'}
            </button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'Publishing…' : 'Publish product'}
            </button>
          </div>
          <p className="hint">
            You can publish without previewing — BuyWise will generate the profile on save.
          </p>
        </div>

        {/* ------------------------------------------------- the generated profile */}
        <div className="card p-6">
          <h2 className="mb-1 font-display text-lg text-ink">AI Commerce Profile</h2>
          <p className="mb-5 text-sm text-ink-muted">
            What the shopping agent will understand about this product.
          </p>

          {!profile ? (
            <div className="rounded-xl border border-dashed border-line px-5 py-12 text-center">
              <p className="text-sm text-ink-muted">
                Generate a profile to see the structured record.
              </p>
              <p className="mt-1 text-xs text-ink-faint">
                Category, features, use cases and audiences — extracted from your listing.
              </p>
            </div>
          ) : (
            <div className="animate-fade-up space-y-4">
              <div>
                <p className="eyebrow mb-1.5">Category</p>
                <p className="text-sm font-medium capitalize text-ink">{profile.category}</p>
              </div>

              <div>
                <p className="eyebrow mb-2">Structured features</p>
                {Object.keys(profile.features || {}).length ? (
                  <dl className="divide-y divide-line-soft rounded-xl border border-line">
                    {Object.entries(profile.features).map(([key, value]) => (
                      <div key={key} className="flex items-baseline justify-between gap-3 px-3.5 py-2">
                        <dt className="font-mono text-xs text-ink-muted">{key}</dt>
                        <dd className="text-sm font-medium text-ink">
                          {value === true ? 'Yes' : String(value)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="text-sm text-ink-faint">
                    None detected — add more detail to your description.
                  </p>
                )}
              </div>

              <div>
                <p className="eyebrow mb-2">Use cases</p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.useCases.map((u) => (
                    <span
                      key={u}
                      className="rounded-lg border border-forest-200 bg-forest-50 px-2.5 py-1 text-xs font-medium capitalize text-forest-700"
                    >
                      {u}
                    </span>
                  ))}
                </div>
              </div>

              {profile.suitableFor?.length > 0 && (
                <div>
                  <p className="eyebrow mb-2">Suits</p>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.suitableFor.map((s) => (
                      <span key={s} className="rounded-lg bg-brass-50 px-2.5 py-1 text-xs capitalize text-brass-600">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {profile.highlights?.length > 0 && (
                <div>
                  <p className="eyebrow mb-2">Selling points</p>
                  <ul className="space-y-1 text-sm text-ink-soft">
                    {profile.highlights.map((h) => (
                      <li key={h}>· {h}</li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="border-t border-line-soft pt-3 text-xs text-ink-faint">
                Generated by:{' '}
                <span className="font-medium text-ink-muted">
                  {profile.generatedBy === 'rules' ? 'built-in rule engine' : `${profile.generatedBy} model`}
                </span>
              </p>

              {profile.generatedBy === 'rules' && (
                <ModeNote>
                  This profile came from the built-in keyword engine. Add an LLM API key in
                  <code className="font-mono"> server/.env</code> for richer extraction.
                </ModeNote>
              )}
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
