import { layout, shared, setShared, setAgentOrder } from "herdr";
import { KEY } from "./store.js";

export function sidebarParts(root) {
  let rail = root?.id === "sidebar" ? root : undefined;
  let stack = root?.id === "sidebar-lists" ? root : undefined;
  for (const child of root?.children ?? []) {
    const found = sidebarParts(child);
    rail ??= found.rail;
    stack ??= found.stack;
    if (rail && stack) break;
  }
  return { rail, stack };
}
export const sidebarPage = () => sidebarParts(layout()).stack?.active;

// The next draw resolves the latest destination against its actual children.
export function revealAfterDraw(view, request, visible, cx) {
  view.reveal = request;
  view.revealTimer = cx.timer.after(0, (cx) => {
    if (view.reveal !== request) return;
    view.revealTimer = null;
    if (!visible()) { view.cancelReveal(); return; }
    request.ready = true;
    cx.notify();
  });
}

export function publishOrder(view, { key, drawn, order, owner }) {
  if (JSON.stringify(drawn) !== JSON.stringify(shared(key) ?? null)) setShared(key, drawn);
  const at = JSON.stringify(order);
  if (at !== view.agentOrder || shared(KEY.agentOrder) !== owner) {
    view.agentOrder = at;
    setAgentOrder(order);
    if (shared(KEY.agentOrder) !== owner) setShared(KEY.agentOrder, owner);
  }
}

// Where the sidebar's toggle stands, as T3's: one place whether the sidebar shows or not (the brand bar's first button, else the
// tab row's): past the macOS window buttons when the layout draws them (the last ends 52 past traffic_lights' x, then a 14
// gap, in unzoomed screen points).
export function toggleLeft(w, root, zoom = 1) {
  const lights = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights;
  return lights ? (root.traffic_lights[0] + 66) / zoom - 4 : 8;
}
