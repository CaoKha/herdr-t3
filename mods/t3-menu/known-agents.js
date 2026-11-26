// The agents Herdr can start on each machine (knownAgents), installed ones only, for New tab's menu: what each machine last
// answered, kept for this run in the JS context the mods share, and asked again each time the menu opens.
import { knownAgents } from "herdr";

const cache = () => /** @type {Map<string, any[]>} */ (globalThis.t3KnownAgents ??= new Map());

/** `machine`'s installed agents as last answered (null: this machine, else its name), or null before any answer. */
export const agentsOn = (machine) => cache().get(machine ?? "") ?? null;

/** Asks `machine` again; its installed agents, or what was known when it can't answer. */
export async function lookAgents(machine) {
  const all = await knownAgents({ on: machine ?? null }).catch(() => null);
  if (all) cache().set(machine ?? "", all.filter((a) => a.installed));
  return agentsOn(machine);
}
