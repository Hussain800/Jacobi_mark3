# Security Policy

## Supported code

Security fixes target the current `main` branch and active release branches. Historical branches and local experimental worktrees may not receive patches.

## Reporting a vulnerability

Use the repository's **Security → Report a vulnerability** private reporting flow on GitHub. Include:

- affected commit and component;
- impact and realistic attack path;
- minimal reproduction using fixtures where possible;
- logs with secrets, tokens, personal data, and retailer credentials removed;
- suggested mitigation if known.

Do not open a public issue for a suspected vulnerability and do not test against real users, production retailer accounts, payment flows, private networks, or paid providers without written authorization. If private GitHub reporting is unavailable, contact the repository owner privately through their verified GitHub profile and share only enough information to establish a secure channel.

## Scope priorities

High-priority areas include:

- SSRF, redirects, DNS rebinding, private IP and metadata access;
- hostile HTML/JSON-LD and resource exhaustion;
- comparison/evidence authorization and Supabase RLS;
- extension message validation and unsafe navigation;
- API keys, service-role keys, manifests, artifacts, and logs;
- rate-limit bypass and provider-budget bypass;
- automatic paid-provider invocation;
- false exact matches or totals that could cause financial harm.

## Safe research expectations

- Use repository fixtures and local services.
- Do not bypass CAPTCHAs, access controls, queues, or anti-bot systems.
- Do not automate checkout, handle credentials, or access private records.
- Do not incur provider charges.
- Stop if testing could affect another person or external system.

The maintainers will acknowledge a valid private report when operationally possible, coordinate remediation, and credit reporters who want attribution. No fixed bounty or response SLA is promised.

See the current [price-optimization security review](docs/SECURITY_REVIEW_PRICE_OPTIMIZATION.md).
