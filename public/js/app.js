'use strict';

/* ═══════════════════════════════════════════════════
   MindCouncil AI — Frontend Application
   ═══════════════════════════════════════════════════ */

// ── Agent metadata (mirrors server/agents.js) ──────────────────
const AGENTS = {
  visionary: { name: 'Visionary',     abbr: 'V', color: '#8b7cf6' },
  analyst:   { name: 'Analyst',       abbr: 'A', color: '#4de0b0' },
  advocate:  { name: 'User Advocate', abbr: 'U', color: '#f97b5a' },
};

const MODE_CONFIG = {
  quick:   { label: 'Quick Mode · 1 agent · instant',      eco: 'Ultra low energy', co2: '0.08g CO₂', bar: 8,  agentN: 1 },
  smart:   { label: 'Smart Mode · 2 agents · 2 rounds',    eco: 'Low energy',       co2: '0.22g CO₂', bar: 22, agentN: 2 },
  council: { label: 'Council Mode · 3 agents · 4 rounds',  eco: 'Eco routing on',   co2: '0.45g CO₂', bar: 45, agentN: 3 },
};

const EXPORT_TEMPLATES = {
  linkedin: `✨ I just ran a multi-agent AI Council debate.\n\nThree AI agents with different roles debated the question, critiqued each other, and converged on a single verdict.\n\nVerdict: [VERDICT_HERE]\n\nPowered by MindCouncil AI 🧠⚖️\n#AI #Startups #ProductThinking`,
  pitch:    `PITCH OUTLINE\n─────────────────────\nProblem:      [Define the core problem]\nSolution:     [Council-validated answer]\nKey insight:  [From Analyst agent]\nUser angle:   [From User Advocate]\nNext steps:\n  1. ...\n  2. ...\n  3. ...`,
  summary:  `COUNCIL SUMMARY\n─────────────────────\nTitle:    [TITLE_HERE]\n\nSummary:  [VERDICT_HERE]\n\nScores:   Visionary 9/10 · Analyst 8/10 · User Advocate 8/10\nMode:     Council · 4 rounds · ${new Date().toLocaleDateString()}`,
  notion:   `# Council Session — ${new Date().toLocaleDateString()}\n\n**Mode:** Council (3 agents, 4 rounds)\n\n## Verdict\n\n### [TITLE_HERE]\n\n[VERDICT_HERE]\n\n## Agent Scores\n\n| Agent | Score | Dimension |\n|---|---|---|\n| Visionary | 9/10 | Creative merit |\n| Analyst | 8/10 | Feasibility |\n| User Advocate | 8/10 | Usability |`,
};

// ── Application state ────────────────────────────────
const state = {
  mode:           'council',
  isRunning:      false,
  annualBilling:  false,
  selectedExport: 'linkedin',
  lastVerdict:    { title: '', summary: '' },
  sessCount:      0,
  ideaCount:      12,
  roundsCount:    8,
  toastTimer:     null,
  currentDebateEl: null,
};

// ── DOM refs ─────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── Init ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setMode('council', $('btn-council'));
});

/* ═══════════════════════════════════════════════════
   VIEW SWITCHING
═══════════════════════════════════════════════════ */
function switchView(viewId, btn) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  $('view-' + viewId).classList.add('active');
  btn.classList.add('active');
}
window.switchView = switchView;

/* ═══════════════════════════════════════════════════
   MODE SELECTION
═══════════════════════════════════════════════════ */
function setMode(m, btn) {
  state.mode = m;
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active-q','active-s','active-c'));
  btn.classList.add({ quick:'active-q', smart:'active-s', council:'active-c' }[m]);

  const cfg = MODE_CONFIG[m];
  $('mode-footer-label').textContent = cfg.label;
  $('eco-footer-label').textContent  = cfg.eco;
  $('eco-co2').textContent           = cfg.co2;
  $('eco-bar').style.width           = cfg.bar + '%';
  $('eco-agents-count').textContent  = cfg.agentN;
  $('eco-mode-label').textContent    = m === 'council' ? 'Standard' : 'Eco';
  $('eco-mode-label').style.color    = m === 'council' ? 'var(--cu)' : 'var(--green)';
  $('row-u').style.opacity           = m !== 'council' ? '0.3' : '1';
}
window.setMode = setMode;

/* ═══════════════════════════════════════════════════
   INPUT HELPERS
═══════════════════════════════════════════════════ */
function fillPrompt(text) {
  const ta = $('chat-input');
  ta.value = text;
  autoResize(ta);
  ta.focus();
}
window.fillPrompt = fillPrompt;

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}
window.autoResize = autoResize;

