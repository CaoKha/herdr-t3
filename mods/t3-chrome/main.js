import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, run, props, updates, layout, shared, spaces, window, settings, appHome, readTextFile, writeTextFile, notify, exec, openOverlay, closeOverlay } from "herdr";
import { tip, glow } from "./tip.js";
import { stopsInit, stopsEnd, stop, focusRoot, within } from "./focus.js";
import { sidebarParts } from "./sidebar.js";
import { initSettings, settingsView } from "./settings.js";
import { KEY } from "./store.js";
import { panelState, showPage, hidePanel, toggleWide, activateSurface, closeSurface } from "./panel.js";
import { button as drawButton, radiusOf } from "./button.js";
import { fileIcon } from "./file-icons.js";

// The space panel's pages (docs/adr/0011), as its stack has them: a page the layout lacks has no tab.
// Review wears pulls.review's own mark, as the Review bar does: a review, not a git command. In its colors, so an image.
const PAGES = { files: ["Files", "folder-tree"], review: ["Review", "pulls-review", true] };

// The sidebar shows either Lists (Spaces and Agents) or the Inbox (t3-inbox): a stack in the layout.
const inboxShown = () => sidebarParts(layout()).stack?.active === "inbox";
export default class WorkspaceChrome extends View {
  async close() { stopsEnd(this); }

  init(_props, cx) {
    this.surfaceWidths = {};
    if (props()?.view === "settings") return initSettings(this, cx);
    stopsInit(this, cx);
    if (props()?.part?.startsWith("surface-")) {
      this.surfaceKeys = cx.focus_handle(); this.surfaceAt = -1;
      this.surfaceKeys.focus();
      const probe = (cx) => {
        const sp = spaces().find(s => s.active), key = `${sp?.id}:${sp?.folder}:${sp?.machine}`;
        if (this.surfaceSpace === key) return;
        this.surfaceSpace = key; this.reviewReason = sp?.machine ? "Review is unavailable on remote spaces" : "Checking repository…";
        if (!sp?.machine) cx.spawn(async (cx) => {
          const r = sp?.folder && await exec("git", ["rev-parse", "--show-toplevel"], { cwd: sp.folder }).catch(() => null);
          if (this.surfaceSpace !== key) return;
          this.reviewReason = r?.code === 0 ? "" : "This space is not a Git repository"; cx.notify();
        });
      };
      probe(cx); cx.timer.every(250, probe);
    }
    if (!props()?.footer && !props()?.part) {
      this.alignLights(cx);
      // The brand copy stays alive with the sidebar hidden; no redraw is needed until a zoom actually changes the file.
      cx.timer.every(250, cx => this.alignLights(cx));
    }
  }

