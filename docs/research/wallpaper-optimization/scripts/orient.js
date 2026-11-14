// osascript -l JavaScript orient.js <file> : the EXIF orientation (1–8) through ImageIO, 1 when absent.
ObjC.import("ImageIO"); ObjC.import("Foundation");
function run(argv) {
  const url = $.NSURL.fileURLWithPath(argv[0]);
  const src = $.CGImageSourceCreateWithURL(url, null);
  if (!src) return "1";
  const props = ObjC.castRefToObject($.CGImageSourceCopyPropertiesAtIndex(src, 0, null));
  const o = props.objectForKey("Orientation");
  return o.isNil() ? "1" : String(ObjC.unwrap(o));
}
