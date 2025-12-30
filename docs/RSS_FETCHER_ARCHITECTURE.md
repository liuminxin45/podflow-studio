# RSS Fetcher 架构设计文档

## 概述

由于不同RSS源的格式差异巨大（标准RSS、汇总型RSS、API接口等），需要设计一套**基于文件的抽象架构**，每种RSS格式对应独立的处理模块，通过统一接口集成到fetch流程中。

---

## 一、架构设计原则

### 1.1 文件级抽象

**核心思想**：每种RSS格式对应一个独立的Python文件，实现统一的接口契约。

**优势**：
- ✅ 解耦：不同格式的解析逻辑完全隔离
- ✅ 可扩展：新增RSS源只需添加新文件，无需修改现有代码
- ✅ 可测试：每个fetcher可独立测试
- ✅ 可维护：格式变更只影响对应文件

### 1.2 统一接口契约

所有RSS fetcher必须实现相同的接口：

```python
def fetch_items(
    config: dict,
    episode_date: date,
    timeout_seconds: int = 30
) -> tuple[list[dict], FetchStatus]:
    """
    拉取RSS数据并返回标准化的items
    
    Args:
        config: RSS源配置（包含url、name、category等）
        episode_date: 目标日期（用于日期相关的过滤/提取）
        timeout_seconds: 超时时间
    
    Returns:
        (items, status): 标准化的items列表和拉取状态
        
    标准化item格式：
    {
        "id": str,              # 唯一ID
        "title": str,           # 标题
        "summary": str,         # 摘要
        "content": str,         # 正文内容
        "url": str,             # 原文链接
        "published_at": str,    # ISO8601格式的发布时间
        "source": str,          # 来源名称
        "category": str,        # 分类（可选）
        "_metadata": dict       # 元数据（可选）
    }
    """
    pass
```

### 1.3 配置驱动

通过配置文件指定使用哪个fetcher：

```yaml
sources:
  rss:
    - name: "标准RSS源"
      fetcher: "standard_rss"  # 指定fetcher类型
      url: "https://example.com/rss.xml"
      enabled: true
    
    - name: "60s每日新闻"
      fetcher: "sixtys_digest"  # 汇总型RSS专用fetcher
      urls:
        - "https://60s.viki.moe/v2/60s/rss"
      enabled: true
    
    - name: "AI工具集"
      fetcher: "aibot_daily"  # API接口专用fetcher
      urls:
        - "https://ai-bot.cn/daily-ai-news/"
      enabled: true
```

---

## 二、目录结构

```
src/fetch/
├── __init__.py
├── base.py                    # 基类和接口定义
├── registry.py                # Fetcher注册表
├── standard_rss.py            # 标准RSS fetcher
├── sixtys_digest.py           # 60s汇总型RSS fetcher
├── aibot_daily.py             # AI工具集API fetcher
├── zhihu_rss.py               # 知乎RSS fetcher（未来扩展）
├── weixin_rss.py              # 微信公众号RSS fetcher（未来扩展）
└── utils/
    ├── html_cleaner.py        # HTML清洗工具
    ├── date_parser.py         # 日期解析工具
    └── content_extractor.py   # 内容提取工具
```

---

## 三、核心组件设计

### 3.1 基类定义 (`base.py`)

