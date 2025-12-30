"""
HTML Content Cleaner
"""

import re
from html.parser import HTMLParser


class HTMLTextExtractor(HTMLParser):
    """提取HTML中的纯文本"""
    
    def __init__(self):
        super().__init__()
        self.text_parts = []
    
    def handle_data(self, data):
        self.text_parts.append(data)
    
    def get_text(self):
        return ''.join(self.text_parts)


def clean_html_content(html: str) -> str:
    """
    清洗HTML内容，提取纯文本
    
    Args:
        html: HTML字符串
    
    Returns:
        str: 清洗后的纯文本
    """
    if not html:
        return ""
    
    # 移除script和style标签
    html = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r'<style[^>]*>.*?</style>', '', html, flags=re.DOTALL | re.IGNORECASE)
    
    # 使用HTMLParser提取文本
    parser = HTMLTextExtractor()
    try:
        parser.feed(html)
        text = parser.get_text()
    except Exception:
        # 降级：使用正则移除所有HTML标签
        text = re.sub(r'<[^>]+>', '', html)
    
    # 清理空白字符
    text = re.sub(r'\s+', ' ', text)
    text = text.strip()
    
    return text
