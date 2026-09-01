/**
 * agent/agentEngine.js
 * -----------------------------------------------------------------------------
 * The decision loop that makes BuyWise an agent rather than a chatbot.
 *
 *     message
 *        |
 *        v
 *   intent extraction      (human language -> structured requirements)
 *        |
 *        v
 *   decision engine        (which tool does this need?)
 *        |
 *        v
 *   backend runs the tool  (search / cart / compare / checkout)
 *        |
 *        v
 *   response composition   (explain the result in plain language)
 *
 * The model proposes; the backend disposes. Conversation state - including the
 * requirements gathered so far - is persisted, which is what lets a shopper say
 * "make it 4000 instead" three turns later and get a correct answer.
 */
import { COLLECTIONS, getCollection } from '../db/index.js';
import { ATTRIBUTES } from '../services/knowledgeBase.js';
import { createConversation, createRecommendationRecord } from '../models/schemas.js';
import {
  INTENTS,
  emptyRequirements,
  extractIntent,
  missingInformation,
  nextClarification,
} from '../services/intentService.js';
import { completeText, isLlmEnabled } from '../services/llm/index.js';
import { catalogueHasBrand } from '../services/productService.js';
import { runTool } from './tools.js';

/* ------------------------------------------------------- conversation state */

export async function loadConversation(conversationId, userId) {
  const conversations = getCollection(COLLECTIONS.CONVERSATIONS);
  if (conversationId) {
    const found = await conversations.findOne({ _id: conversationId });
    if (found) return found;
  }
  const fresh = createConversation(userId);
  await conversations.insertOne(fresh);
  return fresh;
}

/**
 * Recommendations are kept on the few most recent assistant turns only.
 * They are what lets the page redraw its product cards after a reload, but
 * carrying every shortlist for the whole transcript would bloat the record.
 */
function trimStoredRecommendations(messages) {
  let kept = 0;
  return [...messages].reverse().map((m) => {
    if (m.role !== 'assistant' || !m.recommendations?.length) return m;
    kept += 1;
    return kept <= 3 ? m : { ...m, recommendations: [] };
  }).reverse();
}

async function saveConversation(conversation) {
  await getCollection(COLLECTIONS.CONVERSATIONS).updateOne(
    { _id: conversation._id },
    {
      $set: {
        messages: trimStoredRecommendations(conversation.messages).slice(-40),
        requirements: conversation.requirements,
        lastRecommendations: conversation.lastRecommendations,
        userId: conversation.userId,
        updatedAt: new Date().toISOString(),
      },
    }
  );
}

/* ----------------------------------------------------------- the main entry */

