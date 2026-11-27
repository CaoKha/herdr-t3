import { image, svg } from "gpui-kit";

// One program mark in every component, at that component's T3 size.
export function programIcon(p, size, color, fallback = null) {
  if (!p?.icon) return fallback && svg(fallback).size(size).flex_none().text_color(color);
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}
