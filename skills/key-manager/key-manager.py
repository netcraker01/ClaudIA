#!/usr/bin/env python3
"""Unattended local credential store; the local key is separate and mode 0600."""
from __future__ import annotations
import argparse, getpass, hashlib, io, json, os, secrets, subprocess, sys, tarfile, tempfile
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_STORE = Path.home() / ".local/share/key-manager"
KEY_NAME = ".local-key"

def stamp(): return datetime.now(timezone.utc).isoformat()

class Store:
    def __init__(self, root):
        self.root = Path(root); self.root.mkdir(parents=True, exist_ok=True); os.chmod(self.root, 0o700)
    def path(self, name, suffix): return self.root / (hashlib.sha256(name.encode()).hexdigest() + suffix)
    @property
    def key_path(self): return self.root / KEY_NAME
    def _key(self):
        if not self.key_path.exists(): raise RuntimeError("key-manager is not initialized; run init")
        mode = self.key_path.stat().st_mode & 0o777
        if mode != 0o600: raise PermissionError(f"local key must have mode 0600 (found {mode:04o})")
        return self.key_path.read_text().rstrip("\n")
    def initialize(self):
        if self.key_path.exists(): self._key(); return
        if list(self.root.glob("*.gpg")) or list(self.root.glob("*.json")):
            raise RuntimeError("legacy credentials found; use migrate with the old passphrase or re-add them; nothing was discarded")
        fd = os.open(self.key_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            os.write(fd, secrets.token_hex(32).encode() + b"\n"); os.fsync(fd)
        finally: os.close(fd)
        self._key()
    def gpg(self, mode, data, password):
        read_fd, write_fd = os.pipe(); os.write(write_fd, password.encode() + b"\n"); os.close(write_fd)
        try:
            result = subprocess.run(["gpg", "--batch", "--yes", "--pinentry-mode", "loopback", "--passphrase-fd", str(read_fd), mode], input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, pass_fds=(read_fd,), check=False)
            if result.returncode: raise RuntimeError("gpg operation failed")
            return result.stdout
        finally: os.close(read_fd)
    def add(self, name, service, kind, value):
        self.initialize(); metadata, blob = self.path(name, ".json"), self.path(name, ".gpg")
        if metadata.exists(): raise ValueError("credential already exists")
        blob.write_bytes(self.gpg("--symmetric", value.encode(), self._key())); os.chmod(blob, 0o600)
        now = stamp(); metadata.write_text(json.dumps({"name": name, "service": service, "kind": kind, "created": now, "updated": now}, sort_keys=True) + "\n"); os.chmod(metadata, 0o600)
    def get(self, name):
        self.initialize(); blob = self.path(name, ".gpg")
        if not blob.exists(): raise KeyError(self.not_found(name))
        return self.gpg("--decrypt", blob.read_bytes(), self._key()).decode()
    def update(self, name, service, kind, value):
        self.initialize(); metadata = self.path(name, ".json")
        if not metadata.exists(): raise KeyError(self.not_found(name))
        data = json.loads(metadata.read_text()); data.update({"service": service or data["service"], "kind": kind or data["kind"], "updated": stamp()})
        if value is not None:
            blob = self.path(name, ".gpg"); blob.write_bytes(self.gpg("--symmetric", value.encode(), self._key())); os.chmod(blob, 0o600)
        metadata.write_text(json.dumps(data, sort_keys=True) + "\n"); os.chmod(metadata, 0o600)
    def delete(self, name):
        self.initialize(); metadata = self.path(name, ".json")
        if not metadata.exists(): raise KeyError(self.not_found(name))
    def not_found(self, name):
        available = ", ".join(sorted(i["name"] for i in self.listing())) or "(none)"
        return f"credential not found: {name}; available entries: {available}"
    def resolve(self, service, kind):
        self.initialize()
        items = [i for i in self.listing() if i["service"] == service and (not kind or i["kind"] == kind)]
        if len(items) == 1: return items[0]["name"]
        if not items:
            available = "; ".join(f"{i['name']} (service={i['service']}, kind={i['kind']})" for i in self.listing()) or "(none)"
            raise KeyError(f"no credential matches service={service}{f' kind={kind}' if kind else ''}; available entries: {available}")
        raise KeyError(f"ambiguous: {len(items)} credentials match service={service}{f' kind={kind}' if kind else ''}; repeat resolve with --kind. Matches: " + ", ".join(f"{i['name']} (kind={i['kind']})" for i in items))
        metadata.unlink(); self.path(name, ".gpg").unlink(missing_ok=True)
    def listing(self): self.initialize(); return [json.loads(p.read_text()) for p in sorted(self.root.glob("*.json"))]
    def backup(self, out_path, passphrase):
        self.initialize()
        entries = len(self.listing())
        buffer = io.BytesIO()
        with tarfile.open(fileobj=buffer, mode="w") as tar:
            for file_path in sorted(self.root.iterdir()):
                if file_path.is_file():
                    info = tarfile.TarInfo(file_path.name); info.size = file_path.stat().st_size; info.mode = 0o600
                    tar.addfile(info, io.BytesIO(file_path.read_bytes()))
            manifest = json.dumps({"created": stamp(), "entries": entries}, sort_keys=True).encode()
            info = tarfile.TarInfo("manifest.json"); info.size = len(manifest); info.mode = 0o600
            tar.addfile(info, io.BytesIO(manifest))
        out_path = Path(out_path); out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(self.gpg("--symmetric", buffer.getvalue(), passphrase)); os.chmod(out_path, 0o600)
        return entries
    def restore(self, from_path, passphrase, replace):
        if self.key_path.exists() and not replace:
            raise RuntimeError("store already exists; use --replace to overwrite it (nothing is written until the whole backup is valid)")
        decrypted = self.gpg("--decrypt", Path(from_path).read_bytes(), passphrase)
        with tarfile.open(fileobj=io.BytesIO(decrypted), mode="r:") as tar:
            members = tar.getmembers()
            if any("/" in m.name or m.name in ("..", ".") for m in members): raise ValueError("unsafe backup archive")
            manifest = next((m for m in members if m.name == "manifest.json"), None)
            if manifest is None: raise ValueError("backup is missing its manifest; refusing to restore")
            expected = json.load(tar.extractfile(manifest)).get("entries")
            blob_count = sum(1 for m in members if m.name.endswith(".gpg"))
            if expected != blob_count: raise ValueError(f"backup manifest mismatch: {expected} entries declared, {blob_count} blobs found")
            os.chmod(self.root, 0o700)
            for member in members:
                if member.name == "manifest.json": continue
                target = self.root / member.name
                target.write_bytes(tar.extractfile(member).read()); os.chmod(target, 0o600)
        self._key()
        return blob_count
    def migrate(self, old_passphrase):
        blobs = sorted(self.root.glob("*.gpg"))
        if not self.key_path.exists():
            fd = os.open(self.key_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            try: os.write(fd, secrets.token_hex(32).encode() + b"\n"); os.fsync(fd)
            finally: os.close(fd)
        key = self._key(); encrypted = [(blob, self.gpg("--symmetric", self.gpg("--decrypt", blob.read_bytes(), old_passphrase), key)) for blob in blobs]
        for blob, contents in encrypted:
            fd, temporary = tempfile.mkstemp(dir=self.root, prefix=".migrate-")
            try:
                os.write(fd, contents); os.fsync(fd); os.close(fd); fd = None; os.chmod(temporary, 0o600); os.replace(temporary, blob)
            finally:
                if fd is not None: os.close(fd)
                if os.path.exists(temporary): os.unlink(temporary)

AGENT_HELP = """key-manager — safe agent flow (one screen)

1) Store (secret ONLY via stdin pipe, never arguments):
   printf '%s\\n' "$SECRET" | key-manager.py add NAME --service HOST --kind TYPE --secret-stdin
2) Find the exact entry for a service (metadata only, never secrets):
   key-manager.py resolve --service HOST [--kind TYPE]     -> prints the entry NAME
3) Use the secret without exposing it (pipe directly into the consumer):
   consumer_tool < <(key-manager.py get NAME)              # never print or log it
4) Inspect / clean up:
   key-manager.py list [--service HOST] [--kind TYPE]      # metadata-only
   key-manager.py update NAME --service H --kind T --secret-stdin   (empty flags keep values)
   key-manager.py delete NAME
"""

def secret_from_stdin(enabled):
    if not enabled: raise ValueError("use --secret-stdin; interactive secret input is disabled")
    value = sys.stdin.readline().rstrip("\n")
    if not value: raise ValueError("secret input was empty")
    return value

def pick(items, label):
    if not items:
        print("No credentials stored.")
        return None
    print(f"\n{label}:")
    for index, item in enumerate(items, 1):
        print(f"  {index}) {item['name']}  ({item['service']}, {item['kind']}, updated {item['updated'][:10]})")
    raw = input("Number (empty to cancel): ").strip()
    if not raw.isdigit() or not 1 <= int(raw) <= len(items):
        print("Cancelled.")
        return None
    return items[int(raw) - 1]

def ask(prompt, default=""):
    value = input(prompt).strip()
    return value or default

def ask_secret():
    while True:
        value = getpass.getpass("Secret (hidden input): ")
        if getpass.getpass("Repeat secret: ") != value:
            print("Secrets do not match; try again.")
            continue
        if not value:
            print("Secret cannot be empty.")
            continue
        return value

def show_item(item):
    print(f"Name: {item['name']}\nService: {item['service']}\nKind: {item['kind']}\nCreated: {item['created']}\nUpdated: {item['updated']}")

BANNER = r"""
       .-----.
      /       \
     |   / \   |       k e y - m a n a g e r
     |   \_/   |       created by NeTCRaKeR · 2026
      \       /
       '-----'
"""

def wizard(store):
    print(BANNER)
    try:
        while True:
            print("\n1) Add  2) List  3) View  4) Modify  5) Delete  6) Backup  7) Restore  8) Exit")
            choice = input("Choose an option: ").strip()
            if choice == "1":
                name = ask("Name: ")
                if not name:
                    print("Cancelled.")
                    continue
                try:
                    store.add(name, ask("Service (e.g. github.com): "), ask("Kind (e.g. token, password, key): "), ask_secret())
                    print(f"Credential '{name}' added.")
                except ValueError as error:
                    print(error)
            elif choice == "2":
                items = store.listing()
                if not items:
                    print("No credentials stored.")
                else:
                    print()
                    for item in items:
                        print(f"  {item['name']}  ({item['service']}, {item['kind']}, updated {item['updated'][:10]})")
            elif choice == "3":
                item = pick(store.listing(), "Stored credentials")
                if item:
                    show_item(item)
                    input("Press Enter to reveal the secret (Ctrl+C cancels): ")
                    print(f"Secret: {store.get(item['name'])}")
            elif choice == "4":
                item = pick(store.listing(), "Stored credentials")
                if item:
                    show_item(item)
                    service = ask(f"Service [{item['service']}]: ", item["service"])
                    kind = ask(f"Kind [{item['kind']}]: ", item["kind"])
                    value = ask_secret() if input("Change the secret? (y/N): ").strip().lower() == "y" else None
                    store.update(item["name"], service, kind, value)
                    print(f"Credential '{item['name']}' updated.")
            elif choice == "5":
                item = pick(store.listing(), "Stored credentials")
                if item:
                    if ask(f"Type the name '{item['name']}' to confirm deletion: ") == item["name"]:
                        store.delete(item["name"])
                        print(f"Credential '{item['name']}' deleted.")
                    else:
                        print("Name does not match; nothing was deleted.")
            elif choice == "6":
                default_out = Path.home() / f"key-manager-backup-{stamp()[:10]}.gpg"
                out = ask(f"Output path [{default_out}]: ", str(default_out))
                count = store.backup(out, passphrase_interactive())
                print(f"Backup written: {out} ({count} credentials, encrypted). Store it somewhere safe.")
            elif choice == "7":
                from_path = ask("Backup file path: ")
                if not from_path:
                    print("Cancelled.")
                    continue
                replace = input("The existing store will be REPLACED; continue? (y/N): ").strip().lower() == "y"
                count = store.restore(from_path, passphrase_interactive(confirm=False), replace)
                print(f"Store restored: {count} credentials.")
            elif choice in ("8", "q", "quit", "exit"):
                return
            else:
                print("Invalid option.")
    except (KeyboardInterrupt, EOFError):
        print("\nBye.")

def passphrase_interactive(confirm=True):
    if not (sys.stdin.isatty() and sys.stdout.isatty()): raise ValueError("passphrase entry needs a terminal; use --passphrase-stdin for scripts")
    value = getpass.getpass("Backup passphrase (hidden): ")
    if confirm and getpass.getpass("Repeat passphrase: ") != value: raise ValueError("passphrases do not match")
    if not value: raise ValueError("passphrase cannot be empty")
    return value

def passphrase_from(args):
    if args.passphrase_stdin:
        value = sys.stdin.readline().rstrip("\n")
        if not value: raise ValueError("passphrase input was empty")
        return value
    return passphrase_interactive()

def main(argv=None):
    parser = argparse.ArgumentParser(); parser.add_argument("--store", type=Path, default=DEFAULT_STORE); actions = parser.add_subparsers(dest="action")
    actions.add_parser("init")
    add = actions.add_parser("add"); add.add_argument("name"); add.add_argument("--service", required=True); add.add_argument("--kind", required=True); add.add_argument("--secret-stdin", action="store_true")
    get = actions.add_parser("get"); get.add_argument("name")
    update = actions.add_parser("update"); update.add_argument("name"); update.add_argument("--service"); update.add_argument("--kind"); update.add_argument("--secret-stdin", action="store_true")
    delete = actions.add_parser("delete"); delete.add_argument("name")
    listing = actions.add_parser("list"); listing.add_argument("--service"); listing.add_argument("--kind")
    resolve = actions.add_parser("resolve"); resolve.add_argument("--service", required=True); resolve.add_argument("--kind")
    backup = actions.add_parser("backup"); backup.add_argument("--out", required=True, type=Path); backup.add_argument("--passphrase-stdin", action="store_true")
    restore = actions.add_parser("restore"); restore.add_argument("--from", dest="from_path", required=True, type=Path); restore.add_argument("--passphrase-stdin", action="store_true"); restore.add_argument("--replace", action="store_true")
    actions.add_parser("help")
    migrate = actions.add_parser("migrate"); migrate.add_argument("--old-passphrase-stdin", action="store_true")
    args = parser.parse_args(argv); store = Store(args.store)
    try:
        if args.action is None:
            if not (sys.stdin.isatty() and sys.stdout.isatty()):
                print("Interactive mode needs a terminal. Subcommands: init, add, get, update, delete, list, migrate (secrets via --secret-stdin).", file=sys.stderr)
                return 1
            wizard(store); return 0
        if args.action == "init": store.initialize(); print("key-manager initialized")
        elif args.action == "add": store.add(args.name, args.service, args.kind, secret_from_stdin(args.secret_stdin)); print("credential added")
        elif args.action == "get": sys.stdout.write(store.get(args.name))
        elif args.action == "update": store.update(args.name, args.service, args.kind, secret_from_stdin(args.secret_stdin) if args.secret_stdin else None); print("credential updated")
        elif args.action == "delete": store.delete(args.name); print("credential deleted")
        elif args.action == "list":
            items = [i for i in store.listing() if (not args.service or i["service"] == args.service) and (not args.kind or i["kind"] == args.kind)]
            print(json.dumps(items, indent=2, sort_keys=True))
        elif args.action == "resolve": print(store.resolve(args.service, args.kind))
        elif args.action == "backup": count = store.backup(args.out, passphrase_from(args)); print(f"backup written: {args.out} ({count} credentials, encrypted); store it somewhere safe")
        elif args.action == "restore": count = store.restore(args.from_path, passphrase_from(args), args.replace); print(f"store restored: {count} credentials")
        elif args.action == "help": print(AGENT_HELP); return 0
        else: store.migrate(secret_from_stdin(args.old_passphrase_stdin)); print("legacy credentials migrated")
        return 0
    except (KeyError, ValueError, RuntimeError, PermissionError) as error:
        print(error, file=sys.stderr); return 1

if __name__ == "__main__": raise SystemExit(main())
