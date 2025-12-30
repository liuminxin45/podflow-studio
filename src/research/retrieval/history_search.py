"""
History Podcast Search

支持按关键词/实体/主题检索历史播客文本
初版使用简单全文检索，后续可替换为embedding索引
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

from src.research.core.models import HistoryPodcastHit


class HistoryPodcastSearcher:
    """历史播客检索器"""
    
    def __init__(self, history_dir: str = "out/history_podcasts"):
        """
        初始化历史播客检索器
        
        Args:
            history_dir: 历史播客存储目录
        """
        self.history_dir = Path(history_dir)
        self.history_dir.mkdir(parents=True, exist_ok=True)
        self.logger = logging.getLogger("research.history_search")
        
        # 索引缓存
        self._index: Optional[List[Dict[str, Any]]] = None
    
    def _build_index(self) -> List[Dict[str, Any]]:
        """构建索引"""
        if self._index is not None:
            return self._index
        
        self.logger.info("Building history podcast index...")
        index = []
        
        # 扫描历史文件
        for json_file in self.history_dir.rglob("*.json"):
            try:
                with open(json_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                
                # 提取关键字段
                episode_id = data.get("episode_id", "")
                date = data.get("date", "")
                script = data.get("final_script") or data.get("script") or ""
                title = data.get("title", "")
                topics = data.get("topics", [])
                
                if script:
                    index.append({
                        "episode_id": episode_id,
                        "date": date,
                        "title": title,
                        "script": script,
                        "topics": topics,
                        "path": str(json_file)
                    })
            except Exception as e:
                self.logger.warning(f"Failed to index {json_file}: {e}")
        
        self._index = index
        self.logger.info(f"Indexed {len(index)} history podcasts")
        return index
    
    def search(self, 
               query: str,
               entities: Optional[List[str]] = None,
               topics: Optional[List[str]] = None,
               top_k: int = 5) -> List[HistoryPodcastHit]:
        """
        检索历史播客
        
        Args:
            query: 查询文本
            entities: 实体列表
            topics: 主题列表
            top_k: 返回Top K结果
            
        Returns:
            历史播客命中列表
        """
        index = self._build_index()
        
        if not index:
            return []
        
        # 计算相似度
        results = []
        query_lower = query.lower()
        entities_lower = [e.lower() for e in (entities or [])]
        topics_lower = [t.lower() for t in (topics or [])]
        
        for item in index:
            score = self._calculate_score(
                item, query_lower, entities_lower, topics_lower
            )
            
            if score > 0:
                results.append((item, score))
        
        # 排序并返回Top K
        results.sort(key=lambda x: x[1], reverse=True)
        
        hits = []
        for item, score in results[:top_k]:
            # 提取相关片段
            snippet = self._extract_snippet(item["script"], query, entities)
            
            hit = HistoryPodcastHit(
                episode_id=item["episode_id"],
                date=item["date"],
                snippet=snippet,
                similarity=score,
                url_or_path=item["path"]
            )
            hits.append(hit)
        
        self.logger.info(f"Found {len(hits)} history podcast hits for query: {query[:50]}")
        return hits
    
    def _calculate_score(self,
                        item: Dict[str, Any],
                        query: str,
                        entities: List[str],
                        topics: List[str]) -> float:
        """计算相似度分数"""
        score = 0.0
        
        script_lower = item["script"].lower()
        title_lower = item["title"].lower()
        item_topics = [t.lower() for t in item.get("topics", [])]
        
        # 查询词匹配
        if query in script_lower:
            score += 1.0
        if query in title_lower:
            score += 2.0
        
        # 实体匹配
        for entity in entities:
            if entity in script_lower:
                score += 0.5
            if entity in title_lower:
                score += 1.0
        
        # 主题匹配
        for topic in topics:
            if topic in item_topics:
                score += 1.5
            if topic in script_lower:
                score += 0.3
        
        return score
    
    def _extract_snippet(self,
                        script: str,
                        query: str,
                        entities: Optional[List[str]] = None,
                        max_length: int = 200) -> str:
        """提取相关片段"""
        # 查找包含查询词或实体的句子
        sentences = re.split(r'[。！？\n]', script)
        
        query_lower = query.lower()
        entities_lower = [e.lower() for e in (entities or [])]
        
        best_sentence = ""
        best_score = 0
        
        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence:
                continue
            
            sentence_lower = sentence.lower()
            score = 0
            
            if query_lower in sentence_lower:
                score += 2
            
            for entity in entities_lower:
                if entity in sentence_lower:
                    score += 1
            
            if score > best_score:
                best_score = score
                best_sentence = sentence
        
        # 截断过长的片段
        if len(best_sentence) > max_length:
            best_sentence = best_sentence[:max_length] + "..."
        
        return best_sentence or script[:max_length] + "..."
    
    def add_podcast(self, episode_id: str, date: str, title: str,
                   script: str, topics: List[str]) -> None:
        """
        添加新的播客到历史库
        
        Args:
            episode_id: 集ID
            date: 日期
            title: 标题
            script: 脚本
            topics: 主题列表
        """
        # 保存到文件
        filename = f"{date}_{episode_id}.json"
        filepath = self.history_dir / filename
        
        data = {
            "episode_id": episode_id,
            "date": date,
            "title": title,
            "script": script,
            "topics": topics,
            "created_at": str(Path(filepath).stat().st_ctime if filepath.exists() else "")
        }
        
        try:
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            
            # 清除索引缓存，强制重建
            self._index = None
            
            self.logger.info(f"Added podcast to history: {episode_id}")
        except Exception as e:
            self.logger.error(f"Failed to add podcast to history: {e}")


__all__ = ["HistoryPodcastSearcher", "HistoryPodcastHit"]
