### What happened?

A custom Files mod uses `EditorState.new({ language: "rust", value, readonly: true })` to preview code. Creating an editor with syntax highlighting, or replacing its content with `set_value()`, parses the whole document synchronously on the UI call path. For larger files, the window visibly stalls.

The file preview needs to refresh as an agent writes the file. Even when the old and new content differ by only one line, the current highlighter does not use the supplied edit range: `SyntectHighlighter::update` ignores `_edit`, creates a new parser state, clears the highlights, and traverses the entire document again.

Our workaround in Herdr T3 is to show rewritten larger files as plain text first, then create a highlighted editor once their content has settled. Files over 256 KB require an explicit request to highlight. This reduces repeated stalls during continuous updates, but the eventual highlighting still blocks the window synchronously.

### What did you expect?

Opening or refreshing a larger code file should not let syntax highlighting block input and painting for long periods. Small content changes should also avoid synchronous whole-document reprocessing where possible.

Background parsing, processing in batches, or reusing parser state could help. This report concerns responsiveness; it does not require a particular implementation or ask to remove highlighting.

### Herdr version

Source inspection baseline: upstream `master` commit `5216e6f9f8c0c281a65e09816c66e4319e671784`.

Runtime measurements are from the earlier debug-build validation documented in #1077: that baseline plus the `EditorState.set_soft_wrap` patch. The patch did not change the highlighter or the editor-creation path. These are existing experimental results; no new release-build benchmark was run for this report.

### OS and architecture

Existing measurement environment: an isolated macOS VM, 4 vCPU, Apple Silicon (arm64).

### Layout name

The use case is Herdr T3's Files preview. The existing timings came from a separate small mod with a read-only editor, without loading the full T3 layout.

### Steps to reproduce

1. In a minimal mod's `init()` or an event handler, create a read-only editor containing about 1 MB of Rust text.
2. Compare it with an editor containing the same text but no `language`. Disable soft wrapping and folding to reduce their contribution.
3. Change one part of the text and call `set_value()`. Record the synchronous creation and update times separately.
4. Display the editor in a window and also record subsequent frame and event-loop stalls. Report synchronous-call time separately from the next frame.

The following is a proposed minimal API comparison, to run in `init()` or an event handler with an active context, not in `render()`. It measures synchronous calls only. This new comparison snippet has not been run; existing runtime evidence follows below.

```js
import { EditorState } from "gpui-base";

const text = "pub fn f() { let value = 1; }\n".repeat(35000);
const changed = text.replace("value = 1", "value = 2");

for (const language of [undefined, "rust"]) {
  const start = Date.now();
  const editor = EditorState.new({
    language, value: text, readonly: true,
    soft_wrap: false, folding: false,
  });
  const created = Date.now() - start;
  const updateStart = Date.now();
  editor.set_value(changed);
  console.log(JSON.stringify({
    mode: language ?? "plain",
    createMs: created,
    updateMs: Date.now() - updateStart,
  }));
  editor.release();
}
```

#### Existing runtime evidence

The earlier standalone mod used a roughly 1 MB, 28,822-line Rust file. It chained zero-delay timers to record event-loop stalls after each call. Across three runs, rebuilding the highlighted editor produced:

| Phase | Time |
| --- | --- |
| Creation call | 1,256–1,289 ms |
| Stall in the next frame | 1,230–1,491 ms |
| Total | 2,499–2,759 ms |

That experiment included a wrapping-toggle scenario. The total includes highlighting, layout, and other work; it cannot all be attributed to syntax parsing, and it is not a release-build performance figure. It demonstrates a multi-second window stall when rebuilding the editor. The synchronous whole-document highlighting mechanism is confirmed by the source below.

### Source and related work

- [Editor creation and initial text assignment](https://github.com/herdrdev/herdr-app/blob/5216e6f9f8c0c281a65e09816c66e4319e671784/vendor/gpui-kit/crates/shell/src/entities.rs#L461-L488).
- [Synchronous call to highlighter.update](https://github.com/herdrdev/herdr-app/blob/5216e6f9f8c0c281a65e09816c66e4319e671784/vendor/gpui-kit/crates/base/src/input/editor/mod.rs#L154-L166).
- [Highlighter ignoring the edit range and traversing the entire document](https://github.com/herdrdev/herdr-app/blob/5216e6f9f8c0c281a65e09816c66e4319e671784/vendor/gpui-kit/crates/shell/src/syntax.rs#L70-L106).
- #1077 permits toggling wrapping in place, avoiding editor reconstruction for that operation. This report concerns the synchronous highlighting cost that remains when opening files and updating their text.