```python
"""
RSS Fetcher Base Classes and Interfaces
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date
from enum import Enum
from typing import Optional


class FetchStatus(Enum):
    """拉取状态"""
    SUCCESS = "success"
    PARTIAL = "partial"  # 部分成功
    FAILED = "failed"
    TIMEOUT = "timeout"
    INVALID_FORMAT = "invalid_format"


@dataclass
class FetchResult:
    """拉取结果"""
    items: list[dict]
    status: FetchStatus
    error_message: Optional[str] = None
    metadata: Optional[dict] = None  # 额外元数据（如总数、页数等）


class BaseFetcher(ABC):
    """RSS Fetcher基类"""
    
    @property
    @abstractmethod
    def fetcher_type(self) -> str:
        """Fetcher类型标识（如 'standard_rss', 'sixtys_digest'）"""
        pass
    
    @property
    @abstractmethod
    def supported_formats(self) -> list[str]:
        """支持的格式列表（如 ['rss2.0', 'atom']）"""
        pass
    
    @abstractmethod
    def fetch_items(
        self,
        config: dict,
        episode_date: date,
        timeout_seconds: int = 30
    ) -> FetchResult:
        """
        拉取RSS数据
        
        Args:
            config: RSS源配置
            episode_date: 目标日期
            timeout_seconds: 超时时间
        
        Returns:
            FetchResult: 拉取结果
        """
        pass
    
    def validate_config(self, config: dict) -> bool:
        """
        验证配置是否有效
        
        Args:
            config: RSS源配置
        
        Returns:
            bool: 配置是否有效
        """
        return True
    
    def normalize_item(self, raw_item: dict) -> dict:
        """
        标准化单个item
        
        Args:
            raw_item: 原始item数据
        
        Returns:
            dict: 标准化后的item
        """
        return raw_item


class StandardizedItem:
    """标准化Item的字段定义"""
    
    REQUIRED_FIELDS = ["id", "title", "url", "source"]
    OPTIONAL_FIELDS = ["summary", "content", "published_at", "category"]
    
    @staticmethod
    def validate(item: dict) -> tuple[bool, Optional[str]]:
        """验证item是否符合标准格式"""
        for field in StandardizedItem.REQUIRED_FIELDS:
            if field not in item or not item[field]:
                return False, f"Missing required field: {field}"
        return True, None
```

### 3.2 Fetcher注册表 (`registry.py`)

```python
"""
RSS Fetcher Registry

管理所有fetcher的注册和查找
"""

import logging
from typing import Optional, Type

from .base import BaseFetcher


class FetcherRegistry:
    """Fetcher注册表"""
    
    _fetchers: dict[str, Type[BaseFetcher]] = {}
    _logger = logging.getLogger("fetch.registry")
    
    @classmethod
    def register(cls, fetcher_type: str, fetcher_class: Type[BaseFetcher]):
        """
        注册fetcher
        
        Args:
            fetcher_type: Fetcher类型标识
            fetcher_class: Fetcher类
        """
        if fetcher_type in cls._fetchers:
            cls._logger.warning(f"Fetcher '{fetcher_type}' already registered, overwriting")
        
        cls._fetchers[fetcher_type] = fetcher_class
        cls._logger.info(f"Registered fetcher: {fetcher_type} -> {fetcher_class.__name__}")
    
    @classmethod
    def get(cls, fetcher_type: str) -> Optional[Type[BaseFetcher]]:
        """
        获取fetcher类
        
        Args:
            fetcher_type: Fetcher类型标识
        
        Returns:
            Optional[Type[BaseFetcher]]: Fetcher类，如果不存在返回None
        """
        return cls._fetchers.get(fetcher_type)
    
    @classmethod
    def list_all(cls) -> list[str]:
        """列出所有已注册的fetcher类型"""
        return list(cls._fetchers.keys())
    
    @classmethod
    def create_instance(cls, fetcher_type: str) -> Optional[BaseFetcher]:
        """
        创建fetcher实例
        
        Args:
            fetcher_type: Fetcher类型标识
        
        Returns:
            Optional[BaseFetcher]: Fetcher实例，如果不存在返回None
        """
        fetcher_class = cls.get(fetcher_type)
        if not fetcher_class:
            cls._logger.error(f"Fetcher type '{fetcher_type}' not found")
            return None
        
        try:
            return fetcher_class()
        except Exception as e:
            cls._logger.error(f"Failed to create fetcher instance: {e}")
            return None


def register_fetcher(fetcher_type: str):
    """
    装饰器：自动注册fetcher
    
    使用方式：
    @register_fetcher("standard_rss")
    class StandardRSSFetcher(BaseFetcher):
        ...
    """
    def decorator(fetcher_class: Type[BaseFetcher]):
        FetcherRegistry.register(fetcher_type, fetcher_class)
        return fetcher_class
    return decorator
```

### 3.3 标准RSS Fetcher (`standard_rss.py`)

