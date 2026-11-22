#!/usr/bin/env python3
"""Regression tests for audit_miniprogram.py.

The suite builds native Mini Program fixtures in temporary directories and
drives the public CLI.  It intentionally avoids importing implementation
details so it also catches argument parsing, report serialization, and exit
code regressions.
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any


AUDITOR = Path(__file__).with_name("audit_miniprogram.py").resolve()

# These values are deliberately synthetic. Build them at runtime so repository
# secret scanners do not mistake security-test fixtures for leaked credentials.
SYNTHETIC_APP_ID = "wx" + "12345678" + "90abcdef"
SYNTHETIC_MERCHANT_ID = "19000" + "00109"
SYNTHETIC_APP_SECRET = "7f8e9d0c" + "1b2a3948" + "57667584" + "93a2b1c0"
SYNTHETIC_APP_SECRET_ALT = "a9b8c7d6" + "e5f40312" + "23344556" + "67788990"


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def make_project(
    root: Path,
    *,
    app: dict[str, Any] | None = None,
    page_js: str = "Page({})\n",
    page_wxml: str = "<view>ready</view>\n",
    project_config: dict[str, Any] | None = None,
) -> Path:
    """Create the smallest valid native Mini Program project."""

    mini = root / "miniprogram"
    page = mini / "pages" / "index" / "index"
    write_json(
        root / "project.config.json",
        project_config
        or {
            "appid": SYNTHETIC_APP_ID,
            "compileType": "miniprogram",
            "miniprogramRoot": "miniprogram/",
            "setting": {"urlCheck": True},
        },
    )
    write_json(
        mini / "app.json",
        app
        or {
            "pages": ["pages/index/index"],
            "window": {"navigationBarTitleText": "Audit fixture"},
        },
    )
    page.parent.mkdir(parents=True, exist_ok=True)
    page.with_suffix(".js").write_text(page_js, encoding="utf-8")
    page.with_suffix(".wxml").write_text(page_wxml, encoding="utf-8")
    return root


def run_audit(
    project: Path,
    *,
    subject: str = "ordinary-personal",
    fail_on: str = "P1",
) -> tuple[subprocess.CompletedProcess[str], dict[str, Any] | None]:
    command = [
        sys.executable,
        str(AUDITOR),
        str(project),
        "--subject",
        subject,
        "--profile",
        "release",
        "--format",
        "json",
        "--deterministic",
        "--fail-on",
        fail_on,
    ]
    completed = subprocess.run(
        command,
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    report = json.loads(completed.stdout) if completed.stdout.strip() else None
    return completed, report


def finding_ids(report: dict[str, Any]) -> set[str]:
    return {item["id"] for item in report["findings"]}


class AuditMiniProgramCliTests(unittest.TestCase):
    maxDiff = None

    def test_clean_project_allows_false_privacy_flag_missing_sitemap_and_public_ids(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            project = make_project(
                root,
                app={
                    "pages": ["pages/index/index"],
                    "__usePrivacyCheck__": False,
                    "window": {"navigationBarTitleText": "Clean fixture"},
                },
                page_js=(
                    f'const appid = "{SYNTHETIC_APP_ID}";\n'
                    f'const mchid = "{SYNTHETIC_MERCHANT_ID}";\n'
                    "Page({ data: { appid, mchid } });\n"
                ),
            )

            completed, report = run_audit(project)

            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertIsNotNone(report)
            assert report is not None
            self.assertEqual(report["scan_status"], "complete")
            self.assertEqual(report["generated_at"], None)
            self.assertEqual(report["findings"], [])
            self.assertEqual(report["summary"]["blocking_count"], 0)
            self.assertFalse((root / "miniprogram" / "sitemap.json").exists())

    def test_missing_custom_privacy_ui_is_info_only_when_location_is_declared(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = make_project(
                Path(tmp),
                app={
                    "pages": ["pages/index/index"],
                    "__usePrivacyCheck__": False,
                    "requiredPrivateInfos": ["getLocation"],
                    "permission": {
                        "scope.userLocation": {"desc": "用于在地图上展示用户当前位置"}
                    },
                },
                page_js=(
                    "Page({\n"
                    "  locate() {\n"
                    '    wx.getLocation({ type: "gcj02" });\n'
                    "  }\n"
                    "});\n"
                ),
            )

            completed, report = run_audit(project, fail_on="P2")

            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertIsNotNone(report)
            assert report is not None
            self.assertEqual(finding_ids(report), {"PRI001", "PRI010"})
            self.assertTrue(
                all(item["severity"] == "INFO" for item in report["findings"]),
                report["findings"],
            )
            self.assertEqual(report["summary"]["blocking_count"], 0)

    def test_risky_native_project_flags_requested_surfaces(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            project = make_project(
                root,
                app={"pages": ["pages/index/index"]},
                page_js=(
                    f'const appid = "{SYNTHETIC_APP_ID}";\n'
                    f'const mchid = "{SYNTHETIC_MERCHANT_ID}";\n'
                    f'const appSecret = "{SYNTHETIC_APP_SECRET}";\n'
                    "Page({\n"
                    "  onLoad() {\n"
                    "    wx.requestSubscribeMessage({\n"
                    '      tmplIds: ["t1", "t2", "t3", "t4", "t5", "t6"]\n'
                    "    });\n"
                    "  },\n"
                    "  locate() { wx.getLocation({ type: \"gcj02\" }); },\n"
                    "  pay() {\n"
                    "    wx.requestPayment({\n"
                    '      timeStamp: "1", nonceStr: "runtime",\n'
                    '      package: "prepay_id=runtime", signType: "RSA", paySign: signature\n'
                    "    });\n"
                    "  },\n"
                    '  go() { wx.navigateTo({ url: "/pages/missing/index" }); },\n'
                    "  onShareAppMessage() {\n"
                    '    return { path: "/pages/ghost/index?token=leaked-session" };\n'
                    "  }\n"
                    "});\n"
                    "void appid; void mchid; void appSecret;\n"
                ),
                page_wxml=(
                    '<button open-type="getPhoneNumber">获取手机号</button>\n'
                    '<web-view src="https://www.qq.com/help"></web-view>\n'
                    '<textarea placeholder="发布评论"></textarea>\n'
                    '<button open-type="share">分享后解锁奖励</button>\n'
                    "<view>订阅后解锁内容</view>\n"
                ),
            )
            large_asset = root / "miniprogram" / "assets" / "hero.png"
            large_asset.parent.mkdir(parents=True, exist_ok=True)
            large_asset.write_bytes(b"\x89PNG" + b"0" * (1_900_000 - 4))

            completed, report = run_audit(project)

            self.assertEqual(completed.returncode, 1, completed.stderr)
            self.assertIsNotNone(report)
            assert report is not None
            expected = {
                "SEC001",
                "PRI001",
                "PRI002",
                "PRI004",
                "PRI010",
                "CAP001",
                "CAP002",
                "RTE007",
                "PERF001",
                "PERF002",
                "PERF004",
                "PAY001",
                "PAY009",
                "UGC001",
                "UGC002",
                "SUB001",
                "SUB002",
                "SUB004",
                "SHR001",
                "SHR003",
                "SHR004",
            }
            actual = finding_ids(report)
            self.assertTrue(expected <= actual, f"missing={sorted(expected - actual)} actual={sorted(actual)}")
            self.assertGreater(report["summary"]["blocking_count"], 0)

            secret_findings = [
                item for item in report["findings"] if item["id"] in {"SEC001", "SEC002", "PAY002"}
            ]
            rendered_secret_evidence = json.dumps(secret_findings, ensure_ascii=False)
            self.assertNotIn(SYNTHETIC_MERCHANT_ID, rendered_secret_evidence)
            self.assertNotIn(SYNTHETIC_APP_ID, rendered_secret_evidence)

    def test_exit_codes_respect_severity_thresholds_and_bad_input(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)

            p1_project = make_project(
                root / "p1",
                page_js="Page({ pay() { wx.requestPayment({}); } });\n",
            )
            p1_at_p0, p1_report = run_audit(p1_project, fail_on="P0")
            p1_at_p1, _ = run_audit(p1_project, fail_on="P1")
            p1_disabled, _ = run_audit(p1_project, fail_on="none")
            self.assertEqual(p1_at_p0.returncode, 0, p1_at_p0.stderr)
            self.assertEqual(p1_at_p1.returncode, 1, p1_at_p1.stderr)
            self.assertEqual(p1_disabled.returncode, 0, p1_disabled.stderr)
            assert p1_report is not None
            self.assertIn("PAY009", finding_ids(p1_report))

            p2_project = make_project(root / "p2")
            large_asset = p2_project / "miniprogram" / "assets" / "large.png"
            large_asset.parent.mkdir(parents=True, exist_ok=True)
            large_asset.write_bytes(b"\x89PNG" + b"0" * (1_900_000 - 4))
            p2_at_p1, p2_report = run_audit(p2_project, fail_on="P1")
            p2_at_p2, _ = run_audit(p2_project, fail_on="P2")
            self.assertEqual(p2_at_p1.returncode, 0, p2_at_p1.stderr)
            self.assertEqual(p2_at_p2.returncode, 1, p2_at_p2.stderr)
            assert p2_report is not None
            self.assertTrue({"PERF001", "PERF002", "PERF004"} <= finding_ids(p2_report))

            p0_project = make_project(
                root / "p0",
                page_js=(
                    f'const appSecret = "{SYNTHETIC_APP_SECRET_ALT}";\n'
                    "Page({});\n"
                ),
            )
            p0_at_p0, p0_report = run_audit(p0_project, fail_on="P0")
            self.assertEqual(p0_at_p0.returncode, 1, p0_at_p0.stderr)
            assert p0_report is not None
            self.assertIn("SEC001", finding_ids(p0_report))

            invalid = root / "not-a-project"
            invalid.mkdir()
            invalid_run, invalid_report = run_audit(invalid)
            self.assertEqual(invalid_run.returncode, 2)
            self.assertIsNone(invalid_report)
            self.assertIn("input error:", invalid_run.stderr)

    def test_sensitive_query_values_are_redacted_from_findings_and_inventories(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            network_secret = "ULTRA_SECRET_NETWORK_SESSION_123456789"
            share_secret = "ULTRA_SECRET_SHARE_SESSION_987654321"
            project = make_project(
                Path(tmp),
                page_js=(
                    "Page({\n"
                    "  loadOrder() {\n"
                    f'    wx.request({{ url: "https://api.myservice.cn/order?token={network_secret}" }});\n'
                    "  },\n"
                    "  onShareAppMessage() {\n"
                    f'    return {{ path: "/pages/index/index?session={share_secret}" }};\n'
                    "  }\n"
                    "});\n"
                ),
                page_wxml='<button open-type="share">分享</button>\n',
            )

            completed, report = run_audit(project)

            self.assertEqual(completed.returncode, 1, completed.stderr)
            self.assertIsNotNone(report)
            assert report is not None
            self.assertTrue({"SEC003", "SHR003"} <= finding_ids(report))
            self.assertNotIn(network_secret, completed.stdout)
            self.assertNotIn(share_secret, completed.stdout)

    def test_project_root_secret_files_are_in_security_scan_scope(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = make_project(Path(tmp))
            (project / "merchant-private.key").write_text(
                "fixture secret material that must never ship\n",
                encoding="utf-8",
            )

            completed, report = run_audit(project, fail_on="P0")

            self.assertEqual(completed.returncode, 1, completed.stderr)
            self.assertIsNotNone(report)
            assert report is not None
            self.assertIn("SEC001", finding_ids(report))

    def test_pack_ignored_files_do_not_inflate_release_package_metrics(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            project = make_project(
                root,
                project_config={
                    "appid": SYNTHETIC_APP_ID,
                    "compileType": "miniprogram",
                    "miniprogramRoot": "miniprogram/",
                    "setting": {"urlCheck": True},
                    "packOptions": {
                        "ignore": [{"type": "file", "value": "assets/large.png"}]
                    },
                },
            )
            ignored_asset = root / "miniprogram" / "assets" / "large.png"
            ignored_asset.parent.mkdir(parents=True, exist_ok=True)
            ignored_asset.write_bytes(b"\x89PNG" + b"0" * (1_900_000 - 4))

            completed, report = run_audit(project, fail_on="P2")

            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertIsNotNone(report)
            assert report is not None
            self.assertFalse(
                {"PERF001", "PERF002", "PERF004"} & finding_ids(report),
                report["findings"],
            )
            self.assertLess(
                report["inventories"]["metrics"]["raw_package_bytes"]["main"],
                100_000,
            )

    def test_lifecycle_privacy_check_does_not_cross_into_another_handler(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = make_project(
                Path(tmp),
                app={
                    "pages": ["pages/index/index"],
                    "requiredPrivateInfos": ["getLocation"],
                    "permission": {"scope.userLocation": {"desc": "展示当前位置"}},
                },
                page_js=(
                    "Page({\n"
                    "  onLoad() {},\n"
                    "  locate() { wx.getLocation({ type: \"gcj02\" }); }\n"
                    "});\n"
                ),
            )

            completed, report = run_audit(project, fail_on="P2")

            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertIsNotNone(report)
            assert report is not None
            self.assertNotIn("PRI005", finding_ids(report))
            self.assertEqual(finding_ids(report), {"PRI001", "PRI010"})

    def test_required_private_infos_rejects_non_string_entries(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = make_project(
                Path(tmp),
                app={
                    "pages": ["pages/index/index"],
                    "requiredPrivateInfos": [123, None],
                },
            )

            completed, report = run_audit(project)

            self.assertEqual(completed.returncode, 1, completed.stderr)
            self.assertIsNotNone(report)
            assert report is not None
            self.assertIn("CFG010", finding_ids(report))

    def test_content_safety_names_in_comments_are_not_implementation_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = make_project(
                Path(tmp),
                page_js=(
                    "// TODO: call msgSecCheck on the trusted server before release.\n"
                    "Page({});\n"
                ),
                page_wxml='<textarea placeholder="发布评论"></textarea>\n',
            )

            completed, report = run_audit(project)

            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertIsNotNone(report)
            assert report is not None
            self.assertIn("UGC001", finding_ids(report))
            self.assertIn("UGC002", finding_ids(report))
            self.assertNotIn("UGC004", finding_ids(report))

    def test_payment_frontend_state_and_client_success_are_flagged(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = make_project(
                Path(tmp),
                page_js=(
                    "Page({\n"
                    "  data: { ts: '1', nonce: 'n', pkg: 'prepay_id=x', sig: 's' },\n"
                    "  pay() {\n"
                    "    wx.requestPayment({\n"
                    "      timeStamp: this.data.ts, nonceStr: this.data.nonce,\n"
                    "      package: this.data.pkg, paySign: this.data.sig,\n"
                    "      success: () => this.setData({ orderStatus: 'paid' })\n"
                    "    });\n"
                    "  }\n"
                    "});\n"
                ),
            )

            completed, report = run_audit(project, subject="non-personal")

            self.assertEqual(completed.returncode, 1, completed.stderr)
            self.assertIsNotNone(report)
            assert report is not None
            self.assertTrue({"PAY001", "PAY004", "PAY005"} <= finding_ids(report))

    def test_generative_ai_surface_creates_manual_compliance_gate(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project = make_project(
                Path(tmp),
                page_wxml="<view>AI 生成图片与大模型问答</view>\n",
            )

            completed, report = run_audit(project)

            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertIsNotNone(report)
            assert report is not None
            self.assertIn("AIC001", finding_ids(report))
            finding = next(item for item in report["findings"] if item["id"] == "AIC001")
            self.assertEqual("manual", finding["determination"])
            self.assertTrue(report["inventories"]["ai"]["likely_generative_ai"])

    def test_miniprogram_root_escape_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            project = root / "project"
            outside = root / "outside"
            make_project(project)
            write_json(
                project / "project.config.json",
                {
                    "appid": SYNTHETIC_APP_ID,
                    "compileType": "miniprogram",
                    "miniprogramRoot": "../outside/",
                },
            )
            write_json(outside / "app.json", {"pages": ["pages/index/index"]})

            completed, report = run_audit(project)

            self.assertEqual(completed.returncode, 2)
            self.assertIsNone(report)
            self.assertIn("escapes project root", completed.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