function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitQuery(); }
}
window.handleKey = handleKey;

/* ═══════════════════════════════════════════════════
   ROUND PROGRESS
═══════════════════════════════════════════════════ */
function setStep(n) {
  for (let i = 1; i <= 4; i++) {
    const step = $(`ps-${i}`);
    const dot  = $(`pd-${i}`);
    if (!step || !dot) continue;
    step.className = 'prog-step' + (i < n ? ' done' : i === n ? ' active' : '');
    dot.textContent = i < n ? '✓' : String(i);
  }
}

/* ═══════════════════════════════════════════════════
   DOM HELPERS — Messages
═══════════════════════════════════════════════════ */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function appendToChat(el) {
  const scroll = $('chat-scroll');
  const empty  = $('empty-state');
  if (empty) empty.style.display = 'none';
  scroll.appendChild(el);
  scroll.scrollTop = scroll.scrollHeight;
  return el;
}

function userBubble(text) {
  const el = document.createElement('div');
  el.className = 'msg user';
  el.innerHTML = `
    <div class="msg-av user">You</div>
    <div class="msg-body">
      <div class="bubble user">${esc(text)}</div>
    </div>`;
  return appendToChat(el);
}

function systemBubble(icon, text) {
  const el = document.createElement('div');
  el.className = 'msg';
  el.innerHTML = `
    <div class="msg-av sys">${icon}</div>
    <div class="msg-body">
      <div class="bubble sys">${esc(text)}</div>
    </div>`;
  return appendToChat(el);
}

function thinkingBubble(agentId) {
  const ag = AGENTS[agentId];
  const el = document.createElement('div');
  el.className = 'msg';
  el.dataset.thinkingFor = agentId;
  el.innerHTML = `
    <div class="msg-av sys" style="color:${ag.color}">${ag.abbr}</div>
    <div class="msg-body">
      <div class="thinking-wrap">
        <div class="s-dot"></div>
        <span class="thinking-label">${ag.name} thinking…</span>
      </div>
      <div class="thinking">
        <div class="dot"></div><div class="dot"></div><div class="dot"></div>
      </div>
    </div>`;
  return appendToChat(el);
}

function removeThinking(agentId) {
  const el = document.querySelector(`[data-thinking-for="${agentId}"]`);
  if (el) el.remove();
}

function createDebateBox() {
  const el = document.createElement('div');
  el.className = 'debate-box';
  el.id = 'debate-box';
  el.innerHTML = `
    <div class="debate-head">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
      </svg>
      Council debate
      <span class="r-badge pending" id="r-badge">In progress</span>
    </div>`;
  return appendToChat(el);
}

function addTurnToDebate(debateEl, agentId, text, roundLabel) {
  const ag   = AGENTS[agentId];
  const turn = document.createElement('div');
  turn.className = 'agent-turn';
  turn.innerHTML = `
    <div class="turn-av" style="background:${ag.color}22;color:${ag.color}">${ag.abbr}</div>
    <div class="turn-body">
      <div class="turn-name" style="color:${ag.color}">
        ${ag.name} <span style="color:var(--m1);font-weight:400">${esc(roundLabel)}</span>
      </div>
      <div class="turn-text">${esc(text)}</div>
    </div>`;
  debateEl.appendChild(turn);
  $('chat-scroll').scrollTop = 99999;
}

function verdictBubble(title, summary, scores) {
  const scoresHtml = scores.map(s => {
    const ag = AGENTS[s.agentId];
    return `
      <div class="v-score">
        <span style="color:${ag.color};font-size:10px;font-weight:700">${ag.abbr}</span>
        <span style="font-weight:700;color:${ag.color}">${s.score}/10</span>
        <span style="color:var(--m1)">${esc(s.label)}</span>
      </div>`;
  }).join('');

  const el = document.createElement('div');
  el.className = 'verdict-box';
  el.innerHTML = `
    <div class="verdict-label">Council Verdict</div>
    <div class="verdict-title">${esc(title)}</div>
    <div class="verdict-text">${esc(summary)}</div>
    <div class="verdict-scores">${scoresHtml}</div>
    <div class="verdict-actions">
      <button class="act-btn" onclick="openModal('linkedin')">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z"/>
          <circle cx="4" cy="4" r="2"/>
        </svg>
        Post to LinkedIn
      </button>
      <button class="act-btn" onclick="openModal('pitch')">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        Pitch outline
      </button>
      <button class="act-btn" onclick="saveSession()">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
          <polyline points="17 21 17 13 7 13 7 21"/>
        </svg>
        Save session
      </button>
    </div>`;

  state.lastVerdict = { title, summary };
  return appendToChat(el);
}

