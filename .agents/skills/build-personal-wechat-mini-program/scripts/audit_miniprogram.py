#!/usr/bin/env python3
"""Static risk auditor for WeChat Mini Program build artifacts.

This tool intentionally separates static facts, heuristic findings, and manual
checks. It cannot inspect the WeChat MP console, verify qualifications, or
replace a server-side security review, device testing, or platform review.
"""

from __future__ import annotations

import argparse
import fnmatch
import hashlib
import ipaddress
import json
import os
import re
import sys
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import parse_qsl, unquote_plus, urlparse


TOOL_VERSION = "1.0.0"
RULEPACK_CHECKED_AT = "2026-07-12"

SEVERITY_RANK = {"P0": 0, "P1": 1, "P2": 2, "INFO": 3}
FAIL_RANK = {"P0": 0, "P1": 1, "P2": 2, "none": 99}

SOURCE_URLS = {
    "project": "https://developers.weixin.qq.com/miniprogram/dev/devtools/projectconfig.html",
    "app": "https://developers.weixin.qq.com/miniprogram/dev/reference/configuration/app.html",
    "privacy": "https://developers.weixin.qq.com/miniprogram/dev/framework/user-privacy/PrivacyAuthorize.html",
    "privacy-map": "https://developers.weixin.qq.com/miniprogram/dev/framework/user-privacy/miniprogram-intro.html",
    "network": "https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html",
    "categories": "https://developers.weixin.qq.com/miniprogram/product/material/",
    "operations": "https://developers.weixin.qq.com/miniprogram/product/",
    "reject": "https://developers.weixin.qq.com/miniprogram/product/reject.html",
    "security": "https://developers.weixin.qq.com/miniprogram/security/basic/risk.html",
    "content": "https://developers.weixin.qq.com/miniprogram/security/content/security.html",
    "performance": "https://developers.weixin.qq.com/miniprogram/dev/framework/performance/tips/start_optimizeA.html",
    "setdata": "https://developers.weixin.qq.com/miniprogram/dev/framework/performance/tips/runtime_setData.html",
    "phone": "https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/getPhoneNumber.html",
    "webview": "https://developers.weixin.qq.com/miniprogram/dev/component/web-view.html",
    "payment": "https://pay.weixin.qq.com/static/applyment_guide/applyment_detail_miniapp.shtml",
    "virtual-payment": "https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/business-capabilities/virtual-payment.html",
    "genai": "https://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm",
    "aigc-label": "https://www.cac.gov.cn/2025-03/14/c_1743654684782215.htm",
}


RULES: dict[str, dict[str, str]] = {
    "CFG001": {"severity": "P1", "title": "小程序根缺少 app.json"},
    "CFG002": {"severity": "P1", "title": "miniprogramRoot 无效"},
    "CFG003": {"severity": "P1", "title": "JSON 配置无法解析或存在重复键"},
    "CFG004": {"severity": "P1", "title": "项目 compileType 不是 miniprogram"},
    "CFG005": {"severity": "P1", "title": "发布配置缺少有效 AppID"},
    "CFG006": {"severity": "P2", "title": "私有配置覆盖重要共享配置"},
    "CFG007": {"severity": "P2", "title": "开发工具跳过域名/TLS 校验"},
    "CFG008": {"severity": "P2", "title": "app.json 开启 debug"},
    "CFG009": {"severity": "P1", "title": "pages 不是非空字符串数组"},
    "CFG010": {"severity": "P1", "title": "requiredPrivateInfos 含无效或重复值"},
    "RTE001": {"severity": "P1", "title": "路由重复或冲突"},
    "RTE003": {"severity": "P1", "title": "声明页面缺少编译单元"},
    "RTE004": {"severity": "P1", "title": "tabBar 配置无效"},
    "RTE005": {"severity": "P1", "title": "入口或预下载规则指向无效路由"},
    "RTE006": {"severity": "P1", "title": "本地组件或资源引用不存在"},
    "RTE007": {"severity": "P1", "title": "字面量导航目标不存在"},
    "RTE008": {"severity": "P1", "title": "导航 API 与 tabBar 目标不匹配"},
    "RTE012": {"severity": "P1", "title": "文件名大小写不一致"},
    "SEC001": {"severity": "P0", "title": "仓库包含高置信密钥或私钥"},
    "SEC002": {"severity": "P1", "title": "代码疑似硬编码令牌或凭据"},
    "SEC003": {"severity": "P1", "title": "URL 携带敏感查询参数"},
    "SEC004": {"severity": "P1", "title": "客户端直接请求 api.weixin.qq.com"},
    "SEC005": {"severity": "P1", "title": "使用动态代码执行"},
    "SEC008": {"severity": "P1", "title": "日志疑似输出敏感数据"},
    "PRI001": {"severity": "INFO", "title": "隐私接口能力清单"},
    "PRI002": {"severity": "P1", "title": "位置隐私接口未列入 requiredPrivateInfos"},
    "PRI003": {"severity": "P2", "title": "requiredPrivateInfos 声明与源码调用不一致"},
    "PRI004": {"severity": "P1", "title": "位置权限用途说明缺失"},
    "PRI005": {"severity": "P2", "title": "生命周期中疑似提前申请隐私能力"},
    "PRI006": {"severity": "P1", "title": "拒绝权限后疑似终止全部服务"},
    "PRI008": {"severity": "P2", "title": "使用历史用户资料接口"},
    "PRI010": {"severity": "INFO", "title": "依赖官方隐私弹窗兜底"},
    "CAP001": {"severity": "P1", "title": "普通个人主体使用手机号验证能力"},
    "CAP002": {"severity": "P1", "title": "普通个人主体使用 web-view"},
    "NET001": {"severity": "P1", "title": "生产网络使用不安全协议"},
    "NET002": {"severity": "P1", "title": "生产代码使用 localhost、回环或公网裸 IP"},
    "NET003": {"severity": "P2", "title": "使用局域网 IP，需确认硬件场景"},
    "NET004": {"severity": "P1", "title": "生产代码包含示例或测试域名"},
    "NET007": {"severity": "P2", "title": "请求超时或轮询策略需核验"},
    "REV001": {"severity": "P1", "title": "用户可见测试态内容"},
    "REV002": {"severity": "P2", "title": "页面疑似占位或无实现"},
    "REV004": {"severity": "P0", "title": "疑似审核模式或审核对抗开关"},
    "PERF001": {"severity": "P2", "title": "代码包原始体积接近或超过 2 MiB"},
    "PERF002": {"severity": "P2", "title": "代码包包含大资源文件"},
    "PERF003": {"severity": "P2", "title": "代码中内联大体积 Base64"},
    "PERF004": {"severity": "P2", "title": "项目较大但未使用分包"},
    "PERF005": {"severity": "P2", "title": "全局组件/插件可能影响启动"},
    "PERF006": {"severity": "P2", "title": "wx:for 缺少稳定 wx:key"},
    "PERF007": {"severity": "P2", "title": "setData 使用模式可能造成性能问题"},
    "PAY001": {"severity": "INFO", "title": "支付能力清单"},
    "PAY002": {"severity": "P0", "title": "客户端包含支付密钥或签名秘密"},
    "PAY004": {"severity": "P1", "title": "支付参数疑似由前端决定"},
    "PAY005": {"severity": "P1", "title": "仅凭客户端 success 标记已支付"},
    "PAY007": {"severity": "P1", "title": "疑似外部或个人转账支付"},
    "PAY008": {"severity": "P1", "title": "虚拟商品支付路线需核验"},
    "PAY009": {"severity": "P1", "title": "当前主体与支付能力冲突"},
    "UGC001": {"severity": "INFO", "title": "UGC 能力画像"},
    "UGC002": {"severity": "P1", "title": "公开 UGC 未发现服务端内容安全证据"},
    "UGC003": {"severity": "P1", "title": "疑似仅使用客户端敏感词过滤"},
    "UGC004": {"severity": "INFO", "title": "发现内容安全正向证据"},
    "SUB001": {"severity": "P1", "title": "订阅请求疑似不由用户动作触发"},
    "SUB002": {"severity": "P1", "title": "一次订阅模板数量过多"},
    "SUB004": {"severity": "P1", "title": "疑似强制或利诱订阅"},
    "SHR001": {"severity": "P1", "title": "疑似分享后解锁或获利"},
    "SHR003": {"severity": "P1", "title": "分享路径包含敏感参数"},
    "SHR004": {"severity": "P1", "title": "分享路径指向不存在页面"},
    "AIC001": {"severity": "P1", "title": "疑似生成式 AI 服务，需专项核验"},
}


PRIVACY_APIS: dict[str, str] = {
    "getLocation": "精确/模糊位置信息",
    "getFuzzyLocation": "模糊位置信息",
    "onLocationChange": "持续位置信息",
    "startLocationUpdate": "持续位置信息",
    "startLocationUpdateBackground": "后台持续位置信息",
    "chooseLocation": "选择的位置信息",
    "choosePoi": "选择的地点信息",
    "chooseAddress": "收货地址",
    "chooseImage": "选择的照片",
    "chooseMedia": "选择的照片或视频",
    "chooseVideo": "选择的视频",
    "chooseMessageFile": "选择的文件",
    "getWeRunData": "微信运动步数",
    "getClipboardData": "剪贴板信息",
    "setClipboardData": "写入剪贴板",
    "getRecorderManager": "麦克风/录音",
    "startRecord": "麦克风/录音",
    "saveImageToPhotosAlbum": "保存到相册",
    "saveVideoToPhotosAlbum": "保存到相册",
    "addPhoneContact": "写入通讯录",
    "addPhoneRepeatCalendar": "写入日历",
    "addPhoneCalendar": "写入日历",
}

REQUIRED_PRIVATE_INFO_APIS = {
    "getFuzzyLocation",
    "getLocation",
    "onLocationChange",
    "startLocationUpdate",
    "startLocationUpdateBackground",
    "chooseLocation",
    "choosePoi",
    "chooseAddress",
}

PHONE_OPEN_TYPES = {"getPhoneNumber", "getRealtimePhoneNumber"}
PAYMENT_APIS = {"requestPayment", "requestVirtualPayment"}
TEXT_EXTENSIONS = {
    ".js", ".ts", ".mjs", ".cjs", ".wxs", ".wxml", ".wxss", ".json",
    ".scss", ".less", ".html", ".yaml", ".yml", ".env", ".txt",
}
BINARY_SECRET_EXTENSIONS = {".pem", ".p12", ".pfx", ".keystore", ".jks", ".key"}
RESOURCE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".mp3", ".wav", ".mp4", ".mov", ".ttf", ".otf", ".woff", ".woff2"}
SKIP_DIRS = {".git", ".svn", ".hg", ".idea", ".vscode", "node_modules", "coverage", ".cache"}
SECRET_SCAN_SKIP_DIRS = SKIP_DIRS | {
    ".next", ".nuxt", ".output", "__pycache__", "build", "dist", "out",
    "release", "target", "temp", "tmp", "vendor",
}
SENSITIVE_FIELD_MARKERS = {
    "token", "session", "openid", "phone", "mobile", "idcard",
    "identitycard", "password", "passwd", "secret", "paysign", "身份证", "手机号",
}


class AuditInputError(Exception):
    pass


class DuplicateKeyError(ValueError):
    pass


@dataclass
class Evidence:
    path: str
    line: int | None = None
    column: int | None = None
    snippet: str | None = None


