"""
AI Bot Daily Fetcher
"""

import hashlib
import logging
import re
from datetime import date, datetime
from typing import Optional
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from ..core.base import BaseFetcher, FetchResult, FetchStatus
from ..core.registry import register_fetcher


@register_fetcher("aibot_daily")
class AibotDailyFetcher(BaseFetcher):
    """AI工具集每日快讯 Fetcher"""
    
    def __init__(self):
        self.logger = logging.getLogger("fetch.aibot_daily")
        self._date_re = re.compile(r"(?P<m>\d{1,2})\s*月\s*(?P<d>\d{1,2})")
    
    @property
    def fetcher_type(self) -> str:
        return "aibot_daily"
    
    def fetch_items(
        self,
        config: dict,
        episode_date: date,
        timeout_seconds: int = 30
    ) -> FetchResult:
        """拉取AI工具集每日快讯"""
        
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
        
        source_name = config.get("name", "AI工具集")
        url = urls[0]
        
        try:
            self.logger.info(f"Fetching {source_name} from {url}")
            resp = requests.get(
                url,
                timeout=timeout_seconds,
                headers={"User-Agent": "podcast-bot/1.0"}
            )
            resp.raise_for_status()
            
            # 解析HTML
            soup = BeautifulSoup(resp.content, "html.parser")
            items = self._parse_html(soup, source_name, episode_date, url)
            
            self.logger.info(f"Fetched {len(items)} items from {source_name}")
            
            return FetchResult(
                items=items,
                status=FetchStatus.SUCCESS,
                metadata={"url": url}
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
    
    def _parse_html(
        self,
        soup: BeautifulSoup,
        source_name: str,
        episode_date: date,
        base_url: str
    ) -> list[dict]:
        """解析HTML内容"""
        
        items = []
        containers = soup.select("div.news-container")
        
        for container in containers:
            current_date: Optional[date] = None
            
            for node in container.select("div.news-date, div.news-item"):
                classes = set(node.get("class") or [])
                
                # 解析日期节点
                if "news-date" in classes:
                    date_text = node.get_text(strip=True)
                    parsed_date = self._parse_date(date_text, episode_date)
                    if parsed_date:
                        current_date = parsed_date
                    continue
                
                # 解析新闻节点
                if "news-item" in classes and current_date:
                    item = self._parse_news_item(node, source_name, current_date, base_url)
                    if item:
                        items.append(item)
        
        return items
    
    def _parse_date(self, date_text: str, episode_date: date) -> Optional[date]:
        """从文本解析日期"""
        match = self._date_re.search(date_text)
        if not match:
            return None
        
        try:
            month = int(match.group("m"))
            day = int(match.group("d"))
            
            # 推断年份
            year = episode_date.year
            if month > episode_date.month:
                year -= 1
            
            return date(year, month, day)
        except ValueError:
            return None
    
    def _parse_news_item(
        self,
        node,
        source_name: str,
        item_date: date,
        base_url: str
    ) -> Optional[dict]:
        """解析单个新闻item"""
        
        a_tag = node.select_one("div.news-content h2 a")
        if not a_tag:
            return None
        
        title = a_tag.get_text(strip=True)
        link = a_tag.get("href", "")
        if link:
            link = urljoin(base_url, link)
        
        if not title or not link:
            return None
        
        # 提取摘要
        summary_node = node.select_one("div.news-content p")
        summary = summary_node.get_text(strip=True) if summary_node else ""
        
        item_id = hashlib.sha256(link.encode()).hexdigest()[:16]
        
        return {
            "id": item_id,
            "title": title,
            "summary": summary,
            "content": summary,
            "url": link,
            "published_at": item_date.isoformat(),
            "source": source_name,
        }
