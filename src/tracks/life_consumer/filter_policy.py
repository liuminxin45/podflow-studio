"""
Life Consumer Filter Policy

国内生活消费赛道的内容过滤策略
"""

from __future__ import annotations

from typing import Any, Dict, List

from src.tracks.base import FilterPolicy


class LifeConsumerFilterPolicy(FilterPolicy):
    """国内生活消费过滤策略
    
    优先保留：
    - 国内新闻（中国、北京、上海等）
    - 民生相关（医疗、教育、住房、就业、养老）
    - 消费相关（价格、产品、服务、电商、零售）
    - 公共安全（食品安全、交通事故、自然灾害）
    - 政策法规（新政策、法律、监管）
    """
    
    def __init__(self, options: Dict[str, Any]):
        self.options = options
        
        # 优先级关键词
        self.priority_keywords = [
            # 地域
            "中国", "国内", "北京", "上海", "广州", "深圳",
            # 民生
            "医疗", "教育", "住房", "就业", "养老", "社保", "医保",
            # 消费
            "价格", "涨价", "降价", "消费", "购物", "电商", "零售", "超市",
            "食品", "餐饮", "外卖", "快递", "物流",
            # 安全
            "安全", "事故", "火灾", "地震", "台风", "洪水", "疫情",
            "食品安全", "交通事故",
            # 政策
            "政策", "法律", "法规", "监管", "新规", "通知", "公告",
            # 社会
            "维权", "投诉", "曝光", "调查", "处罚", "整改",
        ]
        
        # 排除关键词（国际新闻、娱乐八卦等）
        self.exclude_keywords = [
            "美国", "日本", "韩国", "欧洲", "俄罗斯", "印度",
            "明星", "娱乐圈", "八卦", "绯闻",
        ]
    
    def should_include_item(self, item: dict) -> bool:
        """判断 item 是否应该被包含"""
        title = item.get("title", "").lower()
        content = item.get("content", "").lower()
        summary = item.get("summary", "").lower()
        
        text = f"{title} {content} {summary}"
        
        # 检查是否包含排除关键词
        for keyword in self.exclude_keywords:
            if keyword in text:
                return False
        
        # 检查是否包含优先级关键词
        for keyword in self.priority_keywords:
            if keyword in text:
                return True
        
        # 默认保留（后续由打分和 Gate 筛选）
        return True
    
    def get_priority_keywords(self) -> List[str]:
        return self.priority_keywords
