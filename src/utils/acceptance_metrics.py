"""
Acceptance Metrics Module

追踪和验证核心验收指标，确保系统质量。

核心验收指标：
- 7天重复率 < 5%
- 单期Metaso credits < 30
- 平均evidence_confidence ≥ 阈值
- chapters时间戳误差 < 1s
- 同run_id复跑结果一致

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-26
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

from src.utils.metrics import get_metrics
from src.utils.serialization import stable_json_dumps, compute_hash


@dataclass
class AcceptanceMetrics:
    """验收指标"""
    episode_id: str
    timestamp: float
    
    # 重复率指标
    duplicate_rate_7d: float = 0.0
    duplicate_count: int = 0
    total_items: int = 0
    
    # 成本指标
    metaso_credits: int = 0
    total_cost_usd: float = 0.0
    
    # 证据质量指标
    avg_evidence_confidence: float = 0.0
    evidence_pack_count: int = 0
    
    # 时间戳精度指标
    chapter_timestamp_error_ms: float = 0.0
    chapter_count: int = 0
    
    # 幂等性指标
    run_id: str = ""
    result_hash: str = ""
    is_reproducible: bool = True
    
    # 缓存指标
    cache_hit_rate: float = 0.0
    cache_hits: int = 0
    cache_misses: int = 0
    
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def passes_acceptance(self) -> bool:
        """检查是否通过验收标准"""
        checks = [
            self.duplicate_rate_7d < 0.05,  # < 5%
            self.metaso_credits < 30,
            self.avg_evidence_confidence >= 0.7,
            self.chapter_timestamp_error_ms < 1000,  # < 1s
            self.is_reproducible,
        ]
        return all(checks)
    
    def get_failures(self) -> List[str]:
        """获取未通过的指标"""
        failures = []
        
        if self.duplicate_rate_7d >= 0.05:
            failures.append(f"7天重复率过高: {self.duplicate_rate_7d:.1%} >= 5%")
        
        if self.metaso_credits >= 30:
            failures.append(f"MetaSo credits超标: {self.metaso_credits} >= 30")
        
        if self.avg_evidence_confidence < 0.7:
            failures.append(f"证据置信度不足: {self.avg_evidence_confidence:.2f} < 0.7")
        
        if self.chapter_timestamp_error_ms >= 1000:
            failures.append(f"章节时间戳误差过大: {self.chapter_timestamp_error_ms:.0f}ms >= 1s")
        
        if not self.is_reproducible:
            failures.append("幂等性检查失败: 复跑结果不一致")
        
        return failures
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "episode_id": self.episode_id,
            "timestamp": self.timestamp,
            "duplicate_rate_7d": self.duplicate_rate_7d,
            "metaso_credits": self.metaso_credits,
            "total_cost_usd": self.total_cost_usd,
            "avg_evidence_confidence": self.avg_evidence_confidence,
            "chapter_timestamp_error_ms": self.chapter_timestamp_error_ms,
            "cache_hit_rate": self.cache_hit_rate,
            "run_id": self.run_id,
            "result_hash": self.result_hash,
            "is_reproducible": self.is_reproducible,
            "passes_acceptance": self.passes_acceptance(),
            "failures": self.get_failures(),
            "metadata": self.metadata,
        }


def calculate_duplicate_rate(
    current_items: List[Dict[str, Any]],
    history_items: List[Dict[str, Any]],
    days: int = 7,
) -> tuple[float, int]:
    """
    计算重复率
    
    Args:
        current_items: 当前选中的条目
        history_items: 历史条目（最近N天）
        days: 天数
        
    Returns:
        (duplicate_rate, duplicate_count)
    """
    if not current_items:
        return 0.0, 0
    
    # 使用SimHash或标题相似度检测重复
    from src.store.fingerprints import compute_simhash
    
    current_hashes = {compute_simhash(item.get("title", "") + item.get("content", "")) for item in current_items}
    history_hashes = {compute_simhash(item.get("title", "") + item.get("content", "")) for item in history_items}
    
    # 计算汉明距离 <= 3 的重复
    duplicate_count = 0
    for curr_hash in current_hashes:
        for hist_hash in history_hashes:
            hamming_dist = bin(curr_hash ^ hist_hash).count('1')
            if hamming_dist <= 3:
                duplicate_count += 1
                break
    
    duplicate_rate = duplicate_count / len(current_items)
    return duplicate_rate, duplicate_count


def calculate_metaso_credits(metrics: Any) -> int:
    """
    计算MetaSo credits使用量
    
    Args:
        metrics: 指标收集器
        
    Returns:
        credits数量
    """
    # 假设每次MetaSo调用消耗1 credit
    metaso_calls = metrics.get_counter("api.metaso.calls")
    return int(metaso_calls)


def calculate_avg_evidence_confidence(evidence_packs: List[Dict[str, Any]]) -> float:
    """
    计算平均证据置信度
    
    Args:
        evidence_packs: 证据包列表
        
    Returns:
        平均置信度
    """
    if not evidence_packs:
        return 0.0
    
    confidences = [pack.get("confidence", 0.0) for pack in evidence_packs]
    return sum(confidences) / len(confidences)


def calculate_chapter_timestamp_error(
    chapters: List[Dict[str, Any]],
    actual_timeline: List[Dict[str, Any]],
) -> float:
    """
    计算章节时间戳误差
    
    Args:
        chapters: 章节列表（预期时间戳）
        actual_timeline: 实际时间轴
        
    Returns:
        平均误差（毫秒）
    """
    if not chapters or not actual_timeline:
        return 0.0
    
    errors = []
    for chapter in chapters:
        expected_time = chapter.get("start_time", 0.0)
        
        # 找到最接近的实际时间点
        closest_actual = min(
            actual_timeline,
            key=lambda x: abs(x.get("start_time", 0.0) - expected_time)
        )
        
        error = abs(closest_actual.get("start_time", 0.0) - expected_time)
        errors.append(error * 1000)  # 转换为毫秒
    
    return sum(errors) / len(errors) if errors else 0.0


def check_reproducibility(
    run_id: str,
    result: Dict[str, Any],
    previous_results: Dict[str, Dict[str, Any]],
) -> tuple[bool, str]:
    """
    检查幂等性
    
    Args:
        run_id: 运行ID
        result: 当前结果
        previous_results: 之前的结果（按run_id索引）
        
    Returns:
        (is_reproducible, result_hash)
    """
    # 计算结果哈希
    result_hash = compute_hash(result)
    
    # 检查是否有相同run_id的历史结果
    if run_id in previous_results:
        previous_hash = previous_results[run_id].get("result_hash")
        is_reproducible = (result_hash == previous_hash)
    else:
        # 首次运行，默认可复现
        is_reproducible = True
    
    return is_reproducible, result_hash


def collect_acceptance_metrics(
    episode_id: str,
    run_id: str,
    selected_items: List[Dict[str, Any]],
    evidence_packs: List[Dict[str, Any]],
    chapters: List[Dict[str, Any]],
    timeline: List[Dict[str, Any]],
    result: Dict[str, Any],
    *,
    history_path: Optional[Path] = None,
) -> AcceptanceMetrics:
    """
    收集验收指标
    
    Args:
        episode_id: 节目ID
        run_id: 运行ID
        selected_items: 选中的条目
        evidence_packs: 证据包
        chapters: 章节
        timeline: 时间轴
        result: 完整结果
        history_path: 历史数据路径
        
    Returns:
        验收指标
    """
    logger = logging.getLogger("acceptance_metrics")
    
    metrics = AcceptanceMetrics(
        episode_id=episode_id,
        timestamp=datetime.now().timestamp(),
        run_id=run_id,
    )
    
    # 1. 计算重复率
    if history_path and history_path.exists():
        # 加载最近7天的历史
        history_items = load_recent_history(history_path, days=7)
        duplicate_rate, duplicate_count = calculate_duplicate_rate(
            selected_items,
            history_items,
            days=7
        )
        metrics.duplicate_rate_7d = duplicate_rate
        metrics.duplicate_count = duplicate_count
        metrics.total_items = len(selected_items)
        logger.info(f"7天重复率: {duplicate_rate:.1%} ({duplicate_count}/{len(selected_items)})")
    
    # 2. 计算MetaSo credits
    metrics.metaso_credits = calculate_metaso_credits(get_metrics())
    logger.info(f"MetaSo credits: {metrics.metaso_credits}")
    
    # 3. 计算总成本
    metrics.total_cost_usd = get_metrics().get_total_cost()
    logger.info(f"总成本: ${metrics.total_cost_usd:.4f}")
    
    # 4. 计算证据置信度
    metrics.avg_evidence_confidence = calculate_avg_evidence_confidence(evidence_packs)
    metrics.evidence_pack_count = len(evidence_packs)
    logger.info(f"平均证据置信度: {metrics.avg_evidence_confidence:.2f}")
    
    # 5. 计算章节时间戳误差
    metrics.chapter_timestamp_error_ms = calculate_chapter_timestamp_error(chapters, timeline)
    metrics.chapter_count = len(chapters)
    logger.info(f"章节时间戳误差: {metrics.chapter_timestamp_error_ms:.0f}ms")
    
    # 6. 检查幂等性
    previous_results = load_previous_results(history_path) if history_path else {}
    is_reproducible, result_hash = check_reproducibility(run_id, result, previous_results)
    metrics.is_reproducible = is_reproducible
    metrics.result_hash = result_hash
    logger.info(f"幂等性检查: {'通过' if is_reproducible else '失败'}")
    
    # 7. 缓存指标
    cache_hits = get_metrics().get_counter("cache.hit")
    cache_misses = get_metrics().get_counter("cache.miss")
    metrics.cache_hits = int(cache_hits)
    metrics.cache_misses = int(cache_misses)
    total_cache = cache_hits + cache_misses
    metrics.cache_hit_rate = cache_hits / total_cache if total_cache > 0 else 0.0
    logger.info(f"缓存命中率: {metrics.cache_hit_rate:.1%}")
    
    # 验收检查
    if metrics.passes_acceptance():
        logger.info("✓ 所有验收指标通过")
    else:
        logger.warning("✗ 部分验收指标未通过:")
        for failure in metrics.get_failures():
            logger.warning(f"  - {failure}")
    
    return metrics


def load_recent_history(history_path: Path, days: int = 7) -> List[Dict[str, Any]]:
    """加载最近N天的历史数据"""
    # 简化实现：从历史文件加载
    # 实际实现应该从数据库或文件系统加载
    return []


def load_previous_results(history_path: Path) -> Dict[str, Dict[str, Any]]:
    """加载之前的运行结果"""
    # 简化实现
    return {}


def save_acceptance_metrics(metrics: AcceptanceMetrics, output_path: Path) -> Path:
    """保存验收指标"""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    content = stable_json_dumps(metrics.to_dict())
    output_path.write_text(content, encoding='utf-8')
    return output_path


__all__ = [
    "AcceptanceMetrics",
    "collect_acceptance_metrics",
    "save_acceptance_metrics",
]
