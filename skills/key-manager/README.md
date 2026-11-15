# key-manager

Unattended local credential storage using GPG symmetric encryption and a separately stored random local key. Run `init` once; normal CRUD does not prompt for a passphrase. Secrets enter only through trusted stdin (`--secret-stdin`) and metadata listing never includes secret values.

Security tradeoff: the store and key are restricted to the current user (0700/0600), but the key is intentionally available to same-user processes so an agent can decrypt without interaction. This does not defend against same-user malware, root, backups, or a compromised host.

## Friendly interactive mode

Run the utility with no subcommand in a terminal to open a menu-driven assistant:

```sh
python3 "$HOME/.config/opencode/skills/key-manager/key-manager.py"
```

Menu: Add / List / View / Modify / Delete / Backup / Restore / Exit. Add prompts for name, service, kind and a hidden secret (typed twice); View shows metadata and reveals the secret only after pressing Enter; Modify keeps current values on empty input; Delete requires typing the exact name to confirm; Backup/Restore handle full-store portability. If the store is not initialized, the first operation initializes it automatically. When stdin is not a terminal (agents, pipes), the wizard is refused and the classic subcommands apply unchanged — `--secret-stdin` remains the only way for agents to submit secrets.

## Backup and restore (move to another computer)

The credential store is never copied as part of the package. To move it, create an encrypted backup and restore it on the target machine:

```sh
printf '%s\n' "$PASSPHRASE" | python3 "$KM" backup --out ~/key-manager-backup.gpg --passphrase-stdin
# move the file (scp, USB, ...) to the other machine, there:
printf '%s\n' "$PASSPHRASE" | python3 "$KM" restore --from ~/key-manager-backup.gpg --passphrase-stdin
```

The backup is a GPG-symmetric-encrypted archive containing the local key, all blobs and metadata plus a manifest; it is written mode 0600 and never contains plaintext. Restore refuses to run with a wrong passphrase, a tampered/manifest-mismatched archive, or when a store already exists — pass `--replace` explicitly to overwrite an existing store. Passphrases follow the same rules as secrets: stdin or hidden terminal entry, never arguments, logs, or memory.

Legacy stores are not silently changed. `init` refuses them. Use the documented, one-time `migrate --old-passphrase-stdin` with the old passphrase, or preserve the old store and re-add from the authoritative source. Never ask an agent to read a real credential during migration or testing.

## Agent behavior

A credential the user explicitly supplies for the current task may be used for that task without generic warnings, but must not be repeated or stored automatically. For reusable credentials, check metadata with `list`; if no exact entry exists, ask before storing and have the user enter it through the local stdin flow. Never ask for a missing secret in chat. When work is delegated, pass only a stored credential reference; the consumer retrieves it itself. Do not store temporary or uncertain-scope credentials by default.