function markDebateDone() {
  const badge = $('r-badge');
  if (badge) { badge.textContent = 'Complete'; badge.className = 'r-badge done'; }
}

/* ═══════════════════════════════════════════════════
   AGENT STATE UI
═══════════════════════════════════════════════════ */
function setDot(agentId, on) {
  const dotMap = { visionary: 'dot-v', analyst: 'dot-a', advocate: 'dot-u' };
  const el = $(dotMap[agentId]);
  if (el) el.className = 'a-dot ' + (on ? 'on' : 'off');
}

function setScore(agentId, score) {
  const scoreMap = { visionary: 'score-v', analyst: 'score-a', advocate: 'score-u' };
  const el = $(scoreMap[agentId]);
  if (el) el.textContent = score !== null ? `${score}/10` : '—';
}

function resetAgentUI() {
  ['visionary','analyst','advocate'].forEach(ag => {
    setDot(ag, false);
    setScore(ag, null);
  });
  for (let i = 1; i <= 4; i++) {
    const step = $(`ps-${i}`);
    const dot  = $(`pd-${i}`);
    if (step) step.className = 'prog-step';
    if (dot)  dot.textContent = String(i);
  }
}

/* ═══════════════════════════════════════════════════
   HISTORY
═══════════════════════════════════════════════════ */
function addToHistory(text) {
  const list  = $('hist-list');
  const label = document.querySelector('#hist-list .sec-label');
  list.querySelectorAll('.hist-item').forEach(i => i.classList.remove('current'));
  const item  = document.createElement('div');
  item.className = 'hist-item current';
  const display = text.length > 38 ? text.slice(0, 38) + '…' : text;
  const modeCap = state.mode.charAt(0).toUpperCase() + state.mode.slice(1);
  item.innerHTML = `<div class="hist-label">${esc(display)}</div><div class="hist-meta">${modeCap} · live</div>`;
  label ? label.insertAdjacentElement('afterend', item) : list.prepend(item);
}

function saveSession() { showToast('Session saved ✓'); }
window.saveSession = saveSession;

/* ═══════════════════════════════════════════════════
   METRICS
═══════════════════════════════════════════════════ */
function updateMetrics() {
  state.sessCount++;
  state.ideaCount++;
  state.roundsCount += MODE_CONFIG[state.mode].agentN;
  $('m-sess').textContent   = 3 + state.sessCount;
  $('m-ideas').textContent  = state.ideaCount;
  $('m-rounds').textContent = state.roundsCount;
  const impact = state.mode === 'council' ? 'Med' : 'Low';
  const el = $('m-eco');
  el.textContent  = impact;
  el.style.color  = impact === 'Med' ? 'var(--cu)' : 'var(--green)';
}

