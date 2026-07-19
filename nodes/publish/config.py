from pydantic import Field
from protocol.config_base import NodeConfigBase


class PublishConfig(NodeConfigBase):
    """Publish node configuration."""

    # Storage settings (merged from store node)
    storage_type: str = Field(default="local", description="存储类型")
    local_base_dir: str = Field(default="dist/episodes", description="发布包根目录")
    generate_metadata: bool = Field(default=True, description="是否生成metadata.json")
    # RSS / Publish settings
    rss_output_dir: str = Field(default="out/rss", description="RSS输出目录")
    public_base_url: str = Field(default="", description="公开访问根 URL，用于 RSS enclosure")
    podcast_title: str = Field(default="通勤早咖啡", description="播客标题")
    podcast_description: str = Field(default="单人新闻早报播客", description="播客描述")
    podcast_author: str = Field(default="PodFlow Studio", description="播客作者")
    podcast_language: str = Field(default="zh-CN", description="播客语言")
    podcast_category: str = Field(default="News", description="播客分类")
    enabled_platforms: list[str] = Field(
        default_factory=list,
        exclude=True,
        description="Deprecated compatibility field; publishing now always emits local archive and RSS only",
    )
