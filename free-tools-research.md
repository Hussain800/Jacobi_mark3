# Free Tools/APIs to Supplement BrightData for JACOBI

> Research compiled 2026-05-26

---

## Tier 1: Best Free Tiers (Ready to Integrate)

### WebPeel — Best Overall Free Tier
- **Free**: ~2,000 fetches/month, no credit card
- **Features**: Full browser rendering, JS, Cloudflare bypass, 32 domain extractors, 7 MCP tools, web search (27+ sources), YouTube transcripts
- **Why for JACOBI**: Firecrawl-compatible API — can swap in for BrightData on JS-heavy sites. MCP tools mean AI agents can call it directly.
- **URL**: https://webpeel.dev

### ScraperAPI — Most Generous Free Credits
- **Free**: 5,000 credits/month (monthly)
- **Features**: Proxy rotation, JS rendering (5x credits), CAPTCHA solving, geo-targeting
- **Why for JACOBI**: 5k free requests = ~200 full probes (at 25 credits/probe for premium). Can test any URL before committing to paid BrightData.
- **URL**: https://scraperapi.com

### FineData.ai — AI-Powered Anti-Bot Bypass
- **Free**: 10,000 tokens on signup, 1,000 free monthly tokens forever
- **Features**: AI data extraction, anti-bot bypass (Cloudflare, DataDome, PerimeterX), MCP protocol, TLS fingerprint rotation
- **Why for JACOBI**: Can supplement BrightData for sites that are heavily protected. AI extraction means no per-site parser needed.
- **URL**: https://finedata.ai

### Scrappey — Pay-as-you-go, No Subscription
- **Free**: 150 free scrapes, no credit card
- **Features**: Residential proxies included, JS rendering, CAPTCHA solving, €0.20/1k after free tier
- **Why for JACOBI**: True pay-as-you-go with no monthly commitment. Perfect overflow for BrightData when we need a few extra probes.
- **URL**: https://scrappey.com

---

## Tier 2: Additional Worthwhile Free Tiers

| Tool | Free Tier | Best For | URL |
|------|-----------|----------|-----|
| **ScrapeUp** | 25,000 free credits (30-day trial) | AI extraction, PDF parsing, premium proxies | https://scrapeup.com |
| **Firecrawl** | 500 pages/month | LLM-ready markdown extraction, open-source | https://firecrawl.dev |
| **HasData** | 1,000 API calls free | Pre-built scrapers for 30 sites, structured JSON | https://hasdata.com |
| **ScrapingAnt** | 10,000 free credits/month | Chrome rendering, 3M+ proxies, MCP server | https://scrapingant.com |
| **Apify** | $5 free credits/month | Pre-built actors for Amazon, Google Maps, LinkedIn | https://apify.com |
| **CrawlerAPI** | 1,000 credits/month | No-code visual scraper, 100+ templates | https://crawlerapi.ai |
| **Thunderbit** | 600 units free | AI-powered structured extraction, batch URLs | https://thunderbit.com |
| **Frostbyte** | 200 credits free (no signup) | 40+ APIs: geo, crypto, DNS, scraping, screenshots | https://github.com/Robocular/frostbyte-api |

---

## Tier 3: Free Proxy Sources (For Direct Use)

| Source | Type | Description | URL |
|--------|------|-------------|-----|
| **Worldpool** | Free proxy pool | 120+ sources, self-maintaining, validated, REST API with geo/anonymity/latency filters | https://github.com/CelestialBrain/worldpool |
| **Free Proxy DB** | Free proxy list | 1,000+ daily-updated proxies (HTTP, SOCKS4/5, V2Ray, SS), API + TXT/JSON dumps | https://freeproxydb.com |
| **go-free-proxy-libserver** | Self-hosted proxy pool | Go library + REST API, auto-fetch + validate free proxies, Docker-ready | https://github.com/brainplusplus/go-free-proxy-libserver |
| **GetFreeProxy API** | Free proxy API | RESTful API to free proxy database, real-time tested lists | https://developer.getfreeproxy.com |

---

## Tier 4: AI Agent / MCP-Enabled Tools

| Tool | Cost | MCP | Why for JACOBI |
|------|------|-----|----------------|
| **Pipeworx** | 2,000 calls/day free | ✅ | 261 data sources, 961 tools, one MCP connection — SEC filings, trade flows, mortgage rates |
| **Apollo MCP Proxy** | 3 free req/day per IP | ✅ | 36 tools via x402 micropayments: web scraping through 190+ country residential proxies |
| **agent-scrape** | 10 free calls/wallet | ✅ | x402-monetized MCP: scrape, extract (Groq+Llama), screenshot, metadata, browser sessions |
| **Firecrawl** | 500 pages/month free | ✅ | Search, scrape, crawl, map — open-source, most popular AI scraping tool |

---

## Recommended Integration Strategy for JACOBI

```
Primary:  BrightData Unlocker API    — for reliable large-scale probes
          (already integrated, API key configured)

Fallback: ScraperAPI (5k free/mo)    — when BrightData non-US proxies timeout
          Scrappey (150 free)         — for quick test probes during development

Amplify:  WebPeel (2k free/mo)       — JS-heavy sites BrightData can't handle
          FineData.ai (1k free/mo)    — anti-bot bypass for blocked sites

Future:   Firecrawl MCP              — AI-native scraping pipeline
          Worldpool free proxies      — self-hosted proxy pool for low-cost probes
```

---

## How These Help JACOBI Specifically

| Problem | Tool Solution | Impact |
|---------|---------------|--------|
| 14/24 non-US agents timeout | ScraperAPI premium proxies (5k free credits) or Scrappey residential (€0.20/1k) | ±10% more agent success on international sites |
| BrightData hit CAPTCHA/blocked | FineData.ai anti-bot bypass (1k free/mo) | Can retry blocked URLs through different provider |
| Need to test a new URL quickly | Scrappey 150 free scrapes — instant test without burning BrightData credits | Faster iteration on parser development |
| User wants to probe a JS SPA | WebPeel full browser rendering (2k free/mo) | Support for React/Angular/Vue sites that BrightData can't render |
| Building AI agent integration | Firecrawl MCP — connect AI agent directly to web data | Less code, faster integration |
| Reducing BrightData costs at scale | Worldpool free proxies + self-hosted pool | Move from $1/GB BrightData to $0 for basic probes |