@dataclass
class Finding:
    id: str
    severity: str
    determination: str
    confidence: str
    title: str
    message: str
    remediation: str
    evidence: list[Evidence] = field(default_factory=list)
    sources: list[str] = field(default_factory=list)
    fingerprint: str = ""

    def finalize(self) -> None:
        base = self.id + "|" + self.message + "|" + "|".join(
            f"{e.path}:{e.line or 0}:{(e.snippet or '')[:100]}" for e in self.evidence
        )
        self.fingerprint = hashlib.sha256(base.encode("utf-8")).hexdigest()[:20]


@dataclass
class TextFile:
    path: Path
    rel_project: str
    rel_mini: str | None
    text: str
    package_scope: str


@dataclass
class ProjectContext:
    project_root: Path
    mini_root: Path
    project_config_path: Path | None
    private_config_path: Path | None
    project_config: dict[str, Any]
    shared_config: dict[str, Any]
    private_overrides: list[str]
    app_json_path: Path
    app_config: dict[str, Any]
    routes: list[str]
    tab_routes: set[str]
    subpackage_roots: list[str]
    files: list[TextFile]
    all_files: list[Path]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def redact(value: str) -> str:
    value = value.strip()
    if not value:
        return "REDACTED"
    return f"REDACTED (sha256:{hashlib.sha256(value.encode()).hexdigest()[:12]})"


def is_sensitive_field(name: str) -> bool:
    """Return whether a query/object field name denotes sensitive data."""
    decoded = unquote_plus(name).lower()
    compact = re.sub(r"[^a-z0-9\u4e00-\u9fff]+", "", decoded)
    return any(marker in compact for marker in SENSITIVE_FIELD_MARKERS)


def redact_url_query(value: str) -> str:
    """Redact sensitive query values without retaining even value fragments."""
    if "?" not in value:
        return value
    head, query_and_fragment = value.split("?", 1)
    query, marker, fragment = query_and_fragment.partition("#")
    pieces = re.split(r"([&;])", query)
    for index in range(0, len(pieces), 2):
        key, equals, _raw_value = pieces[index].partition("=")
        if equals and is_sensitive_field(key):
            pieces[index] = f"{key}=REDACTED"
    suffix = "".join(pieces)
    if marker:
        suffix += "#" + fragment
    return head + "?" + suffix


def sanitize_sensitive_text(value: str) -> str:
    """Mask sensitive literal values in URLs, query strings and assignments."""

    def query_replacer(match: re.Match[str]) -> str:
        separator, key, raw_value = match.groups()
        if not is_sensitive_field(key):
            return match.group(0)
        return f"{separator}{key}=REDACTED" if raw_value else match.group(0)

    # This also covers relative Mini Program paths such as /page?token=... .
    value = re.sub(
        r"([?&;])([^?&;=\s]+)=([^&#;\s'\"`<>)}\]]*)",
        query_replacer,
        value,
    )

    field_names = (
        r"(?:access[_-]?token|refresh[_-]?token|bearer[_-]?token|token|"
        r"session(?:[_-]?key)?|openid|phone(?:[_-]?number)?|mobile|"
        r"id[_-]?card|idcard|password|passwd|app[_-]?secret|secret|pay[_-]?sign)"
    )
    quoted_assignment = re.compile(
        rf"(?i)(\b{field_names}\b\s*[:=]\s*)(['\"])([^'\"\r\n]*)(\2)"
    )
    value = quoted_assignment.sub(
        lambda match: f"{match.group(1)}{match.group(2)}REDACTED{match.group(4)}",
        value,
    )
    return value


def sanitize_output(value: Any) -> Any:
    """Defense-in-depth sanitizer for every string serialized in a report."""
    if isinstance(value, str):
        return sanitize_sensitive_text(value)
    if isinstance(value, list):
        return [sanitize_output(item) for item in value]
    if isinstance(value, tuple):
        return tuple(sanitize_output(item) for item in value)
    if isinstance(value, dict):
        return {key: sanitize_output(item) for key, item in value.items()}
    return value


def clean_snippet(text: str, limit: int = 220) -> str:
    text = sanitize_sensitive_text(re.sub(r"\s+", " ", text).strip())
    return text[:limit] + ("…" if len(text) > limit else "")


def matching_brace(text: str, open_index: int) -> int | None:
    """Return the matching closing brace while skipping quoted literals."""

    if open_index < 0 or open_index >= len(text) or text[open_index] != "{":
        return None
    depth = 0
    quote: str | None = None
    escaped = False
    index = open_index
    while index < len(text):
        char = text[index]
        if quote is not None:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
            index += 1
            continue
        if char in {"'", '"', "`"}:
            quote = char
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return index
        index += 1
    return None


def iter_method_bodies(text: str, names: set[str]) -> Iterable[tuple[str, str, int]]:
    pattern = re.compile(
        rf"\b({'|'.join(sorted(re.escape(name) for name in names))})\s*\([^)]*\)\s*\{{"
    )
    for match in pattern.finditer(text):
        open_index = match.end() - 1
        close_index = matching_brace(text, open_index)
        if close_index is None:
            continue
        yield match.group(1), text[open_index + 1 : close_index], open_index + 1


def line_col(text: str, index: int) -> tuple[int, int]:
    line = text.count("\n", 0, index) + 1
    last = text.rfind("\n", 0, index)
    return line, index - last


def strip_json_comments(text: str) -> str:
    out: list[str] = []
    i = 0
    in_string = False
    escaped = False
    quote = ""
    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""
        if in_string:
            out.append(ch)
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == quote:
                in_string = False
            i += 1
            continue
        if ch in {'"', "'"}:
            in_string = True
            quote = ch
            out.append(ch)
            i += 1
        elif ch == "/" and nxt == "/":
            out.extend("  ")
            i += 2
            while i < len(text) and text[i] != "\n":
                out.append(" ")
                i += 1
        elif ch == "/" and nxt == "*":
            out.extend("  ")
            i += 2
            while i < len(text) - 1 and not (text[i] == "*" and text[i + 1] == "/"):
                out.append("\n" if text[i] == "\n" else " ")
                i += 1
            if i < len(text) - 1:
                out.extend("  ")
                i += 2
        else:
            out.append(ch)
            i += 1
    return "".join(out)


def strip_code_comments(text: str, suffix: str) -> str:
    if suffix in {".js", ".ts", ".mjs", ".cjs", ".wxs", ".json", ".scss", ".less", ".wxss"}:
        return strip_json_comments(text)
    if suffix in {".wxml", ".html"}:
        return re.sub(r"<!--.*?-->", lambda m: "\n" * m.group(0).count("\n"), text, flags=re.S)
    return text


def remove_trailing_commas(text: str) -> str:
    return re.sub(r",\s*([}\]])", r"\1", text)


def load_json(path: Path, allow_jsonc: bool = False) -> dict[str, Any]:
    raw = path.read_text(encoding="utf-8-sig")
    if allow_jsonc:
        raw = remove_trailing_commas(strip_json_comments(raw))

    def hook(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        duplicates: list[str] = []
        for key, value in pairs:
            if key in result:
                duplicates.append(key)
            result[key] = value
        if duplicates:
            raise DuplicateKeyError(f"duplicate keys: {', '.join(sorted(set(duplicates)))}")
        return result

    value = json.loads(raw, object_pairs_hook=hook)
    if not isinstance(value, dict):
        raise ValueError("top-level JSON value must be an object")
    return value


def merge_dict(base: dict[str, Any], override: dict[str, Any], prefix: str = "") -> tuple[dict[str, Any], list[str]]:
    merged = dict(base)
    changed: list[str] = []
    for key, value in override.items():
        full = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged_value, nested = merge_dict(merged[key], value, full)
            merged[key] = merged_value
            changed.extend(nested)
        else:
            if key in merged and merged[key] != value:
                changed.append(full)
            elif key not in merged:
                changed.append(full)
            merged[key] = value
    return merged, changed


def walk_limited(root: Path, max_depth: int = 6) -> Iterable[Path]:
    root = root.resolve()
    for current, dirs, files in os.walk(root):
        current_path = Path(current)
        depth = len(current_path.relative_to(root).parts)
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS and (depth < max_depth)]
        for name in files:
            yield current_path / name


def resolve_project(args: argparse.Namespace) -> tuple[Path, Path | None, Path | None, dict[str, Any], dict[str, Any], list[str]]:
    input_path = Path(args.path or ".").expanduser().resolve()
    if args.project:
        project_config_path = Path(args.project).expanduser().resolve()
        if not project_config_path.is_file():
            raise AuditInputError(f"project config not found: {project_config_path}")
    else:
        project_config_path = None
        if input_path.is_file() and input_path.name in {"project.config.json", "project.private.config.json"}:
            project_config_path = input_path.parent / "project.config.json"
        else:
            start = input_path if input_path.is_dir() else input_path.parent
            for parent in [start, *start.parents]:
                candidate = parent / "project.config.json"
                if candidate.is_file():
                    project_config_path = candidate
                    break
            if project_config_path is None and start.is_dir():
                candidates = [p for p in walk_limited(start) if p.name == "project.config.json"]
                if len(candidates) == 1:
                    project_config_path = candidates[0]
                elif len(candidates) > 1:
                    shown = "\n".join(f"- {p}" for p in sorted(candidates)[:20])
                    raise AuditInputError(f"multiple projects found; use --project or --mini-root:\n{shown}")

    shared: dict[str, Any] = {}
    effective: dict[str, Any] = {}
    private_path: Path | None = None
    changed: list[str] = []
    if project_config_path:
        try:
            shared = load_json(project_config_path, allow_jsonc=True)
        except Exception as exc:
            raise AuditInputError(f"cannot parse {project_config_path}: {exc}") from exc
        private_path = project_config_path.parent / "project.private.config.json"
        if private_path.is_file():
            try:
                private = load_json(private_path, allow_jsonc=True)
            except Exception as exc:
                raise AuditInputError(f"cannot parse {private_path}: {exc}") from exc
            effective, changed = merge_dict(shared, private)
        else:
            private_path = None
            effective = shared
        project_root = project_config_path.parent.resolve()
    else:
        project_root = (input_path if input_path.is_dir() else input_path.parent).resolve()

    if args.mini_root:
        mini_root = Path(args.mini_root).expanduser().resolve()
    elif project_config_path:
        mini_value = str(effective.get("miniprogramRoot") or "").strip()
        mini_root = (project_root / mini_value).resolve() if mini_value else project_root
    else:
        start = input_path if input_path.is_dir() else input_path.parent
        if (start / "app.json").is_file():
            mini_root = start.resolve()
        elif input_path.is_file() and input_path.name == "app.json":
            mini_root = input_path.parent.resolve()
        else:
            apps = [p for p in walk_limited(start) if p.name == "app.json"]
            if len(apps) == 1:
                mini_root = apps[0].parent.resolve()
            elif not apps:
                raise AuditInputError("no project.config.json or app.json found; build framework sources and pass --mini-root")
            else:
                shown = "\n".join(f"- {p.parent}" for p in sorted(apps)[:20])
                raise AuditInputError(f"multiple app.json candidates found; use --mini-root:\n{shown}")

    if project_config_path:
        try:
            mini_root.relative_to(project_root)
        except ValueError as exc:
            raise AuditInputError(f"miniprogramRoot escapes project root: {mini_root}") from exc
    return project_root, project_config_path, private_path, shared, effective, changed


def path_matches_ignore(rel: str, patterns: list[str]) -> bool:
    rel = rel.replace(os.sep, "/")
    return any(fnmatch.fnmatch(rel, p) or fnmatch.fnmatch("/" + rel, p) for p in patterns)


