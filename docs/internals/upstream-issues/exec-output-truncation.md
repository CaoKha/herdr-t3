### What happened?

For a local command (no `on`), `herdr.exec()` captures only the first 8 MiB of stdout and stderr separately, then drains and discards the remaining output. If the command exits normally, the call still returns `code: 0`. The result has only `code`, `stdout`, and `stderr`, with no indication that either stream was truncated.

`herdr.d.ts` documents the cap ("8 MiB output."), but not that output past it is dropped silently, and a caller has no way to tell when that happened.

A mod therefore cannot distinguish a complete successful result from a successful command whose output was only partly captured. This can corrupt JSON, file listings, or base64 data transported through stdout.

We encountered this limit while developing image import in Herdr T3. Our current workaround is to resize images to a small sampling grid before reading them back, keeping the payload below the limit. Other `exec()` callers still cannot detect truncation.

With `on`, the same cap applies to the local `hc exec --json` wrapper's stdout. From the source, an oversized remote result would cut that JSON and reject with an `hc exec:` parse error instead of returning partial text; this path was not run. The rest of this report concerns local execution.

### What did you expect?

If stdout or stderr is truncated, the caller should be told explicitly and be able to identify which stream was truncated. For example, the result could include truncation flags, or the call could reject with a clear error.

The output cap can remain as a memory bound. This report does not ask to remove or raise the 8 MiB limit, or prescribe a particular API design.

### Herdr version

Source verified at upstream `master` commit `5216e6f9f8c0c281a65e09816c66e4319e671784`.

The reproduction extracted that revision's unchanged `run_blocking` function into an isolated Rust harness, retaining its output-capture logic. This was a helper-level reproduction, not a GUI mod test. The locally installed app reports 0.1.15; the installed binary was not subjected to the same call test.

### OS and architecture

macOS 27.0, Apple Silicon (arm64).

### Layout name

Herdr T3. The problem is in the shared mod execution API and is independent of the layout; the helper-level reproduction does not load a layout.

### Steps to reproduce

Have a command exit normally after writing 8 MiB minus one byte, exactly 8 MiB, and 8 MiB plus one byte of ASCII to stdout.

The following is the corresponding API snippet for a mod's asynchronous task. The measurements below were obtained with the native-function harness described above, rather than by running this snippet in a GUI mod.

```js
import { exec } from "herdr";

for (const size of [8388607, 8388608, 8388609]) {
  const result = await exec("python3", [
    "-c",
    `import sys; sys.stdout.buffer.write(b'a' * ${size})`,
  ]);
  console.log(JSON.stringify({
    requested: size,
    returned: result.stdout.length, // ASCII only: one character equals one byte.
    code: result.code,
    fields: Object.keys(result),
  }));
}
```

Observed native-function results:

| Bytes written to stdout | Bytes returned | Exit code |
| --- | --- | --- |
| 8,388,607 | 8,388,607 | 0 |
| 8,388,608 | 8,388,608 | 0 |
| 8,388,609 | 8,388,608 | 0 |

Writing 8,388,609 bytes to stderr likewise returned only 8,388,608 bytes with exit code 0.

An additional tested boundary case wrote 8,388,607 ASCII bytes followed by the three UTF-8 bytes of the Chinese character `中`. The cap retained only the first byte of that character, and `String::from_utf8_lossy` replaced it with `�`. The exit code was still 0.

None of these truncated results exposes a separate truncation status to the caller.

### Source and related work

- [Output cap and collection](https://github.com/herdrdev/herdr-app/blob/5216e6f9f8c0c281a65e09816c66e4319e671784/src/mods.rs#L831-L881): after `take(EXEC_OUTPUT)`, remaining output is drained into `sink()`.
- [Result construction](https://github.com/herdrdev/herdr-app/blob/5216e6f9f8c0c281a65e09816c66e4319e671784/src/mods.rs#L951-L969): only `code`, `stdout`, and `stderr` are returned.
- [The documented cap](https://github.com/herdrdev/herdr-app/blob/5216e6f9f8c0c281a65e09816c66e4319e671784/defaults/herdr.d.ts#L10): "8 MiB output.", with no mention of truncation.
- [Remote path](https://github.com/herdrdev/herdr-app/blob/5216e6f9f8c0c281a65e09816c66e4319e671784/src/mods.rs#L899-L900): the `hc exec --json` output goes through the same `run_blocking` cap before it is parsed.
- #446 addresses the output-draining timeout and preserves the existing 8 MiB cap. This report concerns making truncation observable to callers.
