# MindCouncil AI

> Three AI agents debate, critique, and converge — delivering decisions, not just answers.

## Project Structure

```
mindcouncil/
├── server/
│   ├── index.js        # Express server + SSE endpoint
│   ├── council.js      # Multi-agent debate orchestration engine
│   └── agents.js       # Agent definitions and system prompts
├── public/
│   ├── index.html      # Single-page application shell
│   ├── css/style.css   # Full stylesheet
│   └── js/app.js       # Frontend logic (SSE client, UI)
├── .env.example        # Environment variable template
├── .gitignore
├── package.json
└── README.md
```

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set your Anthropic API key:

```
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

### 3. Run in development

```bash
npm run dev
```

### 4. Open in browser

```
http://localhost:3000
```

---

## Production Deployment

### Environment variables

| Variable          | Required | Default | Description                        |
|-------------------|----------|---------|------------------------------------|
| `ANTHROPIC_API_KEY` | ✅ Yes  | —       | Your Anthropic API key             |
| `PORT`            | No       | `3000`  | Server port                        |
| `NODE_ENV`        | No       | `development` | Set to `production` for deploy |
| `RATE_LIMIT_MAX`  | No       | `50`    | Max API requests per 15 min per IP |

### Deploy to Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

Set `ANTHROPIC_API_KEY` in Railway dashboard → Variables.

### Deploy to Render

1. Connect your GitHub repo in Render dashboard
2. Set **Build Command**: `npm install`
3. Set **Start Command**: `npm start`
4. Add environment variable `ANTHROPIC_API_KEY`

### Deploy to a VPS (Ubuntu)

```bash
# Clone repo
git clone https://github.com/youruser/mindcouncil.git
cd mindcouncil
npm install

# Install PM2 process manager
npm install -g pm2

# Start with PM2
pm2 start server/index.js --name mindcouncil
pm2 save
pm2 startup

# Nginx reverse proxy (optional)
# Point your domain to localhost:3000
```

---

## API Reference

### `POST /api/council`

Run a Council debate. Returns a **Server-Sent Events (SSE)** stream.

**Request body:**
```json
{
  "question": "Your question here",
  "mode": "council"
}
```

**Mode values:** `quick` | `smart` | `council`

**SSE event types:**

| Type       | Payload                                      |
|------------|----------------------------------------------|
| `status`   | `{ message: string }`                        |
| `step`     | `{ step: 1-4 }`                              |
| `thinking` | `{ agentId: string }`                        |
| `turn`     | `{ agentId, text, round }`                   |
| `score`    | `{ agentId, score }`                         |
| `verdict`  | `{ title, summary, scores[] }`               |
| `error`    | `{ message: string }`                        |
| `done`     | `{}`                                         |

**Example (curl):**
```bash
curl -X POST http://localhost:3000/api/council \
  -H "Content-Type: application/json" \
  -d '{"question":"Best SaaS idea for solo developers?","mode":"council"}' \
  --no-buffer
```

### `GET /api/agents`

Returns agent metadata.

### `GET /api/health`

Returns server health status.

---

## Modes

| Mode    | Agents | Rounds | Use case                        |
|---------|--------|--------|---------------------------------|
| Quick   | 1      | 1      | Fast answers, low cost          |
| Smart   | 2      | 2      | Balanced debate + synthesis     |
| Council | 3      | 4      | Full debate, highest quality    |

---

## Tech Stack

- **Backend:** Node.js, Express, `@anthropic-ai/sdk`
- **Frontend:** Vanilla JS, CSS custom properties, SSE
- **Security:** Helmet, CORS, rate limiting
- **AI:** Claude (Anthropic) — all 3 agents run server-side