def pack_ignore_patterns(config: dict[str, Any]) -> list[str]:
    patterns: list[str] = []
    pack = config.get("packOptions") if isinstance(config.get("packOptions"), dict) else {}
    items = pack.get("ignore") if isinstance(pack, dict) else []
    if isinstance(items, list):
        for item in items:
            if isinstance(item, str):
                patterns.append(item)
            elif isinstance(item, dict) and isinstance(item.get("value"), str):
                value = item["value"]
                if item.get("type") == "folder" and not value.endswith("/**"):
                    value = value.rstrip("/") + "/**"
                patterns.append(value)
    return patterns


def collect_files(project_root: Path, mini_root: Path, config: dict[str, Any]) -> tuple[list[TextFile], list[Path]]:
    ignore_patterns = pack_ignore_patterns(config)
    roots = [(mini_root, "mini")]
    for key in ("cloudfunctionRoot", "cloudbaseRoot"):
        value = config.get(key)
        if isinstance(value, str) and value.strip():
            root = (project_root / value).resolve()
            if root.is_dir() and root != mini_root:
                roots.append((root, "backend"))

    seen: set[Path] = set()
    text_files: list[TextFile] = []
    all_files: list[Path] = []
    for root, scope in roots:
        for current, dirs, files in os.walk(root):
            current_path = Path(current)
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS or d == "miniprogram_npm"]
            for name in files:
                path = (current_path / name).resolve()
                if path in seen or path.is_symlink():
                    continue
                seen.add(path)
                try:
                    rel_project = path.relative_to(project_root).as_posix()
                except ValueError:
                    continue
                try:
                    rel_mini = path.relative_to(mini_root).as_posix()
                except ValueError:
                    rel_mini = None
                package_scope = "backend"
                if rel_mini is not None:
                    package_scope = "ignored" if path_matches_ignore(rel_mini, ignore_patterns) else "shipped"
                all_files.append(path)
                if path.suffix.lower() not in TEXT_EXTENSIONS or path.stat().st_size > 4 * 1024 * 1024:
                    continue
                try:
                    text = path.read_text(encoding="utf-8-sig")
                except (UnicodeDecodeError, OSError):
                    continue
                text_files.append(TextFile(path, rel_project, rel_mini, text, package_scope))
    return text_files, all_files


def normalize_route(route: str) -> str:
    route = route.split("?", 1)[0].split("#", 1)[0].strip()
    route = route.lstrip("/")
    return re.sub(r"/+", "/", route).rstrip("/")


def build_routes(app: dict[str, Any]) -> tuple[list[str], list[str]]:
    routes: list[str] = []
    roots: list[str] = []
    pages = app.get("pages", [])
    if isinstance(pages, list):
        routes.extend(normalize_route(x) for x in pages if isinstance(x, str))
    packages = app.get("subPackages", app.get("subpackages", []))
    if isinstance(packages, list):
        for package in packages:
            if not isinstance(package, dict):
                continue
            root = normalize_route(str(package.get("root") or ""))
            if root:
                roots.append(root)
            sub_pages = package.get("pages", [])
            if isinstance(sub_pages, list):
                routes.extend(normalize_route(f"{root}/{p}") for p in sub_pages if isinstance(p, str))
    return routes, roots


def create_context(args: argparse.Namespace, findings: list[Finding]) -> ProjectContext:
    project_root, project_config_path, private_path, shared, effective, overrides = resolve_project(args)
    mini_root_value = Path(args.mini_root).expanduser().resolve() if args.mini_root else None
    if mini_root_value:
        mini_root = mini_root_value
    elif project_config_path:
        value = str(effective.get("miniprogramRoot") or "").strip()
        mini_root = (project_root / value).resolve() if value else project_root
    else:
        input_path = Path(args.path or ".").expanduser().resolve()
        mini_root = input_path.parent if input_path.is_file() and input_path.name == "app.json" else input_path
        if not (mini_root / "app.json").is_file():
            apps = [p for p in walk_limited(mini_root) if p.name == "app.json"]
            if len(apps) == 1:
                mini_root = apps[0].parent

    if project_config_path and not mini_root.is_relative_to(project_root):
        add_finding(
            findings,
            "CFG002",
            "static",
            "high",
            f"miniprogramRoot 逃逸项目根目录：{mini_root}",
            "将 miniprogramRoot 改为项目内真实原生编译产物目录。",
            [Evidence(project_config_path.relative_to(project_root).as_posix())],
            [SOURCE_URLS["project"]],
        )
        raise AuditInputError(f"miniprogramRoot escapes project root: {mini_root}")

    app_path = mini_root / "app.json"
    if not mini_root.is_dir():
        add_finding(findings, "CFG002", "static", "high", f"miniprogramRoot 不存在或不是目录：{mini_root}", "修复 project.config.json.miniprogramRoot，或用 --mini-root 指定真实原生编译产物。", [Evidence(project_config_path.relative_to(project_root).as_posix() if project_config_path else str(mini_root))], [SOURCE_URLS["project"]])
        raise AuditInputError(f"invalid miniprogramRoot: {mini_root}")
    if not app_path.is_file():
        add_finding(findings, "CFG001", "static", "high", f"未在 {mini_root} 找到 app.json。", "确认开发者工具实际打开的原生编译产物，并用 --mini-root 指定。", [Evidence(str(app_path))], [SOURCE_URLS["app"]])
        raise AuditInputError(f"invalid Mini Program root: {mini_root}")
    try:
        app = load_json(app_path)
    except Exception as exc:
        add_finding(findings, "CFG003", "static", "high", f"app.json 无法解析：{exc}", "修复 JSON 语法或重复键后重新扫描。", [Evidence(str(app_path))], [SOURCE_URLS["app"]])
        raise AuditInputError(f"cannot parse app.json: {exc}") from exc
    routes, sub_roots = build_routes(app)
    tab_routes: set[str] = set()
    tabbar = app.get("tabBar")
    if isinstance(tabbar, dict) and isinstance(tabbar.get("list"), list):
        for item in tabbar["list"]:
            if isinstance(item, dict) and isinstance(item.get("pagePath"), str):
                tab_routes.add(normalize_route(item["pagePath"]))
    files, all_files = collect_files(project_root, mini_root, effective)
    return ProjectContext(project_root, mini_root, project_config_path, private_path, effective, shared, overrides, app_path, app, routes, tab_routes, sub_roots, files, all_files)


def add_finding(
    findings: list[Finding],
    rule_id: str,
    determination: str,
    confidence: str,
    message: str,
    remediation: str,
    evidence: list[Evidence] | None = None,
    sources: list[str] | None = None,
    severity: str | None = None,
) -> None:
    meta = RULES[rule_id]
    finding = Finding(
        id=rule_id,
        severity=severity or meta["severity"],
        determination=determination,
        confidence=confidence,
        title=meta["title"],
        message=message,
        remediation=remediation,
        evidence=evidence or [],
        sources=sources or [],
    )
    finding.finalize()
    findings.append(finding)


def rel_evidence(ctx: ProjectContext, tf: TextFile, index: int | None = None, snippet: str | None = None) -> Evidence:
    line = column = None
    if index is not None:
        line, column = line_col(tf.text, index)
    return Evidence(tf.rel_project, line, column, clean_snippet(snippet or ""))


def exact_or_case_mismatch(path: Path) -> tuple[bool, Path | None]:
    if path.exists():
        return True, None
    parent = path.parent
    if not parent.is_dir():
        return False, None
    lower = path.name.lower()
    for child in parent.iterdir():
        if child.name.lower() == lower:
            return False, child
    return False, None


