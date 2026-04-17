'use strict';

const Anthropic      = require('@anthropic-ai/sdk');
const { AGENTS, MODE_AGENTS } = require('./agents');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL  = 'claude-opus-4-5';

/**
 * Call Claude with a system + user prompt.
 * Returns the text response string.
 */
async function callClaude(systemPrompt, userContent) {
  const message = await client.messages.create({
    model:      MODEL,
    max_tokens: 512,
    system:     systemPrompt,
    messages:   [{ role: 'user', content: userContent }],
  });
  return message.content?.[0]?.text?.trim() ?? '';
}

/**
 * Run the full Council debate for a given question and mode.
 * Emits structured SSE events via the `emit` callback.
 *
 * emit(type, payload) — types:
 *   'status'   { message }
 *   'step'     { step: 1-4 }
 *   'thinking' { agentId }
 *   'turn'     { agentId, text, round }
 *   'score'    { agentId, score }
 *   'verdict'  { title, summary, scores[] }
 *   'error'    { message }
 *   'done'     {}
 */
async function runCouncil(question, mode, emit) {
  const agentIds = MODE_AGENTS[mode] ?? MODE_AGENTS.council;

  try {
    emit('status', { message: `Assembling ${agentIds.length} agent${agentIds.length > 1 ? 's' : ''}…` });

    // ── ROUND 1: Initial ideas ──────────────────────────
    emit('step', { step: 1 });
    const ideas = {};

    for (const id of agentIds) {
      emit('thinking', { agentId: id });
      ideas[id] = await callClaude(
        AGENTS[id].system,
        question
      );
      emit('turn', { agentId: id, text: ideas[id], round: 'Round 1 · idea' });
    }

    // Quick mode: done after one round
    if (mode === 'quick') {
      const score = randomScore(8, 9);
      emit('score', { agentId: 'visionary', score });
      emit('verdict', {
        title:   'Quick Decision',
        summary: ideas.visionary,
        scores:  [{ agentId: 'visionary', score, label: 'Confidence' }],
      });
      emit('done', {});
      return;
    }

    // ── ROUND 2: Cross-critique ─────────────────────────
    emit('step', { step: 2 });

    for (const id of agentIds) {
      emit('thinking', { agentId: id });
      const others = agentIds
        .filter(k => k !== id)
        .map(k => `${AGENTS[k].name}: ${ideas[k]}`)
        .join('\n');
      const critique = await callClaude(
        AGENTS[id].system,
        `The question is: "${question}"\n\nOther agents said:\n${others}\n\nIn 1-2 sentences, challenge or build on their view from your unique perspective.`
      );
      emit('turn', { agentId: id, text: critique, round: 'Round 2 · critique' });
    }

    // Smart mode: synthesize and stop
    if (mode === 'smart') {
      emit('step', { step: 4 });
      emit('status', { message: 'Computing final decision…' });

      const final = await callClaude(
        'You are a neutral AI arbitrator. Synthesize the debate into one clear decision.',
        `Question: "${question}"\nVisionary: "${ideas.visionary}"\nAnalyst: "${ideas.analyst}"\n\nRespond with:\nTITLE: [8 words max]\nDECISION: [2-3 sentences]`
      );

      const title    = extractSection(final, 'TITLE',    'Smart Decision');
      const decision = extractSection(final, 'DECISION', final);
      const vs = randomScore(7, 9);
      const as = randomScore(7, 9);

      emit('score', { agentId: 'visionary', score: vs });
      emit('score', { agentId: 'analyst',   score: as });
      emit('verdict', {
        title,
        summary: decision,
        scores: [
          { agentId: 'visionary', score: vs, label: 'Vision' },
          { agentId: 'analyst',   score: as, label: 'Analysis' },
        ],
      });
      emit('done', {});
      return;
    }

    // ── ROUND 3: Refinement (Council only) ─────────────
    emit('step', { step: 3 });

    const refined = {};
    for (const id of agentIds) {
      emit('thinking', { agentId: id });
      const allPositions = agentIds
        .map(k => `${AGENTS[k].name}: ${ideas[k]}`)
        .join('\n');
      refined[id] = await callClaude(
        AGENTS[id].system,
        `Question: "${question}"\n\nAll initial positions:\n${allPositions}\n\nIn 1-2 sentences, state your refined final position.`
      );
      emit('turn', { agentId: id, text: refined[id], round: 'Round 3 · refined' });
    }

    // ── ROUND 4: Verdict ────────────────────────────────
    emit('step', { step: 4 });
    emit('status', { message: 'Computing final verdict…' });

    const refinedAll = agentIds
      .map(k => `${AGENTS[k].name}: ${refined[k]}`)
      .join('\n');

    const verdictRaw = await callClaude(
      'You are a neutral AI arbiter. Deliver a decisive, synthesized verdict.',
      `Question: "${question}"\n\nFinal agent positions:\n${refinedAll}\n\nRespond with:\nTITLE: [8 words max]\nVERDICT: [2-3 sentences]`
    );

    const title   = extractSection(verdictRaw, 'TITLE',   'Council Verdict');
    const summary = extractSection(verdictRaw, 'VERDICT', verdictRaw);
    const vs = randomScore(8, 9);
    const as = randomScore(7, 9);
    const us = randomScore(7, 9);

    emit('score', { agentId: 'visionary', score: vs });
    emit('score', { agentId: 'analyst',   score: as });
    emit('score', { agentId: 'advocate',  score: us });

    emit('verdict', {
      title,
      summary,
      scores: [
        { agentId: 'visionary', score: vs, label: 'Vision' },
        { agentId: 'analyst',   score: as, label: 'Analysis' },
        { agentId: 'advocate',  score: us, label: 'Usability' },
      ],
    });

    emit('done', {});

  } catch (err) {
    console.error('[Council Engine]', err.message);
    emit('error', { message: err.message ?? 'Unknown error' });
    emit('done', {});
  }
}

// ── Helpers ────────────────────────────────────────────

function extractSection(text, key, fallback) {
  const match = text.match(new RegExp(`${key}:\\s*([\\s\\S]+?)(?=\\n[A-Z]+:|$)`, 'i'));
  return match?.[1]?.trim() ?? fallback;
}

function randomScore(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

module.exports = { runCouncil };
