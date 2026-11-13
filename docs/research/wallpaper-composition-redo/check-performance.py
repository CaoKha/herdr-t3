#!/usr/bin/env python3
"""Check measured framing replays; these are VM measurements, not fabricated unit timings."""
import json
from pathlib import Path
import statistics
import sys

folder = Path(sys.argv[1])
native = [json.loads(line) for line in (folder.parent / 'native.jsonl').read_text().splitlines()]
slow = []
for mode in ('zoom', 'pan', 'keys'):
    r = json.loads((folder / f'{mode}.json').read_text())
    samples = sorted(r['samples'])
    p95 = samples[int(len(samples) * .95) - 1]
    frames = [n for n in native if r['started'] / 1000 + 1 <= n['t'] <= r['ended'] / 1000]
    count = sum(n['window'] for n in frames)
    paint = sum(n['frame_ms'] for n in frames) / count if count else None
    print(json.dumps(dict(mode=mode, events=len(samples), interval_mean_ms=round(statistics.mean(samples), 2),
                          interval_p95_ms=p95, interval_max_ms=max(samples),
                          js_mean_ms=round(statistics.mean(r['js']), 2), native_frame_mean_ms=round(paint, 2) if paint is not None else None)))
    assert all(r[k] == 0 for k in ('exec', 'readTextFile', 'writeTextFile', 'converts')), f'{mode}: framing did I/O or conversion'
    if p95 > 33:
        slow.append(f'{mode}: {p95}ms p95')
assert not slow, f'main thread blocks the 33ms frame budget: {slow}'