export async function handleMessage({ message, conversationId, userId }) {
  const conversation = await loadConversation(conversationId, userId);
  if (userId) conversation.userId = userId;

  conversation.messages.push({
    role: 'user',
    content: message,
    createdAt: new Date().toISOString(),
  });

  // 1. Understand ------------------------------------------------------------
  // If our last turn asked a question, this turn is probably the answer -
  // so "20000" after "What budget are you working with?" is a budget.
  const lastAssistant = [...conversation.messages]
    .reverse()
    .find((m) => m.role === 'assistant');
  const expecting = lastAssistant?.clarifyField || null;

  const analysis = await extractIntent(message, conversation.requirements, conversation.messages, {
    expecting,
  });
  conversation.requirements = analysis.requirements;

  // 2. Decide ----------------------------------------------------------------
  const plan = decide(analysis, conversation);

  // 3. Act -------------------------------------------------------------------
  const ctx = { userId, message, conversationId: conversation._id };
  const toolResults = [];
  for (const call of plan.toolCalls) {
    toolResults.push(await runTool(call.name, call.args, ctx));
  }

  // 4. Compose ---------------------------------------------------------------
  const response = await compose({ analysis, plan, toolResults, conversation, message });

  const searchResult = toolResults.find((r) => r.name === 'search_products' && r.ok);
  const recommendations = searchResult?.result?.recommendations || [];
  if (recommendations.length) {
    conversation.lastRecommendations = recommendations.map((r) => ({
      productId: r.product._id,
      name: r.product.name,
      score: r.score,
    }));
    await getCollection(COLLECTIONS.RECOMMENDATIONS).insertOne(
      createRecommendationRecord({
        userId,
        conversationId: conversation._id,
        query: message,
        requirements: conversation.requirements,
        results: conversation.lastRecommendations,
      })
    );
  }

  conversation.messages.push({
    role: 'assistant',
    content: response.reply,
    createdAt: new Date().toISOString(),
    recommendationCount: recommendations.length,
    // Stored so a reload or a trip to another page can redraw the cards
    // instead of losing the conversation.
    recommendations,
    suggestions: response.suggestions || [],
    relaxed: searchResult?.result?.relaxed || null,
    // Recorded so the agent can tell it has already asked, and escalate
    // instead of repeating the same question forever.
    wasClarification: Boolean(response.wasClarification),
    clarifyField: response.clarifyField || null,
  });
  await saveConversation(conversation);

  return {
    conversationId: conversation._id,
    intent: analysis.intent,
    requirements: conversation.requirements,
    missing: missingInformation(conversation.requirements),
    reply: response.reply,
    suggestions: response.suggestions || [],
    checkoutReady: Boolean(response.checkoutReady),
    recommendations,
    cart: toolResults.find((r) => r.ok && r.result?.cart)?.result?.cart || null,
    comparison: toolResults.find((r) => r.name === 'compare_products' && r.ok)?.result?.comparison || null,
    actions: plan.toolCalls.map((c) => c.name),
    toolErrors: toolResults.filter((r) => !r.ok).map((r) => r.error),
    relaxed: searchResult?.result?.relaxed || null,
    engine: analysis.source,
  };
}

/* -------------------------------------------------------- the decision step */

/**
 * Map an understood intent onto concrete tool calls.
 *
 * The important behaviour here is the "ask before searching" rule: if we know
 * too little to give a good answer, the agent asks one question instead of
 * dumping a weak shortlist (spec section 18).
 */
function decide(analysis, conversation) {
  const req = analysis.requirements;
  const toolCalls = [];
  const missing = missingInformation(req);

  switch (analysis.intent) {
    case INTENTS.GREETING:
      return { kind: 'greeting', toolCalls };

    case INTENTS.VIEW_CART:
      toolCalls.push({ name: 'view_cart', args: {} });
      return { kind: 'cart', toolCalls };

    case INTENTS.CHECKOUT:
      toolCalls.push({ name: 'checkout_summary', args: {} });
      return { kind: 'checkout', toolCalls };

    case INTENTS.ADD_TO_CART: {
      const target = resolveProductReference(conversation);
      if (!target) return { kind: 'need_product', toolCalls };
      toolCalls.push({ name: 'add_to_cart', args: { productId: target.productId, quantity: 1 } });
      return { kind: 'added', toolCalls, target };
    }

    case INTENTS.COMPARE: {
      const ids = (conversation.lastRecommendations || []).slice(0, 3).map((r) => r.productId);
      if (ids.length < 2) {
        toolCalls.push({ name: 'search_products', args: { requirements: req } });
        return { kind: 'search', toolCalls };
      }
      toolCalls.push({ name: 'compare_products', args: { productIds: ids, requirements: req } });
      return { kind: 'compare', toolCalls };
    }

    case INTENTS.QUESTION:
      if (req.category) {
        toolCalls.push({ name: 'search_products', args: { requirements: req } });
        return { kind: 'search', toolCalls };
      }
      return { kind: 'question', toolCalls };

    default: {
      // Asking is only useful if it moves things forward. If we have already
      // asked and STILL cannot tell what they want, asking the same question
      // again strands the shopper in a loop - so escalate instead.
      const alreadyAsked = clarificationsAsked(conversation);
      const tooVague = missing.includes('category') || (missing.includes('budget') && missing.length >= 2);

      // Someone who names a specific product asked a question, not a survey.
      // Answer it - asking for their budget first would be a non-sequitur.
      const namedAProduct = Boolean(analysis.brandHint);

      const next = nextClarification(req);
      if (tooVague && !namedAProduct && analysis.intent !== INTENTS.REFINE_SEARCH) {
        if (!req.category && alreadyAsked >= 1) {
          // Two strikes on the category: stop asking open questions and offer
          // the actual choices, so there is always a way forward.
          return { kind: 'choose_category', toolCalls };
        }
        if (alreadyAsked < 2) {
          return { kind: 'clarify', toolCalls, question: next?.question, clarifyField: next?.field };
        }
      }

      // No category but the shopper named something concrete - look it up by
      // name across the catalogue rather than pretending we understood.
      if (!req.category) {
        toolCalls.push({
          name: 'search_products',
          args: { requirements: { ...req, freeText: analysis.freeText || null } },
        });
        return { kind: 'search', toolCalls, unknownCategory: true };
      }

      toolCalls.push({ name: 'search_products', args: { requirements: req } });
      return { kind: 'search', toolCalls, refined: analysis.intent === INTENTS.REFINE_SEARCH };
    }
  }
}

