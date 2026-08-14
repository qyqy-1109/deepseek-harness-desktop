/**
 * dsh-codex-flavor — host half.
 *
 * The flavor itself lives in the browser (see ./client.js): it stacks a
 * theme-override layer over the active DSH theme and injects a tiny CSS sheet.
 * The host half exists so the bundle row resolves in the host Loader; it is a
 * deliberate no-op.
 */
export const name = "dsh-codex-flavor";

export function apply() {
  // Nothing to do on the host plane: no routes, services, persistence or
  // system-prompt contribution. The client half is picked up automatically
  // through the `dsh.client` declaration in package.json.
}
