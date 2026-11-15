# key-manager — command reference

Full cheat sheet. `KM` below means:

```sh
KM="$HOME/.config/opencode/skills/key-manager/key-manager.py"
python3 "$KM" ...
```

Store location: `~/.local/share/key-manager` (0700; key and blobs 0600). Never copy the store directly between machines — use backup/restore. Never put secrets or passphrases in arguments, logs, or memory.

## One-time setup

```sh
python3 "$KM" init
```

Not strictly needed: the first add/backup operation initializes automatically.

## Store a credential (agents AND humans)

The secret enters ONLY through a stdin pipe (or hidden interactive entry in the wizard). Never in arguments:

```sh
printf '%s\n' "$SECRET" | python3 "$KM" add NAME --service HOST --kind TYPE --secret-stdin
# example:
printf '%s\n' "$TOKEN" | python3 "$KM" add github-api --service github.com --kind api-token --secret-stdin
```

Naming convention: `service-account-kind`, e.g. `github-api`, `ssh-root-192-168-1-240`, `n8n-192-168-1-240`.

## Find the right entry when several exist (agents)

`resolve` matches by exact service (optionally kind) and prints the ONE entry name. Never guess names:

```sh
python3 "$KM" resolve --service github.com                 # -> prints e.g. "github-api"
python3 "$KM" resolve --service github.com --kind password # disambiguate same service
```

Errors are actionable: ambiguity asks for `--kind`; no match lists available entries.

## Consume a secret (agents)

Pipe directly into the consumer; NEVER print, capture, redirect to a file, or log it:

```sh
consumer_tool < <(python3 "$KM" get NAME)
# SSH password example:
sshpass -f <(python3 "$KM" get ssh-root-192-168-1-240) ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no root@192.168.1.240
```

## Inspect / modify / delete

```sh
python3 "$KM" list                                  # all metadata (JSON, no secrets)
python3 "$KM" list --service github.com             # filter by service
python3 "$KM" list --kind api-token                 # filter by kind
python3 "$KM" update NAME --service NEW --kind NEW --secret-stdin   # empty flags keep values; stdin only if changing the secret
python3 "$KM" delete NAME
```

## Backup / restore (move the store to another machine)

```sh
# source machine:
printf '%s\n' "$PASSPHRASE" | python3 "$KM" backup --out ~/key-manager-backup.gpg --passphrase-stdin
# move the file (scp/USB), then on the target machine:
printf '%s\n' "$PASSPHRASE" | python3 "$KM" restore --from ~/key-manager-backup.gpg --passphrase-stdin
python3 "$KM" restore --from FILE --passphrase-stdin --replace   # ONLY to overwrite an existing store
```

The backup is a GPG-symmetric-encrypted archive (local key + blobs + metadata + manifest), mode 0600, no plaintext inside. Restore refuses wrong passphrases, tampered/manifest-mismatched archives, and existing stores without `--replace`. The passphrase protects only the backup file; the store itself stays passphrase-free for daily use.

## Human-friendly wizard

Run with NO subcommand in a terminal:

```sh
python3 "$KM"
```

Menu: Add / List / View / Modify / Delete / Backup / Restore / Exit. Hidden secret typed twice; View reveals only after Enter; Delete requires typing the exact name. Agents must NOT use the wizard — always pass an explicit subcommand.

## Legacy migration (one-time, old passphrase stores)

```sh
printf '%s\n' "$OLD_PASSPHRASE" | python3 "$KM" migrate --old-passphrase-stdin
```

`init` refuses legacy stores and discards nothing; migrate re-encrypts each blob with the new local key.

## Exit codes

`0` success · `1` error (not found, ambiguous resolve, refused restore, gpg failure). Errors go to stderr; metadata in errors never includes secrets.
