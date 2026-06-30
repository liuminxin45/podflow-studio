from typing import Any
from datetime import datetime, timedelta, UTC
from nodes.topic_selection.config import TopicSelectionConfig
from protocol.llm_client import LLMClient
from protocol.node_runner import NodeContext


def run(state: dict[str, Any], config: TopicSelectionConfig = None) -> dict[str, Any]:
    config = config or TopicSelectionConfig()
    ctx = NodeContext("TopicSelectionNode", state)
    runtime_config = state.get("runtime_config", {})
    organize_config = runtime_config.get("organize", {})
    is_ai_mode = organize_config.get("mode") == "ai"
    contents = state.get("researched_contents", [])

    # Get LLM config from script node if not set
    if ctx.auto_execute and is_ai_mode:
        script_config = runtime_config.get("script", {})
        if not config.api_key and script_config.get("api_key"):
            config.api_key = script_config.get("api_key")
            config.api_base = script_config.get("api_base", "")
            config.llm_model = script_config.get("llm_model", "gpt-4o-mini")
            config.temperature = script_config.get("temperature", 0.3)
            ctx.log(
                f"Using LLM config from script node: {config.api_base[:30]}... / {config.llm_model}"
            )

    # In auto_execute mode, always use analyze_relevance with target_topic from runtime_config
    discover_config = runtime_config.get("discover", {})
    target_topic_from_runtime = discover_config.get("target_topic", "")
    time_range_from_runtime = discover_config.get("time_range_hours", 72)

    if ctx.auto_execute and target_topic_from_runtime:
        mode = "analyze_relevance"
        config.target_topic = target_topic_from_runtime
        config.time_range_hours = time_range_from_runtime
        config.max_items = discover_config.get("max_items", 10)
    else:
        mode = config.mode

    ctx.log_start(
        f"输入: researched_contents={len(contents)} items | "
        f"mode={mode}, AI={is_ai_mode}, auto={ctx.auto_execute}",
        uses_llm=True,
    )
    if ctx.auto_execute and target_topic_from_runtime:
        ctx.log(
            f"Target topic: '{target_topic_from_runtime}', time_range={time_range_from_runtime}h, max_items={config.max_items}"
        )

    try:
        if not contents:
            ctx.add_error("topic_selection", "No content for topic selection")
            ctx.log_end("输出: (无内容)")
            return ctx.finalize(state)

        if mode == "analyze_relevance":
            # Auto selection mode: select multiple relevant materials by topic
            ctx.log(f"Auto-selection for topic: {config.target_topic}")
            selected, rejected = _analyze_relevance(
                contents, config, ctx.logs, debug_mode=ctx.debug_mode
            )

            if ctx.auto_execute:
                state["selected_materials"] = selected
                state["selected_topic"] = {
                    "title": config.target_topic,
                    "description": f'围绕"{config.target_topic}"筛选的 {len(selected)} 条相关素材',
                    "keywords": [],
                }
                ctx.log(f"✓ Selected {len(selected)} materials for topic '{config.target_topic}'")
            else:
                state["auto_selected_items"] = selected
                state["auto_rejected_items"] = rejected
                ctx.log(f"Selected {len(selected)}, Rejected {len(rejected)}")
        else:
            # Traditional cluster mode with LLM scoring if AI mode
            if ctx.auto_execute and is_ai_mode:
                ctx.log("Using AI-powered clustering")
                config.use_llm_scoring = True

            ctx.log(
                f"Clustering {len(contents)} items (min_cluster_size={config.min_cluster_size})"
            )
            clusters = _cluster_contents(contents, config, ctx.logs)

            if clusters:
                ctx.log(f"Found {len(clusters)} clusters")
                for i, cluster in enumerate(clusters):
                    ctx.log(
                        f"  Cluster {i + 1}: {len(cluster.get('items', []))} items - {cluster.get('title', 'Unknown')}"
                    )

                best = max(clusters, key=lambda c: len(c["items"]))
                state["selected_topic"] = {
                    "title": best.get("title", ""),
                    "description": best.get("description", ""),
                    "keywords": best.get("keywords", []),
                }
                state["selected_materials"] = best.get("items", [])
                ctx.log(
                    f"✓ Selected cluster: '{state['selected_topic']['title']}' with {len(state['selected_materials'])} materials"
                )
            else:
                ctx.log("No clusters formed, using all contents")
                state["selected_topic"] = {
                    "title": "General Topic",
                    "description": "",
                    "keywords": [],
                }
                state["selected_materials"] = contents
    except Exception as e:
        ctx.add_error("topic_selection", str(e), str(e))
        ctx.log(f"Error: {str(e)}")

    selected_topic = state.get("selected_topic", {})
    selected_materials = state.get("selected_materials", [])
    detail = f"输出: selected_topic='{selected_topic.get('title', 'N/A')[:50]}', selected_materials={len(selected_materials)} items"
    if selected_materials:
        sample_titles = [m.get("title", "Untitled")[:40] for m in selected_materials[:3]]
        detail += f" | 样本: {sample_titles}"
    ctx.log_end(detail)
    return ctx.finalize(state)


