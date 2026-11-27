import { exec } from "herdr";

// Keep these reads from updating the repository's index or filesystem-monitor state. `on`: the space's machine, null for this one.
export const GIT = ["--no-optional-locks", "-c", "core.fsmonitor=false"];
export const git = (cwd, args, on = null) => exec("git", [...GIT, ...args], { cwd, on });

export async function repoTop(cwd, on) {
  const r = await git(cwd, ["rev-parse", "--show-toplevel"], on);
  return (r.code === 0 && r.stdout?.trim()) || null;
}
