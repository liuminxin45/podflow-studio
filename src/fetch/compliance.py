"""
Content Compliance Validator (Enhanced)

这个文件实现了抓取内容的合规风险检测与评分，用于在爬虫/聚合/摘要生成前做“自动初筛”。

设计目标：
- 可扩展：规则插件化、可配置权重与阈值
- 可解释：每个问题提供命中片段、位置、上下文
- 可工程化：结构化输出、批量过滤、统计报告
- 可落地：支持站点白名单/来源字段钩子/转载风险提示（不做网络请求）

⚠️ 注意：
- “合规/侵权/违法”不可能 100% 靠规则脚本自动判定。本模块输出的是“风险提示与评分”，用于自动过滤与人工复核辅助。
- 敏感词库/违法词库应由合规团队维护并版本化管理，本文件仅提供结构与示例。

作者：Auto-Podcast Team
版本：2.0.0
更新：2025-12-26
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Tuple, Callable


# =========================
# Config & Built-in Lexicons (示例占位)
# =========================

# 你应把真实敏感词库放到外部文件/数据库，做版本化管理
_DEFAULT_SENSITIVE_WORDS: Dict[str, List[str]] = {
    "政治敏感": ["敏感词1", "敏感词2", "敏感词3"],
    "色情低俗": ["色情词1", "色情词2", "色情词3"],
    "暴力恐怖": ["暴力词1", "暴力词2", "暴力词3"],
    "违法犯罪": ["违法词1", "违法词2", "违法词3"],
    "虚假信息": ["虚假词1", "虚假词2", "虚假词3"],
}

# 违法内容检测（示例）
_DEFAULT_ILLEGAL_PATTERNS: Dict[str, re.Pattern] = {
    "赌博": re.compile(r"(赌博|博彩|六合彩|时时彩|百家乐)", re.IGNORECASE),
    "毒品": re.compile(r"(毒品|大麻|海洛因|冰毒|摇头丸|K粉)", re.IGNORECASE),
    "诈骗": re.compile(r"(诈骗|欺诈|骗钱|刷单|返利|中奖)", re.IGNORECASE),
    "邪教": re.compile(r"(邪教|全能神|呼喊派|门徒会)", re.IGNORECASE),
    "恐怖": re.compile(r"(恐怖|爆炸|袭击|杀人|放火|抢劫)", re.IGNORECASE),
}

# 版权/转载风险关键词（示例）
_DEFAULT_COPYRIGHT_KEYWORDS = [
    "版权所有", "著作权", "©", "Copyright", "All Rights Reserved",
    "未经授权", "禁止转载", "违者必究", "授权转载", "转载", "转自", "来源：", "来源:", "原文链接",
]

# 常见 PII（个人信息）模式：用于降低泄露风险（示例：按中国常用格式）
_PII_PATTERNS: Dict[str, re.Pattern] = {
    "email": re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),
    "phone_cn": re.compile(r"\b1[3-9]\d{9}\b"),  # 简化版
    "id_cn": re.compile(r"\b\d{17}[\dXx]\b"),    # 简化版
    "ip": re.compile(r"\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\b"),
}

# URL 检测（用于外链风险、来源识别、可加白名单策略）
_URL_PATTERN = re.compile(r"https?://[^\s)]+", re.IGNORECASE)


# =========================
# Data Structures
# =========================

@dataclass
class Issue:
    """单条风险/问题"""
    type: str                  # e.g. sensitive_word / illegal_content / copyright / pii
    severity: str              # high / medium / low
    message: str
    confidence: float = 1.0
    location: Optional[str] = None      # e.g. title prefix or "content"
    match_text: Optional[str] = None    # 命中的片段
    span: Optional[Tuple[int, int]] = None  # 在 full_text 中的区间
    context: Optional[str] = None       # 命中上下文窗口
    meta: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ComplianceResult:
    passed: bool = True
    score: float = 1.0
    issues: List[Issue] = field(default_factory=list)
    details: Dict[str, Any] = field(default_factory=dict)

    def add_issue(self, issue: Issue, penalty: float) -> None:
        self.issues.append(issue)
        self.score = max(0.0, self.score - max(0.0, penalty))

    def finalize(self, min_score: float) -> None:
        self.passed = self.score >= min_score

    def to_dict(self) -> Dict[str, Any]:
        return {
            "passed": self.passed,
            "score": float(self.score),
            "issues_count": len(self.issues),
            "issues": [
                {
                    "type": x.type,
                    "severity": x.severity,
                    "message": x.message,
                    "confidence": float(x.confidence),
                    "location": x.location,
                    "match_text": x.match_text,
                    "span": x.span,
                    "context": x.context,
                    "meta": x.meta,
                }
                for x in self.issues
            ],
            "details": self.details,
        }


# =========================
# Utilities
# =========================

def _normalize_text(text: str) -> str:
    # 可扩展：全角半角、大小写、空白规整、特殊符号规整等
    return (text or "").replace("\r\n", "\n").replace("\r", "\n")


def _build_full_text(item: Dict[str, Any]) -> Tuple[str, str, str, str]:
    title = _normalize_text(str(item.get("title", "") or ""))
    summary = _normalize_text(str(item.get("summary", "") or ""))
    content = _normalize_text(str(item.get("content", "") or ""))
    full_text = "\n".join([title, summary, content]).strip()
    return title, summary, content, full_text


def _context_window(text: str, span: Tuple[int, int], window: int = 40) -> str:
    start, end = span
    left = max(0, start - window)
    right = min(len(text), end + window)
    snippet = text[left:right]
    # 简单标注命中区间
    rel_s = start - left
    rel_e = rel_s + (end - start)
    return snippet[:rel_s] + "【" + snippet[rel_s:rel_e] + "】" + snippet[rel_e:]


def _severity_penalty(severity: str, policy_level: str) -> float:
    """
    根据严重等级和策略等级决定扣分基准。
    你也可以把它外置成配置文件。
    """
    base = {"high": 0.55, "medium": 0.30, "low": 0.12}.get(severity, 0.20)
    # strict 更“严”：扣分更大；loose 更“松”：扣分更小
    if policy_level == "strict":
        return base * 1.15
    if policy_level == "loose":
        return base * 0.85
    return base


def _safe_compile_or_pattern(words: Iterable[str]) -> Optional[re.Pattern]:
    """
    将词列表编译成一个 OR 正则，性能更好；并对特殊字符做 escape。
    """
    words = [w for w in (words or []) if w]
    if not words:
        return None
    # 长词优先，减少“短词吞长词”导致的定位偏差
    words = sorted(set(words), key=len, reverse=True)
    pat = "(" + "|".join(re.escape(w) for w in words) + ")"
    return re.compile(pat)


# =========================
# Rule System
# =========================

@dataclass
class RuleConfig:
    enabled: bool = True
    weight: float = 1.0
    # 规则内的附加参数
    params: Dict[str, Any] = field(default_factory=dict)


class Rule:
    name: str

    def __init__(self, cfg: RuleConfig):
        self.cfg = cfg

    def apply(
        self,
        *,
        item: Dict[str, Any],
        title: str,
        summary: str,
        content: str,
        full_text: str,
        policy_level: str,
    ) -> Tuple[List[Issue], Dict[str, Any]]:
        raise NotImplementedError


# =========================
# Concrete Rules
# =========================

class SensitiveWordsRule(Rule):
    name = "sensitive_words"

    def __init__(self, cfg: RuleConfig, lexicon: Optional[Dict[str, List[str]]] = None):
        super().__init__(cfg)
        self.lexicon = lexicon or _DEFAULT_SENSITIVE_WORDS
        # 预编译：每个分类一个 OR 正则
        self._compiled: Dict[str, re.Pattern] = {}
        for cat, words in self.lexicon.items():
            pat = _safe_compile_or_pattern(words)
            if pat:
                self._compiled[cat] = pat

    def apply(self, *, item, title, summary, content, full_text, policy_level):
        issues: List[Issue] = []
        counts: Dict[str, int] = {}

        for cat, pat in self._compiled.items():
            matches = list(pat.finditer(full_text))
            if not matches:
                continue
            counts[cat] = len(matches)

            # 去重：同一 span 或同一 match_text 可合并（这里保留前 N 个）
            max_hits = int(self.cfg.params.get("max_hits_per_category", 20))
            for m in matches[:max_hits]:
                mt = m.group(0)
                span = (m.start(), m.end())
                conf = 0.9 if len(mt) >= 3 else 0.75
                severity = self.cfg.params.get("severity_by_category", {}).get(cat, "medium")

                issues.append(Issue(
                    type="sensitive_word",
                    severity=severity,
                    message=f"检测到敏感词：{mt}（类别：{cat}）",
                    confidence=conf,
                    location=(title[:24] + "...") if title else "content",
                    match_text=mt,
                    span=span,
                    context=_context_window(full_text, span, window=50),
                    meta={"category": cat},
                ))

        details = {"sensitive_words": counts, "total_sensitive_hits": sum(counts.values())}
        return issues, details


class IllegalContentRule(Rule):
    name = "illegal_content"

    def __init__(self, cfg: RuleConfig, patterns: Optional[Dict[str, re.Pattern]] = None):
        super().__init__(cfg)
        self.patterns = patterns or _DEFAULT_ILLEGAL_PATTERNS

    def apply(self, *, item, title, summary, content, full_text, policy_level):
        issues: List[Issue] = []
        counts: Dict[str, int] = {}

        for illegal_type, pat in self.patterns.items():
            matches = list(pat.finditer(full_text))
            if not matches:
                continue
            counts[illegal_type] = len(matches)

            max_hits = int(self.cfg.params.get("max_hits_per_type", 20))
            for m in matches[:max_hits]:
                mt = m.group(0)
                span = (m.start(), m.end())

                # 规则默认：这些类别一律 high（你也可以改为按 policy_level 调整）
                severity = "high" if illegal_type in {"毒品", "赌博", "诈骗", "邪教", "恐怖"} else "medium"
                conf = min(1.0, 0.75 + 0.05 * min(5, counts[illegal_type]))

                issues.append(Issue(
                    type="illegal_content",
                    severity=severity,
                    message=f"检测到违法/高风险内容：{mt}（类型：{illegal_type}）",
                    confidence=conf,
                    location=(title[:24] + "...") if title else "content",
                    match_text=mt,
                    span=span,
                    context=_context_window(full_text, span, window=60),
                    meta={"illegal_type": illegal_type},
                ))

        details = {"illegal_content": counts, "total_illegal_hits": sum(counts.values())}
        return issues, details


class PIIRule(Rule):
    name = "pii"

    def __init__(self, cfg: RuleConfig, patterns: Optional[Dict[str, re.Pattern]] = None):
        super().__init__(cfg)
        self.patterns = patterns or _PII_PATTERNS

    def apply(self, *, item, title, summary, content, full_text, policy_level):
        issues: List[Issue] = []
        counts: Dict[str, int] = {}

        # 你可以只检查正文，也可以检查全量；默认全量
        scope = self.cfg.params.get("scope", "full")  # "full" | "content"
        text = full_text if scope == "full" else content

        for pii_type, pat in self.patterns.items():
            matches = list(pat.finditer(text))
            if not matches:
                continue
            counts[pii_type] = len(matches)

            severity = self.cfg.params.get("severity", "medium")
            max_hits = int(self.cfg.params.get("max_hits_per_type", 10))

            for m in matches[:max_hits]:
                mt = m.group(0)
                # 若 scope=content，这里的 span 是 content 内部 span，不是 full_text
                span = (m.start(), m.end())
                conf = 0.85

                issues.append(Issue(
                    type="pii",
                    severity=severity,
                    message=f"检测到可能的个人信息泄露：{pii_type}",
                    confidence=conf,
                    location=(title[:24] + "...") if title else ("content" if scope == "content" else "full"),
                    match_text=mt,
                    span=span,
                    context=_context_window(text, span, window=50),
                    meta={"pii_type": pii_type, "scope": scope},
                ))

        details = {"pii": counts, "total_pii_hits": sum(counts.values())}
        return issues, details


class CopyrightRule(Rule):
    name = "copyright"

    def __init__(self, cfg: RuleConfig, keywords: Optional[List[str]] = None):
        super().__init__(cfg)
        self.keywords = keywords or _DEFAULT_COPYRIGHT_KEYWORDS
        self._pat = _safe_compile_or_pattern(self.keywords)

    def apply(self, *, item, title, summary, content, full_text, policy_level):
        issues: List[Issue] = []

        # 站点/来源钩子：爬虫通常会有 source_url/source_domain
        source_url = str(item.get("url") or item.get("source_url") or "")
        source_domain = str(item.get("source_domain") or "")
        allow_domains = set(self.cfg.params.get("allow_domains", []))  # e.g. ["reuters.com", "apnews.com"]
        requires_attribution = bool(self.cfg.params.get("requires_attribution", True))

        # 命中版权/转载关键词（更像“提示有版权声明”，并不等于侵权）
        hits: List[Tuple[str, Tuple[int, int]]] = []
        if self._pat:
            for m in self._pat.finditer(full_text):
                hits.append((m.group(0), (m.start(), m.end())))

        # 内容结构启发（非常弱，只做“风险提示”）
        content_len = len(content)
        sentence_like = len(re.split(r"[。.!?！？\n]+", content.strip())) if content.strip() else 0
        is_likely_original = (content_len >= 800 and sentence_like >= 12)

        details = {
            "content_length": content_len,
            "sentence_like": sentence_like,
            "copyright_hits": [h[0] for h in hits[:20]],
            "has_copyright_keywords": bool(hits),
            "is_likely_original": is_likely_original,
            "source_url": source_url,
            "source_domain": source_domain,
            "domain_allowed": (source_domain in allow_domains) if source_domain else None,
        }

        # 风险策略：
        # - 未提供来源（url/domain）+ 未见引用/来源字段 + 内容较短：提示“转载/版权风险”
        # - 若域名不在 allowlist 且 requires_attribution=True：提示需要人工复核
        # - 若检测到“禁止转载/未经授权”等关键词：提示更高风险
        attribution_fields = ["author", "byline", "source", "source_name"]
        has_attribution = any(bool(item.get(k)) for k in attribution_fields) or ("来源" in full_text) or ("原文" in full_text)

        if requires_attribution and not has_attribution:
            issues.append(Issue(
                type="copyright",
                severity="low" if policy_level != "strict" else "medium",
                message="未发现明显署名/来源/引用信息，可能存在转载/版权风险（建议补充来源字段或人工复核）",
                confidence=0.65,
                location=(title[:24] + "...") if title else "content",
                meta={"has_attribution": has_attribution},
            ))

        # 命中更强的“禁止转载/未经授权”提示词：风险上调
        strong_terms = {"禁止转载", "未经授权", "违者必究"}
        strong_hit = any(h[0] in strong_terms for h in hits)
        if strong_hit:
            issues.append(Issue(
                type="copyright",
                severity="medium" if policy_level != "loose" else "low",
                message="内容中出现“禁止转载/未经授权”等声明，转载风险较高（建议跳过或进入人工审核）",
                confidence=0.75,
                location=(title[:24] + "...") if title else "content",
                match_text=next((h[0] for h in hits if h[0] in strong_terms), None),
                meta={"strong_terms": list(strong_terms)},
            ))

        # 站点白名单策略：如果有 domain 且不在 allowlist，可提示
        if allow_domains and source_domain and (source_domain not in allow_domains):
            issues.append(Issue(
                type="copyright",
                severity="low" if policy_level == "loose" else "medium",
                message="来源站点不在允许列表中：建议进行转载许可核验或加入人工复核队列",
                confidence=0.60,
                location=(title[:24] + "...") if title else "meta",
                meta={"source_domain": source_domain, "allow_domains": sorted(allow_domains)[:20]},
            ))

        return issues, {"copyright": details}


class ExternalLinksRule(Rule):
    """
    外链/跳转风险（不等于违法）：用于提示钓鱼/导流/营销风险。
    仅做基础检测：URL 数量、可疑参数等（不访问网络）
    """
    name = "external_links"

    def apply(self, *, item, title, summary, content, full_text, policy_level):
        issues: List[Issue] = []

        urls = _URL_PATTERN.findall(full_text)
        url_count = len(urls)
        max_urls = int(self.cfg.params.get("max_urls", 8))

        details = {
            "url_count": url_count,
            "urls_sample": urls[:10],
        }

        if url_count > max_urls:
            issues.append(Issue(
                type="external_links",
                severity="low" if policy_level == "loose" else "medium",
                message=f"检测到外链数量较多（{url_count}），可能存在导流/营销风险（建议人工复核）",
                confidence=0.60,
                location=(title[:24] + "...") if title else "content",
                meta={"url_count": url_count, "max_urls": max_urls},
            ))

        # 简单可疑参数（示例）
        suspicious_params = ("utm_", "aff", "ref=", "invite", "推广", "coupon", "返利")
        suspicious_hits = [u for u in urls if any(p in u.lower() for p in suspicious_params)]
        if suspicious_hits:
            issues.append(Issue(
                type="external_links",
                severity="low" if policy_level != "strict" else "medium",
                message="外链中出现疑似推广/追踪参数（utm/ref/aff 等），建议人工复核",
                confidence=0.55,
                location=(title[:24] + "...") if title else "content",
                match_text=suspicious_hits[0][:120],
                meta={"suspicious_sample": suspicious_hits[:5]},
            ))

        return issues, {"external_links": details}


# =========================
# Validator
# =========================

def build_rules(
    *,
    rule_configs: Dict[str, RuleConfig],
    custom_sensitive_words: Optional[Dict[str, List[str]]] = None,
) -> List[Rule]:
    """
    根据配置构造规则列表（可自由扩展）
    """
    rules: List[Rule] = []

    # sensitive_words
    cfg = rule_configs.get("sensitive_words", RuleConfig(enabled=True))
    if cfg.enabled:
        lex = merge_sensitive_words(custom_sensitive_words)
        rules.append(SensitiveWordsRule(cfg, lexicon=lex))

    # illegal_content
    cfg = rule_configs.get("illegal_content", RuleConfig(enabled=True))
    if cfg.enabled:
        rules.append(IllegalContentRule(cfg))

    # pii
    cfg = rule_configs.get("pii", RuleConfig(enabled=False, params={"scope": "full"}))
    if cfg.enabled:
        rules.append(PIIRule(cfg))

    # copyright
    cfg = rule_configs.get("copyright", RuleConfig(enabled=True))
    if cfg.enabled:
        rules.append(CopyrightRule(cfg))

    # external_links
    cfg = rule_configs.get("external_links", RuleConfig(enabled=False))
    if cfg.enabled:
        rules.append(ExternalLinksRule(cfg))

    return rules


def merge_sensitive_words(custom_words: Optional[Dict[str, List[str]]]) -> Dict[str, List[str]]:
    words: Dict[str, List[str]] = {k: list(v) for k, v in _DEFAULT_SENSITIVE_WORDS.items()}
    if not custom_words:
        return words
    for cat, wl in custom_words.items():
        if not wl:
            continue
        if cat in words:
            words[cat].extend(wl)
        else:
            words[cat] = list(wl)
    # 去重
    for cat in list(words.keys()):
        words[cat] = sorted(set(w for w in words[cat] if w), key=len, reverse=True)
    return words


def validate_compliance(
    item: Dict[str, Any],
    rules: Optional[List[str]] = None,
    min_score: float = 0.6,
    custom_sensitive_words: Optional[Dict[str, List[str]]] = None,
    policy_level: str = "standard",  # loose / standard / strict
    rule_overrides: Optional[Dict[str, Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    合规验证主函数（增强版）

    Args:
        item: 内容项，通常包含 title/summary/content/url/source_domain 等
        rules: 启用的规则名列表；None 表示使用默认集合
        min_score: 最低通过分
        custom_sensitive_words: 自定义敏感词库合并进默认库
        policy_level: loose/standard/strict（影响扣分/部分严重等级）
        rule_overrides: 对规则配置做覆盖（weight/params/enabled）

    Returns:
        dict: ComplianceResult 的结构化字典
    """
    if policy_level not in {"loose", "standard", "strict"}:
        policy_level = "standard"

    default_rule_names = ["sensitive_words", "illegal_content", "copyright"]
    enabled_names = set(rules or default_rule_names)

    # 规则配置：可按业务调整
    base_cfg: Dict[str, RuleConfig] = {
        "sensitive_words": RuleConfig(
            enabled=("sensitive_words" in enabled_names),
            weight=1.0,
            params={
                "max_hits_per_category": 15,
                # 如需按类别调整严重度，可配置：
                # "severity_by_category": {"政治敏感": "high", "色情低俗": "high"}
            },
        ),
        "illegal_content": RuleConfig(
            enabled=("illegal_content" in enabled_names),
            weight=1.0,
            params={"max_hits_per_type": 12},
        ),
        "pii": RuleConfig(
            enabled=("pii" in enabled_names),
            weight=0.8,
            params={"scope": "full", "max_hits_per_type": 8, "severity": "medium"},
        ),
        "copyright": RuleConfig(
            enabled=("copyright" in enabled_names),
            weight=0.6,
            params={
                "requires_attribution": True,
                "allow_domains": [],  # e.g. ["reuters.com", "apnews.com"]
            },
        ),
        "external_links": RuleConfig(
            enabled=("external_links" in enabled_names),
            weight=0.4,
            params={"max_urls": 8},
        ),
    }

    # 应用 overrides
    if rule_overrides:
        for k, ov in rule_overrides.items():
            if k not in base_cfg:
                continue
            if "enabled" in ov:
                base_cfg[k].enabled = bool(ov["enabled"])
            if "weight" in ov:
                try:
                    base_cfg[k].weight = float(ov["weight"])
                except Exception:
                    pass
            if "params" in ov and isinstance(ov["params"], dict):
                base_cfg[k].params.update(ov["params"])

    title, summary, content, full_text = _build_full_text(item)
    result = ComplianceResult()

    # 构建规则实例
    rule_objs = build_rules(rule_configs=base_cfg, custom_sensitive_words=custom_sensitive_words)

    # 执行规则
    for rule in rule_objs:
        issues, details = rule.apply(
            item=item,
            title=title,
            summary=summary,
            content=content,
            full_text=full_text,
            policy_level=policy_level,
        )
        result.details[rule.name] = details

        # 扣分：severity 基准 * rule.weight
        for iss in issues:
            penalty = _severity_penalty(iss.severity, policy_level) * float(rule.cfg.weight)
            result.add_issue(iss, penalty)

    # 最终判定
    result.finalize(min_score=min_score)
    return result.to_dict()


