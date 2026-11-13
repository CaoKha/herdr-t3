"""Validate the actual native mode replays, not Node-only timing."""
import json
from pathlib import Path

folder = Path(__file__).resolve().parent
rows = []
for theme in ['dark', 'light']:
    for mode in ['dots', 'braille', 'blocks', 'quadrants']:
        r = json.loads((folder / f'final-{theme}-{mode}.json').read_text())
        assert not r['busy'] and r['error'] is None and r['style'] == mode
        assert r['scene']['aspect'] == .5 and max(t['y1'] for t in r['scene']['tiles']) == 96
        assert 'decode' not in r['perf']['chunks'], 'mode changes must reuse decoded pixels'
        gaps = sorted(r['perf']['heartbeats'])
        p95 = gaps[int(len(gaps) * .95) - 1]
        longest = max(max(v) for v in r['perf']['chunks'].values())
        assert p95 <= 33 and longest <= 33, (theme, mode, p95, longest)
        rows.append(dict(theme=theme, mode=mode, total_ms=r['elapsed_ms'], max_generator_chunk_ms=longest,
                         heartbeat_p95_ms=p95, heartbeat_max_ms=max(gaps)))
rapid = json.loads((folder / 'final-rapid.json').read_text())
quad = json.loads((folder / 'final-light-quadrants.json').read_text())
assert rapid['generation'] == quad['generation'] + 4 and rapid['style'] == 'quadrants'
assert len(rapid['perf']['chunks']['sample']) == len(quad['perf']['chunks']['sample']), 'one final sampler, not four queued samplers'
dark = json.loads((folder / 'final-dark-dots.json').read_text())
light = json.loads((folder / 'final-light-dots.json').read_text())
assert dark['palette'] != light['palette'], 'selecting a theme slot without changing appearance is not a light-theme test'
(folder / 'mode-performance.json').write_text(json.dumps(rows, indent=2) + '\n')
print(json.dumps(rows, indent=2))
print('ok: 8 native mode replays, distinct light/dark palettes, no source re-decode, and rapid switching starts only the final sampler.')
