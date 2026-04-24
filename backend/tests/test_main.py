# -*- coding: utf-8 -*-
"""
Unit tests for backend/main.py

These tests focus on the Korean language fix:
- _contains_korean() correctly detects Korean characters
- _build_prompt() always produces a Korean-language prompt
  so the AI model handles Korean keywords properly
- Hashtag regex in _build_prompt output examples covers Korean Unicode range
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from main import _contains_korean, _build_prompt, _HASHTAG_PATTERN


# ---------------------------------------------------------------------------
# _contains_korean
# ---------------------------------------------------------------------------
def test_contains_korean_true():
    assert _contains_korean("여행") is True


def test_contains_korean_mixed():
    assert _contains_korean("travel 여행") is True


def test_contains_korean_false_english():
    assert _contains_korean("travel cafe food") is False


def test_contains_korean_empty():
    assert _contains_korean("") is False


def test_contains_korean_numbers_symbols():
    assert _contains_korean("123!@#") is False


# ---------------------------------------------------------------------------
# _build_prompt – structure
# ---------------------------------------------------------------------------
def test_build_prompt_contains_keyword_section():
    prompt = _build_prompt("여행, 카페")
    assert "여행, 카페" in prompt


def test_build_prompt_no_keywords_no_keyword_value():
    prompt = _build_prompt("")
    # Rule 2 mentions "사용자가 입력한 키워드" as a generic instruction –
    # what should be absent is the "키워드: <value>" injected section.
    assert "\n\n사용자가 입력한 키워드:" not in prompt


def test_build_prompt_whitespace_keywords_treated_as_empty():
    prompt = _build_prompt("   ")
    # Whitespace-only input should not inject a keyword section
    assert "\n\n사용자가 입력한 키워드:" not in prompt


def test_build_prompt_is_korean():
    """The prompt must be written in Korean regardless of keyword language."""
    prompt = _build_prompt("travel food")  # English keywords
    # Prompt should still contain Korean instruction text
    assert _contains_korean(prompt)


def test_build_prompt_korean_keywords_preserved():
    prompt = _build_prompt("카페 라떼 디저트")
    assert "카페 라떼 디저트" in prompt


def test_build_prompt_english_keywords_preserved():
    prompt = _build_prompt("coffee dessert")
    assert "coffee dessert" in prompt


# ---------------------------------------------------------------------------
# Hashtag pattern covers Korean Unicode range
# ---------------------------------------------------------------------------
def test_hashtag_pattern_matches_korean():
    tags = _HASHTAG_PATTERN.findall("#여행 #감성사진 #daily")
    assert "#여행" in tags
    assert "#감성사진" in tags
    assert "#daily" in tags


def test_hashtag_pattern_does_not_match_lone_hash():
    tags = _HASHTAG_PATTERN.findall("# not a tag")
    assert len(tags) == 0