def audit_config_and_routes(ctx: ProjectContext, args: argparse.Namespace, findings: list[Finding], inventories: dict[str, Any]) -> None:
    config = ctx.project_config
    if ctx.project_config_path:
        compile_type = config.get("compileType")
        if compile_type and compile_type != "miniprogram":
            add_finding(findings, "CFG004", "static", "high", f"compileType={compile_type!r}，不是 miniprogram。", "对插件、小游戏或其他产物使用对应审计流程。", [Evidence(ctx.project_config_path.relative_to(ctx.project_root).as_posix())], [SOURCE_URLS["project"]])
        appid = str(config.get("appid") or "")
        if args.profile == "release" and (not appid or appid == "touristappid" or re.search(r"your|sample|testappid", appid, re.I)):
            add_finding(findings, "CFG005", "static", "high", f"发布配置中的 appid 无效或为占位值：{appid or '<empty>'}。", "设置真实 AppID；AppID 本身不是秘密。", [Evidence(ctx.project_config_path.relative_to(ctx.project_root).as_posix())], [SOURCE_URLS["project"]])
        important = [x for x in ctx.private_overrides if x.split(".")[0] in {"appid", "miniprogramRoot", "libVersion", "compileType", "setting"}]
        if important:
            add_finding(findings, "CFG006", "static", "high", "project.private.config.json 覆盖了重要字段：" + ", ".join(important), "确认本地有效配置与 CI/审核构建一致，并避免只在私有配置中保存必需发布设置。", [Evidence(ctx.private_config_path.relative_to(ctx.project_root).as_posix() if ctx.private_config_path else "project.private.config.json")], [SOURCE_URLS["project"]])
        setting = config.get("setting") if isinstance(config.get("setting"), dict) else {}
        if setting.get("urlCheck") is False:
            add_finding(findings, "CFG007", "static", "high", "当前有效配置 setting.urlCheck=false，开发工具会跳过域名、TLS 和证书校验。", "发布前开启校验并在真机验证所有域名、端口、证书链和 TLS。", [Evidence(ctx.project_config_path.relative_to(ctx.project_root).as_posix())], [SOURCE_URLS["network"]])

    app = ctx.app_config
    if app.get("debug") is True:
        add_finding(findings, "CFG008", "static", "high", "app.json 中 debug=true。", "发布构建关闭 debug，并检查日志是否包含敏感信息。", [Evidence(ctx.app_json_path.relative_to(ctx.project_root).as_posix())], [SOURCE_URLS["app"]])
    pages = app.get("pages")
    if not isinstance(pages, list) or not pages or any(not isinstance(x, str) or not x.strip() for x in pages):
        add_finding(findings, "CFG009", "static", "high", "app.json.pages 必须是非空字符串数组。", "修复页面注册列表。", [Evidence(ctx.app_json_path.relative_to(ctx.project_root).as_posix())], [SOURCE_URLS["app"]])

    required = app.get("requiredPrivateInfos", [])
    if required is None:
        required = []
    if not isinstance(required, list):
        add_finding(findings, "CFG010", "static", "high", "requiredPrivateInfos 不是数组。", "按官方 app.json 规范配置。", [Evidence(ctx.app_json_path.relative_to(ctx.project_root).as_posix())], [SOURCE_URLS["privacy-map"]])
        required = []
    else:
        values = [x.strip() for x in required if isinstance(x, str) and x.strip()]
        invalid_entries = [
            f"{type(item).__name__}:{item!r}"
            for item in required
            if not isinstance(item, str) or not item.strip()
        ]
        invalid = sorted(set(values) - REQUIRED_PRIVATE_INFO_APIS) + invalid_entries
        duplicates = sorted(k for k, count in Counter(values).items() if count > 1)
        if invalid or duplicates:
            add_finding(findings, "CFG010", "static", "high", f"requiredPrivateInfos 无效值={invalid}，重复值={duplicates}。", "仅按当前官方支持的地理位置相关接口声明，并与源码调用一致。", [Evidence(ctx.app_json_path.relative_to(ctx.project_root).as_posix())], [SOURCE_URLS["privacy-map"]])

    normalized = [normalize_route(x) for x in ctx.routes]
    duplicate_routes = sorted(k for k, count in Counter(r.lower() for r in normalized).items() if count > 1)
    if duplicate_routes:
        add_finding(findings, "RTE001", "static", "high", "路由重复或大小写冲突：" + ", ".join(duplicate_routes), "为每个页面使用唯一、大小写一致的路由。", [Evidence(ctx.app_json_path.relative_to(ctx.project_root).as_posix())], [SOURCE_URLS["app"]])

    route_set = set(normalized)
    inventories["routes"] = sorted(route_set)
    for route in sorted(route_set):
        base = ctx.mini_root / route
        script_candidates = [base.with_suffix(".js"), base.with_suffix(".ts")]
        template = base.with_suffix(".wxml")
        if not any(p.is_file() for p in script_candidates) or not template.is_file():
            missing = []
            if not any(p.is_file() for p in script_candidates):
                missing.append(".js/.ts")
            if not template.is_file():
                missing.append(".wxml")
            add_finding(findings, "RTE003", "static", "high", f"页面 {route} 缺少 {', '.join(missing)} 编译单元。", "补齐原生编译产物或修复 app.json 路由。", [Evidence(route)], [SOURCE_URLS["app"]])

    tabbar = app.get("tabBar")
    if isinstance(tabbar, dict):
        items = tabbar.get("list")
        if not isinstance(items, list) or not (2 <= len(items) <= 5):
            add_finding(findings, "RTE004", "static", "high", "tabBar.list 数量必须为 2–5。", "修复 tabBar 页面数量。", [Evidence(ctx.app_json_path.relative_to(ctx.project_root).as_posix())], [SOURCE_URLS["app"]])
        elif isinstance(items, list):
            for item in items:
                if not isinstance(item, dict):
                    continue
                route = normalize_route(str(item.get("pagePath") or ""))
                if route not in route_set:
                    add_finding(findings, "RTE004", "static", "high", f"tabBar pagePath 未注册：{route}", "将 tabBar 页面加入 pages，或修正 pagePath。", [Evidence(ctx.app_json_path.relative_to(ctx.project_root).as_posix())], [SOURCE_URLS["app"]])
                for key in ("iconPath", "selectedIconPath"):
                    value = item.get(key)
                    if isinstance(value, str) and value:
                        target = ctx.mini_root / value
                        exists, mismatch = exact_or_case_mismatch(target)
                        if not exists:
                            rule = "RTE012" if mismatch else "RTE006"
                            msg = f"tabBar {key} 引用大小写不一致：{value} -> {mismatch.name}" if mismatch else f"tabBar {key} 文件不存在：{value}"
                            add_finding(findings, rule, "static", "high", msg, "修正资源路径并在区分大小写的环境验证。", [Evidence(ctx.app_json_path.relative_to(ctx.project_root).as_posix())], [SOURCE_URLS["app"]])

    entry = app.get("entryPagePath")
    if isinstance(entry, str) and normalize_route(entry) not in route_set:
        add_finding(findings, "RTE005", "static", "high", f"entryPagePath 未注册：{entry}", "修正入口路由。", [Evidence(ctx.app_json_path.relative_to(ctx.project_root).as_posix())], [SOURCE_URLS["app"]])
    preload = app.get("preloadRule")
    if isinstance(preload, dict):
        for source_route, rule in preload.items():
            if normalize_route(source_route) not in route_set:
                add_finding(findings, "RTE005", "static", "high", f"preloadRule 来源页面不存在：{source_route}", "修正预下载规则。", [Evidence(ctx.app_json_path.relative_to(ctx.project_root).as_posix())], [SOURCE_URLS["app"]])
            if isinstance(rule, dict) and isinstance(rule.get("packages"), list):
                valid_roots = set(ctx.subpackage_roots) | {"__APP__"}
                invalid = [x for x in rule["packages"] if x not in valid_roots]
                if invalid:
                    add_finding(findings, "RTE005", "static", "high", f"preloadRule 包不存在：{invalid}", "使用现有分包 root 或 __APP__。", [Evidence(ctx.app_json_path.relative_to(ctx.project_root).as_posix())], [SOURCE_URLS["app"]])

    # Local component references in app/page JSON.
    json_paths = [ctx.app_json_path]
    for route in route_set:
        page_json = (ctx.mini_root / route).with_suffix(".json")
        if page_json.is_file():
            json_paths.append(page_json)
    for json_path in json_paths:
        try:
            cfg = app if json_path == ctx.app_json_path else load_json(json_path)
        except Exception as exc:
            add_finding(findings, "CFG003", "static", "high", f"{json_path.name} 无法解析：{exc}", "修复 JSON。", [Evidence(json_path.relative_to(ctx.project_root).as_posix())], [SOURCE_URLS["app"]])
            continue
        components = cfg.get("usingComponents")
        if not isinstance(components, dict):
            continue
        base_dir = json_path.parent
        for name, value in components.items():
            if not isinstance(value, str) or value.startswith(("plugin://", "ext://")):
                continue
            if not value.startswith((".", "/")):
                continue
            target_base = (ctx.mini_root / value.lstrip("/")) if value.startswith("/") else (base_dir / value)
            target_base = target_base.resolve()
            candidates = [target_base.with_suffix(ext) for ext in (".js", ".ts", ".json", ".wxml")]
            if not any(p.exists() for p in candidates):
                mismatch = next((m for p in candidates for exists, m in [exact_or_case_mismatch(p)] if m), None)
                rule = "RTE012" if mismatch else "RTE006"
                msg = f"组件 {name} 路径大小写不一致：{value}" if mismatch else f"组件 {name} 本地路径不存在：{value}"
                add_finding(findings, rule, "static", "high", msg, "修正 usingComponents 路径。", [Evidence(json_path.relative_to(ctx.project_root).as_posix())], [SOURCE_URLS["app"]])


def iter_api_calls(tf: TextFile) -> Iterable[tuple[str, int]]:
    cleaned = strip_code_comments(tf.text, tf.path.suffix.lower())
    pattern = re.compile(r"\bwx\s*(?:\?\.|\.)\s*([A-Za-z_$][\w$]*)\s*\(")
    for match in pattern.finditer(cleaned):
        yield match.group(1), match.start()


def all_open_types(tf: TextFile) -> Iterable[tuple[str, int]]:
    if tf.path.suffix.lower() != ".wxml":
        return []
    cleaned = strip_code_comments(tf.text, ".wxml")
    return [(m.group(1), m.start()) for m in re.finditer(r"\bopen-type\s*=\s*['\"]([^'\"]+)['\"]", cleaned, re.I)]


def repository_security_files(ctx: ProjectContext) -> tuple[list[Path], list[TextFile]]:
    """Collect repository files for secret scanning without widening runtime rules."""

    binary_files: list[Path] = []
    text_files: list[TextFile] = []
    seen = {tf.path.resolve() for tf in ctx.files}
    for current, dirs, files in os.walk(ctx.project_root):
        dirs[:] = [directory for directory in dirs if directory not in SECRET_SCAN_SKIP_DIRS]
        current_path = Path(current)
        for name in files:
            path = (current_path / name).resolve()
            if path.is_symlink() or not path.is_relative_to(ctx.project_root):
                continue
            suffix = path.suffix.lower()
            if suffix in BINARY_SECRET_EXTENSIONS:
                binary_files.append(path)
            if path in seen:
                continue
            is_env = name == ".env" or name.startswith(".env.")
            if suffix not in TEXT_EXTENSIONS and not is_env:
                continue
            try:
                if path.stat().st_size > 4 * 1024 * 1024:
                    continue
                text = path.read_text(encoding="utf-8-sig")
                rel = path.relative_to(ctx.project_root).as_posix()
            except (OSError, UnicodeDecodeError, ValueError):
                continue
            text_files.append(TextFile(path, rel, None, text, "repository"))
    return binary_files, text_files


def audit_secrets(ctx: ProjectContext, findings: list[Finding]) -> None:
    repository_binaries, repository_text = repository_security_files(ctx)
    binary_candidates = {path.resolve() for path in ctx.all_files if path.suffix.lower() in BINARY_SECRET_EXTENSIONS}
    binary_candidates.update(path.resolve() for path in repository_binaries)
    for path in sorted(binary_candidates):
        if path.suffix.lower() in BINARY_SECRET_EXTENSIONS:
            try:
                rel = path.relative_to(ctx.project_root).as_posix()
            except ValueError:
                rel = str(path)
            add_finding(findings, "SEC001", "static", "high", f"仓库包含敏感密钥文件：{rel}", "立即撤销/轮换密钥，从仓库历史移除，并存入 CI/密钥管理系统。", [Evidence(rel)], [SOURCE_URLS["security"]])

    assignment = re.compile(
        r"(?i)\b(app[_-]?secret|session[_-]?key|api[_-]?v?3?[_-]?key|merchant[_-]?key|private[_-]?key|password|access[_-]?token|bearer[_-]?token)\b\s*[:=]\s*['\"]([^'\"\r\n]{12,})['\"]"
    )
    pem = re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----")
    bearer = re.compile(r"(?i)authorization\s*[:=]\s*['\"]Bearer\s+([A-Za-z0-9._~+/=-]{16,})")
    dynamic_exec = re.compile(r"\b(?:eval\s*\(|new\s+Function\s*\(|set(?:Timeout|Interval)\s*\(\s*['\"])")
    sensitive_log = re.compile(r"(?is)console\.(?:log|info|warn|error)\s*\([^\n;]{0,300}(?:session_key|appsecret|password|token|身份证|手机号|paySign)")
    pay_secret = re.compile(r"(?i)\b(?:paySign|apiV3Key|merchantPrivateKey|mchKey)\b\s*[:=]\s*['\"]([^'\"]{12,})['\"]")
    security_text_files = list(ctx.files) + repository_text
    for tf in security_text_files:
        code = strip_code_comments(tf.text, tf.path.suffix.lower())
        if pem.search(code):
            m = pem.search(code)
            add_finding(findings, "SEC001", "static", "high", "源码中包含私钥 PEM。", "立即轮换并移出客户端、仓库和日志。", [rel_evidence(ctx, tf, m.start(), m.group(0))], [SOURCE_URLS["security"]])
        for match in assignment.finditer(code):
            name, value = match.group(1), match.group(2)
            if re.search(r"your|example|sample|placeholder|xxxx|test", value, re.I):
                continue
            unique_ratio = len(set(value)) / max(1, len(value))
            if len(value) < 20 or unique_ratio < 0.25:
                continue
            rule = "SEC001" if re.search(r"secret|private|api[_-]?v?3|merchant", name, re.I) else "SEC002"
            severity = "P0" if rule == "SEC001" else "P1"
            add_finding(findings, rule, "static", "high", f"疑似硬编码 {name}：{redact(value)}", "撤销/轮换并移至服务端密钥管理；客户端只保存短期业务会话。", [rel_evidence(ctx, tf, match.start(), f"{name}={redact(value)}")], [SOURCE_URLS["security"]], severity=severity)
        for match in bearer.finditer(code):
            value = match.group(1)
            add_finding(findings, "SEC002", "static", "high", f"疑似硬编码 Bearer token：{redact(value)}", "撤销并改为运行时短期会话。", [rel_evidence(ctx, tf, match.start(), redact(value))], [SOURCE_URLS["security"]])
        for match in dynamic_exec.finditer(code):
            add_finding(findings, "SEC005", "static", "high", f"发现动态代码执行：{match.group(0)}", "删除 eval/new Function/字符串 timer；使用静态模块和显式函数。", [rel_evidence(ctx, tf, match.start(), match.group(0))], [SOURCE_URLS["security"]])
        for match in sensitive_log.finditer(code):
            add_finding(findings, "SEC008", "heuristic", "medium", "日志调用附近出现敏感字段名。", "删除敏感日志或做最小化、脱敏和访问控制。", [rel_evidence(ctx, tf, match.start(), match.group(0))], [SOURCE_URLS["security"]])
        for match in pay_secret.finditer(code):
            add_finding(findings, "PAY002", "static", "high", f"客户端疑似包含支付签名秘密：{redact(match.group(1))}", "立即轮换；支付下单和签名必须在可信服务端完成。", [rel_evidence(ctx, tf, match.start(), redact(match.group(1)))], [SOURCE_URLS["payment"]])


