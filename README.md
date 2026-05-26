<div align="center">

```txt

      ██╗ █████╗  ██████╗ ██████╗ ██████╗ ██╗
      ██║██╔══██╗██╔════╝██╔═══██╗██╔══██╗██║
      ██║███████║██║     ██║   ██║██████╔╝██║
 ██   ██║██╔══██║██║     ██║   ██║██╔══██╗██║
 ╚█████╔╝██║  ██║╚██████╗╚██████╔╝██████╔╝██║
  ╚════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚═════╝ ╚═╝

```

# ⚡ JACOBI — Adversarial Pricing Topology Probe

### *24 agents. 5 variables. One URL. Uncover the price you were never meant to see.*

[![MIT](https://img.shields.io/badge/license-MIT-emerald?style=flat-square&labelColor=000)](LICENSE)
[![BrightData](https://img.shields.io/badge/powered%20by-BrightData-00ff41?style=flat-square&labelColor=000)](https://brightdata.com)

[![Python](https://img.shields.io/badge/python-3.11%2B-3776AB?style=flat-square&labelColor=000&logo=python&logoColor=white)](https://python.org)
[![Next.js](https://img.shields.io/badge/next.js-14-000?style=flat-square&labelColor=000&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&labelColor=000&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Gemini](https://img.shields.io/badge/AI-Gemini%202.0-8E75C3?style=flat-square&labelColor=000)](https://deepmind.google/gemini)

---

[✨ Features](#-features) •
[🚀 Quick Start](#-quick-start) •
[🔬 Architecture](#-architecture) •
[🌐 API Reference](#-api-reference) •
[🧪 The 5 Variables](#-the-5-variables) •
[📊 Topology Classification](#-topology-classification) •
[🔧 Configuration](#-configuration) •
[🧩 Extension](#-chrome-extension)

---

</div>

> **JACOBI** deploys 24 adversarial probe agents simultaneously — each with a unique digital fingerprint — against any pricing page. It detects when the price you see is _not_ the price someone else gets, and tells you exactly what to do about it.

---

## ✨ Features

<div align="center">

| | Capability | Detail |
|---|---|---|
| 🕵️ | **24 Parallel Agents** | 3 staggered waves × 8 agents, each with unique geo/device/cookie/referrer/network fingerprint |
| 🌍 | **Global Multi-Geo** | Probes from US, UK, India, UAE, Singapore, and more — detects location-based price discrimination |
| 📱 | **Cross-Device Detection** | Spoofs MacBook, iPhone, Android, iPad, Chromebook — premium devices see different prices |
| 🍪 | **Cookie Profile Analysis** | Fresh vs aged cookies, loyalty program status, search history simulation |
| 🔗 | **Referrer Manipulation** | Direct traffic vs Kayak/Skyscanner aggregator — referral-based pricing revealed |
| 🤖 | **AI-Powered Verdict** | Gemini AI translates statistical gradients into plain-English actionable advice |
| 📊 | **Topology Classification** | Uniform → Selective → Progressive → Aggressive — how bad is the discrimination? |
| 🧩 | **Browser Extension** | Right-click any page → "Probe this price" — one click to launch analysis |
| 🔗 | **Shareable Results** | Copy a permanent link to any probe result |
| 📈 | **Comparison View** | Side-by-side price breakdown by every variable |
| 🎯 | **Real-Time Agent Grid** | Watch all 24 agents deploy in real-time with live status updates |

</div>

<details>
<summary><b>📸 What the probe reveals (click to expand)</b></summary>

<br>

When you submit a URL, JACOBI returns:

| Section | Description |
|---------|-------------|
| **Topology Badge** | Color-coded classification: 🟢 uniform / 🟡 selective / 🟠 progressive / 🔴 aggressive |
| **AI Analysis** | Gemini-generated plain-English verdict with actionable recommendations |
| **Hidden Premium** | How much extra you're paying vs the cheapest achievable price |
| **Network Fingerprint** | Price difference by proxy tier (datacenter → residential → mobile) |
| **Price Impact** | Per-variable delta bars — which factor affects price the most |
| **Comparison Table** | Full gradient breakdown: high vs low state, delta, significance |
| **Agent Grid** | 6×4 grid of all 24 agents with live status and individual agent detail |

</details>

---

## 🚀 Quick Start

```bash
# 1. Clone & install backend
cd backend
cp .env.example .env        # Add your API keys
pip install -r requirements.txt
python main.py &             # Starts on :8000

# 2. Install & run frontend
cd ../frontend
npm install
npm run dev &                # Starts on :3000

# 3. Open the probe interface
open http://localhost:3000/chat
```

> [!TIP]
> No API keys? No problem. Flip the **demo toggle** in the chat header — it runs the full pipeline with realistic simulated data. Everything works, nothing breaks.

---

## 🔬 Architecture

```mermaid
graph TB
    User["👤 User"] --> Frontend["Next.js 14 Frontend<br/><i>:3000/chat</i>"]
    Frontend --> API["FastAPI Backend<br/><i>:8000</i>"]
    
    subgraph Backend ["Backend Probe Engine"]
        API --> RateLimiter["Rate Limiter<br/><i>5 req/min/IP</i>"]
        RateLimiter --> Probe["24‑Agent Probe"]
        
        subgraph Waves ["3 Staggered Waves"]
            W1["Wave 1<br/>Datacenter<br/>8 agents"]
            W2["Wave 2<br/>Residential<br/>8 agents"]
            W3["Wave 3<br/>Mobile<br/>8 agents"]
        end
        
        Probe --> W1 & W2 & W3
        W1 & W2 & W3 --> BrightData["BrightData Unlocker API"]
        
        BrightData --> Parser["Price Parser<br/>BeautifulSoup + Regex"]
        Parser --> Gradients["Gradient Engine<br/>Welch's t-test + Effect Size"]
        Gradients --> Classifier["Topology Classifier<br/>Uniform / Selective / Progressive / Aggressive"]
        Classifier --> Gemini["Gemini AI<br/>Plain-English Verdict"]
        Gemini --> Verdict["Savings Verdict + Action Items"]
    end
    
    Backend --> Supabase["Supabase<br/>Probe Persistence"]
    Backend --> SessionStore["In-Memory Session Store<br/>TTL: 30min, Cap: 100"]
    
    Verdict --> Frontend
    Frontend --> Extension["Chrome Extension<br/>Right-click 'Probe this price'"]
    
    classDef frontend fill:#0f0,color:#000
    classDef backend fill:#00f,color:#fff
    classDef data fill:#f0f,color:#fff
```

### Data Flow

```
User                Frontend              Backend               BrightData        
  │                     │                     │                     │              
  │  Paste URL          │                     │                     │              
  ├────────────────────►│                     │                     │              
  │                     │  POST /api/probe    │                     │              
  │                     ├────────────────────►│                     │              
  │                     │                     │  24× HTTP GET       │              
  │                     │                     │  (diff geo/device)  │              
  │                     │                     ├────────────────────►│              
  │                     │                     │◄────────────────────┤              
  │                     │                     │  24× HTML pages     │              
  │                     │                     │                     │              
  │                     │                     │  Parse prices       │              
  │                     │                     │  Compute gradients  │              
  │                     │                     │  Gemini analysis    │              
  │                     │  Poll /api/result   │                     │              
  │                     │◄────────────────────┤                     │              
  │                     │                     │                     │              
  │  Real-time grid     │                     │                     │              
  │◄────────────────────┤                     │                     │              
  │                     │                     │                     │              
  │  AI Verdict         │                     │                     │              
  │◄────────────────────┤                     │                     │              
```

---

## 🌐 API Reference

| Endpoint | Method | Description | Rate Limited |
|----------|--------|-------------|:-----------:|
| `/health` | `GET` | Backend health check | ❌ |
| `/api/probe` | `POST` | Launch 24-agent pricing probe | ✅ 5/min/IP |
| `/api/result/{id}` | `GET` | Poll probe results by session ID | ❌ |
| `/api/share/{id}` | `GET` | Get probe result for sharing | ❌ |
| `/api/demo` | `GET` | Static demo probe data | ❌ |
| `/api/leaderboard` | `GET` | Top probes by savings | ❌ |
| `/api/history` | `GET` | Recent probe sessions | ❌ |
| `/api/analyze` | `POST` | Gemini analysis on completed probe | ❌ |
| `/api/analyze-demo` | `GET` | Gemini analysis on demo data | ❌ |

> [!NOTE]
> All POST endpoints accept `Content-Type: application/json`. Rate limits apply per IP address.

---

## 🧪 The 5 Variables

Each of the 24 agents uses a unique combination of these variables:

| Variable | States | Impact |
|:--------:|--------|:------:|
| 🌍 **Location** | High-income (NY, London, Dubai) vs Low-income (rural Iowa, Mumbai, Mississippi) | **Highest** — up to 41% price difference |
| 📱 **Device** | Premium (MacBook Pro, iPhone 15, Galaxy S24) vs Budget (Chromebook, Android budget) | **High** — up to 13% premium for luxury devices |
| 🍪 **Cookies** | Fresh (first visit) vs Aged (90-day loyalty, abandoned cart) | **Medium** — up to 4% loyalty penalty |
| 🔗 **Referrer** | Direct vs Aggregator (Kayak, Skyscanner) | **Low-Medium** — up to 5% aggregator markup |
| 📡 **Network Tier** | Datacenter vs Residential vs Mobile 5G | **Tracking** — network quality correlates with price |

---

## 📊 Topology Classification

After computing statistical gradients across all 24 agents, JACOBI classifies the pricing strategy:

```
                    ┌──────────────┐
                    │   UNIFORM    │  ← No significant price differences found
                    │   🟢 #00ff41  │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │   SELECTIVE  │  ← 1-2 variables show mild discrimination
                    │   🟡 #facc15  │     (< 12% max delta)
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  PROGRESSIVE │  ← 2-3 variables with significant deltas
                    │   🟠 #fb923c  │     (< 25% max delta)
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  AGGRESSIVE  │  ← 3+ variables, > 25% max delta
                    │   🔴 #f87171  │     Systematic discrimination
                    └──────────────┘
```

> [!IMPORTANT]
> **Progressive** or **Aggressive** classifications indicate the site is using sophisticated pricing algorithms against you. JACOBI's AI analysis provides specific countermeasures.

---

## 🔧 Configuration

<details>
<summary><b>Environment Variables</b></summary>

<br>

| Variable | Required | Default | Description |
|----------|:--------:|:-------:|-------------|
| `BRIGHTDATA_API_KEY` | ✅ | — | BrightData Unlocker API key |
| `BRIGHTDATA_UNLOCKER_ZONE` | ❌ | `mcp_unlocker` | Unlocker zone name |
| `GEMINI_API_KEY` | ❌ | — | Google Gemini AI for analysis |
| `SUPABASE_URL` | ❌ | — | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | ❌ | — | Supabase service role key |
| `NEXT_PUBLIC_API_URL` | ❌ | `http://localhost:8000` | Backend URL (frontend) |
| `AUTH_SECRET` | ❌ | — | NextAuth encryption secret |
| `AUTH_GOOGLE_ID` | ❌ | — | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | ❌ | — | Google OAuth client secret |

</details>

<details>
<summary><b>BrightData Unlocker Setup</b></summary>

<br>

1. Create a zone at [BrightData](https://brightdata.com) (type: **Web Unlocker**)
2. Enable **Custom Headers & Cookies** in zone settings
3. Copy zone name to `BRIGHTDATA_UNLOCKER_ZONE`
4. Copy API token to `BRIGHTDATA_API_KEY`

> [!WARNING]
> Without Custom Headers & Cookies enabled, BrightData will ignore the per-agent user-agent, referrer, and cookie overrides, and all 24 agents will appear identical.

</details>

---

## 🧩 Chrome Extension

```
┌─────────────────────────────────────────────┐
│  Right-click any page → "Probe this price"  │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  [J]  Pricing Topology Probe        │    │
│  │                                     │    │
│  │  ┌─ https://www.booking.com/... ──┐ │    │
│  │  │  Probe this page               │ │    │
│  │  └─────────────────────────────────┘ │    │
│  │                                     │    │
│  │  Recent Probes                      │    │
│  │  ● booking.com ... 2m ago           │    │
│  │  ● amazon.com ... 15m ago           │    │
│  │  ● expedia.com ... 1h ago           │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  Keyboard: Ctrl+Shift+P → Popup             │
│            Ctrl+Shift+L → Quick probe       │
└─────────────────────────────────────────────┘
```

[Download from Chrome Web Store]() · [Load unpacked](/extension)

---

## 📈 Project Metrics

| Metric | Value |
|--------|:-----:|
| Frontend bundle (`/chat`) | **113 kB** (205 kB first load) |
| Landing page | **3.43 kB** |
| Probe duration (Google Flights) | **~90s** (20/24 agents) |
| Probe duration (Booking.com) | **~120s** (10/24 agents) |
| Gemini analysis | **~3-5s** |
| Total probe → verdict pipeline | **~2 min** |
| Agent success rate (US) | **~85%** |
| Agent success rate (International) | **~40%** (retries improve by 15%) |

---

## 🛠 Tech Stack

<table>
  <tr>
    <td align="center"><b>Frontend</b></td>
    <td>Next.js 14, React 18, TypeScript, Tailwind CSS, Recharts, Lucide</td>
  </tr>
  <tr>
    <td align="center"><b>Backend</b></td>
    <td>Python 3.11, FastAPI, httpx, BeautifulSoup4, Supabase</td>
  </tr>
  <tr>
    <td align="center"><b>AI</b></td>
    <td>Google Gemini 2.0, DeepSeek V4 Flash (OpenCode Zen)</td>
  </tr>
  <tr>
    <td align="center"><b>Infrastructure</b></td>
    <td>BrightData Unlocker API, Vercel, Supabase</td>
  </tr>
  <tr>
    <td align="center"><b>Auth</b></td>
    <td>Supabase Auth (Google OAuth + Email OTP), NextAuth</td>
  </tr>
  <tr>
    <td align="center"><b>Extension</b></td>
    <td>Chrome Extension MV3, contextMenus, notifications</td>
  </tr>
</table>

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/amazing`)
3. Commit changes (`git commit -m 'feat: add amazing thing'`)
4. Push (`git push origin feat/amazing`)
5. Open a PR

---

<div align="center">

**Built with ⚡ for BrightData**

```
"One URL is all it takes to see how much you're being charged for who you are."
```

[Report a Bug](https://github.com/HyperionBurn/Jacobi/issues) · [Request Feature](https://github.com/HyperionBurn/Jacobi/issues) · [BrightData](https://brightdata.com) · [MIT License](LICENSE)

---

<p align="center">
  <sub>Made with ❤️ by the JACOBI team · <code>[ J ]</code> — Pricing Topology Probe</sub>
</p>

</div>