/** Categories that actually have stock, for the "pick one" fallback. */
async function listCategories() {
  const products = getCollection(COLLECTIONS.PRODUCTS);
  const categories = await products.distinct('category');
  const counted = await Promise.all(
    categories.map(async (category) => ({
      category,
      count: await products.countDocuments({ category }),
    }))
  );
  return counted.filter((c) => c.count > 0).sort((a, b) => b.count - a.count);
}

/**
 * How many times have we already asked this shopper to clarify?
 * Counted from the transcript so the guard survives a page reload.
 */
function clarificationsAsked(conversation) {
  return (conversation.messages || []).filter((m) => m.role === 'assistant' && m.wasClarification)
    .length;
}

/** "add it to my cart" -> the product we just recommended. */
function resolveProductReference(conversation) {
  const [best] = conversation.lastRecommendations || [];
  return best || null;
}

/* ------------------------------------------------------ response composition */

async function compose({ analysis, plan, toolResults, conversation, message }) {
  const failed = toolResults.find((r) => !r.ok);
  if (failed) return { reply: failed.error };

  switch (plan.kind) {
    case 'greeting':
      return {
        reply:
          "Hi! I'm BuyWise. Tell me what you need in your own words - something like " +
          '"a waterproof college backpack under ₹2,000 that fits a 15-inch laptop" - ' +
          "and I'll find, compare and explain the best option for you.",
      };

    case 'clarify':
      return {
        reply: `${acknowledge(analysis.requirements)} ${plan.question || 'Tell me a bit more about what you need.'}`.trim(),
        wasClarification: true,
        clarifyField: plan.clarifyField || null,
      };

    /* Asked once already and still no category: offer the real choices rather
       than repeating the question. The suggestions render as buttons. */
    case 'choose_category': {
      const available = await listCategories();
      const noted = acknowledge(analysis.requirements);
      return {
        reply: `${noted} I'm still not sure which kind of product you mean. Here's what I can help you shop for — pick one and I'll take it from there.`.trim(),
        suggestions: available.map((c) => ({
          label: c.category,
          message: `I'm looking for a ${c.category}`,
        })),
        wasClarification: true,
        clarifyField: 'category',
      };
    }

    case 'need_product':
      return { reply: "Which product would you like me to add? Search for something first and I'll add my top pick." };

    case 'cart': {
      const result = toolResults[0]?.result;
      return { reply: describeCart(result?.cart) };
    }

    /* The agent has done its part; the shopper presses the button. Payment is
       never triggered by the model, so we hand off to the checkout page. */
    case 'checkout': {
      const result = toolResults[0]?.result;
      if (!result?.readyForCheckout) {
        return { reply: "Your cart is empty right now — tell me what you need and I'll find it." };
      }
      return {
        reply: `${result.message} I've got everything ready — open checkout when you are.`,
        checkoutReady: true,
      };
    }

    case 'added': {
      const { product, cart } = toolResults[0].result;
      return {
        reply: `Added **${product.name}** (₹${product.price.toLocaleString('en-IN')}) to your cart. That's ${cart.count} item(s) totalling ₹${cart.total.toLocaleString('en-IN')}. Say "checkout" whenever you're ready.`,
      };
    }

    case 'compare': {
      const comparison = toolResults[0].result.comparison;
      return { reply: await explainComparison(comparison, analysis.requirements) };
    }

    case 'question':
      return {
        reply:
          "I can help best when I know what you're shopping for. What kind of product do you have in mind, and roughly what budget?",
      };

    default: {
      const result = toolResults[0]?.result;
      const recommendations = result?.recommendations || [];

      if (!recommendations.length) {
        // Be honest about not stocking something, and still be useful.
        const available = await listCategories();
        return {
          reply:
            `I don't have anything matching that in the catalogue. This is a demo store, ` +
            `so the range is small — I can't look up products outside it.`,
          suggestions: available.map((c) => ({
            label: c.category,
            message: `Show me ${c.category}`,
          })),
        };
      }

      const reply = await explainRecommendation(
        recommendations,
        analysis.requirements,
        message,
        result.relaxed,
        plan.refined
      );

      // We matched on a product name rather than a stated category - say so,
      // otherwise the jump from "Vivo Y16 Pro" to a shortlist looks arbitrary.
      if (plan.unknownCategory) {
        return {
          reply:
            `I don't stock that exact product, but going by what you described, ` +
            `here's the closest thing I have.\n\n${reply}`,
        };
      }

      // The shopper named a brand we worked the category out from. Ask the
      // CATALOGUE whether we stock it - checking only the shortlist would
      // claim we don't carry a brand merely because it didn't rank top-4.
      const brand = analysis.brandHint || analysis.requirements.brand;
      if (brand) {
        const carried = await catalogueHasBrand(brand);
        if (!carried) {
          const label = brand.replace(/\b\w/g, (c) => c.toUpperCase());
          return {
            reply: `I don't carry ${label} in this store, so I can't tell you about that exact model. Here's the closest I do have.\n\n${reply}`,
          };
        }
      }
      return { reply };
    }
  }
}

