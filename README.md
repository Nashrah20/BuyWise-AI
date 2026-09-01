# 🛍️ BuyWise AI — Autonomous AI Shopping Agent

> **Tell BuyWise what you need in normal language, and it finds, compares, explains and prepares the best product for you.**

A full MERN e-commerce platform where the AI does the shopping work. Instead of
searching → filtering → comparing → doubting, the shopper describes their
situation and an agent converts that into structured requirements, searches an
AI-readable catalogue, scores every candidate against what they actually asked
for, and explains its choice.

```
        Ordinary shopping                      BuyWise
  ───────────────────────────      ────────────────────────────
  Search → 100+ products →         You describe the need →
  Filters → Compare →              AI understands → AI searches →
  Reviews → Confusion → Buy        AI compares → AI explains → You buy

  You do the thinking.             The agent does the thinking.
```

---

## Quick start (nothing to install, no API keys)

```bash
npm install            # once, for the dev runner
npm run install:all    # installs server + client
npm run dev            # starts both
```

- Web app → <http://localhost:5173>
- API → <http://localhost:5050>

**It works immediately with zero configuration.** No MongoDB, no LLM key, no
payment account. See [Zero-config mode](#zero-config-mode) for what that means
and how to switch each piece on.

### Demo accounts

| Role | Email | Password |
|---|---|---|
| Shopper | `shopper@buywise.ai` | `demo1234` |
| Merchant | `merchant@buywise.ai` | `demo1234` |

Both are one click away on the sign-in page.

---

## The 90-second demo

1. **Open the agent** and type
   *"I need a backpack."*
   → It asks for your budget instead of dumping 40 bags on you.
2. *"Around 2000 rupees."* → It searches and ranks.
3. *"For college, and I carry a 15.6 inch laptop."*
   → Watch the **What I understood** panel fill in. It correctly reads
   "laptop" as a *requirement of the backpack*, not a request for a laptop.
4. *"Yes, I travel during monsoon so it must be waterproof."*
   → The ranking changes; every card shows why.
5. Click **See how this score was calculated** on the top pick.
6. *"What if I increase my budget to 4000?"*
   → It changes **only** the budget and re-ranks. It remembered the rest.
7. *"Actually battery is more important than noise cancellation."*
   → Priorities shift the scoring weights, not just the wording.
8. *"Add it to my cart"* → the agent acts, then **checkout**.
9. Sign in as the **merchant** → the funnel you just created is on the dashboard.

Or run the whole thing headless:

```bash
node server/src/seed/demoCheck.js      # walks every scenario, prints what the agent did
node client/smoke.mjs                  # drives the real UI in a browser, saves screenshots
```

---

## What's inside

### 1. Intent-based product matching — the USP

The agent doesn't keyword-match. `server/src/services/intentService.js` turns

> *"I'm a college student, I travel by local train, I need a backpack under
> ₹2,000 that won't get damaged in rain and fits my laptop."*

into

```json
{
  "category": "backpack",
  "maxPrice": 2000,
  "useCase": "college",
  "requirements": { "waterproof": true, "laptopCompartment": 15.6 },
  "priorities": {}
}
```

Requirements are **merged** across turns, so a later *"make it ₹4,000"*
changes one field and keeps everything else.

### 2. Recommendation engine with explainability

`server/src/services/recommendationEngine.js` scores every candidate:

| Pillar | Base points |
|---|---|
| Budget fit | 25 |
| Must-have features (ANC, waterproof…) | 30 |
| Specifications (battery hours, RAM, camera MP…) | 25 |
| Use-case suitability | 20 |
| Buyer rating | 5 |

Those weights are **re-balanced by the shopper's stated priorities**, so
*"battery matters more than ANC"* genuinely changes the ranking. Every product
gets a **"Why this product?"** card: what counted for it, what counted against
it, how it compares with the winner, and the exact per-pillar arithmetic.

### 3. Genuinely agentic

- **Memory** — requirements persist in the conversation, so follow-ups work.
- **Clarifying questions** — too little information produces one good question, not a weak shortlist.
- **Trade-off reasoning** — priorities change the maths.
- **Actions** — it adds to cart, reads the cart, compares, prepares checkout.

### 4. AI + tools (the safety boundary)

The LLM never touches the database, the cart or payments. It can only propose a
tool call; the backend decides whether to run it. Tools live in
`server/src/agent/tools.js` — adding a capability means adding a tool there and
nowhere else.

```
message → intent extraction → decision engine → backend runs the tool → explanation
```

### 5. Merchant side

Merchants paste an ordinary listing and BuyWise generates an **AI Commerce
Profile** — structured features, use cases, audiences — and shows it *before*
saving so they can correct it:

```
Name: College Backpack   Price: ₹1499
Description: Waterproof backpack with a padded 15.6 inch laptop
             compartment and anti-theft pocket.
                              ↓
{ "category": "backpack",
  "features": { "waterproof": true, "laptopCompartment": 15.6, "antiTheft": true },
  "useCases": ["college", "travel"],
  "suitableFor": ["students", "travellers"] }
```

### 6. Merchant dashboard — the growth angle

Every agent action writes an analytics event, so the dashboard answers the
question a merchant actually asks: **how much of my revenue did the AI
produce?**

```
AI searches answered → recommendations → added to cart → purchased
```

plus search coverage, cart rate, conversion, top searches in shoppers' own
words, and which of their products the agent picks.

---

## Zero-config mode

Each external dependency has a working fallback, so the project runs anywhere
and degrades honestly instead of breaking. The UI always says which mode it is in.

| Piece | Without configuration | With configuration |
|---|---|---|
| **Database** | File-backed store in `server/.data/` — a small MongoDB-compatible engine (`db/memoryEngine.js`) | Real MongoDB / Atlas via `MONGO_URI` |
| **AI** | Deterministic rule engine — full intent extraction, scoring, explanations | Anthropic, Gemini or OpenAI via an API key |
| **Payment** | Labelled demo simulator | Razorpay sandbox via `RAZORPAY_KEY_ID` / `SECRET` |

Because both database engines speak the same query language, **no application
code changes** when you move to Atlas.

To switch anything on, copy `.env.example` to `server/.env` and fill in what you
want:

```bash
cp .env.example server/.env
```

```bash
MONGO_URI=mongodb+srv://…        # → real MongoDB
GEMINI_API_KEY=…                 # → LLM reasoning (or ANTHROPIC_API_KEY / OPENAI_API_KEY)
RAZORPAY_KEY_ID=…                # → Razorpay sandbox
RAZORPAY_KEY_SECRET=…
```

The LLM path is used for intent extraction, product-profile generation and the
natural-language explanation. **The rule engine stays as the safety net** — if
the model errors, times out or returns unparseable JSON, the request still
succeeds.

---

## Tech stack

**Frontend** React 18 · React Router · Tailwind CSS · Axios · Vite
**Backend** Node · Express · JWT · bcrypt
**Database** MongoDB (official driver) with a built-in fallback engine
**AI** Anthropic / Gemini / OpenAI, plus a deterministic rule engine
**Payment** Razorpay sandbox, plus a demo simulator

---

## API

| Endpoint | Purpose |
|---|---|
| `POST /api/ai/chat` | The full agentic loop — understand, act, explain |
| `POST /api/ai/search` | One-shot: message in, structured filters + ranked list out |
| `POST /api/ai/extract` | Intent extraction alone |
| `GET /api/ai/status` | Which engine is answering |
| `POST /api/recommendations` | Score an explicit requirement object (no LLM) |
| `/api/auth` | signup · login · me · preferences |
| `/api/products` · `/api/search` | Catalogue |
| `/api/cart` · `/api/orders` · `/api/payment` | Commerce |
| `/api/merchant` | dashboard · products · `generate-profile` |

Example:

```http
POST /api/ai/search
{ "message": "I need headphones under 3000 for studying" }
```

```json
{
  "intent": "product_search",
  "filters": {
    "category": "headphones", "maxPrice": 3000, "useCase": "study",
    "requirements": { "anc": true, "battery": 30 }
  },
  "recommendations": [ { "product": {…}, "matchPercent": 96, "pros": [...], "cons": [...] } ]
}
```

---

## Collections

`users` · `products` · `carts` · `orders` · `conversations` · `recommendations` · `events`

A product is stored as an AI Commerce Profile, not just a description:

```json
{
  "name": "SoundMax Pro ANC",
  "price": 2499,
  "category": "headphones",
  "features": { "anc": true, "battery": 35, "wireless": true },
  "useCases": ["study", "travel", "office"],
  "suitableFor": ["students", "travellers"],
  "searchText": "…"
}
```

---

## Project layout

```
server/src/
  agent/            agentEngine.js (the loop) · tools.js (what it may do)
  services/
    intentService.js         human language → structured requirements
    recommendationEngine.js  scoring + "Why this product?" cards
    productProfileService.js merchant listing → AI Commerce Profile
    knowledgeBase.js         the shared vocabulary of the whole platform
    analyticsService.js      the merchant funnel
    llm/                     Anthropic · Gemini · OpenAI behind one interface
  db/                        one data interface, two engines
  routes/  models/  middleware/  seed/

client/src/
  pages/       Home · Agent · Shop · ProductDetail · Cart · Checkout · Orders · SignIn · Merchant×3
  components/  RecommendationCard ("Why this product?") · RequirementPanel ("What I understood")
```

`knowledgeBase.js` is the file to read first: intent extraction, scoring and
profile generation all share it, so `anc` means the same thing whether a shopper
typed it, a merchant stored it, or the recommender scored it. Adding a product
category means adding one entry there.

---

## Deployment

- **Frontend** → Vercel / Netlify (`npm run build` in `client/`)
- **Backend** → Render (`npm start` in `server/`)
- **Database** → MongoDB Atlas — set `MONGO_URI` and everything else is unchanged

Set `CLIENT_URL` on the backend to your deployed frontend origin for CORS, and
point the frontend at the API (the dev proxy in `vite.config.js` is
development-only).

---

## Notes

- Prices are in INR throughout.
- Payments run in a sandbox. No money moves.
- `server/.data/` is generated demo data; delete it to reset. `npm run seed` rebuilds the catalogue.