```python
"""
Standard RSS Fetcher

支持标准RSS 2.0和Atom格式
"""

import logging
from datetime import date
from typing import Optional

import feedparser
import requests

from .base import BaseFetcher, FetchResult, FetchStatus
from .registry import register_fetcher
from .utils.html_cleaner import clean_html_content
from .utils.date_parser import parse_published_date


@register_fetcher("standard_rss")
class StandardRSSFetcher(BaseFetcher):
    """标准RSS Fetcher"""
    
    def __init__(self):
        self.logger = logging.getLogger("fetch.standard_rss")
    
    @property
    def fetcher_type(self) -> str:
        return "standard_rss"
    
    @property
    def supported_formats(self) -> list[str]:
        return ["rss2.0", "atom", "rss1.0"]
    
    def validate_config(self, config: dict) -> bool:
        """验证配置"""
        if "url" not in config and "urls" not in config:
            self.logger.error("Missing 'url' or 'urls' in config")
            return False
        return True
    
    def fetch_items(
        self,
        config: dict,
        episode_date: date,
        timeout_seconds: int = 30
    ) -> FetchResult:
        """拉取标准RSS数据"""
        
        # 获取URL
        url = config.get("url")
        urls = config.get("urls", [])
        url_to_fetch = url if url else (urls[0] if urls else None)
        
        if not url_to_fetch:
            return FetchResult(
                items=[],
                status=FetchStatus.FAILED,
                error_message="No URL provided"
            )
        
        source_name = config.get("name", "unknown")
        
        try:
            # 发起HTTP请求
            self.logger.info(f"Fetching RSS: {source_name} from {url_to_fetch}")
            resp = requests.get(
                url_to_fetch,
                timeout=timeout_seconds,
                headers={"User-Agent": "podcast-bot/1.0"}
            )
            resp.raise_for_status()
            
            # 解析RSS
            parsed = feedparser.parse(resp.content)
            if getattr(parsed, "bozo", 0):
                self.logger.warning(
                    f"RSS parse warning: bozo={parsed.bozo}, "
                    f"error={getattr(parsed, 'bozo_exception', None)}"
                )
            
            # 提取items
            items = []
            for entry in getattr(parsed, "entries", []) or []:
                item = self._parse_entry(entry, source_name)
                if item:
                    items.append(item)
            
            self.logger.info(f"Fetched {len(items)} items from {source_name}")
            
            return FetchResult(
                items=items,
                status=FetchStatus.SUCCESS,
                metadata={"url": url_to_fetch, "entry_count": len(items)}
            )
            
        except requests.Timeout:
            self.logger.error(f"Timeout fetching {source_name}")
            return FetchResult(items=[], status=FetchStatus.TIMEOUT)
        
        except Exception as e:
            self.logger.error(f"Failed to fetch {source_name}: {e}")
            return FetchResult(
                items=[],
                status=FetchStatus.FAILED,
                error_message=str(e)
            )
    
    def _parse_entry(self, entry, source_name: str) -> Optional[dict]:
        """解析单个RSS entry"""
        
        # 提取基本字段
        link = (getattr(entry, "link", None) or "").strip()
        if not link:
            return None
        
        title = (getattr(entry, "title", None) or "").strip()
        summary = (getattr(entry, "summary", None) or "").strip()
        
        # 提取内容
        content = ""
        description = (getattr(entry, "description", None) or "").strip()
        if description:
            content = clean_html_content(description)
        
        if not content:
            content_list = getattr(entry, "content", None)
            if isinstance(content_list, list) and content_list:
                raw_content = (content_list[0].get("value") or "").strip()
                content = clean_html_content(raw_content)
        
        # 过滤无效内容
        if not content or len(content) < 100:
            self.logger.debug(f"Skipping short content: {title}")
            return None
        
        # 解析发布时间
        published_at = parse_published_date(entry)
        
        # 生成稳定ID
        item_id = self._generate_item_id(link)
        
        return {
            "id": item_id,
            "title": title,
            "summary": summary,
            "content": content,
            "url": link,
            "published_at": published_at,
            "source": source_name,
        }
    
    def _generate_item_id(self, url: str) -> str:
        """生成稳定的item ID"""
        import hashlib
        return hashlib.sha256(url.encode()).hexdigest()[:16]
```

### 3.4 60s汇总型RSS Fetcher (`sixtys_digest.py`)

