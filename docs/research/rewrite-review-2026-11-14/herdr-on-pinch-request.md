# 草稿：请 Herdr 向 mod 开放捏合手势（`on_pinch`）

**状态：草稿，未提交。** 只放在这里备用；要不要提、提到哪里，由用户决定。背景见 [wallpaper-create-redesign.md](wallpaper-create-redesign.md) 决策 7。

---

**Title:** Expose GPUI pinch (magnify) events to mods as `on_pinch`

**What we'd like**

An element handler for trackpad pinch, alongside `on_scroll_wheel`:

```ts
on_pinch<Self extends Element>(this: Self, handler: (event: PinchEvent, cx: Context) => void): Self;

interface PinchEvent {
  /** Scale change since the last event: the new scale is `scale * (1 + delta)`. */
  delta: number;
  position: Point;
  local_position?: Point;
  phase: "started" | "moved" | "ended" | "cancelled";
  modifiers: Modifiers;
}
```

**Why**

The asciicn wallpaper mod frames a picture across Home: drag to pan, and zoom about the pointer. With a mouse, the wheel zooms; on a trackpad, two-finger scrolling pans. The natural trackpad zoom is a pinch, but a mod never receives one, so today it asks for ⌘-scroll instead, which few people try.

**What we found**

- GPUI already produces `PinchEvent` (macOS `NSEventTypeMagnify`; Windows through DirectManipulation): `gpui-pre-macos/src/events.rs` around line 297 in the checkout at `4aa3460` (v0.1.12).
- gpui-kit doesn't dispatch it: there's no `on_pinch` in the generated `gpui-kit.d.ts`, and `strings` on the 0.1.15 binary finds none either. `dispatch_scroll_wheel` (`gpui-kit/.../quickjs/mod.rs:4240`) is the model to follow.

**How the mod would use it**

`zoom *= 1 + delta`, about `local_position`, clamped to 100–400%; the slider follows. Nothing else changes: the ⌘-scroll fallback can stay for Linux.
