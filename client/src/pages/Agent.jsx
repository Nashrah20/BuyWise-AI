/**
 * Agent.jsx - the conversational shopping page.
 *
 * Layout is deliberately two-column: the conversation on the left, the agent's
 * live working memory on the right. A shopper can always see WHAT the agent
 * currently believes about their needs, which is what turns this from a chat
 * toy into something you would trust to pick for you.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Markdown from 'react-markdown';
import RecommendationCard from '../components/RecommendationCard';
import RequirementPanel from '../components/RequirementPanel';
import { ModeNote, ThinkingDots } from '../components/Primitives';
import { useApp } from '../context/AppContext';
import { aiApi, errorMessage, formatINR } from '../lib/api';

const STORAGE_KEY = 'buywise_conversation';

const STARTERS = [
  'I need a backpack',
  'Headphones for studying under ₹3,000',
  'A phone under ₹25,000 with a good camera',
  'A laptop for coding under ₹60,000',
];

/** A short, human label for what the agent just did. */
const ACTION_LABELS = {
  search_products: 'searched the catalogue',
  add_to_cart: 'added an item to your cart',
  view_cart: 'read your cart',
  compare_products: 'compared your shortlist',
  checkout_summary: 'prepared your checkout',
  get_profile: 'checked your saved preferences',
};

