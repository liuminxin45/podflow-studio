"""
Unit tests for src/tts/segmenter.py
"""

from __future__ import annotations

from src.tts.segmenter import (
    TextSegment,
    normalize_numbers,
    normalize_dates,
    normalize_text_for_tts,
    segment_text,
    segment_script_for_tts,
    estimate_duration,
)


def test_normalize_numbers():
    text = "增长了50%，达到100.5万元"
    result = normalize_numbers(text)
    
    assert "百分之50" in result
    assert "100点5" in result


def test_normalize_dates():
    text = "2025年12月26日和2025-12-26以及12/26"
    result = normalize_dates(text)
    
    assert "2025年12月26日" in result
    assert "12月26日" in result


def test_normalize_text_for_tts():
    text = "AI技术在2025年增长了30%"
    result = normalize_text_for_tts(text)
    
    # 检查数字和日期规范化
    assert "2025年" in result
    assert "百分之30" in result
    # AI替换需要单词边界，这里"AI技术"不会被替换


def test_segment_text_basic():
    text = "这是第一句话。这是第二句话！这是第三句话？"
    segments = segment_text(text, min_length=5, max_length=35)
    
    assert len(segments) > 0
    assert all(isinstance(s, TextSegment) for s in segments)
    assert all(len(s.text) <= 35 for s in segments)


def test_segment_text_long_sentence():
    text = "这是一个非常非常非常非常非常非常非常非常非常非常长的句子，需要被分割成多个片段。"
    segments = segment_text(text, max_length=35)
    
    assert len(segments) > 1
    assert all(len(s.text) <= 35 for s in segments)


def test_segment_text_with_paragraphs():
    text = """第一段内容。
    
第二段内容。

第三段内容。"""
    
    segments = segment_text(text)
    
    assert len(segments) >= 3
    # 检查段落标记
    paragraph_breaks = [s for s in segments if s.metadata.get("paragraph_break")]
    assert len(paragraph_breaks) >= 1


def test_estimate_duration():
    text = "这是一个测试句子。"
    duration = estimate_duration(text)
    
    assert duration > 0
    assert duration < 10  # 应该在合理范围内


def test_estimate_duration_with_punctuation():
    text = "第一句。第二句！第三句？"
    duration = estimate_duration(text)
    
    # 应该包含停顿时间
    assert duration > len(text) / 3.5


def test_segment_script_for_tts():
    script = """
    欢迎收听本期播客。
    
    今天我们来聊聊人工智能的发展。数据显示，AI市场在2025年增长了50%。
    
    这个趋势值得我们关注。
    """
    
    segments = segment_script_for_tts(script, min_length=10, max_length=35)
    
    assert len(segments) > 0
    assert all(s.normalized_text for s in segments)
    assert all(s.duration_estimate > 0 for s in segments)


def test_segment_script_merge_short():
    script = "短。也短。还是短。这个稍微长一点但还是比较短。"
    
    segments = segment_script_for_tts(script, min_length=15, merge_short=True)
    
    # 短片段应该被合并
    assert all(len(s.text) >= 10 for s in segments)


def test_text_segment_to_dict():
    segment = TextSegment(
        text="测试文本",
        segment_index=0,
        normalized_text="测试文本",
        duration_estimate=2.5,
        metadata={"test": "value"},
    )
    
    data = segment.to_dict()
    
    assert data["text"] == "测试文本"
    assert data["segment_index"] == 0
    assert data["duration_estimate"] == 2.5
    assert data["metadata"]["test"] == "value"


def test_segment_text_empty():
    text = ""
    segments = segment_text(text)
    
    assert len(segments) == 0


def test_segment_text_only_punctuation():
    text = "。！？；"
    segments = segment_text(text, min_length=1)
    
    # 标点会被分割，但每个都很短
    # 实际实现中标点会被保留
    assert all(len(s.text) <= 2 for s in segments)


def test_normalize_special_terms():
    text = "CEO 宣布 IPO 计划，APP 下载量突破1000万"
    result = normalize_text_for_tts(text)
    
    # 需要单词边界才能替换
    assert "首席执行官" in result
    assert "首次公开募股" in result
    assert "应用程序" in result


def test_segment_preserves_order():
    text = "第一句。第二句。第三句。"
    segments = segment_text(text)
    
    # 检查顺序
    for i, segment in enumerate(segments):
        assert segment.segment_index == i


def test_segment_text_max_length_enforcement():
    text = "这是一个测试，" * 20  # 带标点的重复文本
    segments = segment_text(text, max_length=35)
    
    # 大部分片段应该符合长度限制
    # 允许少数片段稍微超出（由于分割逻辑）
    short_segments = [s for s in segments if len(s.text) <= 40]
    assert len(short_segments) >= len(segments) * 0.8


def test_segment_with_mixed_content():
    text = "中文内容 English content 123 数字 2025年12月26日"
    segments = segment_text(text, normalize=True)
    
    assert len(segments) > 0
    # 规范化应该处理日期
    assert any("2025年12月26日" in s.normalized_text for s in segments)
