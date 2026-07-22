"""Transport-neutral command boundary for Jacobi for Agents.

REST and MCP normalize caller input here, then invoke the same deterministic
engine with an explicit organization context.  This module does not perform
authentication and does not select providers; those remain transport and
engine responsibilities respectively.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Mapping, Optional

from pydantic import ValidationError

from . import engine
from . import policy as policy_mod
from .schemas import ConsentScope, DecisionEnvelope, Money, PolicyDecision, SCHEMA_VERSION
from .storage import StorageUnavailableError


@dataclass(frozen=True)
class CommandContext:
    """Server-owned execution context supplied by a transport adapter."""

    org: str
    transport: str


@dataclass(frozen=True)
class VerifyCommand:
    """Normalized input accepted by the deterministic verification engine."""

    schema_version: str
    demo: Optional[str]
    url: Optional[str]
    consent_scope: ConsentScope
    displayed_total: Optional[Dict[str, Any]]
    official_route_claimed: bool
    agent_id: str
    item_or_booking: Dict[str, Any]
    merchant: Dict[str, Any]


@dataclass(frozen=True)
class PolicyCommand:
    schema_version: str
    url: str
    consent_scope: ConsentScope
    official_route_claimed: bool


class AgentCommandError(Exception):
    """Client-safe, deterministic command error shared by REST and MCP."""

    def __init__(
        self,
        code: str,
        message: str,
        *,
        field: Optional[str] = None,
        http_status: int = 422,
        retryable: bool = False,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.field = field
        self.http_status = http_status
        self.retryable = retryable

    def as_dict(self) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "schema_version": SCHEMA_VERSION,
            "code": self.code,
            "message": self.message,
            "retryable": self.retryable,
        }
        if self.field:
            payload["field"] = self.field
        return payload


def _require_schema_version(value: Optional[str]) -> str:
    version = value or SCHEMA_VERSION
    if version != SCHEMA_VERSION:
        raise AgentCommandError(
            "unsupported_schema_version",
            f"This server accepts command schema version {SCHEMA_VERSION}.",
            field="schema_version",
        )
    return version


def _consent_scope(value: Any) -> ConsentScope:
    try:
        return ConsentScope(str(value))
    except ValueError as exc:
        raise AgentCommandError(
            "invalid_consent_scope",
            "consent_scope is not supported.",
            field="consent_scope",
        ) from exc


def _mapping(value: Any, field: str) -> Dict[str, Any]:
    if value is None:
        return {}
    if not isinstance(value, Mapping):
        raise AgentCommandError(
            "invalid_request",
            f"{field} must be an object.",
            field=field,
        )
    return dict(value)


def _displayed_total(value: Any) -> Optional[Dict[str, Any]]:
    if value is None:
        return None
    if not isinstance(value, Mapping):
        raise AgentCommandError(
            "invalid_request",
            "displayed_total must be an object.",
            field="displayed_total",
        )
    try:
        money = Money.model_validate(dict(value))
    except ValidationError as exc:
        raise AgentCommandError(
            "invalid_request",
            "displayed_total must contain a numeric amount and currency.",
            field="displayed_total",
        ) from exc
    return money.model_dump(mode="json")


def normalize_verify_command(payload: Mapping[str, Any]) -> VerifyCommand:
    """Normalize a REST or MCP payload without transport-specific behavior."""

    schema_version = _require_schema_version(payload.get("schema_version"))
    demo_value = payload.get("demo")
    url_value = payload.get("url")
    demo = str(demo_value).strip() if demo_value is not None else None
    url = str(url_value).strip() if url_value is not None else None
    demo = demo or None
    url = url or None

    if demo and url:
        raise AgentCommandError(
            "ambiguous_target",
            "Provide either demo or url, not both.",
            field="target",
        )
    if not demo and not url:
        raise AgentCommandError(
            "missing_target",
            "Either demo or url is required.",
            field="target",
        )
    if demo and demo not in engine.DEMOS:
        raise AgentCommandError(
            "unknown_demo",
            "The requested demo is not available.",
            field="demo",
        )

    agent_id_value = payload.get("agent_id", "unknown-agent")
    agent_id = str(agent_id_value).strip() or "unknown-agent"
    return VerifyCommand(
        schema_version=schema_version,
        demo=demo,
        url=url,
        consent_scope=_consent_scope(payload.get("consent_scope", "recommend")),
        displayed_total=_displayed_total(payload.get("displayed_total")),
        official_route_claimed=bool(payload.get("official_route", False)),
        agent_id=agent_id,
        item_or_booking=_mapping(payload.get("item_or_booking"), "item_or_booking"),
        merchant=_mapping(payload.get("merchant"), "merchant"),
    )


def execute_verify(command: VerifyCommand, context: CommandContext) -> DecisionEnvelope:
    """Execute a normalized verification and map storage failures safely."""

    try:
        return engine.run_verify(
            demo=command.demo,
            url=command.url,
            consent_scope=command.consent_scope.value,
            displayed_total=command.displayed_total,
            official_route=command.official_route_claimed,
            agent_id=command.agent_id,
            item_or_booking=command.item_or_booking,
            merchant=command.merchant,
            org=context.org,
        )
    except StorageUnavailableError as exc:
        raise AgentCommandError(
            "storage_unavailable",
            "The configured provenance storage is unavailable; no verification was run.",
            http_status=503,
            retryable=True,
        ) from exc


def normalize_policy_command(payload: Mapping[str, Any]) -> PolicyCommand:
    schema_version = _require_schema_version(payload.get("schema_version"))
    url_value = payload.get("url")
    url = str(url_value).strip() if url_value is not None else ""
    if not url:
        raise AgentCommandError(
            "missing_target",
            "url is required.",
            field="url",
        )
    return PolicyCommand(
        schema_version=schema_version,
        url=url,
        consent_scope=_consent_scope(payload.get("consent_scope", "recommend")),
        official_route_claimed=bool(payload.get("official_route", False)),
    )


def execute_policy(command: PolicyCommand) -> PolicyDecision:
    return policy_mod.evaluate(
        command.url,
        command.consent_scope,
        command.official_route_claimed,
    )


def compare_total_price_projection(envelope: DecisionEnvelope) -> Dict[str, Any]:
    """Shared REST/MCP projection for the compact comparison command."""

    return {
        "schema_version": envelope.schema_version,
        "request_id": envelope.request_id,
        "created_at": envelope.created_at.isoformat(),
        "expires_at": envelope.expires_at.isoformat(),
        "ttl_seconds": envelope.ttl_seconds,
        "decision": envelope.decision.value,
        "price_summary": envelope.price_summary.model_dump(mode="json"),
        "reason_codes": [code.value for code in envelope.reason_codes],
        "manifest_id": envelope.evidence.manifest_id,
    }
