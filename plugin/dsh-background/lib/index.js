/**
 * dsh-background — host half.
 *
 * Intentionally a no-op loader entry (same shape as dsh-skin / the shipped
 * ui-* packages): the whole feature lives in the browser half (`./client`),
 * picked up through the package's `dsh.client` declaration. The background
 * choice is persisted in localStorage, because the Host settings wire only
 * exposes an allowlisted set of namespaces to browser clients
 * (dsh-host-apiproxy's WEB_SETTINGS_NAMESPACES), so a third-party namespace
 * would answer `settings-not-exposed`.
 */
export function apply() {}
