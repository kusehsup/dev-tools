#!/usr/bin/env python3
"""Slice assets/Map.png into assets/tiles/{z}/{x}/{y}.png (same scheme as server/tilegen.js)."""
from __future__ import annotations
import json, math, sys
from pathlib import Path
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
ROOT = Path(__file__).resolve().parents[1]
SRC, OUT, TILE, OVERVIEW = ROOT/"assets"/"Map.png", ROOT/"assets"/"tiles", 256, 1024

def main() -> int:
    if not SRC.is_file():
        print(f"missing {SRC}", file=sys.stderr); return 1
    src = Image.open(SRC).convert("RGB"); w, h = src.size
    max_z = max(0, math.ceil(math.log2(max(w, h) / TILE)))
    print(f"map {w}x{h} tile={TILE} maxZoom={max_z}")
    if OUT.exists():
        import shutil; shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    ov = src.resize((OVERVIEW, OVERVIEW), Image.Resampling.LANCZOS)
    ov.save(OUT/"overview.png", optimize=True)
    total = 0
    for z in range(max_z + 1):
        scale = 2 ** (max_z - z)
        lw, lh = math.ceil(w / scale), math.ceil(h / scale)
        level = src if scale == 1 else src.resize((lw, lh), Image.Resampling.LANCZOS)
        cols, rows = math.ceil(lw / TILE), math.ceil(lh / TILE)
        print(f"z={z}: {lw}x{lh} ({cols}x{rows})")
        for x in range(cols):
            (OUT/str(z)/str(x)).mkdir(parents=True, exist_ok=True)
            for y in range(rows):
                left, top = x*TILE, y*TILE
                crop = level.crop((left, top, min(left+TILE, lw), min(top+TILE, lh)))
                if crop.size != (TILE, TILE):
                    padded = Image.new("RGB", (TILE, TILE), (0, 0, 0)); padded.paste(crop, (0, 0)); crop = padded
                crop.save(OUT/str(z)/str(x)/f"{y}.png", optimize=True); total += 1
        if level is not src: level.close()
    man = {"tileSize": TILE, "mapWidth": w, "mapHeight": h, "mapSize": max(w,h), "maxZoom": max_z,
           "overview": "overview.png", "overviewSize": OVERVIEW, "pathTemplate": "{z}/{x}/{y}.png", "tileCount": total}
    (OUT/"manifest.json").write_text(json.dumps(man, indent=2)+"\n")
    print(f"done {total} tiles")
    return 0
if __name__ == "__main__":
    raise SystemExit(main())
