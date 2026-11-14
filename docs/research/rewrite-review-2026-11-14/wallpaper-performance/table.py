# Prints each material's stage times side by side for the versions measured: table.py <results dir> <label>...
import json, sys, glob, collections
root, labels = sys.argv[1], sys.argv[2:]
rows = collections.OrderedDict()
for l in labels:
    for f in sorted(glob.glob(f"{root}/{l}/perf-{l}.jsonl.[0-9]")):
        for line in open(f):
            r = json.loads(line)
            rows.setdefault((r["material"], r["group"], r["name"]), {})[l] = r
print("| material | stage | " + " | ".join(f"{l} ms (lag max)" for l in labels) + " |")
print("|---|---|" + "---|" * len(labels))
for (m, g, n), by in rows.items():
    cells = [f"{by[l]['ms']} ({by[l]['lagMax']})" + (" ERR" if "error" in by[l] else "") if l in by else "—" for l in labels]
    print(f"| {m} | {g}/{n} | " + " | ".join(cells) + " |")
print()
for l in labels:
    rs = [json.loads(x) for f in glob.glob(f"{root}/{l}/perf-{l}.jsonl.[0-9]") for x in open(f)]
    print(l, "rss", min(r["rssMB"] for r in rs), "->", max(r["rssMB"] for r in rs), "MB; worst lag", max(r["lagMax"] for r in rs), "ms; stalls>50", sum(r["stalls50"] for r in rs), ">100", sum(r["stalls100"] for r in rs))