def audit_privacy_and_capabilities(ctx: ProjectContext, args: argparse.Namespace, findings: list[Finding], inventories: dict[str, Any]) -> None:
    used: dict[str, list[Evidence]] = defaultdict(list)
    open_types: dict[str, list[Evidence]] = defaultdict(list)
    custom_privacy = False
    webviews: list[Evidence] = []
    for tf in ctx.files:
        if tf.rel_mini is None or tf.package_scope != "shipped":
            continue
        for api, index in iter_api_calls(tf):
            if api in PRIVACY_APIS or api in PAYMENT_APIS or api in {"requestSubscribeMessage", "getPrivacySetting", "onNeedPrivacyAuthorization", "requirePrivacyAuthorize", "openPrivacyContract"}:
                used[api].append(rel_evidence(ctx, tf, index, f"wx.{api}(..."))
            if api in {"getPrivacySetting", "onNeedPrivacyAuthorization", "requirePrivacyAuthorize", "openPrivacyContract"}:
                custom_privacy = True
        for value, index in all_open_types(tf):
            open_types[value].append(rel_evidence(ctx, tf, index, f"open-type={value}"))
            if value == "agreePrivacyAuthorization" or "agreePrivacyAuthorization" in value:
                custom_privacy = True
        if tf.path.suffix.lower() == ".wxml":
            cleaned = strip_code_comments(tf.text, ".wxml")
            for match in re.finditer(r"<web-view\b", cleaned, re.I):
                webviews.append(rel_evidence(ctx, tf, match.start(), "<web-view>"))
            for match in re.finditer(r"<input\b[^>]*\btype\s*=\s*['\"]nickname['\"]", cleaned, re.I):
                used["input:nickname"].append(rel_evidence(ctx, tf, match.start(), match.group(0)))

    privacy_inventory = []
    for api in sorted(used):
        if api in PRIVACY_APIS:
            privacy_inventory.append({"api": api, "information": PRIVACY_APIS[api], "locations": [asdict(x) for x in used[api]]})
    for name in sorted(open_types):
        if name in PHONE_OPEN_TYPES or name in {"chooseAvatar", "getUserInfo"}:
            privacy_inventory.append({"component": name, "locations": [asdict(x) for x in open_types[name]]})
    inventories["privacy"] = privacy_inventory
    if privacy_inventory:
        add_finding(findings, "PRI001", "static", "high", f"发现 {len(privacy_inventory)} 类隐私/用户资料能力；详见 inventory。", "逐项与 MP 后台隐私保护指引、用途、保留期、拒绝降级和删除方式对账。", [], [SOURCE_URLS["privacy-map"]])

    required = ctx.app_config.get("requiredPrivateInfos", [])
    required_set = set(x.strip() for x in required if isinstance(x, str) and x.strip()) if isinstance(required, list) else set()
    used_required = set(used) & REQUIRED_PRIVATE_INFO_APIS
    for api in sorted(used_required - required_set):
        add_finding(findings, "PRI002", "static", "high", f"使用 wx.{api}，但 app.json.requiredPrivateInfos 未声明。", "按当前官方映射声明，并在 MP 后台隐私保护指引说明真实用途。", used[api][:5], [SOURCE_URLS["privacy-map"]])
    for api in sorted(required_set - used_required):
        add_finding(findings, "PRI003", "heuristic", "medium", f"requiredPrivateInfos 声明 {api}，但可见源码未发现调用。", "确认是否由插件/封装动态调用；若不用则删除多余声明。", [Evidence(ctx.app_json_path.relative_to(ctx.project_root).as_posix())], [SOURCE_URLS["privacy-map"]])

    if used_required:
        permission = ctx.app_config.get("permission") if isinstance(ctx.app_config.get("permission"), dict) else {}
        location = permission.get("scope.userLocation") if isinstance(permission, dict) else None
        desc = location.get("desc") if isinstance(location, dict) else None
        if not isinstance(desc, str) or not desc.strip():
            ev = next(iter(used[sorted(used_required)[0]]), Evidence(ctx.app_json_path.relative_to(ctx.project_root).as_posix()))
            add_finding(findings, "PRI004", "static", "high", "使用位置能力但 permission.scope.userLocation.desc 缺失或为空。", "写明具体功能用途，避免笼统描述。", [ev], [SOURCE_URLS["app"], SOURCE_URLS["privacy"]])

    privacy_names = "|".join(re.escape(x) for x in PRIVACY_APIS)
    for tf in ctx.files:
        if tf.rel_mini is None or tf.package_scope != "shipped" or tf.path.suffix.lower() not in {".js", ".ts"}:
            continue
        code = strip_code_comments(tf.text, tf.path.suffix.lower())
        for _name, body, body_start in iter_method_bodies(code, {"onLaunch", "onShow", "onLoad"}):
            hit = re.search(rf"\bwx\s*(?:\?\.|\.)\s*(?:{privacy_names})\s*\(", body)
            if hit:
                index = body_start + hit.start()
                add_finding(findings, "PRI005", "heuristic", "medium", "在 onLaunch/onShow/onLoad 附近直接调用隐私能力，可能早于用户触发。", "把调用移动到用户明确操作后的业务路径，并提供拒绝降级。", [rel_evidence(ctx, tf, index, hit.group(0))], [SOURCE_URLS["privacy"]])
        denial = re.compile(r"(?is)(?:deny|reject|fail|拒绝).{0,300}(?:exitMiniProgram|navigateBack\s*\(\s*\{?\s*delta\s*:\s*\d{2,}|reLaunch\s*\()").search(code)
        if denial:
            add_finding(findings, "PRI006", "heuristic", "medium", "权限拒绝分支疑似退出或重置整个小程序。", "仅降级依赖该权限的功能，保留无关服务。", [rel_evidence(ctx, tf, denial.start(), denial.group(0))], [SOURCE_URLS["operations"]])
        for legacy in re.finditer(r"\bwx\s*(?:\?\.|\.)\s*(getUserProfile|getUserInfo)\s*\(", code):
            add_finding(findings, "PRI008", "heuristic", "medium", f"使用历史用户资料接口 wx.{legacy.group(1)}。", "评估迁移到 chooseAvatar 与 input type=nickname，并重新核验基础库行为。", [rel_evidence(ctx, tf, legacy.start(), legacy.group(0))], ["https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/userProfile.html"])

    if privacy_inventory and not custom_privacy:
        add_finding(findings, "PRI010", "static", "high", "未发现自定义隐私同意流程；运行时可能依赖微信官方弹窗兜底。", "这不等于违规；评估按业务时机接入 getPrivacySetting/onNeedPrivacyAuthorization 以改善说明和降级体验。", [], [SOURCE_URLS["privacy"]])

    phone_evidence = []
    for name in PHONE_OPEN_TYPES:
        phone_evidence.extend(open_types.get(name, []))
    if args.subject in {"ordinary-personal", "upgraded-personal"} and phone_evidence:
        add_finding(findings, "CAP001", "static", "high", "个人主体代码使用手机号快速/实时验证组件；官方当前仅向已认证非个人主体开放。", "删除该依赖，使用非强制手工输入+自有验证，或迁移至符合条件的非个人主体。", phone_evidence[:10], [SOURCE_URLS["phone"]])
    if args.subject in {"ordinary-personal", "upgraded-personal"} and webviews:
        add_finding(findings, "CAP002", "static", "high", "个人主体代码包含 web-view；官方组件页明确个人类型暂不支持。", "使用原生页面实现，或迁移至当前明确支持该能力的主体并配置业务域名。", webviews[:10], [SOURCE_URLS["webview"]])
    inventories["webviews"] = [asdict(x) for x in webviews]


def audit_network(ctx: ProjectContext, args: argparse.Namespace, findings: list[Finding], inventories: dict[str, Any]) -> None:
    url_re = re.compile(r"\b(?:https?|wss?|ws)://[^\s'\"<>)}\]]+")
    sensitive_names = {"token", "access_token", "session", "session_key", "password", "secret", "openid", "phone", "mobile", "idcard", "身份证", "手机号", "paysign"}
    domains: dict[str, dict[str, Any]] = {}
    for tf in ctx.files:
        if tf.rel_mini is None or tf.package_scope != "shipped":
            continue
        code = strip_code_comments(tf.text, tf.path.suffix.lower())
        for match in url_re.finditer(code):
            raw = match.group(0).rstrip(".,;:")
            parsed = urlparse(raw)
            host = (parsed.hostname or "").lower()
            key = f"{parsed.scheme}://{parsed.netloc}"
            domains.setdefault(key, {"url": key, "locations": []})["locations"].append(asdict(rel_evidence(ctx, tf, match.start(), raw)))
            evidence = [rel_evidence(ctx, tf, match.start(), raw)]
            if parsed.scheme in {"http", "ws"}:
                add_finding(findings, "NET001", "static", "high", f"使用不安全协议：{raw}", "生产请求使用 HTTPS/WSS，并配置合法域名和证书。", evidence, [SOURCE_URLS["network"]])
            if host == "api.weixin.qq.com":
                add_finding(findings, "SEC004", "static", "high", "小程序客户端直接请求 api.weixin.qq.com。", "将 AppSecret/access_token 调用移至服务端。", evidence, [SOURCE_URLS["network"]])
            is_ip = False
            ip_obj = None
            try:
                ip_obj = ipaddress.ip_address(host.strip("[]"))
                is_ip = True
            except ValueError:
                pass
            if host == "localhost" or (is_ip and (ip_obj.is_loopback or ip_obj.is_unspecified)):
                add_finding(findings, "NET002", "static", "high", f"生产代码使用本机地址：{raw}", "改用已配置、已备案的 HTTPS/WSS 域名。", evidence, [SOURCE_URLS["network"]])
            elif is_ip and ip_obj.is_private:
                add_finding(findings, "NET003", "manual", "medium", f"使用局域网 IP：{raw}", "确认确属同局域网硬件场景、目标基础库支持，并在真机测试；不要用于公网后端。", evidence, [SOURCE_URLS["network"]])
            elif is_ip:
                add_finding(findings, "NET002", "static", "high", f"生产代码使用公网裸 IP：{raw}", "小程序服务器域名不能使用公网 IP；改用备案域名。", evidence, [SOURCE_URLS["network"]])
            if args.profile == "release" and re.search(r"(^|\.)(example|test|testing|staging|mock|dev|localhost)(\.|$)", host):
                add_finding(findings, "NET004", "static", "high", f"发布代码包含示例/测试域名：{raw}", "替换为生产域名并检查环境构建。", evidence, [SOURCE_URLS["network"]])
            query_names = {k.lower() for k, _ in parse_qsl(parsed.query, keep_blank_values=True)}
            if query_names & sensitive_names:
                add_finding(findings, "SEC003", "static", "high", f"URL 查询参数含敏感字段：{sorted(query_names & sensitive_names)}", "敏感数据放在受保护请求体/头部并最小化；分享链接不得携带会话或个人信息。", evidence, [SOURCE_URLS["security"]])
    inventories["domains"] = sorted(domains.values(), key=lambda x: x["url"])

    for tf in ctx.files:
        if tf.rel_mini is None or tf.package_scope != "shipped" or tf.path.suffix.lower() not in {".js", ".ts"}:
            continue
        code = strip_code_comments(tf.text, tf.path.suffix.lower())
        for match in re.finditer(r"\btimeout\s*:\s*(\d{5,})", code):
            value = int(match.group(1))
            if value >= 60000:
                add_finding(findings, "NET007", "heuristic", "medium", f"请求显式 timeout={value}ms，可能让用户长时间等待。", "按业务设置较短可恢复超时，并设计幂等重试。", [rel_evidence(ctx, tf, match.start(), match.group(0))], [SOURCE_URLS["network"]])