  alignLights(cx) {
    if (shared("layout") !== "herdr-t3") return;
    const root = /** @type {any} */ (layout()), w = window(), zoom = Number(settings().zoom) || 1;
    if (w?.platform !== "macos" || w.fullscreen || root?.titlebar !== "none" || !root.traffic_lights || this.lightsWriting) return;
    // Once per zoom and layout value: an update that rewrites the layout is aligned again, a failure isn't retried.
    const seen = `${zoom}:${root.traffic_lights[1]}`;
    if (this.lightsSeen === seen) return;
    this.lightsSeen = seen;
    // Native buttons are unzoomed, centered 8px below y; the brand row's center is 20 logical px.
    const y = Math.round((12 + 20 * (zoom - 1)) * 1000) / 1000;
    if (root.traffic_lights[1] === y) return;
    this.lightsWriting = true;
    cx.spawn(async () => {
      try {
        const file = `${appHome()}/layouts/herdr-t3.json`, before = await readTextFile(file);
        if (before === null) throw new Error("Couldn't read the layout file.");
        const saved = JSON.parse(before);
        if (saved.titlebar !== "none" || !saved.traffic_lights || saved.traffic_lights[1] === y) return;
        saved.traffic_lights = [saved.traffic_lights[0], y];
        const after = before.replace(/("traffic_lights"\s*:\s*)\[[^\]]*\]/, (_match, key) => key + JSON.stringify(saved.traffic_lights));
        if (JSON.stringify(JSON.parse(after)) !== JSON.stringify(saved)) throw new Error("Couldn't locate the layout's window buttons.");
        await writeTextFile(file, after, before);
      } catch (e) {
        notify({ title: "Couldn't align the window buttons", body: String(e), level: "error" });
      } finally { this.lightsWriting = false; }
    });
  }

  render() {
    if (props()?.view === "settings") return settingsView(this);
    const t = theme();
    if (props()?.part?.startsWith("surface-")) return this.surfaceView(t);
    if (props()?.part === "panel") return this.panelHead(t);
    if (props()?.footer) {
      // As T3's footer: a row of 32px icon buttons, and at its end, once Herdr has downloaded an update, its restart.
      const ready = updates().app.ready;
      // T3's undo notice, the inbox's (t3-inbox.notice), in this row's free space so it covers nothing: "Settled," or
      // "Settled 2," then Undo, which the inbox does. It fades in and out over 200ms, Undo inert while it goes. One older than
      // its 5s and the fade is left from before a restart.
      const n = shared(KEY.notice);
      // Short of room the summary is cut, never Undo: GPUI's flex doesn't do T3's two wraps, which squeezed Undo to nothing.
      const notice = n && Date.now() - n.at < 6000 && h_flex().id(`undo-notice-${n.gen}`).flex_1().min_w(0).h(24).justify_end().gap(4).items_center()
        .text_size(11).text_color(t.dim).opacity(n.shown ? 1 : 0).transition("opacity", { duration: 200, easing: "ease-out" })
        .child(div().min_w(0).truncate().child(`${n.action}${n.count === 1 ? "" : ` ${n.count}`},`))
        // As T3's InlineButton: medium, foreground, underlined on hover.
        .child(h_flex().id("undo-notice-undo").flex_none().h(24).items_center().font_medium().text_color(t.foreground)
          .when(n.live && Date.now() - n.at < 5000, (el) => el.hover((s) => s.underline()).role("button").accessibility_label(`Undo: ${n.action} ${n.count} agent${n.count === 1 ? "" : "s"}`)
            .on_click(() => run("t3-tabs.undo")))
          .child("Undo")
          .when(n.live && Date.now() - n.at < 5000, (el) => stop(this, t, "undo-notice-undo", el, 4)));
      const button = (id, icon, label, action, key) => tip(this, t, id, label, stop(this, t, id, drawButton(t, id, { size: "default", icon, label, hot: this.hot === id })
        .on_hover(glow(this, id))
        // Each opens over its button, before the pointer can report leaving it.
        .on_click((_e, cx) => { this.hot = null; action(); cx.notify(); }), radiusOf("default")), { action: key });
      // T3's footer: 8 in and 4 above its row, whatever height the layout gives the block.
      return focusRoot(this, div().size_full().bg(t.chrome).px(8).pt(4).child(h_flex().h(32).gap(4).items_center()
        .child(button("settings", "mods/t3-chrome/icons/settings.svg", "Settings", () => run("app.settings"), "app.settings"))
        .child(button("t3-settings", "mods/t3-chrome/icons/sliders-horizontal.svg", "Herdr T3 settings", () => run("t3-tabs.settings"), "t3-tabs.settings"))
        .child(notice || div().flex_1())
        .when(Boolean(ready), el => el.child(tip(this, t, "app-update", `Update ${ready} downloaded. Click to restart`, stop(this, t, "app-update", div().id("app-update").h(32).px(12).flex_none().flex().items_center()
          .rounded_full().bg(t.accent + "26").text_size(12).text_color(t.accent).hover(s => s.bg(t.accent + "40")).on_hover(glow(this, "app-update"))
          .role("button").accessibility_label(`Restart into Herdr ${ready}`)
          .on_click(() => run("app.update")).child("Update"), 16))))));
    }
    // Room for the macOS window buttons (layout traffic_lights), a place to drag the window, and the
    // sidebar toggle at its right edge; while the sidebar is hidden, t3-tabs shows it after the buttons.
    const inbox = inboxShown(), w = window();
    // Herdr's mark and name where its own layout has them, past the macOS window buttons; a click goes Home, which has no
    // button of its own. Its colours are louder than anything else here, so it waits at 70% and its name is muted, both lit
    // on hover, with no background behind them. As T3's, no tooltip. The window buttons are screen points, unzoomed: the last ends at 68
    // (traffic_lights x 16, three 12s 8 apart), and the logo's tile shows 16pt from it, less the PNG's 2 of clear edge and
    // this button's 6 in. Short of room the name gives way whole, never cut to "Her…", and never the buttons.
    const zoom = settings().zoom || 1, left = w?.platform === "macos" && !w?.fullscreen ? (68 + 16 - 2) / zoom - 6 : 8, on = this.hot === "home"
      // Lit at Home too: its tab bar is empty and its panes may be anyone's, so this says where you are.
      || spaces().some((s) => s.active && s.id === shared(KEY.home));
    // What the name has past the left inset: less the 8 at the right, two 28px buttons, this button's 6 each side, the 20px logo and 8 gap.
    const named = !this.brandW || this.brandW - left - 8 - 56 - 12 - 20 - 8 >= (this.nameW || 0);
    return focusRoot(this, h_flex().id("brand").size_full().bg(t.chrome).pl(left).pr(8).items_center()
      .on_size_change((size, cx) => { this.brandW = size.width / zoom; cx.notify(); })
      .child(stop(this, t, "home", h_flex().id("home").h(28).min_w(0).px(6).gap(8).items_center().rounded(8)
        .text_size(14).font_medium().text_color(on ? t.foreground : t.muted).on_hover(glow(this, "home"))
        .role("button").accessibility_label("Home")
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click(() => run("t3-tabs.home"))
        .child(image("frame/welcome/herdr.png").size(20).flex_none().rounded(5).opacity(on ? 1 : 0.7))
        .when(named, el => el.child(div().id("home-name").flex_none().child("Herdr")
          .on_size_change((size, cx) => { this.nameW = size.width / zoom; cx.notify(); }))), 8))
      .child(div().flex_1())
      // T3's 28px title bar buttons, side by side instead of its 12 apart, so each stands over a button of the list's top row below.
      // The mode a click shows: a tray for the Inbox, rows with their marks for the lists.
      .child(tip(this, t, "sidebar-mode", inbox ? "Show lists" : "Show inbox", stop(this, t, "sidebar-mode", drawButton(t, "sidebar-mode", {
        size: "sm", icon: `mods/t3-chrome/icons/${inbox ? "layout-list" : "inbox"}.svg`, label: inbox ? "Show lists" : "Show inbox", hot: this.hot === "sidebar-mode" })
        .on_hover(glow(this, "sidebar-mode"))
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click(() => run("t3-tabs.sidebar")), radiusOf("sm")), { action: "t3-tabs.sidebar", below: true }))
      .child(tip(this, t, "sidebar-toggle", "Hide sidebar", stop(this, t, "sidebar-toggle", drawButton(t, "sidebar-toggle", {
        size: "sm", icon: "mods/t3-chrome/icons/panel-left.svg", label: "Hide sidebar", hot: this.hot === "sidebar-toggle" })
        .on_hover(glow(this, "sidebar-toggle"))
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        // It goes with the sidebar, before the pointer can report leaving it.
        .on_click(() => { this.hot = null; run("layout.toggle", { id: "sidebar" }); }), radiusOf("sm")), { action: "layout.toggle:sidebar", below: true })));
  }

  // The space panel's top: its pages as T3's panel tabs (24px, 12px words), then widen and close as 24px icon buttons.
  // The rest of the row drags the window, as the tab bar does.
  panelHead(t) {
    const s = panelState(), space = spaces().find(p => p.active);
    // Review's run for this space, marked as a tab's agent is: what was news in a pane's card before (docs/adr/0011).
    const word = space && shared("review.status")?.[space.id];
    const mark = word === "working" ? svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)
      : word === "blocked" ? div().size(14).flex_none().rounded(4).bg(t.blocked + "26").text_size(11).font_bold().text_color(t.blocked).flex().items_center().justify_center().child("!")
      : word === "done" ? div().size(6).flex_none().rounded_full().bg(t.done) : null;
    const own = (el) => el.on_mouse_down("left", (_e, cx) => cx.stop_propagation());
    const page = (tab) => {
      const id = tab.id, [label, icon, colored] = PAGES[id] ?? [tab.path?.split("/").at(-1) ?? id, "folder-tree"], on = s.active === id, key = `surface-${id}`;
      const closeId = `surface-close-${id}`, closing = this.hot === key || within(this, [key, closeId]);
      // docs/internals/t3-tokens.md: 面板标签; icon and close share the leading 16px slot.
      const glyph = closing ? svg("mods/t3-chrome/icons/x.svg").size(12).text_color(t.dim)
        : tab.path ? image(`mods/t3-chrome/${fileIcon(tab.path)}`).size(12)
        : colored ? image(`mods/t3-chrome/icons/${icon}.svg`).size(12).opacity(on ? 1 : 0.7)
        : svg(`mods/t3-chrome/icons/${icon}.svg`).size(12).text_color(t.dim);
      return tip(this, t, key, tab.path ?? label, stop(this, t, key, own(h_flex().id(key).h(24).max_w(144).pl(6).pr(8).gap(2).flex_none().items_center().rounded(6).text_size(12)
        .bg(on ? t.selected : t.chrome).text_color(on || this.hot === key ? t.foreground : t.dim)
        .when(!on, el => el.hover(st => st.bg(t.hover))).on_hover(glow(this, key))
        .role("tab").accessibility_label(label)
        .on_click(() => activateSurface(id))
        .on_size_change((size, cx) => { const width = size.width / (Number(settings().zoom) || 1); this.surfaceWidths ??= {}; if (this.surfaceWidths[id] !== width) { this.surfaceWidths[id] = width; cx.notify(); } })
        .on_mouse_down("middle", (_e, cx) => { cx.stop_propagation(); closeSurface(id); })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "t3-chrome", kind: "popup", width: 220, height: 148, props: { part: "surface-context", target: id, space: space?.id } }); })
        .child(stop(this, t, closeId, own(drawButton(t, closeId, { size: "tiny", label: `Close ${label}`, surface: "tab" }).child(glyph)
          .on_click((_e, cx) => { cx.stop_propagation(); closeSurface(id); })), 4))
        .child(div().flex_1().min_w(0).truncate().whitespace_nowrap().child(label))
        .when(id === "review" && mark != null, el => el.child(mark))), 6), { below: true });
    };
    const button = (id, icon, label, action, key, size = /** @type {"xs" | "sm"} */ ("sm")) => tip(this, t, id, label, stop(this, t, id, own(drawButton(t, id, {
      size, surface: id === "surface-add" ? "chrome" : "card", on: id === "panel-close", icon: `mods/t3-chrome/icons/${icon}.svg`, label, hot: this.hot === id })
      .on_hover(glow(this, id))
      .on_click((_e, cx) => { this.hot = null; action(); cx.notify(); })), radiusOf(size)), { action: key, below: true });
    const add = button("surface-add", "plus", "Open a surface", () => {
      const b = this.surfaceAddPress, z = Number(settings().zoom) || 1;
      openOverlay({ mod: "t3-chrome", kind: "popup", width: 220, height: 72, ...(b ? { at: { x: b.x, y: b.y + b.height + 6 * z } } : {}), props: { part: "surface-menu" } });
    }, "t3-tabs.surface-menu", "xs").on_mouse_down("left", (e, cx) => { this.surfaceAddPress = e.bounds; cx.stop_propagation(); });
    const widths = s.tabs.map(tab => (this.surfaceWidths?.[tab.id] ?? 100) + 4), total = widths.reduce((a, b) => a + b, 28), room = this.surfaceRoom ?? 300;
    this.surfaceOffset = Math.max(0, Math.min(this.surfaceOffset ?? 0, total - room));
    const measured = `${space?.id}:${s.active}:${room}:${widths.join(",")}`;
    if (this.surfaceMeasured !== measured) {
      this.surfaceMeasured = measured;
      const i = s.tabs.findIndex(tab => tab.id === s.active), x = widths.slice(0, Math.max(0, i)).reduce((a, b) => a + b, 0);
      this.surfaceOffset = Math.max(0, Math.min(x, Math.max(this.surfaceOffset, x + (widths[i] ?? 0) + (i === s.tabs.length - 1 ? 28 : 0) - room)));
    }
    return focusRoot(this, h_flex().id("panel-head").size_full().bg(t.chrome).gap(4).items_center()
      .on_size_change(size => { const metrics = /** @type {any} */ (globalThis).t3Titlebar ??= {}; metrics.panel = size.width; })
      .when(total > room, el => el.child(button("surface-back", "chevron-left", "Previous surfaces", () => { this.surfaceOffset = Math.max(0, this.surfaceOffset - room / 2); })))
      .child(div().id("surface-scroll").flex_1().min_w(0).overflow_hidden()
        .on_size_change((size, cx) => { const width = size.width / (Number(settings().zoom) || 1); if (this.surfaceRoom !== width) { this.surfaceRoom = width; cx.notify(); } })
        .on_scroll_wheel((e, cx) => { const delta = Math.abs(e.delta.x) > Math.abs(e.delta.y) ? e.delta.x : e.delta.y; this.surfaceOffset = Math.max(0, Math.min(total - room, this.surfaceOffset - delta / (Number(settings().zoom) || 1))); cx.stop_propagation(); cx.notify(); })
        .child(h_flex().id("surface-strip").ml(-this.surfaceOffset).gap(4).items_center().children(s.tabs.map(page)).child(add)))
      .when(total > room, el => el.child(button("surface-next", "chevron-right", "Next surfaces", () => { this.surfaceOffset = Math.min(total - room, this.surfaceOffset + room / 2); })))
      .child(button("panel-wide", s.wide ? "minimize-2" : "maximize-2", s.wide ? "Restore panel" : "Expand panel", toggleWide))
      .child(button("panel-close", "panel-right", "Hide panel", hidePanel, "t3-tabs.panel"))
      .when(Boolean(window()?.buttons), el => el.children([["minimize", "−", "win-min"], ["maximize", window().maximized ? "❐" : "□", window().maximized ? "win-restore" : "win-max"], ["close", "×", "win-close"]].map(([cmd, text, icon]) => own(drawButton(t, `panel-window-${cmd}`, { size: "sm", label: `${cmd} window`, ...(window().platform === "windows" ? { icon: `mods/t3-chrome/icons/${icon}.svg` } : { text }) }).w(28).px(0).on_click(() => run(`window.${cmd}`)))))));
  }

  surfaceView(t) {
    const p = props(), s = panelState(), empty = p.part === "surface-empty", context = p.part === "surface-context";
    const at = s.tabs.findIndex(tab => tab.id === p.target), tab = s.tabs[at];
    const finish = () => { if (!empty) closeOverlay(p.overlay); };
    const items = context ? [
      ...(tab?.path ? [{ label: "Copy path", act: cx => cx.write_to_clipboard(tab.path) }] : []),
      { label: "Close", act: () => closeSurface(p.target) },
      { label: "Close others", disabled: s.tabs.length < 2, act: () => closeSurface(p.target, "others") },
      { label: "Close to the right", disabled: at === s.tabs.length - 1, act: () => closeSurface(p.target, "right") },
      { label: "Close all", act: () => closeSurface(p.target, "all") },
    ] : [
      { label: "Files", key: "f", icon: "folder-tree", act: () => showPage("files") },
      ...(s.pages.includes("review") ? [{ label: "Review", key: "r", icon: "pulls-review", disabled: Boolean(this.reviewReason), reason: this.reviewReason, act: () => showPage("review") }] : []),
    ];
    const choose = (i, cx) => { const it = items[i]; if (!it || it.disabled) return; if (context && p.space !== spaces().find(sp => sp.active)?.id) return finish(); finish(); it.act(cx); };
    const list = v_flex().id("surface-list").w_full().max_w(empty ? 320 : 220).p(4).gap(0).children(items.map((it, i) => h_flex().id(`surface-option-${i}`).h(empty ? 32 : 28).px(8).gap(8).items_center().rounded(4).text_size(14)
      .text_color(t.foreground).when(it.disabled, el => el.opacity(0.5).tooltip(it.reason ?? "Not available"))
      .when(!it.disabled, el => el.on_hover((on, cx) => { this.surfaceAt = on ? i : -1; cx.notify(); }).on_click((_e, cx) => choose(i, cx)))
      .when(this.surfaceAt === i, el => el.bg(t.selected))
      .role("button").accessibility_label(it.label)
      .when(Boolean(it.icon), el => el.child(svg(`mods/t3-chrome/icons/${it.icon}.svg`).size(16).flex_none()))
      .child(div().flex_1().min_w(0).child(it.label))
      .when(Boolean(it.key), el => el.child(div().text_size(12).text_color(t.dim).child(it.key?.toUpperCase())))));
    return v_flex().id(empty ? "surface-empty" : "surface-menu").size_full().min_h(0).items_center()
      .when(empty, el => el.justify_center().gap(12).p(24)).when(!empty, el => el.bg(t.popover))
      .track_focus(this.surfaceKeys).on_mouse_down("left", () => this.surfaceKeys.focus())
      .on_key_down((e, cx) => {
        if (e.key === "escape" && !empty) finish();
        else if (e.key === "enter") choose(this.surfaceAt, cx);
        else if (["up", "down"].includes(e.key)) {
          const enabled = items.map((it, i) => !it.disabled ? i : -1).filter(i => i >= 0), index = enabled.indexOf(this.surfaceAt);
          this.surfaceAt = enabled[(index + (e.key === "down" ? 1 : enabled.length - 1) + enabled.length) % enabled.length];
        } else if (e.keystroke === e.key) { const i = items.findIndex(it => it.key === e.key); if (i < 0) return; choose(i, cx); }
        else return;
        cx.stop_propagation(); cx.notify();
      })
      .when(empty, el => el.child(div().text_size(14).font_medium().text_color(t.muted).child("Open a surface")))
      .child(list);
  }
}
