"""
60s Digest RSS Fetcher
"""

import hashlib
import logging
import re
from datetime import date
from typing import Optional

import feedparser
import requests

from ..core.base import BaseFetcher, FetchResult, FetchStatus
from ..core.registry import register_fetcher
from ..utils import clean_html_content, parse_date_from_title


@register_fetcher("sixtys_digest")
class SixtysDigestFetcher(BaseFetcher):
    """60s汇总型RSS Fetcher"""
    
    def __init__(self):
        self.logger = logging.getLogger("fetch.sixtys_digest")
    
    @property
    def fetcher_type(self) -> str:
        return "sixtys_digest"
    
    def fetch_items(
        self,
        config: dict,
        episode_date: date,
        timeout_seconds: int = 30
    ) -> FetchResult:
        """拉取60s汇总RSS数据"""
        
        # 获取URL列表（支持多个备用URL）
        urls = config.get("urls", [])
        if not urls:
            url = config.get("url")
            if url:
                urls = [url]
        
        if not urls:
            return FetchResult(
                items=[],
                status=FetchStatus.FAILED,
                error_message="No URLs provided"
            )
        
        source_name = config.get("name", "60s")
        
        # 尝试多个URL（降级策略）
        for url in urls:
            try:
                self.logger.info(f"Trying URL: {url}")
                result = self._fetch_from_url(url, source_name, timeout_seconds)
                if result.status == FetchStatus.SUCCESS:
                    return result
            except Exception as e:
                self.logger.warning(f"Failed to fetch from {url}: {e}")
                continue
        
        return FetchResult(
            items=[],
            status=FetchStatus.FAILED,
            error_message="All URLs failed"
        )
    
    def _fetch_from_url(
        self,
        url: str,
        source_name: str,
        timeout_seconds: int
    ) -> FetchResult:
        """从单个URL拉取数据"""
        
        resp = requests.get(
            url,
            timeout=timeout_seconds,
            headers={"User-Agent": "podcast-bot/1.0"}
        )
        resp.raise_for_status()
        
        parsed = feedparser.parse(resp.content)
        
        items = []
        for entry in getattr(parsed, "entries", []) or []:
            item = self._parse_digest_entry(entry, source_name)
            if item:
                # 从标题提取日期并设置为ISO格式字符串
                item_date = parse_date_from_title(item["title"])
                if item_date:
                    item["published_at"] = f"{item_date.isoformat()}T00:00:00+00:00"
                else:
                    self.logger.warning(f"无法从标题提取日期: {item['title']}")
                    continue
                items.append(item)
        
        self.logger.info(f"Fetched {len(items)} digest items from {source_name}")
        
        return FetchResult(
            items=items,
            status=FetchStatus.SUCCESS,
            metadata={"url": url, "digest_count": len(items)}
        )
    
    def _parse_digest_entry(self, entry, source_name: str) -> Optional[dict]:
        """解析汇总型entry"""
        
        link = (getattr(entry, "link", None) or "").strip()
        if not link:
            return None
        
        title = (getattr(entry, "title", None) or "").strip()
        
        # 检查是否为日期标题
        if not self._is_date_title(title):
            self.logger.debug(f"Not a date title: {title}")
            return None
        
        # 提取内容
        description = (getattr(entry, "description", None) or "").strip()
        content = clean_html_content(description)
        
        if not content or len(content) < 200:
            self.logger.debug(f"Skipping short digest: {title}")
            return None
        
        item_id = hashlib.sha256(link.encode()).hexdigest()[:16]
        
        return {
            "id": item_id,
            "title": title,
            "summary": "",
            "content": content,
            "url": link,
            "published_at": None,  # 将由调用方从标题提取
            "source": source_name,
            "category": "digest",
            "_metadata": {
                "is_digest": True,
                "requires_splitting": True
            }
        }
    
    def _is_date_title(self, title: str) -> bool:
        """检查标题是否为日期格式"""
        date_patterns = [
            r"\d{4}-\d{2}-\d{2}",
            r"\d{4}年\d{1,2}月\d{1,2}日",
        ]
        return any(re.search(pattern, title) for pattern in date_patterns)
