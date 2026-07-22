"""Jacobi for Agents — evidence-grade price provenance layer for AI agents.

Package layout:
  schemas.py    — contract models (PriceObligation, DecisionEnvelope, EvidenceManifest, ...)
  policy.py     — platform policy registry + action-mode gating
  scoring.py    — Price Provenance Score + decision logic
  evidence.py   — deterministic SHA-256 evidence manifests
  extract.py    — extractor v0 (data-attr + generic fallback)
  providers.py  — CollectionProvider interface, fixture + local HTTP providers, budget
  commands.py   — transport-neutral command normalization + deterministic errors
  engine.py     — verification orchestrator
  api.py        — FastAPI router (/v1/agent/*)
  mcp_server.py — MCP stdio server exposing the tool catalog
"""
