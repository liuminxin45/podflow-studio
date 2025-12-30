"""
Standard RSS Fetcher
"""

import hashlib
import logging
from datetime import date
from typing import Optional

import feedparser
import requests

from ..core.base import BaseFetcher, FetchResult, FetchStatus
from ..core.registry import register_fetcher
from ..utils import clean_html_content, parse_published_date


@register_fetcher("standard_rss")
class StandardRSSFetcher(BaseFetcher):
    """标准RSS Fetcher"""
    
    def __init__(self):
        self.logger = logging.getLogger("fetch.standard_rss")
    
    @property
    def fetcher_type(self) -> str:
        return "standard_rss"
    
    def validate_config(self, config: dict) -> bool:
        """验证配置"""
        if "url" not in config and "urls" not in config:
            self.logger.error("Missing 'url' or 'urls' in config")
            return False
        return True
    
    def fetch_items(
        self,
        config: dict,
        episode_date: date,
        timeout_seconds: int = 30
    ) -> FetchResult:
        """拉取标准RSS数据"""
        
        # 获取URL
        url = config.get("url")
        urls = config.get("urls", [])
        url_to_fetch = url if url else (urls[0] if urls else None)
        
        if not url_to_fetch:
            return FetchResult(
                items=[],
                status=FetchStatus.FAILED,
                error_message="No URL provided"
            )
        
        source_name = config.get("name", "unknown")
        
        try:
            # 发起HTTP请求
            self.logger.info(f"Fetching RSS: {source_name} from {url_to_fetch}")
            resp = requests.get(
                url_to_fetch,
                timeout=timeout_seconds,
                headers={"User-Agent": "podcast-bot/1.0"}
            )
            resp.raise_for_status()
            
            # 解析RSS
            parsed = feedparser.parse(resp.content)
            if getattr(parsed, "bozo", 0):
                self.logger.warning(
                    f"RSS parse warning: bozo={parsed.bozo}, "
                    f"error={getattr(parsed, 'bozo_exception', None)}"
                )
            
            # 提取items
            items = []
            for entry in getattr(parsed, "entries", []) or []:
                item = self._parse_entry(entry, source_name)
                if item:
                    items.append(item)
            
            self.logger.info(f"Fetched {len(items)} items from {source_name}")
            
            return FetchResult(
                items=items,
                status=FetchStatus.SUCCESS,
                metadata={"url": url_to_fetch, "entry_count": len(items)}
            )
            
        except requests.Timeout:
            self.logger.error(f"Timeout fetching {source_name}")
            return FetchResult(items=[], status=FetchStatus.TIMEOUT)
        
        except Exception as e:
            self.logger.error(f"Failed to fetch {source_name}: {e}")
            return FetchResult(
                items=[],
                status=FetchStatus.FAILED,
                error_message=str(e)
            )
    
    def _parse_entry(self, entry, source_name: str) -> Optional[dict]:
        """解析单个RSS entry"""
        
        # 提取基本字段
        link = (getattr(entry, "link", None) or "").strip()
        if not link:
            return None
        
        title = (getattr(entry, "title", None) or "").strip()
        summary = (getattr(entry, "summary", None) or "").strip()
        
        # 提取内容
        content = ""
        description = (getattr(entry, "description", None) or "").strip()
        if description:
            content = clean_html_content(description)
        
        if not content:
            content_list = getattr(entry, "content", None)
            if isinstance(content_list, list) and content_list:
                raw_content = (content_list[0].get("value") or "").strip()
                content = clean_html_content(raw_content)
        
        # 过滤无效内容
        if not content or len(content) < 100:
            self.logger.debug(f"Skipping short content: {title}")
            return None
        
        # 解析发布时间
        published_at = parse_published_date(entry)
        
        # 生成稳定ID
        item_id = hashlib.sha256(link.encode()).hexdigest()[:16]
        
        return {
            "id": item_id,
            "title": title,
            "summary": summary,
            "content": content,
            "url": link,
            "published_at": published_at,
            "source": source_name,
        }