const describeCart = (cart) => {
  if (!cart || !cart.items.length) return 'Your cart is empty.';
  const lines = cart.items.map((i) => `- ${i.name} x${i.quantity} - ₹${(i.price * i.quantity).toLocaleString('en-IN')}`);
  return `Here's your cart:\n${lines.join('\n')}\n\nTotal: ₹${cart.total.toLocaleString('en-IN')}`;
};

function acknowledge(req) {
  const parts = [];
  if (req.category) parts.push(`a ${req.category}`);
  if (req.maxPrice) parts.push(`under ₹${req.maxPrice.toLocaleString('en-IN')}`);
  if (req.useCase) parts.push(`for ${req.useCase}`);
  return parts.length ? `Got it - looking for ${parts.join(' ')}.` : '';
}

/* ------------------------------------------------ explanation (spec §7 & §17) */

/** Deterministic explanation, always correct because it reads the actual score card. */
function templateExplanation(recommendations, requirements, relaxed, refined) {
  const [best] = recommendations;
  const p = best.product;

  const lead = refined
    ? `Updated for your new requirements - ${describeRequirements(requirements)}.`
    : `Based on ${describeRequirements(requirements)}, here's what I'd pick.`;

  const reasons = best.pros.slice(0, 3).map((pro) => `- ${pro}`).join('\n');
  const caveat = best.cons.length ? `\n\nWorth knowing: ${best.cons[0].toLowerCase()}.` : '';

  const runnerUp = recommendations[1]
    ? `\n\nIf you'd rather compare, **${recommendations[1].product.name}** scores ${recommendations[1].matchPercent}% - ${recommendations[1].versusBest}.`
    : '';

  const widened =
    relaxed === 'features'
      ? '\n\n(Nothing matched every single requirement, so I relaxed the strictest ones and scored the closest options instead.)'
      : relaxed === 'budget'
        ? '\n\n(Nothing fell inside that budget, so these are the closest options just outside it.)'
        : '';

  return `${lead}

**${p.name}** - ₹${p.price.toLocaleString('en-IN')} · ${best.matchPercent}% match

${reasons}${caveat}${runnerUp}${widened}`;
}

