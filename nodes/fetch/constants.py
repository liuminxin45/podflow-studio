"""Configuration constants for fetch node filtering and scoring."""

BREADTH_PER_SOURCE_CAP = {
    1: 20,
    2: 50,
    3: 100,
    4: 200,
    5: 0,  # unlimited
}

QUALITY_MIN_LENGTH = {
    1: 0,
    2: 40,
    3: 100,
    4: 160,
    5: 220,
}

DEDUPLICATION_THRESHOLDS = {
    "default": 0.85,
    "high_quality": 0.9,
    "relaxed": 0.82,
}

EVENT_DETECTION_THRESHOLD = 0.75
TOPIC_GROUPING_THRESHOLD = 0.78

FRESHNESS_HOURS = {
    1: None,  # no filter
    2: 24 * 7,  # 1 week
    3: 72,  # 3 days
    4: 24,  # 1 day
    5: 6,  # 6 hours (realtime)
}

LANGUAGE_DETECTION = {
    "chinese_cjk_ratio": 0.2,
    "chinese_min_chars": 5,
    "english_alpha_ratio": 0.4,
    "english_min_chars": 20,
}

RELEVANCE_SCORE_THRESHOLDS = {
    "high": 0.4,
    "medium_high": 0.25,
    "medium": 0.15,
    "low": 0.05,
}

RELEVANCE_SCORES = {
    "high": 5,
    "medium_high": 4,
    "medium": 3,
    "low": 2,
    "baseline": 1,
    "no_topic": 3,
    "keyword_only": 2,
}

RECENCY_SCORES = {
    "6h": 30,
    "24h": 18,
    "72h": 8,
}

SCORING_WEIGHTS = {
    "relevance": 12,
    "trend_boost_per_occurrence": 8,
    "keyword_hit": 6,
    "group_boost_per_item": 4,
}

TOKENIZATION = {
    "short_allow_list": {"ai", "ml", "llm", "ar", "vr", "5g"},
    "min_english_token_len": 3,
    "min_chinese_token_len": 2,
    "stopwords": {
        "the", "and", "for", "with", "from", "that", "this", "into", "about",
        "关注", "方向", "相关", "新闻", "资讯", "话题", "今天", "最新",
    },
}

PRIORITY_SOURCES = ["newsnow", "hackernews", "techcrunch", "ai_news_daily"]

EXCLUDED_SOURCE_FILES = ["_", "base.py", "example_custom"]
