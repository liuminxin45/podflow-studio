from pydantic import Field
from protocol.config_base import NodeConfigBase


class PreprocessConfig(NodeConfigBase):
    min_content_length: int = Field(default=100, ge=0)
    max_content_length: int = Field(default=50000, ge=100)
    remove_duplicates: bool = Field(default=True)
    similarity_threshold: float = Field(default=0.85, ge=0.0, le=1.0)
