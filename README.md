# ConstructIQ — Voice-Controlled Construction Schedule

A real-time, voice-controlled project schedule management tool with an embedded CPM (Critical Path Method) scheduling engine. Built for the HB1-4 Data Centers project.

## Features

- **Voice Commands** — Click the mic and speak naturally: *"Push the steel erection back by two weeks"*
- **AI-Powered Interpretation** — Claude Sonnet converts natural language to schedule actions
- **CPM Engine** — Full forward-pass scheduling with FS/SS/FF/SF relationships and lag/lead
- **Real-Time Gantt Chart** — Bars animate to new positions when the schedule changes
- **Dependency Cascading** — Change one activity and watch all downstream activities recalculate
- **152 Activities** — 4 buildings × 7 construction phases with realistic sequencing

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/constructiq.git
cd constructiq

# 2. Install dependencies
npm install

# 3. Set up your Anthropic API key (for AI voice commands)
cp .env.example .env
# Edit .env and add your key from https://console.anthropic.com/

# 4. Start the dev server
npm run dev
```

Open http://localhost:3000 — the mic button works immediately since it's a top-level page (not an iframe).

## Deploy to Vercel (Recommended)

```bash
# Install Vercel CLI and deploy
npm i -g vercel
vercel

# Then add your API key in Vercel dashboard:
# Settings → Environment Variables → ANTHROPIC_API_KEY
```

Or connect your GitHub repo to vercel.com for auto-deploy on push.

## Project Structure

```
constructiq/
├── api/
│   └── interpret.js          # Vercel serverless function (Anthropic API proxy)
├── src/
│   ├── engine/
│   │   ├── CPMEngine.js      # CPM scheduling engine (pure JS, zero deps)
│   │   ├── sampleData.js     # HB1-4 Data Centers activity/relationship data
│   │   └── aiInterpreter.js  # AI command parser + local fallback
│   ├── hooks/
│   │   └── useVoiceInput.js  # Web Speech API hook
│   ├── App.jsx               # Main app: Gantt chart, command bar, state
│   └── main.jsx              # React entry point
├── index.html
├── vite.config.js
├── vercel.json
└── .env.example
```

## Voice Commands

| Say This | What Happens |
|----------|-------------|
| "Push steel erection back by 2 weeks" | Shifts activities by 14 days, cascades downstream |
| "Change duration of excavation building 1 to 12 days" | Updates duration, recalculates |
| "Link foundation to steel for building 2" | Creates FS relationship between phases |
| "Show me building 3" | Filters Gantt to Building 3 |
| "Mark pile driving building 1 as completed" | Updates status |

## How It Works

1. **Voice Input** → Web Speech API transcribes speech to text
2. **AI Interpretation** → Claude Sonnet converts natural language to a structured JSON action
3. **CPM Engine** → Forward pass recalculates all early start/finish dates
4. **Gantt Re-render** → Bars animate to new positions with CSS transitions

The AI has a **local regex fallback** — if no API key is set, common commands still work.

## Architecture Notes

- **API Key Security**: Anthropic key lives server-side only in `/api/interpret.js`
- **CPM Engine**: Pure JS, zero deps, handles FS/SS/FF/SF with lag/lead
- **Web Speech API**: Built into Chrome/Edge. No third-party STT needed.
