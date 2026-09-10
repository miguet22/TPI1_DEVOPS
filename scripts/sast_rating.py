"""Convierte un informe completo de Bandit en un badge y aplica el umbral de aprobación SAST."""
import json
import sys
from pathlib import Path


def evaluate(report):
    if report.get("errors") or not report.get("metrics", {}).get("_totals", {}).get("loc", 0):
        raise ValueError("Bandit did not complete a non-empty scan")
    counts = {severity: 0 for severity in ("LOW", "MEDIUM", "HIGH")}
    for finding in report["results"]:
        counts[finding["issue_severity"]] += 1
    if counts["HIGH"]:
        return "D", "red", counts, False
    if counts["MEDIUM"]:
        return "C", "orange", counts, False
    if counts["LOW"]:
        return "B", "yellow", counts, True
    return "A", "brightgreen", counts, True


def main():
    source, destination = map(Path, sys.argv[1:3])
    try:
        rating, color, counts, passed = evaluate(json.loads(source.read_text(encoding="utf-8")))
        message = f"{rating} | H:{counts['HIGH']} M:{counts['MEDIUM']} L:{counts['LOW']}"
    except (OSError, ValueError, KeyError, TypeError) as error:
        message, color, passed = "error", "lightgrey", False
        print(f"SAST report error: {error}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps({"schemaVersion": 1, "label": "SAST Python", "message": message, "color": color}), encoding="utf-8")
    print(f"SAST Python: {message}")
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
