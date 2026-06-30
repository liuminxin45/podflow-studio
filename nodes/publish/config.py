from pydantic import Field
from protocol.config_base import NodeConfigBase


class PublishConfig(NodeConfigBase):
    """Publish node configuration."""

    # Storage settings (merged from store node)
    storage_type: str = Field(default="local", description="存储类型")
    local_base_dir: str = Field(default="out/published", description="本地存储根目录")
    generate_metadata: bool = Field(default=True, description="是否生成metadata.json")
    # RSS / Publish settings
    rss_output_dir: str = Field(default="out/rss", description="RSS输出目录")
    podcast_title: str = Field(default="AI Tech Podcast", description="播客标题")
    podcast_description: str = Field(default="AI-generated tech podcast", description="播客描述")
    podcast_author: str = Field(default="PodFlow Studio", description="播客作者")
    podcast_language: str = Field(default="zh-CN", description="播客语言")
    podcast_category: str = Field(default="Technology", description="播客分类")