def filter_compliant_items(
    items: List[Dict[str, Any]],
    rules: Optional[List[str]] = None,
    min_score: float = 0.6,
    custom_sensitive_words: Optional[Dict[str, List[str]]] = None,
    policy_level: str = "standard",
    rule_overrides: Optional[Dict[str, Dict[str, Any]]] = None,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    过滤合规内容项：返回 (compliant, non_compliant)
    """
    compliant: List[Dict[str, Any]] = []
    non_compliant: List[Dict[str, Any]] = []

    for item in items:
        compliance_result = validate_compliance(
            item,
            rules=rules,
            min_score=min_score,
            custom_sensitive_words=custom_sensitive_words,
            policy_level=policy_level,
            rule_overrides=rule_overrides,
        )
        item2 = dict(item)
        item2["_compliance"] = compliance_result

        if compliance_result.get("passed"):
            compliant.append(item2)
        else:
            non_compliant.append(item2)

    return compliant, non_compliant


def assess_compliance(items: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    评估批量内容的合规性（基于 items[*]['_compliance']）
    """
    total_items = len(items)
    compliant_count = 0
    total_score = 0.0
    issue_counts: Dict[str, int] = {}

    for item in items:
        compliance = item.get("_compliance") or {}
        if compliance.get("passed"):
            compliant_count += 1
        total_score += float(compliance.get("score", 0.0))

        for issue in compliance.get("issues", []) or []:
            t = issue.get("type", "unknown")
            issue_counts[t] = issue_counts.get(t, 0) + 1

    avg_score = (total_score / total_items) if total_items else 0.0
    compliance_rate = (compliant_count / total_items) if total_items else 0.0

    return {
        "total_items": total_items,
        "compliant_count": compliant_count,
        "compliance_rate": compliance_rate,
        "average_score": avg_score,
        "issue_counts": issue_counts,
        "summary": f"共检查 {total_items} 条内容，合规 {compliant_count} 条，合规率 {compliance_rate:.2%}，平均得分 {avg_score:.2f}",
    }


# =========================
# Demo
# =========================

def main() -> None:
    test_items = [
        {
            "title": "合法新闻标题",
            "summary": "这是一条合法的新闻摘要，内容健康向上。",
            "content": "这是一条完整的合法新闻内容，包含了丰富的信息，没有敏感词和违法内容。",
            "url": "https://example.com/news/1",
            "source_domain": "example.com",
        },
        {
            "title": "涉及敏感词的标题",
            "summary": "这条新闻包含了敏感词1，需要被检测出来。",
            "content": "这条新闻的正文也提到了敏感词2，属于政治敏感内容。",
            "url": "https://example.com/news/2",
            "source_domain": "example.com",
        },
        {
            "title": "违法内容示例",
            "summary": "这条新闻涉及赌博内容，需要被过滤。",
            "content": "我们提供各种赌博服务，包括时时彩、六合彩等，欢迎大家参与。",
            "url": "https://example.com/news/3",
            "source_domain": "example.com",
        },
        {
            "title": "可能包含PII",
            "summary": "联系邮箱 test@example.com，手机号 13800138000。",
            "content": "更多信息请联系 110105199001011234 或访问 https://xx.com/?utm_source=abc",
            "url": "https://example.com/news/4",
            "source_domain": "example.com",
        },
    ]

    print("=== 单条内容验证（默认规则） ===")
    r1 = validate_compliance(test_items[1])
    print(r1["passed"], r1["score"], r1["issues_count"])
    for it in r1["issues"]:
        print("-", it["severity"], it["type"], it["message"])

    print("\n=== 启用更多规则（pii + external_links）并 strict 策略 ===")
    r2 = validate_compliance(
        test_items[3],
        rules=["sensitive_words", "illegal_content", "copyright", "pii", "external_links"],
        policy_level="strict",
        min_score=0.7,
    )
    print(r2["passed"], r2["score"], r2["issues_count"])
    for it in r2["issues"]:
        print("-", it["severity"], it["type"], it["message"], "| match:", (it.get("match_text") or "")[:40])

    print("\n=== 批量过滤 ===")
    compliant, non_compliant = filter_compliant_items(
        test_items,
        rules=["sensitive_words", "illegal_content", "copyright"],
        min_score=0.6,
        policy_level="standard",
    )
    print("compliant:", len(compliant), "non_compliant:", len(non_compliant))

    print("\n=== 合规报告 ===")
    report = assess_compliance(compliant + non_compliant)
    print(report["summary"])
    print(report["issue_counts"])


if __name__ == "__main__":
    main()
