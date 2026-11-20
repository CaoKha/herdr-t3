// The Snooze menu's times (snooze-presets.js), as T3's: soonest first, one row per wake minute, tonight's gone once it's past.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { strip } = require("./check-kit.js");

const context = vm.createContext({ Date });
vm.runInContext(strip(fs.readFileSync(path.join(__dirname, "snooze-presets.js"), "utf8")) + "\nglobalThis.presets = presets;", context);
const at = (day, h, m = 0) => new Date(2026, 10, day, h, m).getTime();
const offered = (now) => [...context.presets(now)].map((p) => `${p.label} ${p.when}`);

assert.deepEqual(offered(at(3, 10)), ["In 1 hour 11:00 am", "In 3 hours 1:00 pm", "This evening 6:00 pm", "Tomorrow 9:00 am", "Next week Mon 9:00 am"]);
assert.deepEqual(offered(at(3, 15)), ["In 1 hour 4:00 pm", "In 3 hours 6:00 pm", "Tomorrow 9:00 am", "Next week Mon 9:00 am"], "6 pm from either shows once");
assert.deepEqual(offered(at(3, 19)), ["In 1 hour 8:00 pm", "In 3 hours 10:00 pm", "Tomorrow 9:00 am", "Next week Mon 9:00 am"], "tonight's past");
assert.deepEqual(offered(at(3, 22)), ["In 1 hour 11:00 pm", "In 3 hours Wed 1:00 am", "Tomorrow 9:00 am", "Next week Mon 9:00 am"], "another day names it");
assert.deepEqual(offered(at(8, 10)).slice(-1), ["Tomorrow 9:00 am"], "on a Sunday next week is tomorrow");
assert.equal(context.presets(at(3, 10)).find((p) => p.label === "Tomorrow").at, at(4, 9), "tomorrow is the next calendar day at 9:00");

console.log("ok: the snooze times are T3's, by the clock they are asked at.");
