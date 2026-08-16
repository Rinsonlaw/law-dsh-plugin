// Host half of the dsh-cursor-glow plugin.
// The host side does nothing — it only exists as a mount point so the
// client-modules scanner discovers this package's `dsh.client` declaration
// and serves /plugins/dsh-cursor-glow/client.js.
const name = "cursor-glow";

function apply(ctx) {
  // No host-side behavior.
}

export { apply, name };
