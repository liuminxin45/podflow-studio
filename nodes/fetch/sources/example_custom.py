"""
Example Custom Source
这是一个示例，展示如何创建自定义数据源
你可以复制这个文件并修改为自己的数据源
"""

from typing import Any
from nodes.fetch.sources.base import FetchSourceBase


class ExampleCustomSource(FetchSourceBase):
    """Example custom data source."""

    @property
    def name(self) -> str:
        return "示例自定义源"

    @property
    def description(self) -> str:
        return "这是一个示例数据源，展示如何创建自定义爬虫"

    def fetch(self, fetch_logs: list[str] | None = None) -> list[dict[str, Any]]:
        """
        实现你的爬取逻辑。

        你可以：
        1. 使用requests抓取网页
        2. 使用BeautifulSoup解析HTML
        3. 使用Selenium处理JavaScript渲染的页面
        4. 调用API获取数据
        5. 读取本地文件

        返回标准格式的列表即可。
        """
        # 示例：返回一些模拟数据
        items = [
            {
                "title": "示例新闻1",
                "content": "这是第一条示例新闻的内容...",
                "url": "https://example.com/news1",
                "published": "2024-02-08",
                "source": "example_custom",
                "type": "custom",
            },
            {
                "title": "示例新闻2",
                "content": "这是第二条示例新闻的内容...",
                "url": "https://example.com/news2",
                "published": "2024-02-08",
                "source": "example_custom",
                "type": "custom",
            },
        ]

        return items


# 导出实例供fetch节点使用
source = ExampleCustomSource()