```python
"""
60s Digest RSS Fetcher

专门处理60s每日新闻汇总型RSS
特点：
- 标题为日期格式（如"📅 2025-12-30 星期二"）
- 内容为多条新闻的汇总
- 需要拆分成单独的子事件
"""

import logging
import re
from datetime import date
from typing import Optional

import feedparser
import requests

from .base import BaseFetcher, FetchResult, FetchStatus
from .registry import register_fetcher
from .utils.date_parser import parse_date_from_title


@register_fetcher("sixtys_digest")
class SixtysDige stFetcher(BaseFetcher):
    """60s汇总型RSS Fetcher"""
    
    def __init__(self):
        self.logger = logging.getLogger("fetch.sixtys_digest")
    
    @property
    def fetcher_type(self) -> str:
        return "sixtys_digest"
    
    @property
    def supported_formats(self) -> list[str]:
        return ["rss2.0"]
    
    def fetch_items(
        self,
        config: dict,
        episode_date: date,
        timeout_seconds: int = 30
    ) -> FetchResult:
        """拉取60s汇总RSS数据"""
        
        # 获取URL列表（支持多个备用URL）
        urls = config.get("urls", [])
        if not urls:
            url = config.get("url")
            if url:
                urls = [url]
        
        if not urls:
            return FetchResult(
                items=[],
                status=FetchStatus.FAILED,
                error_message="No URLs provided"
            )
        
        source_name = config.get("name", "60s")
        
        # 尝试多个URL（降级策略）
        for url in urls:
            try:
                self.logger.info(f"Trying URL: {url}")
                result = self._fetch_from_url(url, source_name, episode_date, timeout_seconds)
                if result.status == FetchStatus.SUCCESS:
                    return result
            except Exception as e:
                self.logger.warning(f"Failed to fetch from {url}: {e}")
                continue
        
        return FetchResult(
            items=[],
            status=FetchStatus.FAILED,
            error_message="All URLs failed"
        )
    
    def _fetch_from_url(
        self,
        url: str,
        source_name: str,
        episode_date: date,
        timeout_seconds: int
    ) -> FetchResult:
        """从单个URL拉取数据"""
        
        resp = requests.get(
            url,
            timeout=timeout_seconds,
            headers={"User-Agent": "podcast-bot/1.0"}
        )
        resp.raise_for_status()
        
        parsed = feedparser.parse(resp.content)
        
        items = []
        for entry in getattr(parsed, "entries", []) or []:
            item = self._parse_digest_entry(entry, source_name)
            if item:
                # 从标题提取日期
                item_date = parse_date_from_title(item["title"])
                if item_date:
                    item["published_at"] = item_date.isoformat()
                items.append(item)
        
        self.logger.info(f"Fetched {len(items)} digest items from {source_name}")
        
        return FetchResult(
            items=items,
            status=FetchStatus.SUCCESS,
            metadata={"url": url, "digest_count": len(items)}
        )
    
    def _parse_digest_entry(self, entry, source_name: str) -> Optional[dict]:
        """解析汇总型entry"""
        
        link = (getattr(entry, "link", None) or "").strip()
        if not link:
            return None
        
        title = (getattr(entry, "title", None) or "").strip()
        
        # 检查是否为日期标题
        if not self._is_date_title(title):
            self.logger.debug(f"Not a date title: {title}")
            return None
        
        # 提取内容
        description = (getattr(entry, "description", None) or "").strip()
        content = self._extract_digest_content(description)
        
        if not content or len(content) < 200:
            self.logger.debug(f"Skipping short digest: {title}")
            return None
        
        item_id = self._generate_item_id(link)
        
        return {
            "id": item_id,
            "title": title,
            "summary": "",
            "content": content,
            "url": link,
            "published_at": None,  # 将由调用方从标题提取
            "source": source_name,
            "category": "digest",
            "_metadata": {
                "is_digest": True,
                "requires_splitting": True
            }
        }
    
    def _is_date_title(self, title: str) -> bool:
        """检查标题是否为日期格式"""
        # 匹配 "📅 2025-12-30 星期二" 或 "2025-12-30" 等格式
        date_patterns = [
            r"\d{4}-\d{2}-\d{2}",  # 2025-12-30
            r"\d{4}年\d{1,2}月\d{1,2}日",  # 2025年12月30日
        ]
        return any(re.search(pattern, title) for pattern in date_patterns)
    
    def _extract_digest_content(self, html: str) -> str:
        """提取汇总内容（去除HTML标签）"""
        from .utils.html_cleaner import clean_html_content
        return clean_html_content(html)
    
    def _generate_item_id(self, url: str) -> str:
        """生成稳定的item ID"""
        import hashlib
        return hashlib.sha256(url.encode()).hexdigest()[:16]
```