def audit_navigation_and_review(ctx: ProjectContext, args: argparse.Namespace, findings: list[Finding], inventories: dict[str, Any]) -> None:
    route_set = set(ctx.routes)
    nav_pattern = re.compile(r"\bwx\s*\.\s*(navigateTo|redirectTo|switchTab|reLaunch)\s*\(\s*\{.{0,800}?\burl\s*:\s*['\"]([^'\"]+)['\"]", re.S)
    visible_terms = re.compile(r"(?i)(测试版|仅供测试|demo\b|mock\b|todo\b|开发中|敬请期待|占位页面)")
    audit_identifier = re.compile(r"(?i)\b(?:isAudit|auditMode|reviewMode|reviewSwitch|audit_switch)\b|审核开关|过审开关|审核模式")
    core_switch = re.compile(r"(?i)(?:wx:if|hidden\s*=|requestPayment|web-view|navigateTo|redirectTo|category|支付|商品|服务|内容)")
    for tf in ctx.files:
        if tf.rel_mini is None or tf.package_scope != "shipped":
            continue
        code = strip_code_comments(tf.text, tf.path.suffix.lower())
        for match in nav_pattern.finditer(code):
            api, raw = match.group(1), match.group(2)
            if "{{" in raw or "${" in raw:
                continue
            route = normalize_route(raw)
            if route not in route_set:
                add_finding(findings, "RTE007", "static", "high", f"wx.{api} 指向未注册页面：{raw}", "修正路由或注册页面。", [rel_evidence(ctx, tf, match.start(), match.group(0))], [SOURCE_URLS["app"]])
            elif api in {"navigateTo", "redirectTo"} and route in ctx.tab_routes:
                add_finding(findings, "RTE008", "static", "high", f"wx.{api} 打开 tabBar 页面 {route}。", "使用 wx.switchTab。", [rel_evidence(ctx, tf, match.start(), match.group(0))], [SOURCE_URLS["app"]])
            elif api == "switchTab" and route not in ctx.tab_routes:
                add_finding(findings, "RTE008", "static", "high", f"wx.switchTab 打开非 tabBar 页面 {route}。", "使用 navigateTo/redirectTo 或加入 tabBar。", [rel_evidence(ctx, tf, match.start(), match.group(0))], [SOURCE_URLS["app"]])
        if tf.path.suffix.lower() in {".wxml", ".json"}:
            for match in visible_terms.finditer(code):
                severity = "P1" if args.profile == "release" else "P2"
                add_finding(findings, "REV001", "heuristic", "medium", f"用户可见内容疑似保留测试态词语：{match.group(0)}", "确认是否真实展示；发布版删除占位和测试内容。", [rel_evidence(ctx, tf, match.start(), match.group(0))], [SOURCE_URLS["reject"]], severity=severity)
        if audit_identifier.search(code) and core_switch.search(code):
            match = audit_identifier.search(code)
            add_finding(findings, "REV004", "heuristic", "medium", "发现审核模式标识与隐藏/替换核心功能的组合迹象。", "人工审查条件分支；删除针对审核账号、IP、地域、时间或版本的差异化核心业务。", [rel_evidence(ctx, tf, match.start(), match.group(0))], [SOURCE_URLS["operations"]])
        if tf.path.suffix.lower() == ".wxml":
            cleaned = strip_code_comments(tf.text, ".wxml")
            if re.search(r"<button\b[^>]*>\s*(?:按钮|点击|测试)\s*</button>", cleaned, re.I):
                add_finding(findings, "REV002", "heuristic", "medium", "页面包含疑似占位按钮。", "实现真实业务行为、空态和错误态。", [Evidence(tf.rel_project)], [SOURCE_URLS["reject"]])


def audit_performance(ctx: ProjectContext, findings: list[Finding], inventories: dict[str, Any]) -> None:
    ignore_patterns = pack_ignore_patterns(ctx.project_config)
    shipped = []
    for path in ctx.all_files:
        if not path.is_file() or not path.is_relative_to(ctx.mini_root):
            continue
        rel = path.relative_to(ctx.mini_root).as_posix()
        if path_matches_ignore(rel, ignore_patterns):
            continue
        shipped.append(path)
    sub_roots = [r.rstrip("/") + "/" for r in ctx.subpackage_roots]
    sizes: dict[str, int] = defaultdict(int)
    largest: list[tuple[int, str]] = []
    for path in shipped:
        rel = path.relative_to(ctx.mini_root).as_posix()
        size = path.stat().st_size
        scope = "main"
        for root in sub_roots:
            if rel.startswith(root):
                scope = root.rstrip("/")
                break
        sizes[scope] += size
        largest.append((size, rel))
        if path.suffix.lower() in RESOURCE_EXTENSIONS and size >= 500 * 1024:
            add_finding(findings, "PERF002", "static", "high", f"大资源 {rel} 为 {size / 1024:.1f} KiB。", "压缩、按显示尺寸提供或移至合规 CDN/对象存储。", [Evidence(rel)], [SOURCE_URLS["performance"]])
    for scope, size in sorted(sizes.items()):
        if size >= int(1.8 * 1024 * 1024):
            add_finding(findings, "PERF001", "static", "high", f"{scope} 原始文件估算 {size / 1024 / 1024:.2f} MiB，接近/超过单包 2 MiB。", "这是原始文件估算而非最终编译包；使用开发者工具确认，并分包、按需注入、清理资源。", [Evidence(scope)], [SOURCE_URLS["performance"]])
    total = sum(sizes.values())
    if not ctx.subpackage_roots and total >= int(1.5 * 1024 * 1024):
        add_finding(findings, "PERF004", "heuristic", "medium", f"项目原始体积 {total / 1024 / 1024:.2f} MiB 且未使用分包。", "按使用频率拆分低频页面和组件。", [Evidence(ctx.app_json_path.relative_to(ctx.project_root).as_posix())], [SOURCE_URLS["performance"]])
    globals_ = ctx.app_config.get("usingComponents") if isinstance(ctx.app_config.get("usingComponents"), dict) else {}
    plugins = ctx.app_config.get("plugins") if isinstance(ctx.app_config.get("plugins"), dict) else {}
    if len(globals_) + len(plugins) >= 12:
        add_finding(findings, "PERF005", "heuristic", "medium", f"全局组件/插件共 {len(globals_) + len(plugins)} 个。", "把低频组件/插件移动到页面或分包配置，验证按需注入效果。", [Evidence(ctx.app_json_path.relative_to(ctx.project_root).as_posix())], [SOURCE_URLS["performance"]])

    for tf in ctx.files:
        if tf.rel_mini is None or tf.package_scope != "shipped":
            continue
        code = strip_code_comments(tf.text, tf.path.suffix.lower())
        for match in re.finditer(r"data:[^;\s]+;base64,[A-Za-z0-9+/=]{50000,}", code):
            add_finding(findings, "PERF003", "static", "high", "发现超过约 50KB 的内联 Base64。", "改为压缩后的外部资源或小图标。", [rel_evidence(ctx, tf, match.start(), match.group(0)[:80])], [SOURCE_URLS["performance"]])
        if tf.path.suffix.lower() == ".wxml":
            for tag in re.finditer(r"<[^>]+\bwx:for\s*=\s*['\"][^'\"]+['\"][^>]*>", code, re.I):
                if not re.search(r"\bwx:key\s*=", tag.group(0), re.I):
                    add_finding(findings, "PERF006", "static", "high", "wx:for 未配置 wx:key。", "提供稳定业务键，避免使用易变化索引。", [rel_evidence(ctx, tf, tag.start(), tag.group(0))], [SOURCE_URLS["setdata"]])
        if tf.path.suffix.lower() in {".js", ".ts"}:
            for pattern, msg in [
                (r"\.setData\s*\(\s*this\.data\s*\)", "this.setData(this.data) 传输整棵 data"),
                (r"\bonPageScroll\b.{0,1200}?\.setData\s*\(", "onPageScroll 中调用 setData"),
                (r"setInterval\s*\(.{0,500}?\.setData\s*\(.{0,300}?,\s*(?:[1-9]\d?|100)\s*\)", "短周期 timer 高频 setData"),
            ]:
                match = re.search(pattern, code, re.S)
                if match:
                    add_finding(findings, "PERF007", "heuristic", "medium", msg + "。", "只更新变化字段、合并调用并把高频区域拆成组件。", [rel_evidence(ctx, tf, match.start(), match.group(0))], [SOURCE_URLS["setdata"]])

    inventories["metrics"] = {
        "raw_package_bytes": dict(sorted(sizes.items())),
        "largest_files": [{"path": p, "bytes": s} for s, p in sorted(largest, reverse=True)[:20]],
        "note": "原始文件估算，不等于开发者工具最终编译包大小。",
    }


