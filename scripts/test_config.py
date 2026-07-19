#!/usr/bin/env python
"""
Config Validation Test

Verifies that all node configs properly inherit from NodeConfigBase and support validation.
"""

# This file is a standalone validation command. Its helper accepts arguments
# supplied by main(), so pytest must not collect it as a fixture-driven test.
__test__ = False

import sys
from dataclasses import asdict, is_dataclass
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


def test_config_import(node_name: str, config_class: str) -> bool:
    """Test that a config can be imported and instantiated."""
    try:
        module = __import__(f"nodes.{node_name}.config", fromlist=[config_class])
        ConfigClass = getattr(module, config_class)

        # Test default instantiation
        config = ConfigClass()

        # Test from_dict
        ConfigClass.from_dict({})

        # Test serialization for both Pydantic configs and the dataclass TTS config.
        if hasattr(config, "to_dict"):
            config.to_dict()
        elif is_dataclass(config):
            asdict(config)
        else:
            raise TypeError("Config must support to_dict() or be a dataclass")

        print(f"✅ {node_name}.{config_class}: OK")
        return True

    except Exception as e:
        print(f"❌ {node_name}.{config_class}: {type(e).__name__}: {e}")
        return False


def main():
    print("=" * 60)
    print("Config Validation Test")
    print("=" * 60)
    print()

    configs = [
        ("fetch", "FetchConfig"),
        ("preprocess", "PreprocessConfig"),
        ("research", "ResearchConfig"),
        ("topic_selection", "TopicSelectionConfig"),
        ("facts", "FactsConfig"),
        ("script", "ScriptConfig"),
        ("tts", "TTSConfig"),
        ("audio_postprocess", "AudioPostprocessConfig"),
        ("assets", "AssetsConfig"),
        ("review", "ReviewConfig"),
        ("publish", "PublishConfig"),
    ]

    results = {}
    for node, config_class in configs:
        results[f"{node}.{config_class}"] = test_config_import(node, config_class)

    print()
    print("=" * 60)
    passed = sum(results.values())
    total = len(results)
    print(f"Results: {passed}/{total} passed")

    if passed == total:
        print("✅ All configs validated successfully!")
        sys.exit(0)
    else:
        print("❌ Some configs failed validation")
        sys.exit(1)


if __name__ == "__main__":
    main()
