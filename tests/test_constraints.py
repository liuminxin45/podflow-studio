from __future__ import annotations

import datetime as dt

from src.store.constraints import ClusterMetadata, ConstraintConfig, ConstraintState, apply_constraints
from src.utils.models import StoryCluster, StoryClusterSignals


def _make_cluster(idx: int, cooldown_delta_days: int = 0) -> StoryCluster:
    now = dt.datetime.now(dt.timezone.utc)
    cooldown = now + dt.timedelta(days=cooldown_delta_days)
    return StoryCluster(
        cluster_id=f"clu:{idx}",
        headline=f"测试标题{idx}",
        topic="tech",
        items=[f"item:{idx}"],
        first_seen_at=now.isoformat(),
        last_seen_at=now.isoformat(),
        cooldown_until=cooldown.isoformat(),
        signals=StoryClusterSignals(freshness=1.0),
    )


def test_cooldown_blocks_cluster_without_exception():
    cluster = _make_cluster(1, cooldown_delta_days=1)
    metadata = ClusterMetadata(topic="ai", domains=["example.com"], headline="普通新闻")
    state = ConstraintState()
    ok, reasons = apply_constraints(cluster=cluster, metadata=metadata, state=state, config=ConstraintConfig(), now=dt.datetime.now(dt.timezone.utc))
    assert not ok
    assert "cooldown" in reasons


def test_exception_keyword_allows_cluster():
    cluster = _make_cluster(2, cooldown_delta_days=1)
    metadata = ClusterMetadata(topic="ai", domains=["example.com"], headline="最新进展发布")
    state = ConstraintState()
    ok, reasons = apply_constraints(cluster=cluster, metadata=metadata, state=state, config=ConstraintConfig(), now=dt.datetime.now(dt.timezone.utc))
    assert ok
    assert reasons == []


def test_topic_and_domain_quota():
    cluster = _make_cluster(3, cooldown_delta_days=-1)
    metadata = ClusterMetadata(topic="ai", domains=["foo.com"], headline="AI 新闻")
    state = ConstraintState(topic_counts={"ai": 2}, domain_counts={"foo.com": 1})
    cfg = ConstraintConfig(max_per_topic=2, max_per_domain=1)
    ok, reasons = apply_constraints(cluster=cluster, metadata=metadata, state=state, config=cfg, now=dt.datetime.now(dt.timezone.utc))
    assert not ok
    assert any(reason.startswith("topic_quota") for reason in reasons) or any(reason.startswith("domain_quota") for reason in reasons)


def test_title_similarity_rejection():
    cluster = _make_cluster(4, cooldown_delta_days=-1)
    metadata = ClusterMetadata(topic="fin", domains=["bar.com"], headline="央行 最新 政策 发布")
    state = ConstraintState()
    state.headline_token_sets.append({"央行", "宣布", "最新", "政策"})
    cfg = ConstraintConfig(max_title_similarity=0.6)
    ok, reasons = apply_constraints(cluster=cluster, metadata=metadata, state=state, config=cfg, now=dt.datetime.now(dt.timezone.utc))
    assert not ok
    assert "too_similar" in reasons
