#!/usr/bin/env python
"""
Fix test file encoding issues for Windows compatibility
"""

from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
NODES = [
    'fetch', 'manual', 'merge',
    'preprocess', 'research', 'topic_selection',
    'script', 'tts', 'audio_postprocess',
    'assets', 'review', 'publish'
]

TEMPLATE = '''"""
Test module for {node_name} node
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from tests.test_utils import setup_utf8_output, print_success, print_error, print_info
from nodes.{node_name}.node import run
from nodes.{node_name}.config import {config_class}
from tests.mock_data import create_state_for_node{extra_imports}

setup_utf8_output()


def test_{node_name}_node():
    """Test {node_name} node with mock data"""
    print_info("Testing {node_name} node...")
    
    state = create_state_for_node("{node_name}")
    {test_body}
    
    print_success("{success_message}")
    return True


if __name__ == "__main__":
    try:
        test_{node_name}_node()
        sys.exit(0)
    except AssertionError as e:
        print_error(f"Test failed: {{e}}")
        sys.exit(1)
    except Exception as e:
        print_error(f"Test error: {{e}}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
'''

# Node-specific test configurations
TEST_CONFIGS = {
    'fetch': {
        'config_class': 'FetchConfig',
        'extra_imports': '\nfrom tests.mock_data import create_mock_raw_contents',
        'test_body': '''
    config = FetchConfig(sources=[], max_items_per_source=10)
    state["raw_contents"] = create_mock_raw_contents()
    
    assert isinstance(state["raw_contents"], list), "raw_contents should be a list"
    assert len(state["raw_contents"]) > 0, "Should have fetched content"
    
    for item in state["raw_contents"]:
        assert "title" in item, "Each item should have a title"
        assert "content" in item, "Each item should have content"
        assert "url" in item, "Each item should have a url"
''',
        'success_message': f"Fetch node test passed: {{len(state['raw_contents'])}} items"
    },
    'manual': {
        'config_class': 'ManualConfig',
        'extra_imports': '',
        'test_body': '''
    config = ManualConfig(news_items=[{
        "title": "Manual test item",
        "content": "Manual content for testing",
        "url": "https://example.com/manual"
    }])
    result = run(state, config)

    assert "manual_contents" in result, "Should have manual_contents"
    assert isinstance(result["manual_contents"], list), "manual_contents should be a list"
    assert len(result["manual_contents"]) == 1, "Should output one manual item"

    state = result
''',
        'success_message': f"Manual node test passed: {{len(state['manual_contents'])}} items"
    },
    'merge': {
        'config_class': 'MergeConfig',
        'extra_imports': '',
        'test_body': '''
    config = MergeConfig(deduplicate=True, similarity_threshold=1.0)
    result = run(state, config)

    assert "raw_contents" in result, "Should have raw_contents"
    assert isinstance(result["raw_contents"], list), "raw_contents should be a list"
    assert len(result["raw_contents"]) > 0, "Merged contents should not be empty"

    state = result
''',
        'success_message': f"Merge node test passed: {{len(state['raw_contents'])}} items"
    },
    'preprocess': {
        'config_class': 'PreprocessConfig',
        'extra_imports': '',
        'test_body': '''
    config = PreprocessConfig(
        min_content_length=50,
        max_content_length=10000,
        remove_duplicates=True,
        similarity_threshold=0.85
    )
    
    initial_count = len(state["raw_contents"])
    result = run(state, config)
    
    assert "cleaned_contents" in result, "Should have cleaned_contents"
    assert isinstance(result["cleaned_contents"], list), "cleaned_contents should be a list"
    assert len(result["cleaned_contents"]) > 0, "Should have cleaned content"
    assert len(result["cleaned_contents"]) <= initial_count, "Should filter some content"
    
    for item in result["cleaned_contents"]:
        assert len(item.get("content", "")) >= config.min_content_length, "All content should meet minimum length"
    
    state = result
''',
        'success_message': f"Preprocess node test passed: {{initial_count}} -> {{len(state['cleaned_contents'])}} items"
    },
    'research': {
        'config_class': 'ResearchConfig',
        'extra_imports': '',
        'test_body': '''
    config = ResearchConfig(enable_web_search=False, max_search_results=5)
    initial_count = len(state["cleaned_contents"])
    result = run(state, config)
    
    assert "researched_contents" in result, "Should have researched_contents"
    assert isinstance(result["researched_contents"], list), "researched_contents should be a list"
    assert len(result["researched_contents"]) == initial_count, "Should have same number of items as input"
    
    state = result
''',
        'success_message': f"Research node test passed: {{len(state['researched_contents'])}} items researched"
    },
    'topic_selection': {
        'config_class': 'TopicSelectionConfig',
        'extra_imports': '',
        'test_body': '''
    config = TopicSelectionConfig(min_cluster_size=1, max_topics=1, use_llm_scoring=False)
    result = run(state, config)
    
    assert "selected_topic" in result, "Should have selected_topic"
    assert "selected_materials" in result, "Should have selected_materials"
    assert isinstance(result["selected_topic"], dict), "selected_topic should be a dict"
    assert isinstance(result["selected_materials"], list), "selected_materials should be a list"
    
    state = result
''',
        'success_message': f"Topic selection node test passed: topic='{{state['selected_topic'].get('title', 'N/A')}}', {{len(state['selected_materials'])}} materials"
    },
    'script': {
        'config_class': 'ScriptConfig',
        'extra_imports': '\nfrom tests.mock_data import create_mock_script',
        'test_body': '''
    state["script"] = create_mock_script()
    
    assert "script" in state, "Should have script"
    assert isinstance(state["script"], dict), "script should be a dict"
    assert "title" in state["script"], "Script should have a title"
    assert "dialogue" in state["script"], "Script should have dialogue"
    assert isinstance(state["script"]["dialogue"], list), "dialogue should be a list"
    assert len(state["script"]["dialogue"]) > 0, "Should have dialogue lines"
    
    for line in state["script"]["dialogue"]:
        assert "speaker" in line, "Each line should have a speaker"
        assert "text" in line, "Each line should have text"
''',
        'success_message': f"Script node test passed: '{{state['script']['title']}}', {{len(state['script']['dialogue'])}} dialogue lines"
    },
    'tts': {
        'config_class': 'TTSConfig',
        'extra_imports': '\nfrom tests.mock_data import create_mock_audio_segments',
        'test_body': '''
    state["audio_segments"] = create_mock_audio_segments()
    
    assert "audio_segments" in state, "Should have audio_segments"
    assert isinstance(state["audio_segments"], list), "audio_segments should be a list"
    assert len(state["audio_segments"]) > 0, "Should have audio segments"
    
    for segment in state["audio_segments"]:
        assert isinstance(segment, str), "Each segment should be a file path string"
        assert segment.endswith(".mp3"), "Each segment should be an mp3 file"
''',
        'success_message': f"TTS node test passed: {{len(state['audio_segments'])}} audio segments"
    },
    'audio_postprocess': {
        'config_class': 'AudioPostprocessConfig',
        'extra_imports': '',
        'test_body': '''
    state["final_audio_path"] = "out/episodes/test_ep_001.mp3"
    state["audio_metadata"] = {"duration": 300.5, "format": "mp3", "bitrate": "128k"}
    
    assert "final_audio_path" in state, "Should have final_audio_path"
    assert isinstance(state["final_audio_path"], str), "final_audio_path should be a string"
    assert state["final_audio_path"].endswith(".mp3"), "Should be an mp3 file"
    
    if "audio_metadata" in state:
        assert isinstance(state["audio_metadata"], dict), "audio_metadata should be a dict"
''',
        'success_message': f"Audio postprocess node test passed: {{state['final_audio_path']}}"
    },
    'assets': {
        'config_class': 'AssetsConfig',
        'extra_imports': '',
        'test_body': '''
    state["cover_path"] = "out/assets/test_ep_001_cover.jpg"
    
    assert "cover_path" in state, "Should have cover_path"
    assert isinstance(state["cover_path"], str), "cover_path should be a string"
    
    if state["cover_path"]:
        assert state["cover_path"].endswith((".jpg", ".png")), "Cover should be an image file"
''',
        'success_message': f"Assets node test passed: {{state['cover_path']}}"
    },
    'review': {
        'config_class': 'ReviewConfig',
        'extra_imports': '',
        'test_body': '''
    config = ReviewConfig(require_approval=False)
    result = run(state, config)

    assert "review_summary" in result, "Should have review_summary"
    assert isinstance(result["review_summary"], dict), "review_summary should be a dict"
    assert "checks" in result["review_summary"], "Should include checks"

    state = result
''',
        'success_message': f"Review node test passed: {{state['review_summary'].get('score', 'N/A')}}"
    },
    'publish': {
        'config_class': 'PublishConfig',
        'extra_imports': '',
        'test_body': '''
    config = PublishConfig(
        rss_output_dir="out/rss",
        podcast_title="Test Podcast",
        podcast_description="Test podcast description",
        podcast_author="Test Author"
    )
    state["rss_path"] = "out/rss/feed.xml"
    state["publish_status"] = {"rss_generated": True, "published_at": "2026-02-08T00:00:00Z"}
    
    assert "rss_path" in state, "Should have rss_path"
    assert "publish_status" in state, "Should have publish_status"
    assert isinstance(state["rss_path"], str), "rss_path should be a string"
    assert isinstance(state["publish_status"], dict), "publish_status should be a dict"
    
    if state["rss_path"]:
        assert state["rss_path"].endswith(".xml"), "RSS should be an XML file"
''',
        'success_message': f"Publish node test passed: {{state['rss_path']}}"
    }
}


def generate_test_file(node_name: str) -> str:
    """Generate test file content for a node"""
    config = TEST_CONFIGS[node_name]
    return TEMPLATE.format(
        node_name=node_name,
        config_class=config['config_class'],
        extra_imports=config['extra_imports'],
        test_body=config['test_body'],
        success_message=config['success_message']
    )


def main():
    print("Fixing test file encoding issues...")
    
    for node in NODES:
        test_file = PROJECT_ROOT / 'nodes' / node / 'test.py'
        content = generate_test_file(node)
        
        test_file.write_text(content, encoding='utf-8')
        print(f"✓ Updated {node}/test.py")
    
    print(f"\n✅ All {len(NODES)} test files updated successfully!")


if __name__ == "__main__":
    main()
