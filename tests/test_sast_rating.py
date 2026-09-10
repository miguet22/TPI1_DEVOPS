import pytest

from scripts.sast_rating import evaluate


@pytest.mark.parametrize("severity,rating,passed", [(None, "A", True), ("LOW", "B", True), ("MEDIUM", "C", False), ("HIGH", "D", False)])
def test_severity_controls_rating_and_gate(severity, rating, passed):
    report = {"metrics": {"_totals": {"loc": 10}}, "errors": [], "results": [] if severity is None else [{"issue_severity": severity}]}
    result = evaluate(report)
    assert result[0] == rating
    assert result[3] is passed


@pytest.mark.parametrize("report", [{}, {"errors": ["parse failure"]}, {"metrics": {"_totals": {"loc": 0}}}])
def test_incomplete_scan_is_not_a_passing_rating(report):
    with pytest.raises(ValueError):
        evaluate(report)
