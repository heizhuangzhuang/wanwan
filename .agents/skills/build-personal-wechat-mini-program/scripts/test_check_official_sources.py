#!/usr/bin/env python3
"""Tests for check_official_sources.py; no external network is required."""

from __future__ import annotations

import io
import json
import sys
import tempfile
import threading
import unittest
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import check_official_sources as checker


LAST_MODIFIED = "Fri, 10 Jul 2026 11:17:18 GMT"
CHANGED_LAST_MODIFIED = "Sat, 11 Jul 2026 11:17:18 GMT"
NOW = datetime(2026, 7, 12, 12, 0, tzinfo=timezone.utc)


class _SourceHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        if self.path == "/redirect":
            self.send_response(302)
            self.send_header("Location", "/same")
            self.send_header("Content-Length", "0")
            self.send_header("Connection", "close")
            self.end_headers()
            return

        if self.path == "/not-found":
            self.send_response(404)
            self.send_header("Content-Length", "0")
            self.send_header("Connection", "close")
            self.end_headers()
            return

        if self.path == "/same":
            last_modified = LAST_MODIFIED
        elif self.path == "/changed":
            last_modified = CHANGED_LAST_MODIFIED
        elif self.path == "/no-last-modified":
            last_modified = None
        else:
            self.send_response(500)
            self.send_header("Content-Length", "0")
            self.send_header("Connection", "close")
            self.end_headers()
            return

        self.send_response(200)
        if last_modified:
            self.send_header("Last-Modified", last_modified)
        self.send_header("Content-Length", "0")
        self.send_header("Connection", "close")
        self.end_headers()

    def log_message(self, _format: str, *args: Any) -> None:
        return


class OfficialSourceCheckerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), _SourceHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        host, port = cls.server.server_address
        cls.base_url = f"http://{host}:{port}"

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)

    def _source(
        self,
        path: str,
        *,
        source_id: str = "source",
        checked_at: str = "2026-07-10",
        last_modified: str | None = LAST_MODIFIED,
        volatility: str = "high",
    ) -> dict[str, Any]:
        return {
            "id": source_id,
            "title": source_id,
            "url": self.base_url + path,
            "authority": "test",
            "volatility": volatility,
            "checked_at": checked_at,
            "last_modified": last_modified,
            "use_for": ["test"],
        }

    @staticmethod
    def _registry(*sources: dict[str, Any]) -> dict[str, Any]:
        return {
            "schema_version": 1,
            "registry_checked_at": "2026-07-12T00:00:00+00:00",
            "sources": list(sources),
        }

    def _check(self, *sources: dict[str, Any], max_age_days: int = 7) -> dict[str, Any]:
        return checker.check_registry(
            self._registry(*sources),
            max_age_days=max_age_days,
            timeout=2,
            now=NOW,
        )

    def test_current_source_with_matching_metadata_is_ok(self) -> None:
        report = self._check(self._source("/same"))
        result = report["results"][0]

        self.assertEqual("ok", result["status"])
        self.assertEqual(2, result["snapshot"]["age_days"])
        self.assertEqual(200, result["http"]["status"])
        self.assertFalse(result["changed"])
        self.assertEqual(0, checker.report_exit_code(report))

    def test_old_snapshot_is_stale_without_claiming_page_changed(self) -> None:
        report = self._check(
            self._source("/same", checked_at="2026-06-01"), max_age_days=30
        )
        result = report["results"][0]

        self.assertEqual("stale", result["status"])
        self.assertTrue(result["snapshot"]["stale"])
        self.assertFalse(result["changed"])
        self.assertIn("SNAPSHOT_STALE", result["signals"])
        self.assertEqual(1, checker.report_exit_code(report))

    def test_default_policy_uses_source_volatility(self) -> None:
        source = self._source(
            "/same", checked_at="2026-07-04", volatility="critical"
        )
        report = checker.check_registry(
            self._registry(source), timeout=2, now=NOW
        )
        result = report["results"][0]

        self.assertEqual("stale", result["status"])
        self.assertEqual(7, result["snapshot"]["max_age_days"])
        self.assertEqual("per-volatility", report["freshness_policy"]["mode"])

    def test_explicit_max_age_overrides_volatility(self) -> None:
        source = self._source(
            "/same", checked_at="2026-07-04", volatility="critical"
        )
        report = checker.check_registry(
            self._registry(source), max_age_days=30, timeout=2, now=NOW
        )

        self.assertEqual("ok", report["results"][0]["status"])
        self.assertEqual(30, report["results"][0]["snapshot"]["max_age_days"])
        self.assertEqual("override", report["freshness_policy"]["mode"])

    def test_manual_check_mode_does_not_create_permanent_http_failure(self) -> None:
        source = self._source("/not-found")
        source["check_mode"] = "manual"
        report = checker.check_registry(
            self._registry(source), timeout=2, now=NOW
        )
        result = report["results"][0]

        self.assertEqual("manual", result["status"])
        self.assertFalse(result["needs_review"])
        self.assertTrue(result["http"]["manual_required"])
        self.assertIn("MANUAL_BROWSER_CHECK", result["signals"])
        self.assertEqual(1, report["summary"]["manual"])
        self.assertEqual(0, checker.report_exit_code(report))

    def test_last_modified_difference_marks_changed(self) -> None:
        report = self._check(self._source("/changed"))
        result = report["results"][0]

        self.assertEqual("changed", result["status"])
        self.assertTrue(result["changed"])
        self.assertEqual(["LAST_MODIFIED_CHANGED"], result["change_signals"])

    def test_redirect_records_final_url_and_marks_changed(self) -> None:
        report = self._check(self._source("/redirect"))
        result = report["results"][0]

        self.assertEqual("changed", result["status"])
        self.assertTrue(result["http"]["redirected"])
        self.assertEqual(self.base_url + "/same", result["http"]["final_url"])
        self.assertIn("FINAL_URL_CHANGED", result["change_signals"])

    def test_new_last_modified_without_registry_baseline_is_informational(self) -> None:
        report = self._check(self._source("/same", last_modified=None))
        result = report["results"][0]

        self.assertEqual("ok", result["status"])
        self.assertFalse(result["changed"])
        self.assertIn("LAST_MODIFIED_OBSERVED_NO_BASELINE", result["signals"])

    def test_missing_response_header_does_not_claim_page_changed(self) -> None:
        report = self._check(self._source("/no-last-modified"))
        result = report["results"][0]

        self.assertEqual("ok", result["status"])
        self.assertFalse(result["changed"])
        self.assertIn("LAST_MODIFIED_UNAVAILABLE", result["signals"])

    def test_http_error_is_reported_without_aborting(self) -> None:
        report = self._check(self._source("/not-found"))
        result = report["results"][0]

        self.assertEqual("http_error", result["status"])
        self.assertEqual(404, result["http"]["status"])
        self.assertIn("LIVE_VERIFICATION_REQUIRED", result["signals"])

    def test_fetcher_failure_gracefully_degrades_and_batch_continues(self) -> None:
        def broken_fetcher(_url: str, _timeout: float) -> checker.FetchResult:
            raise TimeoutError("simulated timeout")

        sources = [
            self._source("/same", source_id="one"),
            self._source("/same", source_id="two"),
        ]
        report = checker.check_registry(
            self._registry(*sources),
            max_age_days=7,
            timeout=2,
            now=NOW,
            fetcher=broken_fetcher,
        )

        self.assertEqual(2, len(report["results"]))
        self.assertEqual(2, report["summary"]["unavailable"])
        for result in report["results"]:
            self.assertEqual("unavailable", result["status"])
            self.assertIn("LIVE_VERIFICATION_REQUIRED", result["signals"])
            self.assertIn("simulated timeout", result["http"]["error"])

    def test_invalid_checked_at_is_localised_to_its_source(self) -> None:
        report = self._check(
            self._source("/same", source_id="bad", checked_at="not-a-date"),
            self._source("/same", source_id="good"),
        )

        self.assertEqual("invalid", report["results"][0]["status"])
        self.assertEqual("ok", report["results"][1]["status"])
        self.assertEqual(1, report["summary"]["invalid"])

    def test_cli_json_output_is_machine_readable_and_registry_is_unchanged(self) -> None:
        registry = self._registry(self._source("/same"))
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "registry.json"
            original = json.dumps(registry, ensure_ascii=False, indent=2).encode("utf-8")
            path.write_bytes(original)
            stdout = io.StringIO()
            stderr = io.StringIO()

            exit_code = checker.main(
                [
                    "--registry",
                    str(path),
                    "--max-age-days",
                    "7",
                    "--timeout",
                    "2",
                    "--format",
                    "json",
                ],
                now=NOW,
                stdout=stdout,
                stderr=stderr,
            )

            payload = json.loads(stdout.getvalue())
            self.assertEqual(0, exit_code)
            self.assertTrue(payload["read_only"])
            self.assertEqual(1, payload["summary"]["ok"])
            self.assertEqual("", stderr.getvalue())
            self.assertEqual(original, path.read_bytes())

    def test_malformed_registry_returns_configuration_error(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "registry.json"
            path.write_text("{broken", encoding="utf-8")
            stdout = io.StringIO()
            stderr = io.StringIO()

            exit_code = checker.main(
                ["--registry", str(path), "--no-network"],
                now=NOW,
                stdout=stdout,
                stderr=stderr,
            )

            self.assertEqual(2, exit_code)
            self.assertEqual("", stdout.getvalue())
            self.assertIn("invalid JSON", stderr.getvalue())


if __name__ == "__main__":
    unittest.main(verbosity=2)