async function explainRecommendation(recommendations, requirements, message, relaxed, refined) {
  const fallback = templateExplanation(recommendations, requirements, relaxed, refined);
  if (!isLlmEnabled()) return fallback;

  const brief = recommendations
    .map(
      (r) =>
        `${r.rank}. ${r.product.name} - ₹${r.product.price}, ${r.matchPercent}% match
   strengths: ${r.pros.join('; ') || 'none recorded'}
   trade-offs: ${r.cons.join('; ') || 'none recorded'}`
    )
    .join('\n');

  const result = await completeText({
    system: `You are BuyWise, a careful shopping adviser for Indian shoppers. Prices are in rupees.
Explain the top recommendation in 3-5 short sentences of plain English.
Rules:
- Only use facts from the scored list you are given. Never invent a specification.
- Say WHY it wins against the shopper's stated requirements, then name one honest trade-off.
- Mention the runner-up in one clause if it is genuinely competitive.
- Warm and direct. No bullet lists, no headings, no emoji.`,
    maxTokens: 420,
    prompt: `Shopper said: "${message}"
Their requirements: ${JSON.stringify(requirements)}
${relaxed ? `Note: no product matched everything, so the search was widened (${relaxed}).` : ''}

Scored shortlist:
${brief}`,
  });

  return result.ok && result.text ? result.text : fallback;
}

async function explainComparison(comparison, requirements) {
  const lines = comparison
    .map((c) => `**${c.product.name}** - ₹${c.product.price.toLocaleString('en-IN')} · ${c.matchPercent}% match\n${c.pros.slice(0, 2).map((p) => `  - ${p}`).join('\n')}`)
    .join('\n\n');
  const fallback = `Here's how they compare against what you asked for:\n\n${lines}`;

  if (!isLlmEnabled()) return fallback;
  const result = await completeText({
    system:
      'You are BuyWise. Compare these products for the shopper in 3-4 sentences. Use only the given facts. Say which one you would pick and why. No lists.',
    maxTokens: 350,
    prompt: `Requirements: ${JSON.stringify(requirements)}\n\n${comparison
      .map((c) => `${c.product.name} (₹${c.product.price}, ${c.matchPercent}%): + ${c.pros.join('; ')} | - ${c.cons.join('; ')}`)
      .join('\n')}`,
  });
  return result.ok && result.text ? result.text : fallback;
}

function describeRequirements(req) {
  const parts = [];
  if (req.category) parts.push(req.category);
  if (req.maxPrice) parts.push(`a ₹${req.maxPrice.toLocaleString('en-IN')} budget`);
  if (req.useCase) parts.push(`${req.useCase} use`);

  const features = Object.entries(req.requirements || {}).map(([key, value]) => {
    const attr = ATTRIBUTES[key];
    const label = (attr?.label || key).toLowerCase();
    if (value === true) return label;
    const unit = attr?.unit && attr.unit !== 'score' ? ` ${attr.unit}` : '';
    return `${label} of at least ${value}${unit}`;
  });
  if (features.length) parts.push(features.join(' and '));
  return parts.join(', ') || 'what you told me';
}

export { emptyRequirements };
