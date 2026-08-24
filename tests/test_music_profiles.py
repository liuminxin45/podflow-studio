import json
from urllib.parse import parse_qs, urlparse

import pytest

from protocol.music_profiles import evaluate_music_candidate, load_music_profiles
from protocol.music_sources import discover_openverse_music


def _candidate(**overrides):
    value = {
        "id": "track-1",
        "title": "Morning Window",
        "creator": "Example Artist",
        "provider": "jamendo",
        "source": "jamendo",
        "license": "cc0",
        "license_url": "https://creativecommons.org/publicdomain/zero/1.0/",
        "landing_url": "https://example.test/tracks/1",
        "audio_url": "https://cdn.example.test/tracks/1.mp3",
        "duration_seconds": 120,
        "bpm": 96,
        "tags": ["instrumental", "warm", "acoustic", "piano"],
    }
    value.update(overrides)
    return value


def test_registry_contains_bounded_builtin_profiles():
    registry = load_music_profiles()

    assert registry["default_profile_id"] == "morning_coffee_warm"
    assert {item["id"] for item in registry["profiles"]} == {
        "morning_coffee_warm",
        "morning_city_commute",
        "morning_focus",
        "weekend_relaxed",
    }
    assert all(item["required"]["licenses"] == ["cc0"] for item in registry["profiles"])


def test_candidate_rules_accept_reviewable_warm_instrumental():
    result = evaluate_music_candidate(_candidate(), "morning_coffee_warm")

    assert result["eligible_for_review"] is True
    assert result["score"] >= 70
    assert result["rejection_reasons"] == []
    assert result["manual_review_reasons"] == []


@pytest.mark.parametrize(
    ("patch", "reason"),
    [
        ({"license": "by"}, "license_not_allowed:by"),
        ({"duration_seconds": 20}, "duration_out_of_range:20"),
        ({"audio_url": ""}, "audio_url_missing"),
        ({"tags": ["instrumental", "aggressive"]}, "excluded_tags:aggressive"),
        ({"tags": ["vocal", "warm"]}, "vocals_detected"),
    ],
)
def test_candidate_rules_reject_unsafe_or_wrong_style_metadata(patch, reason):
    result = evaluate_music_candidate(_candidate(**patch), "morning_coffee_warm")

    assert result["eligible_for_review"] is False
    assert reason in result["rejection_reasons"]


def test_candidate_rules_require_manual_review_for_missing_style_evidence():
    result = evaluate_music_candidate(_candidate(tags=["warm"], bpm=None), "morning_coffee_warm")

    assert result["eligible_for_review"] is True
    assert result["manual_review_reasons"] == ["instrumental_status_unverified", "bpm_unavailable"]


def test_openverse_discovery_applies_cc0_query_and_profile_ranking():
    raw = {
        "results": [
            {
                "id": "good",
                "title": "Warm Piano",
                "creator": "Artist",
                "provider": "jamendo",
                "source": "jamendo",
                "license": "cc0",
                "license_url": "https://creativecommons.org/publicdomain/zero/1.0/",
                "foreign_landing_url": "https://example.test/good",
                "url": "https://cdn.example.test/good.mp3",
                "duration": 120000,
                "tags": [{"name": "instrumental"}, {"name": "warm"}, {"name": "piano"}],
            },
            {
                "id": "bad",
                "title": "Dark Trailer",
                "creator": "Artist",
                "provider": "jamendo",
                "source": "jamendo",
                "license": "cc0",
                "foreign_landing_url": "https://example.test/bad",
                "url": "https://cdn.example.test/bad.mp3",
                "duration": 120000,
                "tags": [{"name": "instrumental"}, {"name": "dark"}],
            },
        ]
    }
    captured = {}

    def fetch(request, timeout):
        captured["url"] = request.full_url
        captured["timeout"] = timeout
        return json.dumps(raw).encode()

    result = discover_openverse_music("morning_coffee_warm", limit=3, fetch=fetch)
    query = parse_qs(urlparse(captured["url"]).query)

    assert query["license"] == ["cc0"]
    assert query["q"] == ["instrumental warm"]
    assert captured["timeout"] == 15
    assert [item["id"] for item in result["candidates"]] == ["good"]
    assert result["rejected_count"] == 1
    assert result["candidates"][0]["manual_review_reasons"] == ["bpm_unavailable"]


def test_openverse_discovery_preserves_external_failure_reason():
    def fetch(_request, _timeout):
        raise TimeoutError("timed out")

    with pytest.raises(RuntimeError, match="Openverse music discovery failed: timed out"):
        discover_openverse_music("morning_focus", fetch=fetch)
