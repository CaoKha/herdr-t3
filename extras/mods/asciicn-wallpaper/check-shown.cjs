// What Home shows, said under the layout's `t3.homeShown` (docs/internals/storage.md) for the Home row above it to draw its
// part (docs/adr/0021): the layer drawn, not the one still loading; its place in Home's px; written only when it changes.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { existsSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { runtime, find } = require("./harness.cjs");

const watchdog = setTimeout(() => { console.error("shown check did not finish"); process.exit(1); }, 60000);

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "herdr-wallpaper-shown-"));
  try {
    const r = await runtime(path.join(root, "home"));
    const { cx, state, settle, app, world } = r;
    const SHOWN = r.modules["store.js"].KEY.homeShown, HOME = r.modules["store.js"].KEY.home;
    assert.equal(SHOWN, "t3.homeShown");
    state[HOME] = "space-1";
    // Home shown, its tab this one wallpaper pane: the copy the Home row reads.
    const homeTab = (space, tab, mods) => {
      world.spaces = [{ id: space, tabs: [{ id: tab, active: true }] }];
      world.panes = mods.map((mod, i) => ({ pane: `${tab}-p${i}`, tab, mod, terminal: null }));
      world.focused = { space, tab, pane: `${tab}-p0`, terminal: null };
    };
    homeTab("space-1", "tab-1", ["asciicn-wallpaper"]);
    // Home under a 40 px row in a 1000×800 window: as wide as the window, 40 shorter. Herdr reports its size once drawn.
    const h = await r.home({ width: 1000, height: 760 });
    const loads = (t) => {
      find(t, "wallpaper")?.handlers.on_size_change?.({ width: 1000, height: 760 }, cx);
      const box = find(t, "wallpaper-probe-size"), file = find(box, "wallpaper-probe-image")?.props.path;
      if (file && existsSync(path.join(app, file))) box.handlers.on_size_change({ width: 640, height: 480 }, cx);
      return t;
    };
    const draw = () => loads(h.render(cx));

    // Nothing up yet, nothing said: the row stays Home's colour rather than show a picture Home doesn't.
    h.render(cx);
    assert.equal(state[SHOWN], undefined, "no picture drawn, none said");

    await settle(() => find(draw(), "wallpaper-picture"));
    const t = draw(), path0 = find(t, "wallpaper-picture").props.path, g = find(t, `wallpaper-at:${path0}`).props;
    const said = state[SHOWN];
    assert.ok(said, "the picture drawn is said");
    assert.deepEqual({ ...said }, { path: path0, w: g.w, h: g.h, right: g.right, top: 760 - g.bottom - g.h, opacity: 1, home: "space-1" },
      "where Home draws it, from Home's top");
    assert.ok(said.top < 0, "a picture framed against the window starts above Home, under the row");

    // Drawn again with nothing changed: not written again, so no mod redraws for it.
    draw();
    assert.equal(state[SHOWN], said, "unchanged, not written again");

    // Another Home: said again, naming it.
    state[HOME] = "space-2";
    homeTab("space-2", "tab-2", ["asciicn-wallpaper"]);
    draw();
    assert.equal(state[SHOWN].home, "space-2");

    // Only the copy the row reads says: two copies writing their own framing would redraw each other without end
    // (every setShared redraws every mod). Home split into two wallpapers: neither is the row's.
    const before = state[SHOWN];
    homeTab("space-2", "tab-2", ["asciicn-wallpaper", "asciicn-wallpaper"]);
    h.homeH = 500;
    draw();
    assert.equal(state[SHOWN], before, "a split Home's wallpaper says nothing");
    // A wallpaper in another space's tab, Home not shown: not the row's either.
    homeTab("space-3", "tab-3", ["asciicn-wallpaper"]);
    draw();
    assert.equal(state[SHOWN], before, "a wallpaper away from Home says nothing");

    console.log("ok: shown: the drawn layer's place from Home's top, its picture, opacity and Home; written only on a change, and only by the copy the row reads.");
  } finally {
    clearTimeout(watchdog);
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exit(1); });
