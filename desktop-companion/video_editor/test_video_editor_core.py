from video_editor.silence_editor import build_silence_timeline
from video_editor.timeline import calculate_output_duration, validate_timeline


def _removed(clips):
    return [c for c in clips if c.action == "remove"]


def test_no_silence_keeps_all():
    clips = build_silence_timeline(10.0, [], "compact")
    assert len(clips) == 1
    assert clips[0].action == "keep"
    assert calculate_output_duration(clips) == 10.0


def test_short_silence_is_not_removed():
    clips = build_silence_timeline(10.0, [{"start": 2.0, "end": 2.3, "duration": 0.3}], "compact")
    assert not _removed(clips)


def test_long_silence_keeps_center_padding():
    clips = build_silence_timeline(20.0, [{"start": 10.0, "end": 11.2, "duration": 1.2}], "compact")
    removed = _removed(clips)
    assert len(removed) == 2
    assert calculate_output_duration(clips) > 19.0
    validate_timeline(clips, 20.0)


def test_leading_and_trailing_silence():
    clips = build_silence_timeline(
        20.0,
        [
            {"start": 0.0, "end": 1.2, "duration": 1.2},
            {"start": 18.5, "end": 20.0, "duration": 1.5},
        ],
        "natural",
    )
    assert len(_removed(clips)) == 2
    validate_timeline(clips, 20.0)


def test_presets_remove_different_amounts():
    silences = [{"start": 4.0, "end": 5.0, "duration": 1.0}]
    natural = calculate_output_duration(build_silence_timeline(10.0, silences, "natural"))
    compact = calculate_output_duration(build_silence_timeline(10.0, silences, "compact"))
    fast = calculate_output_duration(build_silence_timeline(10.0, silences, "fast"))
    assert natural > compact > fast