def audit_payment_ugc_share(ctx: ProjectContext, args: argparse.Namespace, findings: list[Finding], inventories: dict[str, Any]) -> None:
    api_evidence: dict[str, list[Evidence]] = defaultdict(list)
    runtime_files = [
        tf
        for tf in ctx.files
        if tf.package_scope == "backend"
        or (tf.rel_mini is not None and tf.package_scope == "shipped")
    ]
    stripped_by_path = {
        tf.path: strip_code_comments(tf.text, tf.path.suffix.lower()) for tf in runtime_files
    }
    all_text = "\n".join(stripped_by_path.values())
    content_safety_evidence: list[Evidence] = []
    content_safety_pattern = re.compile(
        r"\b(?:(?:security\s*\.)?msgSecCheck|(?:security\s*\.)?mediaCheckAsync)\s*\("
    )
    for tf in runtime_files:
        if tf.package_scope != "backend":
            continue
        code = stripped_by_path[tf.path]
        for match in content_safety_pattern.finditer(code):
            content_safety_evidence.append(
                rel_evidence(ctx, tf, match.start(), match.group(0))
            )
    content_safety = bool(content_safety_evidence)
    ugc_input_evidence: list[Evidence] = []
    ugc_publish_evidence: list[Evidence] = []
    share_evidence: list[Evidence] = []
    subscribe_evidence: list[Evidence] = []
    ai_evidence: list[Evidence] = []
    ai_pattern = re.compile(
        r"(?i)(生成式人工智能|AIGC|大模型|AI\s*(?:生成|绘画|问答|写作|配音|换脸|次数)|"
        r"文本生成|图像生成|视频生成|prompt\b|LLM\b)"
    )
    for tf in runtime_files:
        code = stripped_by_path[tf.path]
        for match in ai_pattern.finditer(code):
            ai_evidence.append(rel_evidence(ctx, tf, match.start(), match.group(0)))
        for api, index in iter_api_calls(tf):
            if api in PAYMENT_APIS | {"requestSubscribeMessage"}:
                api_evidence[api].append(rel_evidence(ctx, tf, index, f"wx.{api}(..."))
        if tf.path.suffix.lower() == ".wxml":
            for value, index in all_open_types(tf):
                if value == "share":
                    share_evidence.append(rel_evidence(ctx, tf, index, "open-type=share"))
            for match in re.finditer(r"<(?:input|textarea|editor)\b|open-type\s*=\s*['\"]chooseAvatar['\"]", code, re.I):
                ugc_input_evidence.append(rel_evidence(ctx, tf, match.start(), match.group(0)))
        for match in re.finditer(r"\b(?:chooseMedia|chooseImage|chooseVideo|uploadFile)\b", code):
            ugc_input_evidence.append(rel_evidence(ctx, tf, match.start(), match.group(0)))
        for match in re.finditer(r"(?i)(发布|评论|帖子|动态|聊天|留言|作品|公开|publish|comment|post|chat|submit)", code):
            ugc_publish_evidence.append(rel_evidence(ctx, tf, match.start(), match.group(0)))
        for match in re.finditer(r"\bonShare(?:AppMessage|Timeline)\b", code):
            share_evidence.append(rel_evidence(ctx, tf, match.start(), match.group(0)))

        if tf.path.suffix.lower() in {".js", ".ts"}:
            payment_call = re.compile(
                r"\bwx\s*(?:\?\.|\.)\s*requestPayment\s*\(\s*\{"
            )
            for pay_match in payment_call.finditer(code):
                open_index = pay_match.end() - 1
                close_index = matching_brace(code, open_index)
                if close_index is None:
                    continue
                block = code[open_index + 1 : close_index]
                client_controlled = re.search(
                    r"(?is)\b(?:timeStamp|nonceStr|package|paySign)\s*:\s*"
                    r"(?:this\.data\b|options?\b|\w+\.dataset\b|wx\.getStorageSync\s*\()",
                    block,
                )
                if client_controlled:
                    add_finding(
                        findings,
                        "PAY004",
                        "heuristic",
                        "medium",
                        "requestPayment 的签名参数疑似直接来自页面参数、dataset 或本地存储。",
                        "支付参数应由可信服务端按当前订单生成；服务端复核用户、商品、金额、订单状态和签名。",
                        [rel_evidence(ctx, tf, open_index + 1 + client_controlled.start(), client_controlled.group(0))],
                        [SOURCE_URLS["payment"]],
                    )
                success_marks_paid = re.search(
                    r"(?is)\bsuccess\s*[:(].{0,1200}?"
                    r"(?:setData\s*\(.{0,300}?(?:paid|已支付|支付成功)|"
                    r"setStorage(?:Sync)?\s*\(.{0,300}?(?:paid|已支付|支付成功)|"
                    r"orderStatus\s*[:=]\s*['\"]?(?:paid|success|已支付))",
                    block,
                )
                if success_marks_paid:
                    add_finding(
                        findings,
                        "PAY005",
                        "heuristic",
                        "medium",
                        "支付 success 回调疑似直接把订单永久标记为已支付。",
                        "前端 success 只作交互提示；以服务端异步通知或主动查单验签后的状态为准，并保证幂等。",
                        [rel_evidence(ctx, tf, open_index + 1 + success_marks_paid.start(), success_marks_paid.group(0))],
                        [SOURCE_URLS["payment"]],
                    )
            for match in re.finditer(r"\brequestSubscribeMessage\s*\(", code):
                subscribe_evidence.append(rel_evidence(ctx, tf, match.start(), match.group(0)))
                before = code[max(0, match.start() - 600):match.start()]
                if re.search(r"\b(?:onLoad|onShow|onLaunch)\b", before) and not re.search(r"(?:tap|click|submit|success)", before, re.I):
                    add_finding(findings, "SUB001", "heuristic", "medium", "requestSubscribeMessage 疑似在生命周期中自动触发。", "仅在用户明确点击等动作后请求订阅。", [rel_evidence(ctx, tf, match.start(), match.group(0))], [SOURCE_URLS["operations"]])
            for match in re.finditer(r"tmplIds\s*:\s*\[([^\]]*)\]", code, re.S):
                count = len(re.findall(r"['\"][^'\"]+['\"]", match.group(1)))
                if count > 5:
                    add_finding(findings, "SUB002", "static", "high", f"一次请求包含 {count} 个 tmplIds。", "按当前接口限制拆分并只请求用户当前预期的消息。", [rel_evidence(ctx, tf, match.start(), match.group(0))], [SOURCE_URLS["operations"]])

    payments = sorted(api for api in api_evidence if api in PAYMENT_APIS)
    inventories["payments"] = {api: [asdict(x) for x in api_evidence[api]] for api in payments}
    if payments:
        add_finding(findings, "PAY001", "static", "high", "发现支付 API：" + ", ".join(payments), "核验主体、商品类型、商户号、服务端下单/验签/幂等/退款和当前官方规则。", [], [SOURCE_URLS["payment"], SOURCE_URLS["virtual-payment"]])
    if args.subject == "ordinary-personal" and payments:
        add_finding(findings, "PAY009", "static", "high", "普通个人主体代码使用支付 API；标准支付和虚拟支付当前不适用该路线。", "删除收费、改流量主，或评估官方个人升级版（实物/线下服务）/个体工商户/企业。", [e for api in payments for e in api_evidence[api]][:10], [SOURCE_URLS["payment"], SOURCE_URLS["virtual-payment"]])
    if args.subject == "upgraded-personal" and "requestVirtualPayment" in payments:
        add_finding(findings, "PAY008", "manual", "high", "个人升级版代码使用虚拟支付；升级版交易能力不能推断覆盖虚拟商品。", "在当前 AppID 后台和官方虚拟支付页核验；默认改用个体工商户/企业主体。", api_evidence["requestVirtualPayment"][:10], [SOURCE_URLS["virtual-payment"]])
    if args.subject in {"unknown", "non-personal"} and "requestVirtualPayment" in payments:
        add_finding(findings, "PAY008", "manual", "high", "项目使用虚拟支付。", "核验主体认证类型、商品类目、iOS/Android/鸿蒙/Windows 规则和商户资料。", api_evidence["requestVirtualPayment"][:10], [SOURCE_URLS["virtual-payment"]])

    external_pay = re.compile(r"(?i)(支付宝|个人转账|个人收款码|加微信付款|银行卡转账|外部H5支付|线下充值|公众号充值)")
    force_sub = re.compile(r"(?i)(订阅后|完成订阅|订阅即可|订阅.*(?:解锁|领取|继续|奖励))")
    force_share = re.compile(r"(?i)(分享后|完成分享|转发后|分享.*(?:解锁|领取|继续|提现|奖励)|分享到朋友圈.*(?:获得|领取))")
    virtual_terms = re.compile(r"(?i)(数字会员|会员(?:内容|解锁|订阅|权益)|VIP(?:内容|权益)?|订阅内容|付费功能|解锁功能|打赏|虚拟礼物|虚拟币|课程视频|PDF|AI\s*次数|道具)")
    for tf in ctx.files:
        if tf.rel_mini is None or tf.package_scope != "shipped":
            continue
        code = strip_code_comments(tf.text, tf.path.suffix.lower())
        for match in external_pay.finditer(code):
            add_finding(findings, "PAY007", "heuristic", "medium", f"出现外部/个人支付文案：{match.group(0)}", "确认是否用户可见；删除绕开平台支付的路径。", [rel_evidence(ctx, tf, match.start(), match.group(0))], [SOURCE_URLS["operations"]])
        if virtual_terms.search(code) and re.search(r"requestPayment|支付宝|个人转账|H5支付|公众号充值", code, re.I):
            match = virtual_terms.search(code)
            add_finding(findings, "PAY008", "heuristic", "medium", "虚拟商品词语与普通/外部支付迹象同时出现。", "按当前虚拟支付规则重构；不得引导外部充值。", [rel_evidence(ctx, tf, match.start(), match.group(0))], [SOURCE_URLS["virtual-payment"]])
        for match in force_sub.finditer(code):
            if "requestSubscribeMessage" in all_text:
                add_finding(findings, "SUB004", "heuristic", "medium", f"疑似强制或利诱订阅：{match.group(0)}", "订阅必须自愿，拒绝后仍可继续核心功能。", [rel_evidence(ctx, tf, match.start(), match.group(0))], [SOURCE_URLS["operations"]])
        for match in force_share.finditer(code):
            if share_evidence:
                add_finding(findings, "SHR001", "heuristic", "medium", f"疑似分享后解锁/获利：{match.group(0)}", "移除分享作为继续、奖励或提现条件。", [rel_evidence(ctx, tf, match.start(), match.group(0))], [SOURCE_URLS["operations"]])
        for match in re.finditer(r"\bpath\s*:\s*['\"]([^'\"]+)['\"]", code):
            path_value = match.group(1)
            parsed = urlparse(path_value)
            names = {k.lower() for k, _ in parse_qsl(parsed.query, keep_blank_values=True)}
            sensitive = names & {"token", "session", "session_key", "openid", "phone", "mobile", "idcard", "password"}
            if sensitive and re.search(r"onShare|share", code[max(0, match.start() - 1000):match.start()], re.I):
                add_finding(findings, "SHR003", "static", "high", f"分享路径包含敏感参数：{sorted(sensitive)}", "分享只携带不可预测的短期业务 ID，并在服务端鉴权。", [rel_evidence(ctx, tf, match.start(), match.group(0))], [SOURCE_URLS["operations"]])
            route = normalize_route(parsed.path)
            if route and route not in set(ctx.routes) and re.search(r"onShare|share", code[max(0, match.start() - 1000):match.start()], re.I):
                add_finding(findings, "SHR004", "static", "high", f"分享 path 指向未注册页面：{path_value}", "修正分享路由。", [rel_evidence(ctx, tf, match.start(), match.group(0))], [SOURCE_URLS["app"]])

    likely_ugc = bool(ugc_input_evidence and ugc_publish_evidence)
    inventories["ugc"] = {
        "likely_public_ugc": likely_ugc,
        "input_evidence": [asdict(x) for x in ugc_input_evidence[:30]],
        "publish_evidence": [asdict(x) for x in ugc_publish_evidence[:30]],
        "content_safety_evidence": content_safety,
    }
    if likely_ugc:
        add_finding(findings, "UGC001", "heuristic", "medium", "源码同时出现内容输入/上传与发布/评论/聊天迹象，可能存在公开 UGC。", "确认真实业务、类目、发布前检测、人工复核、举报和巡查。", (ugc_input_evidence + ugc_publish_evidence)[:10], [SOURCE_URLS["content"]])
        if not content_safety:
            add_finding(findings, "UGC002", "manual", "medium", "可见仓库未发现 msgSecCheck/mediaCheckAsync 等服务端内容安全证据。", "检查云函数/自建后端；公开前接入文本和多媒体检测，并设置人工治理。", (ugc_input_evidence + ugc_publish_evidence)[:10], [SOURCE_URLS["content"]])
        else:
            add_finding(findings, "UGC004", "static", "medium", "后端/云函数发现官方内容安全接口调用迹象；这只是正向证据，不代表治理完整。", "继续验证失败默认拒绝、异步回调、人工复核、举报、巡查和处置。", content_safety_evidence[:10], [SOURCE_URLS["content"]])
    if re.search(r"(?i)(sensitiveWords|blacklistWords|违禁词|敏感词列表)", all_text) and not content_safety:
        add_finding(findings, "UGC003", "heuristic", "medium", "发现客户端敏感词/黑名单迹象，但未发现服务端内容安全证据。", "客户端提示只能辅助；在可信服务端执行官方内容安全与人工治理。", [], [SOURCE_URLS["content"]])
    inventories["subscriptions"] = [asdict(x) for x in subscribe_evidence]
    inventories["shares"] = [asdict(x) for x in share_evidence]
    inventories["ai"] = {
        "likely_generative_ai": bool(ai_evidence),
        "evidence": [asdict(x) for x in ai_evidence[:30]],
    }
    if ai_evidence:
        add_finding(
            findings,
            "AIC001",
            "manual",
            "medium",
            "源码或用户界面疑似提供生成式 AI/大模型能力。是否属于面向公众的生成式服务、是否需算法备案/安全评估及生成合成标识，不能只靠静态扫描判断。",
            "核验真实服务和类目；审计模型供应商、提示词/输出安全、个人信息、知识产权、投诉处置，并实现适用的显式/隐式 AIGC 标识和导出元数据。",
            ai_evidence[:10],
            [SOURCE_URLS["genai"], SOURCE_URLS["aigc-label"]],
        )


