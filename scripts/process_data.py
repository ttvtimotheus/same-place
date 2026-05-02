from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "src" / "data"
OUTPUT_PATH = DATA_DIR / "merged.json"


def load_records(path: Path) -> list[dict]:
	if not path.exists():
		return []

	with path.open(encoding="utf-8") as handle:
		payload = json.load(handle)

	if not isinstance(payload, list):
		raise ValueError(f"Expected a JSON array in {path.name}")

	return payload


def merge_by_region(*datasets: tuple[str, list[dict]]) -> list[dict]:
	merged: dict[str, dict] = {}

	for source_name, records in datasets:
		for record in records:
			region_id = record.get("region_id") or record.get("id")
			if region_id is None:
				continue

			bucket = merged.setdefault(str(region_id), {"region_id": region_id})
			bucket[source_name] = record

	return list(merged.values())


def main() -> None:
	nsdap_records = load_records(DATA_DIR / "nsdap_1933.json")
	afd_records = load_records(DATA_DIR / "afd_2025.json")
	incident_records = load_records(DATA_DIR / "incidents.json")

	merged = merge_by_region(
		("nsdap_1933", nsdap_records),
		("afd_2025", afd_records),
		("incidents", incident_records),
	)

	with OUTPUT_PATH.open("w", encoding="utf-8") as handle:
		json.dump(merged, handle, ensure_ascii=False, indent=2)

	print(f"Wrote {len(merged)} merged records to {OUTPUT_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
	main()