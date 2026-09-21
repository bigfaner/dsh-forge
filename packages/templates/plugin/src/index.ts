/**
 * dsh client plugin template, node half. Pure UI plugins keep this half
 * intentionally empty: the apply() exists so the plugin appears in the host
 * cordis.yml / Loader tree; the browser half ships via exports['./client'],
 * discovered through the package.json dsh.client declaration. (If your plugin
 * needs host-side Node behavior, this is the place — keep imports resolvable
 * from the installation anchor.)
 */

/** Host plugin body — no host-side behavior for this surface plugin. */
export function apply(): void {}
