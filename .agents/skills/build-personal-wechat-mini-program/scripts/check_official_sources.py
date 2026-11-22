#!/usr/bin/env python3
"""Read-only freshness and HTTP metadata checks for the source registry.

This script deliberately does not update the registry or any rule/reference file.
Reachability, redirects, and ``Last-Modified`` changes are review signals only;
they do not prove that the meaning of an official page changed.
"""

from __future__ import annotations

import argparse
import json
import os
import ssl
import sys
from dataclasses import dataclass
from datetime import date, datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any, Callable, Mapping, Optional, Sequence, TextIO
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, urlunsplit
from urllib.request import Request, urlopen


DEFAULT_MAX_AGE_DAYS = 30
DEFAULT_TIMEOUT_SECONDS = 12.0
DEFAULT_REGISTRY = Path(__file__).resolve().parents[1] / "references" / "source-registry.json"
USER_AGENT = "personal-wechat-mini-program-source-check/1.0"
VOLATILITY_MAX_AGE_DAYS = {
    "critical": 7,
    "high": 30,
    "medium": 90,
    "low": 365,
    "stale-warning": 0,
}


class RegistryError(ValueError):
    """Raised when the source registry cannot be parsed or has no usable shape."""


@dataclass(frozen=True)
class FetchResult:
    """HTTP metadata returned by a fetcher.

    ``error`` is populated for transport failures and for HTTP error responses.
    An HTTP error still carries its status, final URL, and response headers.
    """

    status: Optional[int]
    final_url: str
    last_modified: Optional[str]
    error: Optional[str] = None


Fetcher = Callable[[str, float], FetchResult]


def _verified_ssl_context() -> ssl.SSLContext:
    """Create a verified TLS context, including common macOS/Python.org CA paths.

    Some standalone Python installations do not inherit the macOS system CA
    path. Falling back to an existing OS bundle keeps verification enabled;
    this function never creates an unverified context.
    """

    candidates = [
        os.environ.get("SSL_CERT_FILE"),
        ssl.get_default_verify_paths().cafile,
        "/etc/ssl/cert.pem",
        "/etc/ssl/certs/ca-certificates.crt",
        "/etc/pki/tls/certs/ca-bundle.crt",
    ]
    seen: set[str] = set()
    for candidate in candidates:
        if not candidate or candidate in seen:
            continue
        seen.add(candidate)
        path = Path(candidate)
        if not path.is_file():
            continue
        try:
            return ssl.create_default_context(cafile=str(path))
        except (OSError, ssl.SSLError):
            continue
    return ssl.create_default_context()


def _clean_header(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def fetch_url(url: str, timeout: float = DEFAULT_TIMEOUT_SECONDS) -> FetchResult:
    """Fetch one URL and return response metadata without consuming its body."""

    request = Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
            "Accept-Encoding": "identity",
            "Connection": "close",
        },
        method="GET",
    )
    try:
        with urlopen(request, timeout=timeout, context=_verified_ssl_context()) as response:
            status = response.getcode()
            return FetchResult(
                status=int(status) if status is not None else None,
                final_url=response.geturl() or url,
                last_modified=_clean_header(response.headers.get("Last-Modified")),
            )
    except HTTPError as exc:
        # HTTPError is also a response object, so preserve its useful metadata.
        try:
            return FetchResult(
                status=int(exc.code),
                final_url=exc.geturl() or url,
                last_modified=_clean_header(exc.headers.get("Last-Modified")),
                error=f"HTTP {exc.code}: {exc.reason}",
            )
        finally:
            exc.close()
    except (URLError, TimeoutError, OSError) as exc:
        reason = getattr(exc, "reason", exc)
        return FetchResult(
            status=None,
            final_url=url,
            last_modified=None,
            error=f"{type(exc).__name__}: {reason}",
        )


def load_registry(path: Path) -> dict[str, Any]:
    """Load a registry without opening it for writing."""

    try:
        raw = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise RegistryError(f"cannot read registry {path}: {exc}") from exc

    try:
        registry = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RegistryError(
            f"invalid JSON in registry {path} at line {exc.lineno}, column {exc.colno}: {exc.msg}"
        ) from exc

    if not isinstance(registry, dict):
        raise RegistryError("registry root must be a JSON object")
    if not isinstance(registry.get("sources"), list):
        raise RegistryError("registry.sources must be a JSON array")
    return registry


def _parse_checked_date(value: Any) -> date:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("checked_at is missing or is not a non-empty string")

    text = value.strip()
    try:
        if len(text) == 10:
            return date.fromisoformat(text)
        normalized = text[:-1] + "+00:00" if text.endswith("Z") else text
        return datetime.fromisoformat(normalized).date()
    except ValueError as exc:
        raise ValueError(f"checked_at is not an ISO-8601 date or datetime: {value!r}") from exc


