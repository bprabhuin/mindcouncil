'use strict';

require('dotenv').config();

const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');
const path       = require('path');
const { v4: uuid } = require('uuid');
const { runCouncil } = require('./council');
const { AGENTS }     = require('./agents');

// ── Validate env ──────────────────────────────────────
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('\n[MindCouncil] ERROR: ANTHROPIC_API_KEY is not set in .env\n');
  process.exit(1);
}

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Security middleware ───────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'"],
      styleSrc:   ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:    ["'self'", 'https://fonts.gstatic.com'],
      connectSrc: ["'self'"],
      imgSrc:     ["'self'", 'data:'],
    },
  },
}));

app.use(cors({ origin: process.env.NODE_ENV === 'production' ? false : '*' }));
app.use(express.json({ limit: '16kb' }));

// ── Rate limiting ─────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      parseInt(process.env.RATE_LIMIT_MAX, 10) || 50,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many requests. Please try again later.' },
});
app.use('/api/', limiter);

// ── Static files ──────────────────────────────────────
app.use(express.static(path.join(__dirname, '../public')));

// ── Validation helpers ────────────────────────────────
const VALID_MODES   = new Set(['quick', 'smart', 'council']);
const MAX_QUESTION  = 500;

function validateRequest(req, res) {
  const { question, mode } = req.body;
  if (!question || typeof question !== 'string' || question.trim().length < 3) {
    res.status(400).json({ error: 'Question must be at least 3 characters.' });
    return null;
  }
  if (question.trim().length > MAX_QUESTION) {
    res.status(400).json({ error: `Question must be under ${MAX_QUESTION} characters.` });
    return null;
  }
  if (!VALID_MODES.has(mode)) {
    res.status(400).json({ error: 'Mode must be quick, smart, or council.' });
    return null;
  }
  return { question: question.trim(), mode };
}

// ── API: Council (SSE streaming) ──────────────────────
app.post('/api/council', async (req, res) => {
  const validated = validateRequest(req, res);
  if (!validated) return;

  const { question, mode } = validated;
  const sessionId = uuid();

  // Set SSE headers
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Nginx
  res.flushHeaders();

  // Helper: write an SSE event
  const emit = (type, payload) => {
    if (res.writableEnded) return;
    const data = JSON.stringify({ type, sessionId, ...payload });
    res.write(`data: ${data}\n\n`);
  };

  // Handle client disconnect
  req.on('close', () => { if (!res.writableEnded) res.end(); });

  // Run the council
  await runCouncil(question, mode, emit);

  if (!res.writableEnded) res.end();
});

// ── API: Agent metadata ───────────────────────────────
app.get('/api/agents', (_req, res) => {
  const safe = Object.values(AGENTS).map(({ id, name, abbr, color, role }) =>
    ({ id, name, abbr, color, role })
  );
  res.json({ agents: safe });
});

// ── API: Health check ─────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ── Catch-all: SPA ────────────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ── Global error handler ──────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[Server Error]', err.stack);
  res.status(500).json({ error: 'Internal server error.' });
});

// ── Start ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  MindCouncil AI running at http://localhost:${PORT}`);
  console.log(`  Mode: ${process.env.NODE_ENV || 'development'}\n`);
});