/* ═══════════════════════════════════════════════════
   SSE — Council Stream Handler
═══════════════════════════════════════════════════ */
async function runCouncil(question) {
  const debateEl = state.mode !== 'quick' ? createDebateBox() : null;
  state.currentDebateEl = debateEl;

  const response = await fetch('/api/council', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ question, mode: state.mode }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Server error ${response.status}`);
  }

  await new Promise((resolve, reject) => {
    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = '';

    function processChunk({ done, value }) {
      if (done) { resolve(); return; }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6));
          handleSSEEvent(event, debateEl);
          if (event.type === 'done')  { resolve(); return; }
          if (event.type === 'error') { reject(new Error(event.message)); return; }
        } catch (_) { /* malformed chunk — skip */ }
      }

      reader.read().then(processChunk).catch(reject);
    }

    reader.read().then(processChunk).catch(reject);
  });
}

function handleSSEEvent(event, debateEl) {
  switch (event.type) {

    case 'status':
      systemBubble('⚙', event.message);
      break;

    case 'step':
      setStep(event.step);
      break;

    case 'thinking':
      setDot(event.agentId, true);
      thinkingBubble(event.agentId);
      break;

    case 'turn':
      removeThinking(event.agentId);
      setDot(event.agentId, false);
      if (debateEl) {
        addTurnToDebate(debateEl, event.agentId, event.text, event.round);
      } else {
        const ag = AGENTS[event.agentId];
        const el = document.createElement('div');
        el.className = 'msg';
        el.innerHTML = `
          <div class="msg-av sys" style="color:${ag.color}">${ag.abbr}</div>
          <div class="msg-body">
            <div class="msg-name" style="color:${ag.color}">${ag.name}</div>
            <div class="bubble sys">${esc(event.text)}</div>
          </div>`;
        appendToChat(el);
      }
      break;

    case 'score':
      setScore(event.agentId, event.score);
      break;

    case 'verdict':
      markDebateDone();
      verdictBubble(event.title, event.summary, event.scores);
      updateMetrics();
      break;
  }
}

/* ═══════════════════════════════════════════════════
   SUBMIT
═══════════════════════════════════════════════════ */
async function submitQuery() {
  const input = $('chat-input');
  const text  = input.value.trim();
  if (!text || state.isRunning) return;

  state.isRunning = true;
  $('send-btn').disabled = true;
  input.value = '';
  input.style.height = 'auto';

  userBubble(text);
  addToHistory(text);
  resetAgentUI();

  try {
    await runCouncil(text);
  } catch (err) {
    console.error('[MindCouncil]', err);
    systemBubble('!', `Error: ${err.message || 'Something went wrong. Please try again.'}`);
  } finally {
    state.isRunning = false;
    $('send-btn').disabled = false;
    input.focus();
  }
}
window.submitQuery = submitQuery;

/* ═══════════════════════════════════════════════════
   PRICING
═══════════════════════════════════════════════════ */
function toggleBilling() {
  state.annualBilling = !state.annualBilling;
  const annual = state.annualBilling;
  $('billing-toggle').classList.toggle('on', annual);
  $('tl-m').classList.toggle('active', !annual);
  $('tl-a').classList.toggle('active',  annual);
  $('save-pill').classList.toggle('show', annual);
  $('pro-price').innerHTML  = annual ? '<sup>$</sup>13<span class="per"> / mo</span>' : '<sup>$</sup>19<span class="per"> / mo</span>';
  $('team-price').innerHTML = annual ? '<sup>$</sup>34<span class="per"> / mo</span>' : '<sup>$</sup>49<span class="per"> / mo</span>';
}
window.toggleBilling = toggleBilling;

function toggleFaq(el) {
  el.classList.toggle('open');
}
window.toggleFaq = toggleFaq;

/* ═══════════════════════════════════════════════════
   SETTINGS
═══════════════════════════════════════════════════ */
function setSnav(el) {
  document.querySelectorAll('.sn-item').forEach(i => i.classList.remove('active'));
  el.classList.add('active');
}
window.setSnav = setSnav;

function copyApiKey() {
  const val = $('api-key-input').value;
  navigator.clipboard?.writeText(val).catch(() => {});
  showToast('API key copied');
}
window.copyApiKey = copyApiKey;

/* ═══════════════════════════════════════════════════
   EXPORT MODAL
═══════════════════════════════════════════════════ */
function openModal(type) {
  state.selectedExport = type ?? 'linkedin';
  document.querySelectorAll('.export-option').forEach(el => el.classList.remove('selected'));
  const target = $('eo-' + state.selectedExport);
  if (target) target.classList.add('selected');
  updateExportPreview();
  $('export-modal').classList.add('open');
}
window.openModal = openModal;

function closeModal() {
  $('export-modal').classList.remove('open');
}
window.closeModal = closeModal;

function handleOverlayClick(e) {
  if (e.target === $('export-modal')) closeModal();
}
window.handleOverlayClick = handleOverlayClick;

function selectExportType(type, el) {
  state.selectedExport = type;
  document.querySelectorAll('.export-option').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
  updateExportPreview();
}
window.selectExportType = selectExportType;

function updateExportPreview() {
  const { title, summary } = state.lastVerdict;
  let text = EXPORT_TEMPLATES[state.selectedExport] ?? '';
  if (title)   text = text.replaceAll('[TITLE_HERE]',   title);
  if (summary) text = text.replaceAll('[VERDICT_HERE]', summary);
  $('export-preview').textContent = text;
}

function doExport() {
  const content = $('export-preview').textContent;
  if (navigator.clipboard && content) {
    navigator.clipboard.writeText(content).catch(() => {});
  }
  closeModal();
  const msgs = {
    linkedin: 'LinkedIn post copied!',
    pitch:    'Pitch outline copied!',
    summary:  'Summary copied!',
    notion:   'Notion content copied!',
  };
  showToast(msgs[state.selectedExport] ?? 'Copied!');
}
window.doExport = doExport;

/* ═══════════════════════════════════════════════════
   TOAST
═══════════════════════════════════════════════════ */
function showToast(msg) {
  const el = $('toast-el');
  el.textContent = msg;
  el.classList.add('show');
  if (state.toastTimer) clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => el.classList.remove('show'), 2700);
}
window.showToast = showToast;
