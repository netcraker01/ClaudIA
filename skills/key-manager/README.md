# key-manager

Unattended local credential storage using GPG symmetric encryption and a separately stored random local key. Run `init` once; normal CRUD does not prompt for a passphrase. Secrets enter only through trusted stdin (`--secret-stdin`) and metadata listing never includes secret values.

Security tradeoff: the store and key are restricted to the current user (0700/0600), but the key is intentionally available to same-user processes so an agent can decrypt without interaction. This does not defend against same-user malware, root, backups, or a compromised host.

Legacy stores are not silently changed. `init` refuses them. Use the documented, one-time `migrate --old-passphrase-stdin` with the old passphrase, or preserve the old store and re-add from the authoritative source. Never ask an agent to read a real credential during migration or testing.

## Agent behavior

A credential the user explicitly supplies for the current task may be used for that task without generic warnings, but must not be repeated or stored automatically. For reusable credentials, check metadata with `list`; if no exact entry exists, ask before storing and have the user enter it through the local stdin flow. Never ask for a missing secret in chat. When work is delegated, pass only a stored credential reference; the consumer retrieves it itself. Do not store temporary or uncertain-scope credentials by default.
