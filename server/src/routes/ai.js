/**
 * routes/ai.js
 * -----------------------------------------------------------------------------
 * The agent's public surface.
 *
 *   POST /api/ai/chat     the full agentic loop (understand -> act -> explain)
 *   POST /api/ai/search   one-shot: message in, structured filters + ranked list out
 *   POST /api/ai/extract  intent extraction alone, handy for the demo panel
 *   GET  /api/ai/status   which engine is answering right now
 */
import { Router } from 'express';
import { handleMessage, loadConversation } from '../agent/agentEngine.js';
import { TOOL_DEFINITIONS, recordSearchEvents } from '../agent/tools.js';
import { COLLECTIONS, getCollection } from '../db/index.js';
import { asyncRoute } from '../middleware/errors.js';
import { emptyRequirements, extractIntent, missingInformation } from '../services/intentService.js';
import { activeProvider, isLlmEnabled } from '../services/llm/index.js';
import { searchProducts } from '../services/productService.js';
import { rankProducts } from '../services/recommendationEngine.js';

const router = Router();

router.get('/status', (_req, res) => {
  res.json({
    provider: activeProvider(),
    llmEnabled: isLlmEnabled(),
    mode: isLlmEnabled() ? 'LLM reasoning' : 'Built-in rule engine',
    tools: TOOL_DEFINITIONS,
  });
});

/** The conversational agent. This is what the chat page talks to. */
router.post(
  '/chat',
  asyncRoute(async (req, res) => {
    const { message, conversationId } = req.body;
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: 'Tell me what you are looking for.' });
    }
    const result = await handleMessage({
      message: String(message).trim(),
      conversationId,
      userId: req.user?._id,
    });
    return res.json(result);
  })
);

/**
 * Stateless search - the endpoint from spec section 14.
 * message in, structured filters and ranked recommendations out.
 */
router.post(
  '/search',
  asyncRoute(async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'A message is required.' });

    const analysis = await extractIntent(message, emptyRequirements(), []);
    const { products, relaxed } = await searchProducts(analysis.requirements);
    const recommendations = rankProducts(products, analysis.requirements, { limit: 6 });

    await recordSearchEvents({
      ranked: recommendations,
      requirements: analysis.requirements,
      userId: req.user?._id,
      message,
    });

    return res.json({
      intent: analysis.intent,
      filters: {
        category: analysis.requirements.category,
        maxPrice: analysis.requirements.maxPrice,
        minPrice: analysis.requirements.minPrice,
        useCase: analysis.requirements.useCase,
        brand: analysis.requirements.brand,
        requirements: analysis.requirements.requirements,
        priorities: analysis.requirements.priorities,
      },
      recommendations,
      relaxed,
      engine: analysis.source,
    });
  })
);

/** Show the raw "human language -> machine requirements" step. */
router.post(
  '/extract',
  asyncRoute(async (req, res) => {
    const { message, previous } = req.body;
    if (!message) return res.status(400).json({ error: 'A message is required.' });
    const analysis = await extractIntent(message, previous || emptyRequirements(), []);
    res.json(analysis);
  })
);

/**
 * Resume a conversation. The page calls this on load so the agent's memory -
 * and the shopper's transcript - survive a reload or a trip to another page.
 */
router.get(
  '/conversation/:id',
  asyncRoute(async (req, res) => {
    const conversation = await getCollection(COLLECTIONS.CONVERSATIONS).findOne({ _id: req.params.id });
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    return res.json({
      conversation,
      missing: missingInformation(conversation.requirements || {}),
    });
  })
);

router.post(
  '/conversation',
  asyncRoute(async (req, res) => {
    const conversation = await loadConversation(null, req.user?._id);
    res.status(201).json({ conversation });
  })
);

export default router;