---

## 四、集成到FetchStep

### 4.1 修改FetchStep (`fetch_step.py`)

```python
from src.fetch.registry import FetcherRegistry
from src.fetch.base import FetchStatus

class FetchStep(BaseStep):
    
    def execute(self, ctx: EpisodeContext):
        cfg = ctx.config
        
        # 1. 拉取数据（使用fetcher registry）
        self.logger.info("开始从各个源拉取数据...")
        fetched = []
        
        rss_sources = cfg.get("sources", {}).get("rss", [])
        
        for source_config in rss_sources:
            if not source_config.get("enabled", True):
                continue
            
            # 获取fetcher类型（默认为standard_rss）
            fetcher_type = source_config.get("fetcher", "standard_rss")
            source_name = source_config.get("name", "unknown")
            
            # 创建fetcher实例
            fetcher = FetcherRegistry.create_instance(fetcher_type)
            if not fetcher:
                self.logger.error(f"Unknown fetcher type: {fetcher_type}")
                continue
            
            # 验证配置
            if not fetcher.validate_config(source_config):
                self.logger.error(f"Invalid config for {source_name}")
                continue
            
            # 拉取数据
            try:
                self.logger.info(f"Fetching from {source_name} using {fetcher_type}")
                result = fetcher.fetch_items(
                    config=source_config,
                    episode_date=ctx.episode_date,
                    timeout_seconds=cfg.get("fetch", {}).get("timeout_seconds", 30)
                )
                
                if result.status == FetchStatus.SUCCESS:
                    fetched.extend(result.items)
                    self.logger.info(f"✓ {source_name}: {len(result.items)} items")
                elif result.status == FetchStatus.PARTIAL:
                    fetched.extend(result.items)
                    self.logger.warning(f"⚠ {source_name}: {len(result.items)} items (partial)")
                else:
                    self.logger.error(f"✗ {source_name}: {result.error_message}")
                    
            except Exception as e:
                self.logger.error(f"Failed to fetch {source_name}: {e}")
        
        self.logger.info(f"拉取完成: {len(fetched)} items")
        
        # 后续流程保持不变...
```

---

## 五、扩展示例

### 5.1 添加新的RSS源（知乎专栏）

**步骤1**：创建新fetcher文件 `zhihu_rss.py`

```python
@register_fetcher("zhihu_column")
class ZhihuColumnFetcher(BaseFetcher):
    
    @property
    def fetcher_type(self) -> str:
        return "zhihu_column"
    
    def fetch_items(self, config, episode_date, timeout_seconds=30):
        # 知乎专栏特定的解析逻辑
        ...
```

**步骤2**：在配置文件中使用

```yaml
sources:
  rss:
    - name: "丁香医生知乎专栏"
      fetcher: "zhihu_column"  # 使用新fetcher
      url: "https://zhuanlan.zhihu.com/dingxiangyisheng"
      enabled: true
```

**步骤3**：无需修改FetchStep，自动生效

---

## 六、测试策略

### 6.1 单元测试

每个fetcher独立测试：

```python
# tests/fetch/test_standard_rss.py

def test_standard_rss_fetcher():
    fetcher = StandardRSSFetcher()
    
    config = {
        "name": "Test RSS",
        "url": "https://example.com/rss.xml"
    }
    
    result = fetcher.fetch_items(
        config=config,
        episode_date=date(2025, 12, 30),
        timeout_seconds=10
    )
    
    assert result.status == FetchStatus.SUCCESS
    assert len(result.items) > 0
    
    # 验证item格式
    item = result.items[0]
    is_valid, error = StandardizedItem.validate(item)
    assert is_valid, error
```

### 6.2 集成测试

测试fetcher registry和FetchStep集成：

```python
# tests/integration/test_fetch_step.py

def test_fetch_step_with_multiple_fetchers():
    config = {
        "sources": {
            "rss": [
                {"name": "RSS1", "fetcher": "standard_rss", "url": "..."},
                {"name": "60s", "fetcher": "sixtys_digest", "urls": ["..."]},
            ]
        }
    }
    
    ctx = EpisodeContext(config=config, episode_date=date(2025, 12, 30))
    step = FetchStep()
    step.execute(ctx)
    
    assert len(ctx.items_raw) > 0
```

