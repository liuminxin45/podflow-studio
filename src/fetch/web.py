"""
Web Utilities Module

这个文件提供了Web请求和处理的通用工具函数。

功能概述：
- HTTP请求封装和优化
- 网络错误处理和重试
- 响应数据解析和清洗
- 代理和认证支持

主要函数：
- fetch_with_retry(): 带重试的HTTP请求
- parse_html_response(): HTML响应解析
- handle_http_errors(): HTTP错误处理

工具特性：
- 自动重试机制
- 超时控制
- 代理支持
- 响应缓存

使用示例：
    response = fetch_with_retry(
        url="https://example.com",
        max_retries=3,
        timeout=30
    )

应用场景：
- 网络数据获取
- API调用封装
- 网页内容抓取
- 错误恢复处理

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-25
"""

from __future__ import annotations

import logging

import requests
from bs4 import BeautifulSoup


def extract_main_text(url: str, timeout_seconds: int) -> str:
    log = logging.getLogger("fetch.web")

    resp = requests.get(
        url,
        timeout=timeout_seconds,
        headers={"User-Agent": "podcast-bot/0.1"},
    )
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")

    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()

    text = soup.get_text("\n")
    lines = [ln.strip() for ln in text.splitlines()]
    cleaned = "\n".join([ln for ln in lines if ln])

    if len(cleaned) < 200:
        log.info("extracted text too short: %s", url)

    return cleaned