def _cluster_contents(
    contents: list[dict], config: TopicSelectionConfig, logs: list[str]
) -> list[dict]:
    """Pure-Python content clustering using TF vectors + cosine similarity.
    No external dependencies (replaces sklearn TF-IDF + KMeans)."""
    if len(contents) < config.min_cluster_size:
        logs.append(
            f"[TopicSelection] Content count ({len(contents)}) < min_cluster_size ({config.min_cluster_size}), creating single cluster"
        )
        return [{"title": "General Topic", "description": "", "keywords": [], "items": contents}]

    import re
    import math
    from collections import Counter

    logs.append("[TopicSelection] Starting pure-Python TF vectorization...")

    # Tokenize each document
    def tokenize(text: str) -> list[str]:
        text = text.lower()
        # Split on non-word chars, keep Chinese chars and alphanumeric
        tokens = re.findall(r"[\u4e00-\u9fff]+|[a-z0-9]{2,}", text)
        return tokens

    doc_tokens = [
        tokenize(item.get("content", "") + " " + item.get("title", "")) for item in contents
    ]

    # Build vocabulary from top terms by document frequency
    df: Counter = Counter()
    for tokens in doc_tokens:
        for t in set(tokens):
            df[t] += 1
    # Filter: appear in at least 2 docs, at most 80% of docs
    max_df = max(2, int(len(contents) * 0.8))
    vocab = [t for t, count in df.most_common(200) if 2 <= count <= max_df][:100]
    logs.append(f"[TopicSelection] Vocabulary: {len(vocab)} terms from {len(contents)} documents")

    if not vocab:
        logs.append("[TopicSelection] Empty vocabulary, returning single cluster")
        return [{"title": "General Topic", "description": "", "keywords": [], "items": contents}]

    # Build TF vectors
    vectors: list[list[float]] = []
    for tokens in doc_tokens:
        tf = Counter(tokens)
        vec = [tf.get(t, 0) for t in vocab]
        # Normalize
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        vectors.append([v / norm for v in vec])

    # Simple K-Means clustering (pure Python)
    n_clusters = max(1, min(3, len(contents) // config.min_cluster_size))
    logs.append(f"[TopicSelection] Running pure-Python K-Means with {n_clusters} clusters...")

    # Initialize centroids using first n_clusters items (deterministic)
    dim = len(vocab)
    centroids = [list(vectors[i * len(vectors) // n_clusters]) for i in range(n_clusters)]
    labels = [0] * len(vectors)

    for iteration in range(20):
        # Assign each point to nearest centroid
        changed = 0
        for i, vec in enumerate(vectors):
            best_c = 0
            best_sim = -1.0
            for c in range(n_clusters):
                sim = sum(a * b for a, b in zip(vec, centroids[c]))
                if sim > best_sim:
                    best_sim = sim
                    best_c = c
            if labels[i] != best_c:
                changed += 1
            labels[i] = best_c
        if changed == 0:
            break
        # Recompute centroids
        for c in range(n_clusters):
            members = [vectors[i] for i in range(len(vectors)) if labels[i] == c]
            if members:
                centroids[c] = [sum(m[d] for m in members) / len(members) for d in range(dim)]

    logs.append(f"[TopicSelection] K-Means completed in {iteration + 1} iterations")

    clusters = []
    for i in range(n_clusters):
        cluster_items = [contents[j] for j in range(len(contents)) if labels[j] == i]
        if cluster_items:
            cluster_title = f"Topic Cluster {i + 1}"
            sample_titles = [item.get("title", "")[:30] for item in cluster_items[:3]]
            logs.append(
                f"[TopicSelection] Cluster {i + 1}: {len(cluster_items)} items, samples: {sample_titles}"
            )
            clusters.append(
                {
                    "title": cluster_title,
                    "description": "",
                    "keywords": [],
                    "items": cluster_items,
                }
            )
    return clusters


def _keyword_prefilter(contents: list[dict], topic: str, cap: int) -> tuple:
    """Reorder candidates by topic keyword relevance before LLM evaluation.
    Ensures the capped LLM input contains the most likely relevant items,
    not just the top-N by hotlist rank."""
    import re

    keywords = [w for w in re.findall(r"[\u4e00-\u9fff]{2,}|[A-Za-z0-9]{3,}", topic) if len(w) >= 2]
    if not keywords:
        return contents[:cap], contents[cap:]

    def _score(item: dict) -> int:
        text = (item.get("title", "") + " " + item.get("content", "")[:150]).lower()
        return sum(1 for kw in keywords if kw.lower() in text)

    scored = sorted(range(len(contents)), key=lambda i: _score(contents[i]), reverse=True)
    ordered = [contents[i] for i in scored]
    return ordered[:cap], ordered[cap:]


def _analyze_relevance(
    contents: list[dict], config: TopicSelectionConfig, logs: list[str], debug_mode: bool = False
) -> tuple:
    """Analyze content relevance using LLM. Returns (selected, rejected)."""
    logs.append(
        f"[TopicSelection] _analyze_relevance called with {len(contents)} items (debug_mode={debug_mode})"
    )
    logs.append(
        f"[TopicSelection] Config: api_key={'SET' if config.api_key else 'NOT SET'}, api_base={config.api_base}, model={config.llm_model}"
    )

    time_filtered = _filter_by_time(contents, config.time_range_hours)
    logs.append(
        f"[TopicSelection] Time filter: {len(time_filtered)}/{len(contents)} items within {config.time_range_hours}h"
    )

    if not time_filtered:
        logs.append("[TopicSelection] No items after time filter, returning empty")
        return [], contents

    if not config.api_key or not config.api_base:
        logs.append(
            f"[TopicSelection] ⚠ No LLM config (api_key={bool(config.api_key)}, api_base={bool(config.api_base)}), skipping AI analysis"
        )
        logs.append(
            f"[TopicSelection] Fallback: returning first {config.max_items} items without AI scoring"
        )
        return time_filtered[: config.max_items], time_filtered[config.max_items :] + [
            c for c in contents if c not in time_filtered
        ]

    try:
        llm_input_cap = max(config.max_items * 3, 20)
        llm_candidates, skipped_candidates = _keyword_prefilter(
            time_filtered, config.target_topic, llm_input_cap
        )
        logs.append(
            f"[TopicSelection] LLM候选池: max_items={config.max_items} → 候选上限={llm_input_cap} (max_items*3, 关键词预排序)"
        )
        if skipped_candidates:
            logs.append(
                f"[TopicSelection] LLM input capped: {len(llm_candidates)}/{len(time_filtered)} items (skipped={len(skipped_candidates)})"
            )

        logs.append(f"[TopicSelection] Starting LLM analysis with {len(llm_candidates)} items...")
        import time

        start_time = time.time()

        with LLMClient(
            config.api_base,
            config.api_key,
            config.llm_model,
            config.temperature,
            debug_mode=debug_mode,
        ) as client:
            logs.append("[TopicSelection] LLMClient initialized, calling _llm_batch_analyze...")
            analyzed = _llm_batch_analyze(llm_candidates, config, client, logs)

        elapsed = time.time() - start_time
        logs.append(f"[TopicSelection] LLM analysis completed in {elapsed:.2f}s")

        analyzed.sort(key=lambda x: x.get("_topic_score", 0), reverse=True)
        selected = [
            item
            for item in analyzed
            if item.get("_topic_decision") == "keep"
            and item.get("_topic_score", 0) >= config.min_match_score
        ][: config.max_items]
        rejected = [item for item in analyzed if item.get("_topic_decision") != "keep"]
        rejected += skipped_candidates
        rejected += [c for c in contents if c not in time_filtered]

        logs.append(
            f"[TopicSelection] ✓ LLM analysis result: {len(selected)} selected, {len(rejected)} rejected"
        )
        return selected, rejected
    except Exception as e:
        logs.append(f"[TopicSelection] ✗ LLM analysis failed: {type(e).__name__}: {str(e)}")
        import traceback

        logs.append(f"[TopicSelection] Traceback: {traceback.format_exc()}")
        logs.append(
            f"[TopicSelection] Fallback: returning first {config.max_items} items without AI scoring"
        )
        return time_filtered[: config.max_items], time_filtered[config.max_items :] + [
            c for c in contents if c not in time_filtered
        ]


def _filter_by_time(contents: list[dict], hours: int) -> list[dict]:
    """Filter contents by publish time within specified hours.
    Items without a parseable publish time are included (benefit of the doubt)."""
    if hours <= 0:
        return contents

    cutoff = datetime.now() - timedelta(hours=hours)
    filtered = []

    for item in contents:
        pub_time = (
            item.get("published_at")
            or item.get("pubDate")
            or item.get("pub_time")
            or item.get("published")
        )
        if not pub_time:
            # No publish time — include the item (hotlist items are always fresh)
            filtered.append(item)
            continue

        try:
            if isinstance(pub_time, str):
                pub_dt = datetime.fromisoformat(pub_time.replace("Z", "+00:00"))
            else:
                pub_dt = pub_time
            # Strip timezone for comparison if needed
            if pub_dt.tzinfo is not None:
                cutoff_aware = cutoff.replace(tzinfo=UTC)
                if pub_dt >= cutoff_aware:
                    filtered.append(item)
            else:
                if pub_dt >= cutoff:
                    filtered.append(item)
        except Exception:
            # Unparseable time — include the item
            filtered.append(item)

    return filtered


def _llm_batch_analyze(
    contents: list[dict], config: TopicSelectionConfig, client: LLMClient, logs: list[str]
) -> list[dict]:
    """Use LLM to analyze relevance in batches."""

    def create_prompt(batch: list[dict]) -> str:
        if client.debug_mode:
            item = batch[0]
            title = item.get("title", "")[:50]
            content = item.get("content", "")[:50]

            prompt = f"""选题：{config.target_topic}

文章：{title}
摘要：{content}

输出JSON: {{"decision":"keep"或"drop","score":0-100}}"""
            return prompt

        prompt = f"""你是专业的内容主编。当前选题任务：{config.target_topic}
{"额外要求：" + config.focus_instruction if config.focus_instruction else ""}

请评估以下文章与选题方向的相关性。评分标准（严格执行）：
- 90-100分：核心直接相关，明确涉及该领域
- 70-89分：有明确关联点，可从选题角度自然切入
- 50-69分：弱相关，需要较多延伸解读才能关联
- 0-49分：实质无关或强行关联

决策规则：score≥70且内容有实际利用价值才选keep，否则一律drop。

文章列表：
"""
        for idx, item in enumerate(batch):
            title = item.get("title", "")
            summary = item.get("summary", item.get("content", ""))[:120]
            prompt += f"{idx + 1}. 标题：{title}\n   摘要：{summary}\n\n"

        prompt += """请对每篇文章输出JSON数组，格式：
[{"index": 1, "score": 0-100, "decision": "keep"或"drop", "reason": "一句话理由", "angle": "建议切入角度"}]

只输出JSON数组，不要其他内容。"""
        return prompt

    def parse_results(batch: list[dict], parsed: list[dict]) -> list[dict]:
        if client.debug_mode:
            item = batch[0]
            if isinstance(parsed, dict):
                item["_topic_score"] = parsed.get("score", 0)
                item["_topic_decision"] = parsed.get("decision", "drop")
                item["_topic_reason"] = ""
                item["_topic_angle"] = ""
            else:
                item["_topic_score"] = 0
                item["_topic_decision"] = "drop"
                item["_topic_reason"] = ""
                item["_topic_angle"] = ""
            return [item]

        result_dict = {r.get("index", i + 1): r for i, r in enumerate(parsed)}
        for idx, item in enumerate(batch):
            result = result_dict.get(
                idx + 1, {"score": 0, "decision": "drop", "reason": "解析失败", "angle": ""}
            )
            item["_topic_score"] = result.get("score", 0)
            item["_topic_decision"] = result.get("decision", "drop")
            item["_topic_reason"] = result.get("reason", "")
            item["_topic_angle"] = result.get("angle", "")
        return batch

    return client.batch_analyze(contents, create_prompt, parse_results, logs)