def _coerce_now(now: Optional[datetime]) -> datetime:
    current = now or datetime.now().astimezone()
    if current.tzinfo is None:
        return current.replace(tzinfo=timezone.utc)
    return current


def _normalise_url(url: str) -> str:
    """Normalise superficial URL differences while preserving path/query meaning."""

    try:
        parts = urlsplit(url)
    except ValueError:
        return url
    path = parts.path or "/"
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), path, parts.query, ""))


def _http_date_key(value: str) -> Optional[datetime]:
    try:
        parsed = parsedate_to_datetime(value)
    except (TypeError, ValueError, OverflowError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).replace(microsecond=0)


def _last_modified_differs(recorded: str, observed: str) -> bool:
    recorded_date = _http_date_key(recorded)
    observed_date = _http_date_key(observed)
    if recorded_date is not None and observed_date is not None:
        return recorded_date != observed_date
    return recorded.strip() != observed.strip()


def _invalid_source_result(
    source: Any,
    index: int,
    max_age_days: int,
    message: str,
) -> dict[str, Any]:
    source_id = source.get("id") if isinstance(source, Mapping) else None
    return {
        "id": source_id or f"source-{index}",
        "title": source.get("title") if isinstance(source, Mapping) else None,
        "url": source.get("url") if isinstance(source, Mapping) else None,
        "volatility": source.get("volatility") if isinstance(source, Mapping) else None,
        "status": "invalid",
        "needs_review": True,
        "snapshot": {
            "checked_at": source.get("checked_at") if isinstance(source, Mapping) else None,
            "age_days": None,
            "max_age_days": max_age_days,
            "stale": True,
            "error": message,
        },
        "http": {
            "status": None,
            "final_url": None,
            "redirected": False,
            "last_modified": None,
            "recorded_last_modified": (
                source.get("last_modified") if isinstance(source, Mapping) else None
            ),
            "error": "source entry is invalid; network check skipped",
            "manual_required": False,
        },
        "changed": False,
        "change_signals": [],
        "signals": ["SNAPSHOT_INVALID", "LIVE_VERIFICATION_REQUIRED"],
    }


def _source_max_age_days(source: Any, override: Optional[int]) -> int:
    """Resolve snapshot age from an explicit override or registry volatility."""

    if override is not None:
        return override
    if isinstance(source, Mapping):
        volatility = source.get("volatility")
        if isinstance(volatility, str):
            return VOLATILITY_MAX_AGE_DAYS.get(volatility.strip().lower(), DEFAULT_MAX_AGE_DAYS)
    return DEFAULT_MAX_AGE_DAYS


