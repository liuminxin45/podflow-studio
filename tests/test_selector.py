from __future__ import annotations

import datetime as dt

from src.store.selector import SelectionConfig, select_clusters
from src.store.scoring import ScoringConfig
from src.store.constraints import ConstraintConfig
from src.utils.models import NewsSource, NewsItem, StoryCluster, StoryClusterSignals


def _make_item(idx: int, domain: str, topic: str) -> dict:
    item = {
        "id": f"item:{idx}",
        "title": f"新闻{idx}",
        "summary": f"摘要{idx}",
        "content": f"内容{idx}",
        "category": topic,
        "url": f"https://{domain}/news/{idx}",
        "source": {"domain": domain, "url": f"https://{domain}/news/{idx}"},
        "quality": {"extract_confidence": 0.8},
    }
    return item


def _make_cluster(idx: int, items: list[str], headline: str, topic: str, days_offset: int = 0) -> StoryCluster:
    now = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=days_offset)
    return StoryCluster(
        cluster_id=f"clu:{idx}",
        headline=headline,
        topic=topic,
        items=items,
        first_seen_at=now.isoformat(),
        last_seen_at=now.isoformat(),
        cooldown_until=(now + dt.timedelta(days=1)).isoformat(),
        signals=StoryClusterSignals(freshness=1.0),
    )


def test_selector_prefers_higher_score_and_respects_limit():
    items = {
        "item:1": _make_item(1, "a.com", "ai"),
        "item:2": _make_item(2, "b.com", "ai"),
        "item:3": _make_item(3, "c.com", "fin"),
    }

    cluster1 = _make_cluster(1, ["item:1"], "AI 最新进展", "ai", days_offset=0)
    cluster2 = _make_cluster(2, ["item:2"], "芯片供应链观察", "ai", days_offset=2)
    cluster3 = _make_cluster(3, ["item:3"], "金融动态", "fin", days_offset=0)

    cfg = SelectionConfig(
        max_clusters=5,
        scoring=ScoringConfig(freshness_half_life_days=1.0),
        constraints=ConstraintConfig(
            max_per_domain=2,
            max_per_topic=1,
            cooldown_days=0,
            max_title_similarity=0.2,
        ),
    )

    result = select_clusters(
        [cluster1, cluster2, cluster3],
        item_lookup=items,
        config=cfg,
        now=dt.datetime.now(dt.timezone.utc),
    )

    assert len(result["selected"]) == 1
    selected_ids = {entry["cluster"]["cluster_id"] for entry in result["selected"]}
    assert selected_ids == {"clu:1"}
    rejected = {entry["cluster"]["cluster_id"]: entry for entry in result["rejected"]}
    assert "clu:2" in rejected
    assert "limit" in rejected["clu:2"]["reasons"] or any(reason.startswith("topic_quota") for reason in rejected["clu:2"]["reasons"])


def test_selector_provides_reasons():
    items = {"item:1": _make_item(1, "a.com", "ai")}
    cluster = _make_cluster(1, ["item:1"], "旧闻", "ai", days_offset=-5)
    cfg = SelectionConfig(max_clusters=1)
    result = select_clusters([cluster], item_lookup={}, config=cfg)
    assert result["rejected"][0]["reasons"] == ["missing_items"]
