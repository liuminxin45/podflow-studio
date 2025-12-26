"""
Unit tests for src/fetch/extractor.py
"""

from __future__ import annotations

from src.fetch.extractor import extract_from_html, ExtractResult


def test_extract_result_is_empty():
    result = ExtractResult(text="")
    assert result.is_empty() is True
    
    result2 = ExtractResult(text="  \n  ")
    assert result2.is_empty() is True
    
    result3 = ExtractResult(text="Some content")
    assert result3.is_empty() is False


def test_extract_from_html_empty():
    result = extract_from_html("")
    assert result.is_empty() is True
    assert result.text == ""


def test_extract_from_html_simple():
    html = """
    <html>
        <head><title>Test Title</title></head>
        <body>
            <h1>Main Heading</h1>
            <p>This is a paragraph with some content.</p>
            <p>Another paragraph here.</p>
        </body>
    </html>
    """
    
    result = extract_from_html(html)
    
    assert result.text
    assert len(result.text) > 0
    assert not result.is_empty()


def test_extract_from_html_with_url():
    html = """
    <html>
        <head>
            <title>Article Title</title>
            <meta name="description" content="Article description">
        </head>
        <body>
            <article>
                <h1>Article Heading</h1>
                <p>Article content goes here.</p>
            </article>
        </body>
    </html>
    """
    
    result = extract_from_html(html, url="https://example.com/article")
    
    assert result.text
    assert not result.is_empty()


def test_extract_from_html_fallback_beautifulsoup():
    html = """
    <html>
        <head><title>Fallback Title</title></head>
        <body>
            <div>Some text content that might not be extracted by trafilatura</div>
        </body>
    </html>
    """
    
    result = extract_from_html(html)
    
    assert isinstance(result, ExtractResult)
    assert result.text is not None


def test_extract_from_html_with_metadata():
    html = """
    <html lang="zh-CN">
        <head>
            <title>中文标题</title>
            <meta name="description" content="这是一篇中文文章的描述">
            <meta name="author" content="作者名">
        </head>
        <body>
            <article>
                <h1>文章标题</h1>
                <p>文章内容。</p>
            </article>
        </body>
    </html>
    """
    
    result = extract_from_html(html, url="https://example.com/zh/article")
    
    assert result.text
    assert isinstance(result.metadata, dict)


def test_extract_from_html_script_and_style_removed():
    html = """
    <html>
        <head>
            <title>Clean Content</title>
            <style>body { color: red; }</style>
            <script>console.log('test');</script>
        </head>
        <body>
            <p>Visible content</p>
            <script>alert('popup');</script>
            <style>.hidden { display: none; }</style>
        </body>
    </html>
    """
    
    result = extract_from_html(html)
    
    assert result.text
    assert "console.log" not in result.text
    assert "alert" not in result.text
    assert "color: red" not in result.text


def test_extract_from_html_complex_structure():
    html = """
    <html>
        <head><title>Complex Page</title></head>
        <body>
            <header>
                <nav>Navigation links</nav>
            </header>
            <main>
                <article>
                    <h1>Main Article</h1>
                    <p>First paragraph of the article.</p>
                    <p>Second paragraph with more details.</p>
                    <blockquote>A quote from someone.</blockquote>
                </article>
            </main>
            <aside>
                <div>Sidebar content</div>
            </aside>
            <footer>
                <p>Footer information</p>
            </footer>
        </body>
    </html>
    """
    
    result = extract_from_html(html)
    
    assert result.text
    assert len(result.text) > 0


def test_extract_result_dataclass_fields():
    result = ExtractResult(
        text="Content text",
        title="Title",
        summary="Summary",
        metadata={"lang": "en", "author": "John"},
    )
    
    assert result.text == "Content text"
    assert result.title == "Title"
    assert result.summary == "Summary"
    assert result.metadata["lang"] == "en"
    assert result.metadata["author"] == "John"