export default function Agent() {
  const { addToCart, notify, user } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [requirements, setRequirements] = useState(null);
  const [missing, setMissing] = useState([]);
  const [engine, setEngine] = useState(null);
  const [status, setStatus] = useState(null);

  const [resumed, setResumed] = useState(false);

  const endRef = useRef(null);
  const inputRef = useRef(null);
  const sentInitial = useRef(false);
  const restored = useRef(false);

  useEffect(() => {
    aiApi.status().then(setStatus).catch(() => {});
  }, []);

  /**
   * Resume the conversation.
   *
   * The agent's memory lives on the server, but the id linking us to it used to
   * live only in React state - so leaving this page and coming back silently
   * started a new conversation while the shopper carried on as if it
   * remembered their budget. The id is now persisted and the transcript
   * rebuilt on load.
   */
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;

    // Arriving from the home page with a fresh question starts a new search.
    if (location.state?.initialMessage) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }

    const savedId = localStorage.getItem(STORAGE_KEY);
    if (!savedId) return;

    aiApi
      .conversation(savedId)
      .then(({ conversation, missing: stillMissing }) => {
        if (!conversation?.messages?.length) return;
        setConversationId(conversation._id);
        setRequirements(conversation.requirements);
        setMissing(stillMissing || []);
        setMessages(
          conversation.messages.map((m) => ({
            role: m.role,
            content: m.content,
            recommendations: m.recommendations || [],
            suggestions: m.suggestions || [],
            relaxed: m.relaxed || null,
          }))
        );
        setResumed(true);
      })
      .catch(() => localStorage.removeItem(STORAGE_KEY));
  }, [location.state]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy]);

  const send = useCallback(
    async (text) => {
      const content = String(text ?? '').trim();
      if (!content || busy) return;

      setMessages((prev) => [...prev, { role: 'user', content }]);
      setInput('');
      setBusy(true);

      try {
        const data = await aiApi.chat(content, conversationId);
        setConversationId(data.conversationId);
        localStorage.setItem(STORAGE_KEY, data.conversationId);
        setRequirements(data.requirements);
        setMissing(data.missing || []);
        setEngine(data.engine);
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.reply,
            recommendations: data.recommendations || [],
            suggestions: data.suggestions || [],
            actions: data.actions || [],
            relaxed: data.relaxed,
            cart: data.cart,
            checkoutReady: data.checkoutReady,
          },
        ]);
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: errorMessage(err), isError: true },
        ]);
      } finally {
        setBusy(false);
        inputRef.current?.focus();
      }
    },
    [busy, conversationId]
  );

  /* A query typed on the home page starts the conversation here. */
  useEffect(() => {
    const initial = location.state?.initialMessage;
    if (initial && !sentInitial.current) {
      sentInitial.current = true;
      send(initial);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location, navigate, send]);

  const handleAdd = async (productId) => {
    const ok = await addToCart(productId);
    if (ok) notify('Added. Say "checkout" to the agent, or open your cart.');
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="container-page py-8">
      <div className="mb-6">
        <h1 className="text-3xl text-ink">Your shopping agent</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Describe what you need in your own words. Change your mind whenever you like — it remembers.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ------------------------------------------------------ conversation */}
        <div className="flex min-h-[560px] flex-col">
          <div className="flex-1 space-y-5">
            {resumed && (
              <p className="flex items-center justify-center gap-2 text-xs text-ink-muted">
                <span className="h-1 w-1 rounded-full bg-forest-500" />
                Picked up where you left off — everything you told me is still here.
              </p>
            )}

            {isEmpty && (
              <div className="card p-8 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-forest-50">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#256349"
                       strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-6.5A8 8 0 0 1 11 4h2a8 8 0 0 1 8 8Z" />
                  </svg>
                </div>
                <h2 className="mb-2 text-xl text-ink">What are you shopping for?</h2>
                <p className="mx-auto mb-6 max-w-md text-sm leading-relaxed text-ink-muted">
                  Tell me the whole situation, not just a product name. Budget, what you'll use it
                  for, anything that would rule a product out — it all helps me choose well.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {STARTERS.map((s) => (
                    <button key={s} type="button" onClick={() => send(s)} className="chip">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) =>
              msg.role === 'user' ? (
                <div key={i} className="flex justify-end">
                  <p className="max-w-[85%] animate-fade-up rounded-2xl rounded-br-md bg-forest-700 px-4 py-2.5 text-sm leading-relaxed text-white">
                    {msg.content}
                  </p>
                </div>
              ) : (
                <div key={i} className="animate-fade-up space-y-4">
                  <div className="flex gap-3">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-forest-700 text-[10px] font-bold text-white">
                      BW
                    </span>

                    <div className="min-w-0 flex-1">
                      <div
                        className={`reply-prose rounded-2xl rounded-tl-md border px-4 py-3 text-sm ${
                          msg.isError
                            ? 'border-clay-200 bg-clay-50 text-clay-500'
                            : 'border-line bg-card text-ink-soft'
                        }`}
                      >
                        <Markdown>{msg.content}</Markdown>
                      </div>

                      {/* what the agent actually DID - the tool trace */}
                      {msg.actions?.length > 0 && (
                        <p className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-1 text-[11px] text-ink-faint">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                               strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                            <path d="m5 13 4 4L19 7" />
                          </svg>
                          BuyWise {msg.actions.map((a) => ACTION_LABELS[a] || a).join(' and ')}
                        </p>
                      )}

                      {/* When the agent can't work out what you mean, it
                          offers real choices instead of asking again. */}
                      {msg.suggestions?.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {msg.suggestions.map((s) => (
                            <button
                              key={s.label}
                              type="button"
                              onClick={() => send(s.message)}
                              className="chip capitalize"
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                      )}

                      {msg.relaxed === 'features' && (
                        <p className="mt-2 text-xs text-brass-600">
                          Nothing matched every requirement exactly, so close alternatives are
                          included and scored honestly.
                        </p>
                      )}
                      {msg.relaxed === 'budget' && (
                        <p className="mt-2 text-xs text-brass-600">
                          Nothing fell inside that budget — these are the nearest options above it.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* One card per row: these are dense, and a cramped column
                      forces the product name and badges to wrap badly. */}
                  {msg.recommendations?.length > 0 && (
                    <div className="space-y-4 pl-10">
                      {msg.recommendations.map((entry) => (
                        <RecommendationCard
                          key={entry.product._id}
                          entry={entry}
                          onAddToCart={handleAdd}
                        />
                      ))}
                    </div>
                  )}

                  {msg.cart?.items?.length > 0 && (
                    <div className="flex flex-wrap gap-2 pl-10">
                      {/* The agent prepares the order; the shopper presses the
                          button. Payment is never triggered by the model. */}
                      {msg.checkoutReady && (
                        <button
                          type="button"
                          onClick={() => navigate('/checkout')}
                          className="btn-primary"
                        >
                          Go to checkout · {formatINR(msg.cart.total)}
                        </button>
                      )}
                      <button type="button" onClick={() => navigate('/cart')} className="btn-secondary">
                        Open cart ({msg.cart.count} item{msg.cart.count === 1 ? '' : 's'})
                      </button>
                    </div>
                  )}
                </div>
              )
            )}

            {busy && (
              <div className="flex gap-3 pl-0">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-forest-700 text-[10px] font-bold text-white">
                  BW
                </span>
                <div className="rounded-2xl rounded-tl-md border border-line bg-card px-4 py-3">
                  <ThinkingDots />
                </div>
              </div>
            )}

            <div ref={endRef} />
          </div>

          {/* ---------------------------------------------------------- composer */}
          <div className="sticky bottom-4 mt-6">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="flex items-end gap-2 rounded-2xl border border-line bg-card p-2 shadow-lift"
            >
              <label htmlFor="agent-input" className="sr-only">
                Message BuyWise
              </label>
              <textarea
                id="agent-input"
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                placeholder={
                  messages.length
                    ? 'Change anything — "make it ₹4,000", "battery matters more", "add it to my cart"'
                    : 'Describe what you need…'
                }
                className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none"
              />
              <button type="submit" disabled={busy || !input.trim()} className="btn-primary h-11 px-5">
                Send
              </button>
            </form>

            {!user && (
              <p className="mt-2 text-center text-xs text-ink-muted">
                You can browse and get recommendations without an account. Sign in when you want to
                add something to your cart.
              </p>
            )}
          </div>
        </div>

        {/* --------------------------------------------------------- side panel */}
        <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <RequirementPanel requirements={requirements} missing={missing} engine={engine} />

          {conversationId && (
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem(STORAGE_KEY);
                setMessages([]);
                setConversationId(null);
                setRequirements(null);
                setMissing([]);
                setResumed(false);
              }}
              className="btn-secondary w-full"
            >
              Start a new search
            </button>
          )}

          {status && !status.llmEnabled && (
            <ModeNote>
              Running on the built-in rule engine — no API key needed. Add a Gemini, OpenAI or
              Anthropic key in <code className="font-mono">server/.env</code> and the same agent
              starts reasoning with an LLM instead.
            </ModeNote>
          )}

          <div className="card p-4">
            <p className="eyebrow mb-2.5">Things you can say</p>
            <ul className="space-y-1.5 text-xs text-ink-muted">
              {[
                '"Show me something cheaper"',
                '"Increase my budget to ₹5,000"',
                '"Battery matters more than noise cancellation"',
                '"Compare the top two"',
                '"Add it to my cart"',
              ].map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