---

## 七、迁移计划

### 7.1 现有代码迁移

**阶段1**：创建基础架构
- [ ] 实现`base.py`和`registry.py`
- [ ] 创建工具函数（html_cleaner, date_parser等）

**阶段2**：迁移现有fetcher
- [ ] 将`rss.py`重构为`standard_rss.py`
- [ ] 将`sixtys.py`重构为`sixtys_digest.py`
- [ ] 将`aibot_daily.py`适配新接口

**阶段3**：集成到FetchStep
- [ ] 修改`fetch_step.py`使用registry
- [ ] 更新配置文件格式
- [ ] 添加向后兼容逻辑

**阶段4**：测试和验证
- [ ] 单元测试覆盖
- [ ] 集成测试验证
- [ ] 生产环境灰度发布

### 7.2 向后兼容

支持旧配置格式（无`fetcher`字段）：

```python
# 自动推断fetcher类型
def infer_fetcher_type(config: dict) -> str:
    name = config.get("name", "").lower()
    
    if "60s" in name or "sixtys" in name:
        return "sixtys_digest"
    elif "aibot" in name or "ai工具集" in name:
        return "aibot_daily"
    else:
        return "standard_rss"  # 默认
```

---

## 八、最佳实践

### 8.1 Fetcher开发规范

1. **继承BaseFetcher**：所有fetcher必须继承基类
2. **使用装饰器注册**：`@register_fetcher("type_name")`
3. **实现所有抽象方法**：`fetcher_type`, `supported_formats`, `fetch_items`
4. **返回标准化格式**：严格遵守StandardizedItem规范
5. **错误处理**：捕获异常并返回FetchStatus
6. **日志记录**：使用统一的logger格式

### 8.2 配置规范

```yaml
sources:
  rss:
    - name: "源名称"           # 必填：显示名称
      fetcher: "fetcher_type"  # 必填：fetcher类型
      url: "..."               # 可选：单个URL
      urls: ["..."]            # 可选：多个URL（备用）
      enabled: true            # 可选：是否启用
      category: "..."          # 可选：分类
      # fetcher特定配置
      custom_field: "..."      # 可选：自定义字段
```

### 8.3 性能优化

1. **并发拉取**：使用`asyncio`或`ThreadPoolExecutor`
2. **缓存机制**：对不变的RSS内容缓存
3. **超时控制**：每个fetcher独立超时
4. **降级策略**：多URL自动切换

---

## 九、FAQ

### Q1: 如何添加新的RSS源？

**A**: 创建新的fetcher文件，继承`BaseFetcher`，使用`@register_fetcher`装饰器注册，然后在配置文件中指定`fetcher`类型即可。

### Q2: 如何处理特殊格式的RSS？

**A**: 实现专用的fetcher，在`_parse_entry`方法中添加特殊逻辑。例如60s的日期标题解析、AI工具集的HTML结构解析等。

### Q3: 如何测试新的fetcher？

**A**: 编写单元测试，mock HTTP请求，验证返回的items格式是否符合`StandardizedItem`规范。

### Q4: 如何处理fetcher失败？

**A**: 返回`FetchResult`时设置`status=FetchStatus.FAILED`，并提供`error_message`。FetchStep会记录日志但不中断流程。

### Q5: 如何支持多个备用URL？

**A**: 在fetcher的`fetch_items`方法中遍历`config.get("urls")`，依次尝试，成功后立即返回。

---

## 十、总结

**核心优势**：
- ✅ **解耦**：每种RSS格式独立文件，互不影响
- ✅ **可扩展**：新增源只需添加文件+配置，无需改动核心代码
- ✅ **可测试**：每个fetcher可独立测试
- ✅ **统一接口**：所有fetcher遵循相同契约
- ✅ **配置驱动**：通过YAML配置灵活切换fetcher

**实施路径**：
1. 创建基础架构（base.py + registry.py）
2. 迁移现有fetcher（standard_rss, sixtys_digest, aibot_daily）
3. 集成到FetchStep
4. 测试验证
5. 生产发布

**未来扩展**：
- 微信公众号RSS fetcher
- 知乎专栏fetcher
- Twitter/X RSS fetcher
- 自定义API fetcher

---

**文档版本**：v1.0  
**创建日期**：2025-12-30  
**维护者**：Cascade AI
