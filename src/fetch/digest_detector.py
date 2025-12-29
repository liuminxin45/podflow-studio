"""
Digest Detector - 识别汇总型RSS源

目标：低成本判断一个RSS item是否包含多个不相关事件
策略：优先使用规则/启发式，不使用LLM
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any


@dataclass
class DigestDetectionResult:
    """汇总检测结果"""
    is_digest: bool
    confidence: float  # 0.0-1.0
    reasons: list[str]
    metadata: dict[str, Any]


class DigestDetector:
    """汇总型RSS检测器（纯规则，无LLM）"""
    
    def __init__(self):
        self.logger = logging.getLogger("fetch.digest_detector")
        # 标题特征：日期/星期/汇总关键词
        self.title_digest_patterns = [
            r'^\d{4}[-/年]\d{1,2}[-/月]\d{1,2}',  # 2025-12-29 / 2025年12月29日
            r'^📅\s*\d{4}[-/年]\d{1,2}[-/月]\d{1,2}',  # 📅 2025-12-29
            r'星期[一二三四五六日天]',
            r'周[一二三四五六日天]',
            r'每[天日周月]',
            r'今[天日]',
            r'本周',
            r'\d+秒读懂',
            r'60秒',
            r'速览',
            r'盘点',
            r'要闻',
            r'快讯',
            r'简报',
            r'日报',
            r'周报',
            r'晨报',
            r'晚报',
            r'资讯汇总',
            r'新闻汇总',
            r'热点汇总',
        ]
        
        # 内容特征：多条编号列表
        self.content_list_patterns = [
            r'^\d+[、\.\)）]',  # 1、 1. 1) 1）
            r'^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]',  # 圈数字
            r'^\[\d+\]',  # [1]
            r'^【\d+】',  # 【1】
        ]
    
    def detect(self, item: dict) -> DigestDetectionResult:
        """
        检测单个item是否为汇总型
        
        Args:
            item: RSS item字典，包含title/content/summary等字段
            
        Returns:
            DigestDetectionResult
        """
        item_id = item.get("id", "unknown")[:30]
        self.logger.debug(f"开始检测item: {item_id}")
        
        reasons = []
        confidence = 0.0
        metadata = {}
        
        title = (item.get("title") or "").strip()
        content = (item.get("content") or item.get("summary") or "").strip()
        
        self.logger.debug(f"  标题: {title[:50]}...")
        self.logger.debug(f"  内容长度: {len(content)}")
        
        # 特征1: 标题包含日期/汇总关键词
        title_score = self._check_title_patterns(title)
        if title_score > 0:
            reasons.append(f"标题包含汇总特征 (score={title_score:.2f})")
            confidence += title_score * 0.4
            self.logger.debug(f"  特征1-标题: score={title_score:.2f}, confidence={confidence:.2f}")
        
        # 特征2: 内容包含多条编号列表
        list_count, list_score = self._check_content_lists(content)
        if list_count >= 5:
            reasons.append(f"内容包含{list_count}条编号列表")
            confidence += list_score * 0.5  # 提高权重
            metadata["list_count"] = list_count
            self.logger.debug(f"  特征2-列表: count={list_count}, score={list_score:.2f}, confidence={confidence:.2f}")
        
        # 特征3: 实体数量异常多（简单启发式）
        entity_count = self._estimate_entity_count(content)
        if entity_count >= 8:
            reasons.append(f"内容包含大量实体 (估计{entity_count}个)")
            confidence += 0.15
            metadata["entity_count"] = entity_count
        elif entity_count >= 5 and list_count >= 5:
            # 如果有列表且实体较多，也加分
            reasons.append(f"内容包含多个实体 (估计{entity_count}个)")
            confidence += 0.1
            metadata["entity_count"] = entity_count
        
        # 特征4: 内容长度与列表项数量比例
        if list_count >= 5 and len(content) > 500:
            avg_item_length = len(content) / list_count
            if avg_item_length < 200:  # 每条很短，典型汇总
                reasons.append(f"列表项平均长度很短 ({avg_item_length:.0f}字)")
                confidence += 0.1
        
        # 特征5: 标题是纯日期（强特征）
        if self._is_pure_date_title(title):
            reasons.append("标题是纯日期")
            confidence = max(confidence, 0.9)
            self.logger.debug(f"  特征5-纯日期: confidence={confidence:.2f}")
        
        # 归一化confidence
        confidence = min(1.0, confidence)
        
        # 判定阈值
        is_digest = confidence >= 0.5
        
        self.logger.info(
            f"检测完成: {item_id} | is_digest={is_digest} | "
            f"confidence={confidence:.2f} | reasons={len(reasons)}"
        )
        if is_digest:
            self.logger.info(f"  ✓ 汇总型RSS: {title[:60]}")
            for reason in reasons:
                self.logger.info(f"    - {reason}")
        
        return DigestDetectionResult(
            is_digest=is_digest,
            confidence=confidence,
            reasons=reasons,
            metadata=metadata
        )
    
    def _check_title_patterns(self, title: str) -> float:
        """检查标题是否匹配汇总特征，返回0-1分数"""
        if not title:
            return 0.0
        
        score = 0.0
        for pattern in self.title_digest_patterns:
            if re.search(pattern, title):
                score += 0.3
        
        return min(1.0, score)
    
    def _check_content_lists(self, content: str) -> tuple[int, float]:
        """
        检查内容是否包含多条编号列表
        
        Returns:
            (列表项数量, 0-1分数)
        """
        if not content:
            return 0, 0.0
        
        lines = content.split('\n')
        list_count = 0
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            for pattern in self.content_list_patterns:
                if re.match(pattern, line):
                    list_count += 1
                    break
        
        # 分数计算：5条以上开始有分，10条以上满分
        if list_count < 5:
            score = 0.0
        elif list_count >= 10:
            score = 1.0
        else:
            score = (list_count - 5) / 5.0  # 5-10条之间线性增长
        
        return list_count, score
    
    def _estimate_entity_count(self, content: str) -> int:
        """
        粗略估计内容中的实体数量（简单启发式）
        
        策略：
        - 中文专有名词（连续大写/特定模式）
        - 组织机构名
        - 地名
        """
        if not content:
            return 0
        
        # 简单策略：统计可能的实体模式
        entity_patterns = [
            r'[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*',  # 英文专有名词
            r'[\u4e00-\u9fa5]{2,}(?:公司|集团|科技|银行|大学|政府|部门|委员会)',  # 中文机构
            r'[\u4e00-\u9fa5]{2,}(?:市|省|县|区|国)',  # 地名
        ]
        
        entities = set()
        for pattern in entity_patterns:
            matches = re.findall(pattern, content)
            entities.update(matches)
        
        return len(entities)
    
    def _is_pure_date_title(self, title: str) -> bool:
        """判断标题是否为纯日期（强汇总信号）"""
        if not title:
            return False
        
        # 移除常见前缀/后缀
        cleaned = title
        for noise in ['每天', '每日', '60秒', '读懂世界', '星期', '周', '📅']:
            cleaned = cleaned.replace(noise, '')
        
        cleaned = cleaned.strip()
        
        # 检查是否主要是日期
        date_pattern = r'^\d{4}[-/年]\d{1,2}[-/月]\d{1,2}'
        if re.match(date_pattern, cleaned):
            # 移除日期后剩余内容很少
            remaining = re.sub(date_pattern, '', cleaned).strip()
            remaining = re.sub(r'[日号\s\-/]', '', remaining)
            return len(remaining) < 5
        
        return False


def detect_digest_items(items: list[dict]) -> tuple[list[dict], list[dict]]:
    """
    批量检测items，分离普通item和汇总item
    
    Args:
        items: RSS items列表
        
    Returns:
        (normal_items, digest_items)
    """
    logger = logging.getLogger("fetch.digest_detector")
    logger.info(f"开始批量检测 {len(items)} 个items...")
    
    detector = DigestDetector()
    normal_items = []
    digest_items = []
    
    for idx, item in enumerate(items, 1):
        logger.debug(f"检测进度: {idx}/{len(items)}")
        result = detector.detect(item)
        
        # 将检测结果附加到item
        item_copy = dict(item)
        item_copy["_digest_detection"] = {
            "is_digest": result.is_digest,
            "confidence": result.confidence,
            "reasons": result.reasons,
            "metadata": result.metadata,
        }
        
        if result.is_digest:
            digest_items.append(item_copy)
        else:
            normal_items.append(item_copy)
    
    logger.info(f"批量检测完成:")
    logger.info(f"  - 普通items: {len(normal_items)}")
    logger.info(f"  - 汇总items: {len(digest_items)}")
    
    if digest_items:
        logger.info(f"检测到的汇总items:")
        for item in digest_items:
            title = item.get("title", "")[:60]
            conf = item.get("_digest_detection", {}).get("confidence", 0)
            logger.info(f"  • {title} (confidence={conf:.2f})")
    
    return normal_items, digest_items


__all__ = [
    "DigestDetector",
    "DigestDetectionResult",
    "detect_digest_items",
]
