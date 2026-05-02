from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REGIONS_PATH = ROOT / "src" / "data" / "regions.geojson"


def load_geojson(path: Path) -> dict:
	with path.open(encoding="utf-8") as handle:
		payload = json.load(handle)

	if payload.get("type") != "FeatureCollection":
		raise ValueError("Expected a GeoJSON FeatureCollection scaffold")

	return payload


def main() -> None:
	regions = load_geojson(REGIONS_PATH)
	feature_count = len(regions.get("features", []))
	print(
		"Geometry mapping scaffold ready. "
		f"Current placeholder contains {feature_count} features in {REGIONS_PATH.relative_to(ROOT)}."
	)


if __name__ == "__main__":
	main()