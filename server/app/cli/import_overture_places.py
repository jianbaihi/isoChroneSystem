from __future__ import annotations

import argparse
import json
import sys

from app.importers.overture import ImportValidationError, import_overture_places


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Import one Overture Places region into SQLite.")
    parser.add_argument("--release-manifest", required=True)
    parser.add_argument("--region-manifest", required=True)
    parser.add_argument("--database", required=True)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--replace", action="store_true")
    args = parser.parse_args(argv)
    try:
        report = import_overture_places(
            args.release_manifest,
            args.region_manifest,
            args.database,
            dry_run=args.dry_run,
            replace=args.replace,
        )
    except (ImportValidationError, OSError, ValueError) as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2
    print(json.dumps(report, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
