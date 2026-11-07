---
name: key-manager
description: "Trigger: SSH credentials, API credentials, tokens, key manager. Securely manage credentials with key-manager."
---
# Key Manager

## Agent credential policy

- A credential the user explicitly provides for the current task is authorized input. Use it for that task without generic refusal or warnings; never repeat or expose the value, and never store it automatically.
- For reusable credentials not supplied for this task, check metadata with `list` first. If no exact matching entry exists, ask for confirmation before creating one and direct the user to enter it through the local secure stdin flow. Never ask the user to paste a missing secret into chat.
- Prefer exact stable entry names such as `github-api`, `ssh-root-192-168-1-240`, or `n8n-192-168-1-240`. Match host, service, and account from metadata; do not guess or use a partial name.
- A child agent that needs a stored credential receives only its reference and retrieves it itself. Never pass a resolved secret in a prompt or handoff. For a one-time credential present only in the chat, the parent may perform the operation itself or ask to store it securely before delegating.
- Do not store temporary, third-party, or uncertain-scope credentials by default; clarify the intended scope first.

Initialize once (no passphrase prompt):

```sh
python3 "$HOME/.config/opencode/skills/key-manager/key-manager.py" init
```

Then add credentials through a trusted stdin pipe; never put secrets in arguments, logs, metadata, or memory:

```sh
printf '%s\n' "$SECRET_FROM_TRUSTED_SOURCE" | python3 "$HOME/.config/opencode/skills/key-manager/key-manager.py" add example-token --service example --kind api-token --secret-stdin
```

Normal `get`, `update`, `delete`, and `list` calls are unattended after initialization. `list` is metadata-only: use it to locate an entry by `service`, `kind`, or `name`, then select its exact `name` for subsequent commands. Match the requested host, service, and account against the metadata/name (for example, `ssh-root-192-168-1-240`); do not guess an entry or use a partial name. `get NAME` prints the secret to stdout—never run it alone, display/capture its output, or treat it as safe to inspect. Pipe it directly to the trusted consumer.

For password-based SSH, first verify the exact entry with metadata-only `list`, then pass its secret directly to `sshpass` through process substitution. Replace `ENTRY_NAME`, `USER`, and `HOST` with the exact metadata entry name, SSH login user, and destination host; the entry name is not necessarily the remote username or host:

```sh
sshpass -f <(python3 "$HOME/.config/opencode/skills/key-manager/key-manager.py" get ENTRY_NAME) ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no USER@HOST
```

Do not enable shell tracing, redirect the `get` output, place the secret in an argument/environment variable/file, or log it. This pattern is for an authorized password credential and host only; it does not retrieve credentials or connect unless explicitly executed.

The store is `~/.local/share/key-manager` (0700). Each encrypted blob and `.local-key` are 0600. The random `.local-key` is separate from encrypted credential files and is not itself encrypted; this deliberately allows the same-user agent process to decrypt without prompting. Same-user processes, root, backups, and a compromised host may therefore access the key or plaintext. This is encryption at rest, not process isolation or a hardware-backed vault.

## Existing credentials / one-time migration

`init` refuses to touch a store containing legacy `.gpg` or metadata files. It never discards them. To preserve them, run this one-time command with the old passphrase supplied through a trusted stdin pipe (the command decrypts and immediately re-encrypts each blob; use synthetic data first):

```sh
printf '%s\n' "$OLD_PASSPHRASE_FROM_TRUSTED_SOURCE" | python3 "$HOME/.config/opencode/skills/key-manager/key-manager.py" migrate --old-passphrase-stdin
```

If the old passphrase is unavailable, do not delete the store: securely retrieve it, or re-add each credential from its authoritative source after backing up the legacy store. Verify added entries with a metadata-only `list` call.

The portable installer installs this utility at `$HOME/.config/opencode/skills/key-manager/key-manager.py`. Do not copy the credential store or local key into the package or to another computer.
