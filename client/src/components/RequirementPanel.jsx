/**
 * RequirementPanel - "here is what I understood".
 *
 * The agent's working memory, rendered. This is the single most convincing
 * thing on the screen: it shows that BuyWise converted a sentence into
 * structured requirements (spec sections 2 and 3), that it REMEMBERS them
 * across turns, and what it still doesn't know.
 */
import { formatINR } from '../lib/api';

const ATTRIBUTE_LABELS = {
  anc: 'Noise cancellation',
  battery: 'Battery life',
  wireless: 'Wireless',
  mic: 'Microphone',
  waterproof: 'Waterproof',
  laptopCompartment: 'Laptop compartment',
  antiTheft: 'Anti-theft',
  capacity: 'Capacity',
  ram: 'RAM',
  storage: 'Storage',
  processor: 'Processor',
  weightKg: 'Weight',
  camera: 'Camera',
  display: 'Display',
  fiveG: '5G',
  waterResistant: 'Water resistant',
  heartRate: 'Heart rate',
  backlit: 'Backlit keys',
  mechanical: 'Mechanical switches',
};

const UNITS = {
  battery: 'hrs',
  laptopCompartment: '"',
  capacity: 'L',
  ram: 'GB',
  storage: 'GB',
  camera: 'MP',
  weightKg: 'kg',
};

const MISSING_LABELS = {
  category: 'what kind of product',
  budget: 'your budget',
  useCase: 'what you will use it for',
};

const PRIORITY_STYLE = {
  high: 'bg-forest-700 text-white',
  medium: 'bg-brass-100 text-brass-600',
  low: 'bg-line-soft text-ink-muted',
};

function Row({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="shrink-0 text-xs text-ink-muted">{label}</dt>
      <dd className="text-right text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}

export default function RequirementPanel({ requirements, missing = [], engine }) {
  const req = requirements || {};
  const features = Object.entries(req.requirements || {});
  const priorities = Object.entries(req.priorities || {});
  const hasAnything =
    req.category || req.maxPrice || req.minPrice || req.useCase || req.brand || features.length;

  return (
    <aside className="card overflow-hidden">
      <div className="border-b border-line-soft px-4 py-3">
        <h2 className="font-display text-base text-ink">What I understood</h2>
        <p className="mt-0.5 text-xs text-ink-muted">
          Your words, converted into requirements the engine can score against.
        </p>
      </div>

      <div className="px-4 py-3">
        {!hasAnything ? (
          <p className="py-4 text-center text-sm text-ink-muted">
            Nothing yet. Describe what you need and this fills in as we talk.
          </p>
        ) : (
          <dl className="divide-y divide-line-soft">
            {req.category && <Row label="Category">{req.category}</Row>}

            {(req.maxPrice || req.minPrice) && (
              <Row label="Budget">
                {req.minPrice && req.maxPrice
                  ? `${formatINR(req.minPrice)} – ${formatINR(req.maxPrice)}`
                  : req.maxPrice
                    ? `up to ${formatINR(req.maxPrice)}`
                    : `from ${formatINR(req.minPrice)}`}
              </Row>
            )}

            {req.useCase && <Row label="Main use">{req.useCase}</Row>}
            {req.brand && <Row label="Brand">{req.brand}</Row>}

            {features.length > 0 && (
              <div className="py-2.5">
                <p className="mb-2 text-xs text-ink-muted">Must-haves</p>
                <ul className="flex flex-wrap gap-1.5">
                  {features.map(([key, value]) => (
                    <li
                      key={key}
                      className="rounded-lg border border-forest-200 bg-forest-50 px-2.5 py-1 text-xs font-medium text-forest-700"
                    >
                      {ATTRIBUTE_LABELS[key] || key}
                      {value !== true && (
                        <span className="ml-1 font-normal text-forest-500">
                          ≥ {value}
                          {UNITS[key] || ''}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {priorities.length > 0 && (
              <div className="py-2.5">
                <p className="mb-2 text-xs text-ink-muted">What matters most</p>
                <ul className="space-y-1.5">
                  {priorities.map(([key, level]) => (
                    <li key={key} className="flex items-center justify-between gap-2">
                      <span className="text-sm text-ink-soft">
                        {ATTRIBUTE_LABELS[key] || key}
                      </span>
                      <span className={`badge ${PRIORITY_STYLE[level]}`}>{level}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </dl>
        )}

        {missing.length > 0 && (
          <div className="mt-3 rounded-xl border border-brass-100 bg-brass-50 px-3 py-2.5">
            <p className="text-xs font-semibold text-brass-600">Still to find out</p>
            <p className="mt-0.5 text-xs text-brass-600/90">
              {missing
                .map((m) => MISSING_LABELS[m] || `your ${m} preferences`)
                .join(', ')}
            </p>
          </div>
        )}
      </div>

      {engine && (
        <p className="border-t border-line-soft px-4 py-2.5 text-[11px] text-ink-faint">
          Understood by:{' '}
          <span className="font-medium text-ink-muted">
            {engine === 'rules' ? 'built-in rule engine' : `${engine} model`}
          </span>
        </p>
      )}
    </aside>
  );
}