def check_source(
    source: Any,
    *,
    index: int,
    max_age_days: Optional[int],
    timeout: float,
    now: datetime,
    fetcher: Fetcher,
    network_enabled: bool,
) -> dict[str, Any]:
    """Check one source and return a JSON-serialisable result."""

    effective_max_age_days = _source_max_age_days(source, max_age_days)
    if not isinstance(source, Mapping):
        return _invalid_source_result(
            source, index, effective_max_age_days, "source entry is not an object"
        )

    source_id = source.get("id")
    url = source.get("url")
    if not isinstance(source_id, str) or not source_id.strip():
        return _invalid_source_result(
            source, index, effective_max_age_days, "source id is missing"
        )
    if not isinstance(url, str) or not url.strip():
        return _invalid_source_result(
            source, index, effective_max_age_days, "source url is missing"
        )
    try:
        parsed_url = urlsplit(url)
    except ValueError as exc:
        return _invalid_source_result(
            source, index, effective_max_age_days, f"invalid source url: {exc}"
        )
    if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
        return _invalid_source_result(
            source,
            index,
            effective_max_age_days,
            "source url must be an absolute HTTP(S) URL",
        )

    signals: list[str] = []
    change_signals: list[str] = []
    manual_check = source.get("check_mode") == "manual"
    snapshot_error: Optional[str] = None
    age_days: Optional[int] = None
    stale = False
    try:
        checked_date = _parse_checked_date(source.get("checked_at"))
        age_days = (now.date() - checked_date).days
        if age_days < 0:
            stale = True
            snapshot_error = f"checked_at is {abs(age_days)} day(s) in the future"
            signals.append("SNAPSHOT_INVALID")
        elif age_days > effective_max_age_days:
            stale = True
            signals.append("SNAPSHOT_STALE")
    except ValueError as exc:
        stale = True
        snapshot_error = str(exc)
        signals.append("SNAPSHOT_INVALID")

    if manual_check:
        fetched = FetchResult(
            status=None,
            final_url=url,
            last_modified=None,
            error=None,
        )
        signals.append("MANUAL_BROWSER_CHECK")
    elif network_enabled:
        try:
            fetched = fetcher(url, timeout)
            if not isinstance(fetched, FetchResult):
                raise TypeError("fetcher must return FetchResult")
        except Exception as exc:  # A custom/injected fetcher must not abort the batch.
            fetched = FetchResult(
                status=None,
                final_url=url,
                last_modified=None,
                error=f"{type(exc).__name__}: {exc}",
            )
    else:
        fetched = FetchResult(
            status=None,
            final_url=url,
            last_modified=None,
            error="network check disabled",
        )

    unavailable = fetched.status is None and not manual_check
    http_error = fetched.status is not None and not 200 <= fetched.status < 400
    if unavailable:
        signals.append("LIVE_VERIFICATION_REQUIRED")
    elif http_error:
        signals.extend(["HTTP_STATUS_ERROR", "LIVE_VERIFICATION_REQUIRED"])

    redirected = False
    if fetched.status is not None and fetched.final_url:
        redirected = _normalise_url(fetched.final_url) != _normalise_url(url)
        if redirected:
            change_signals.append("FINAL_URL_CHANGED")

    recorded_last_modified = _clean_header(source.get("last_modified"))
    observed_last_modified = _clean_header(fetched.last_modified)
    if recorded_last_modified and observed_last_modified:
        if _last_modified_differs(recorded_last_modified, observed_last_modified):
            change_signals.append("LAST_MODIFIED_CHANGED")
    elif observed_last_modified and not recorded_last_modified:
        signals.append("LAST_MODIFIED_OBSERVED_NO_BASELINE")
    elif recorded_last_modified and fetched.status is not None and not observed_last_modified:
        # A missing response header is not sufficient evidence that the page changed.
        signals.append("LAST_MODIFIED_UNAVAILABLE")

    changed = bool(change_signals)
    signals.extend(change_signals)

    invalid_snapshot = snapshot_error is not None
    if invalid_snapshot:
        status = "invalid"
    elif manual_check:
        status = "stale" if stale else "manual"
    elif unavailable:
        status = "unavailable"
    elif http_error:
        status = "http_error"
    elif stale and changed:
        status = "stale_changed"
    elif changed:
        status = "changed"
    elif stale:
        status = "stale"
    else:
        status = "ok"

    return {
        "id": source_id,
        "title": source.get("title"),
        "url": url,
        "volatility": source.get("volatility"),
        "status": status,
        "needs_review": status not in {"ok", "manual"},
        "snapshot": {
            "checked_at": source.get("checked_at"),
            "age_days": age_days,
            "max_age_days": effective_max_age_days,
            "stale": stale,
            "error": snapshot_error,
        },
        "http": {
            "status": fetched.status,
            "final_url": fetched.final_url,
            "redirected": redirected,
            "last_modified": observed_last_modified,
            "recorded_last_modified": recorded_last_modified,
            "error": fetched.error,
            "manual_required": manual_check,
        },
        "changed": changed,
        "change_signals": change_signals,
        "signals": signals,
    }


def check_registry(
    registry: Mapping[str, Any],
    *,
    max_age_days: Optional[int] = None,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
    now: Optional[datetime] = None,
    fetcher: Fetcher = fetch_url,
    network_enabled: bool = True,
) -> dict[str, Any]:
    """Check every registry source and return a structured, read-only report."""

    if max_age_days is not None and max_age_days < 0:
        raise ValueError("max_age_days must be zero or greater")
    if timeout <= 0:
        raise ValueError("timeout must be greater than zero")
    sources = registry.get("sources")
    if not isinstance(sources, list):
        raise RegistryError("registry.sources must be a JSON array")

    current = _coerce_now(now)
    results = [
        check_source(
            source,
            index=index,
            max_age_days=max_age_days,
            timeout=timeout,
            now=current,
            fetcher=fetcher,
            network_enabled=network_enabled,
        )
        for index, source in enumerate(sources, start=1)
    ]

    summary = {
        "total": len(results),
        "ok": sum(result["status"] == "ok" for result in results),
        "stale": sum(bool(result["snapshot"]["stale"]) for result in results),
        "changed": sum(bool(result["changed"]) for result in results),
        "unavailable": sum(result["status"] == "unavailable" for result in results),
        "http_error": sum(result["status"] == "http_error" for result in results),
        "manual": sum(result["status"] == "manual" for result in results),
        "invalid": sum(result["status"] == "invalid" for result in results),
        "needs_review": sum(bool(result["needs_review"]) for result in results),
    }
    return {
        "schema_version": 1,
        "generated_at": current.isoformat(),
        "registry_schema_version": registry.get("schema_version"),
        "registry_checked_at": registry.get("registry_checked_at"),
        "max_age_days": max_age_days,
        "freshness_policy": (
            {"mode": "override", "max_age_days": max_age_days}
            if max_age_days is not None
            else {"mode": "per-volatility", "days": VOLATILITY_MAX_AGE_DAYS}
        ),
        "network_enabled": network_enabled,
        "read_only": True,
        "summary": summary,
        "results": results,
        "notice": (
            "Advisory metadata check only: no registry or rule was modified, and redirects or "
            "Last-Modified changes do not prove a semantic policy change. Review official page "
            "content and the relevant Mini Program backend before updating conclusions."
        ),
    }


