from __future__ import annotations

from html import unescape
from html.parser import HTMLParser
import ipaddress
import re
import socket
from typing import Any
from urllib.parse import urljoin, urlparse

import requests


ALLOWED_CONTENT_TYPES = ("text/html", "application/xhtml+xml", "text/plain")
DEFAULT_TIMEOUT_SECONDS = 15
DEFAULT_MAX_BYTES = 2 * 1024 * 1024


class _ReadableHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._ignored_depth = 0
        self._in_title = False
        self.title_parts: list[str] = []
        self.text_parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        del attrs
        if tag in {"script", "style", "noscript", "svg"}:
            self._ignored_depth += 1
        if tag == "title":
            self._in_title = True

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript", "svg"} and self._ignored_depth > 0:
            self._ignored_depth -= 1
        if tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        value = data.strip()
        if not value or self._ignored_depth:
            return
        if self._in_title:
            self.title_parts.append(value)
        else:
            self.text_parts.append(value)


def _assert_public_http_url(value: str) -> None:
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("只支持公开的 http 或 https 链接")
    if parsed.username or parsed.password:
        raise ValueError("链接不能包含用户名或密码")
    try:
        default_port = 443 if parsed.scheme == "https" else 80
        addresses = socket.getaddrinfo(
            parsed.hostname,
            parsed.port or default_port,
            type=socket.SOCK_STREAM,
        )
    except OSError as exc:
        raise ValueError(f"无法解析链接域名：{exc}") from exc
    for address in addresses:
        ip = ipaddress.ip_address(address[4][0])
        if not ip.is_global:
            raise ValueError("链接指向本机或内网地址，已拒绝读取")


def _decode_response(response: requests.Response, body: bytes) -> str:
    encoding = response.encoding or ""
    if not encoding or encoding.lower() in {"iso-8859-1", "latin-1"}:
        head = body[:4096].decode("ascii", errors="ignore")
        match = re.search(r"charset\s*=\s*['\"]?([a-zA-Z0-9._-]+)", head, flags=re.I)
        encoding = match.group(1) if match else "utf-8"
    return body.decode(encoding, errors="replace")


def _read_bounded_response(response: requests.Response, max_bytes: int) -> bytes:
    chunks: list[bytes] = []
    total = 0
    for chunk in response.iter_content(chunk_size=64 * 1024):
        if not chunk:
            continue
        total += len(chunk)
        if total > max_bytes:
            raise ValueError(f"网页正文超过 {max_bytes // 1024} KB 限制")
        chunks.append(chunk)
    return b"".join(chunks)


def _extract_html(value: str) -> tuple[str, str]:
    parser = _ReadableHTMLParser()
    parser.feed(value)
    title = re.sub(r"\s+", " ", unescape(" ".join(parser.title_parts))).strip()
    content = re.sub(r"\s+", " ", unescape(" ".join(parser.text_parts))).strip()
    return title, content


def fetch_manual_url(
    value: str,
    *,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
    max_bytes: int = DEFAULT_MAX_BYTES,
) -> dict[str, Any]:
    current_url = value
    response: requests.Response | None = None
    for _redirect_count in range(6):
        _assert_public_http_url(current_url)
        response = requests.get(
            current_url,
            timeout=timeout_seconds,
            stream=True,
            allow_redirects=False,
            headers={
                "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9",
                "User-Agent": "PodFlow-Studio/0.2 manual-source-reader",
            },
        )
        if response.status_code in {301, 302, 303, 307, 308}:
            location = str(response.headers.get("location") or "").strip()
            response.close()
            if not location:
                raise ValueError("网页重定向缺少目标地址")
            current_url = urljoin(current_url, location)
            continue
        break
    else:
        raise ValueError("链接重定向次数过多")

    if response is None:
        raise ValueError("网页请求没有返回响应")
    try:
        response.raise_for_status()
        _assert_public_http_url(response.url)
        content_type = str(response.headers.get("content-type") or "").lower()
        if not any(content_type.startswith(allowed) for allowed in ALLOWED_CONTENT_TYPES):
            raise ValueError(f"不支持的网页内容类型：{content_type or '未知'}")
        body = _read_bounded_response(response, max_bytes)
        decoded = _decode_response(response, body)
    finally:
        response.close()
    if content_type.startswith("text/plain"):
        title = urlparse(response.url).hostname or "手动链接"
        content = re.sub(r"\s+", " ", decoded).strip()
    else:
        title, content = _extract_html(decoded)
    if not content:
        raise ValueError("网页没有可读取的正文")
    return {
        "title": title or urlparse(response.url).hostname or "手动链接",
        "content": content,
        "url": response.url,
        "source": "manual",
        "source_name": "手动链接",
        "type": "manual_url",
    }


def collect_manual_inputs(
    source_inputs: list[dict[str, Any]] | None,
    *,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
    max_bytes: int = DEFAULT_MAX_BYTES,
) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    items: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    for index, raw in enumerate(source_inputs or []):
        if not isinstance(raw, dict):
            errors.append({"input": str(index + 1), "message": "输入不是有效的素材对象"})
            continue
        content = str(raw.get("content") or "").strip()
        url = str(raw.get("url") or "").strip()
        if content:
            items.append(
                {
                    **raw,
                    "title": str(raw.get("title") or content[:60]).strip(),
                    "content": content,
                    "source": str(raw.get("source") or "manual"),
                    "source_name": str(raw.get("source_name") or "手动素材"),
                    "type": str(raw.get("type") or "manual_note"),
                }
            )
            continue
        if not url:
            errors.append({"input": str(index + 1), "message": "素材既没有正文也没有链接"})
            continue
        try:
            fetched = fetch_manual_url(
                url,
                timeout_seconds=timeout_seconds,
                max_bytes=max_bytes,
            )
            items.append({**raw, **fetched})
        except (requests.RequestException, ValueError) as exc:
            errors.append({"input": url, "message": str(exc)})
    return items, errors