def manual_checks(ctx: ProjectContext, args: argparse.Namespace, inventories: dict[str, Any]) -> list[dict[str, str]]:
    checks = [
        {"id": "MAN-CATEGORY", "severity": "P1", "check": "在当前 AppID 后台核验主体开放类目、适用范围、资质和页面路径。", "source": SOURCE_URLS["categories"]},
        {"id": "MAN-PRIVACY", "severity": "P1", "check": "将源码/SDK 隐私能力清单与 MP 后台《小程序用户隐私保护指引》逐项对账。", "source": SOURCE_URLS["privacy"]},
        {"id": "MAN-DOMAIN", "severity": "P1", "check": "核验 request/upload/download/socket/业务域名、ICP 备案、TLS、证书链和端口。", "source": SOURCE_URLS["network"]},
        {"id": "MAN-BACKEND", "severity": "P1", "check": "审计服务端身份、角色、资源归属、参数校验、幂等、上传下载和日志。", "source": SOURCE_URLS["security"]},
        {"id": "MAN-REVIEW", "severity": "P1", "check": "使用体验版和审核账号在真机验证全部登录、会员、付费、隐藏功能、弱网和拒绝授权路径。", "source": SOURCE_URLS["reject"]},
        {"id": "MAN-FILING", "severity": "P1", "check": "核验备案状态、服务内容、负责人、联系方式和地方管局材料。", "source": "https://developers.weixin.qq.com/miniprogram/product/record/guidelines.html"},
    ]
    if inventories.get("payments"):
        checks.append({"id": "MAN-PAYMENT", "severity": "P1", "check": "核验主体/商户号/商品类型、服务端下单验签、异步通知、退款、对账与投诉。", "source": SOURCE_URLS["payment"]})
    if inventories.get("ugc", {}).get("likely_public_ugc"):
        checks.append({"id": "MAN-UGC", "severity": "P1", "check": "验证发布前文本/多媒体检测、人工复核、举报、删除、封禁、申诉和巡查。", "source": SOURCE_URLS["content"]})
    if inventories.get("ai", {}).get("likely_generative_ai"):
        checks.append({"id": "MAN-AI", "severity": "P1", "check": "核验生成式 AI 服务适用范围、模型供应商、算法备案/安全评估、显式/隐式标识、导出元数据、投诉与日志义务。", "source": SOURCE_URLS["aigc-label"]})
    if args.subject == "ordinary-personal":
        checks.append({"id": "MAN-PERSONAL", "severity": "P1", "check": "确认每项服务均属于当前普通个人开放类目；不要把个体工商户或个人升级版能力套用。", "source": SOURCE_URLS["categories"]})
    return checks


def deduplicate(findings: list[Finding]) -> list[Finding]:
    unique: dict[tuple[str, str], Finding] = {}
    for finding in findings:
        key = (finding.id, finding.fingerprint)
        if key not in unique:
            unique[key] = finding
    return sorted(
        unique.values(),
        key=lambda f: (
            SEVERITY_RANK[f.severity],
            f.id,
            f.evidence[0].path if f.evidence else "",
            (f.evidence[0].line or 0) if f.evidence else 0,
        ),
    )


def finding_blocks(finding: Finding, fail_on: str) -> bool:
    if fail_on == "none":
        return False
    if finding.determination == "manual":
        return False
    if finding.confidence not in {"high", "medium"}:
        return False
    return SEVERITY_RANK[finding.severity] <= FAIL_RANK[fail_on]


def build_report(ctx: ProjectContext, args: argparse.Namespace, findings: list[Finding], inventories: dict[str, Any]) -> dict[str, Any]:
    manual = manual_checks(ctx, args, inventories)
    counts = Counter(f.severity for f in findings)
    blocking = [f for f in findings if finding_blocks(f, args.fail_on)]
    return {
        "schema_version": "1",
        "tool_version": TOOL_VERSION,
        "rulepack": {"checked_at": RULEPACK_CHECKED_AT},
        "generated_at": None if args.deterministic else now_iso(),
        "scan_status": "complete",
        "disclaimer": "本报告仅基于可见源码和配置。它不能读取微信公众平台后台，不能验证服务端真实实现、资质、备案或运营行为，也不能替代开发者工具编译、真机、安全、隐私/法律评估及微信官方审核。",
        "project": {
            "project_root": str(ctx.project_root),
            "mini_root": str(ctx.mini_root),
            "project_config": str(ctx.project_config_path) if ctx.project_config_path else None,
            "private_config": str(ctx.private_config_path) if ctx.private_config_path else None,
            "subject": args.subject,
            "profile": args.profile,
            "appid": ctx.project_config.get("appid"),
            "routes": len(ctx.routes),
        },
        "summary": {
            "counts": {k: counts.get(k, 0) for k in ("P0", "P1", "P2", "INFO")},
            "blocking_count": len(blocking),
            "fail_on": args.fail_on,
        },
        "findings": [
            {
                **{k: v for k, v in asdict(f).items() if k != "evidence"},
                "evidence": [asdict(e) for e in f.evidence],
            }
            for f in findings
        ],
        "manual_checks": manual,
        "inventories": inventories,
    }


def markdown_report(report: dict[str, Any]) -> str:
    lines = [
        "# 微信小程序静态审计报告",
        "",
        f"> {report['disclaimer']}",
        "",
        "## 结论",
        "",
        f"- 扫描状态：`{report['scan_status']}`",
        f"- 主体参数：`{report['project']['subject']}`",
        f"- 项目根：`{report['project']['project_root']}`",
        f"- 小程序根：`{report['project']['mini_root']}`",
        f"- 路由数：{report['project']['routes']}",
        f"- 阻断阈值：`{report['summary']['fail_on']}`",
        f"- 阻断项：{report['summary']['blocking_count']}",
        "- 计数：" + ", ".join(f"{k}={v}" for k, v in report["summary"]["counts"].items()),
        "",
    ]
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for finding in report["findings"]:
        grouped[finding["severity"]].append(finding)
    for severity in ("P0", "P1", "P2", "INFO"):
        items = grouped.get(severity, [])
        if not items:
            continue
        lines.extend([f"## {severity} 发现", ""])
        for finding in items:
            lines.append(f"### {finding['id']} · {finding['title']}")
            lines.append("")
            lines.append(f"- 判定：`{finding['determination']}` / 置信度 `{finding['confidence']}`")
            lines.append(f"- 说明：{finding['message']}")
            lines.append(f"- 修复：{finding['remediation']}")
            if finding["evidence"]:
                lines.append("- 证据：")
                for evidence in finding["evidence"][:12]:
                    loc = evidence["path"]
                    if evidence.get("line"):
                        loc += f":{evidence['line']}"
                    snippet = f" — `{evidence['snippet']}`" if evidence.get("snippet") else ""
                    lines.append(f"  - `{loc}`{snippet}")
            if finding.get("sources"):
                lines.append("- 依据：" + "、".join(f"<{x}>" for x in finding["sources"]))
            lines.append("")
    lines.extend(["## 发布前人工核验", ""])
    for item in report["manual_checks"]:
        lines.append(f"- [{item['severity']}] {item['check']} — <{item['source']}>")
    lines.extend(["", "## 能力与指标摘要", ""])
    inventories = report["inventories"]
    lines.append(f"- 隐私能力：{len(inventories.get('privacy', []))} 类")
    lines.append(f"- 网络域名：{len(inventories.get('domains', []))} 个")
    lines.append(f"- 支付 API：{', '.join(inventories.get('payments', {}).keys()) or '未发现'}")
    lines.append(f"- 公开 UGC 迹象：{inventories.get('ugc', {}).get('likely_public_ugc', False)}")
    lines.append(f"- 生成式 AI 迹象：{inventories.get('ai', {}).get('likely_generative_ai', False)}")
    metrics = inventories.get("metrics", {})
    if metrics:
        lines.append("- 原始包体估算：" + ", ".join(f"{k}={v / 1024 / 1024:.2f}MiB" for k, v in metrics.get("raw_package_bytes", {}).items()))
        lines.append(f"- 包体说明：{metrics.get('note', '')}")
    lines.append("")
    return "\n".join(lines)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Static audit for WeChat Mini Program projects")
    parser.add_argument("path", nargs="?", default=".", help="project directory, project.config.json, or app.json")
    parser.add_argument("--project", help="explicit project.config.json")
    parser.add_argument("--mini-root", help="explicit native Mini Program root containing app.json")
    parser.add_argument("--subject", choices=["ordinary-personal", "upgraded-personal", "non-personal", "unknown"], default="unknown")
    parser.add_argument("--profile", choices=["release", "development"], default="release")
    parser.add_argument("--format", choices=["markdown", "json", "both"], default="markdown")
    parser.add_argument("--output", help="Markdown or primary output file")
    parser.add_argument("--json-out", help="JSON output file when --format both")
    parser.add_argument("--fail-on", choices=["P0", "P1", "P2", "none"], default="P1")
    parser.add_argument("--deterministic", action="store_true", help="omit generated timestamp")
    parser.add_argument("--list-rules", action="store_true")
    parser.add_argument("--explain", metavar="RULE_ID")
    return parser.parse_args(argv)


def emit(text: str, path: str | None) -> None:
    if path:
        Path(path).write_text(text, encoding="utf-8")
    else:
        print(text)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    if args.list_rules:
        for rule_id, meta in sorted(RULES.items()):
            print(f"{rule_id}\t{meta['severity']}\t{meta['title']}")
        return 0
    if args.explain:
        meta = RULES.get(args.explain)
        if not meta:
            print(f"unknown rule: {args.explain}", file=sys.stderr)
            return 2
        print(json.dumps({"id": args.explain, **meta}, ensure_ascii=False, indent=2))
        return 0

    findings: list[Finding] = []
    inventories: dict[str, Any] = {}
    try:
        ctx = create_context(args, findings)
        audit_config_and_routes(ctx, args, findings, inventories)
        audit_secrets(ctx, findings)
        audit_privacy_and_capabilities(ctx, args, findings, inventories)
        audit_network(ctx, args, findings, inventories)
        audit_navigation_and_review(ctx, args, findings, inventories)
        audit_performance(ctx, findings, inventories)
        audit_payment_ugc_share(ctx, args, findings, inventories)
        findings = deduplicate(findings)
        report = sanitize_output(build_report(ctx, args, findings, inventories))
        markdown = markdown_report(report)
        json_text = json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    except AuditInputError as exc:
        print(f"input error: {exc}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        return 130
    except Exception as exc:
        print(f"internal error: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 3

    if args.format == "markdown":
        emit(markdown + "\n", args.output)
    elif args.format == "json":
        emit(json_text, args.output)
    else:
        emit(markdown + "\n", args.output)
        json_path = args.json_out or ((args.output + ".json") if args.output else None)
        if json_path:
            emit(json_text, json_path)
        else:
            print("\n--- JSON ---\n")
            print(json_text)
    return 1 if report["summary"]["blocking_count"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