def report_exit_code(report: Mapping[str, Any]) -> int:
    """Return 1 when any source needs review, otherwise 0."""

    summary = report.get("summary", {})
    return 1 if int(summary.get("needs_review", 0)) > 0 else 0


def _display_status(status: str) -> str:
    return {
        "stale_changed": "STALE+CHANGED",
        "http_error": "HTTP-ERROR",
    }.get(status, status.upper())


def render_text(report: Mapping[str, Any]) -> str:
    """Render a compact human-readable report."""

    lines = [
        "Official source check (read-only)",
        (
            f"generated_at={report['generated_at']} freshness_policy="
            f"{report['freshness_policy']['mode']} "
            f"network_enabled={str(report['network_enabled']).lower()}"
        ),
    ]
    for result in report["results"]:
        snapshot = result["snapshot"]
        http = result["http"]
        age = "?" if snapshot["age_days"] is None else f"{snapshot['age_days']}d"
        http_status = "-" if http["status"] is None else str(http["status"])
        signals = ",".join(result["signals"]) or "none"
        lines.append(
            f"[{_display_status(result['status'])}] {result['id']} "
            f"age={age} http={http_status} signals={signals}"
        )
        if http["redirected"]:
            lines.append(f"  final_url={http['final_url']}")
        if http["error"]:
            lines.append(f"  network={http['error']}")
        if snapshot["error"]:
            lines.append(f"  snapshot={snapshot['error']}")

    summary = report["summary"]
    lines.append(
        "Summary: "
        + " ".join(
            f"{key}={summary[key]}"
            for key in (
                "total",
                "ok",
                "stale",
                "changed",
                "unavailable",
                "http_error",
                "manual",
                "invalid",
                "needs_review",
            )
        )
    )
    lines.append(f"NOTICE: {report['notice']}")
    return "\n".join(lines) + "\n"


def _non_negative_int(value: str) -> int:
    parsed = int(value)
    if parsed < 0:
        raise argparse.ArgumentTypeError("must be zero or greater")
    return parsed


def _positive_float(value: str) -> float:
    parsed = float(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("must be greater than zero")
    return parsed


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Read-only check of source snapshot age, HTTP status, final URL, and "
            "Last-Modified metadata. The registry is never updated automatically."
        )
    )
    parser.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    parser.add_argument(
        "--max-age-days",
        type=_non_negative_int,
        default=None,
        help=(
            "override every source's age threshold; by default use registry volatility "
            "(critical=7, high=30, medium=90, low=365, stale-warning=0)"
        ),
    )
    parser.add_argument(
        "--timeout",
        type=_positive_float,
        default=DEFAULT_TIMEOUT_SECONDS,
        help=f"per-source network timeout in seconds (default: {DEFAULT_TIMEOUT_SECONDS:g})",
    )
    parser.add_argument(
        "--format",
        choices=("text", "json"),
        default="text",
        help="output format (default: text)",
    )
    parser.add_argument("--json", action="store_true", help="shortcut for --format json")
    parser.add_argument(
        "--no-network",
        action="store_true",
        help="only evaluate snapshot age; mark live verification as unavailable",
    )
    return parser


def main(
    argv: Optional[Sequence[str]] = None,
    *,
    now: Optional[datetime] = None,
    fetcher: Fetcher = fetch_url,
    stdout: Optional[TextIO] = None,
    stderr: Optional[TextIO] = None,
) -> int:
    stdout = stdout or sys.stdout
    stderr = stderr or sys.stderr
    args = build_parser().parse_args(argv)

    try:
        registry = load_registry(args.registry)
        report = check_registry(
            registry,
            max_age_days=args.max_age_days,
            timeout=args.timeout,
            now=now,
            fetcher=fetcher,
            network_enabled=not args.no_network,
        )
    except (RegistryError, ValueError) as exc:
        print(f"ERROR: {exc}", file=stderr)
        return 2

    output_format = "json" if args.json else args.format
    if output_format == "json":
        json.dump(report, stdout, ensure_ascii=False, indent=2)
        stdout.write("\n")
    else:
        stdout.write(render_text(report))
    return report_exit_code(report)


if __name__ == "__main__":
    raise SystemExit(main())
