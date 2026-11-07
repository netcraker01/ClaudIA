#!/usr/bin/env python3
"""Unattended local credential store; the local key is separate and mode 0600."""
from __future__ import annotations
import argparse, hashlib, json, os, secrets, subprocess, sys, tempfile
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
        if not blob.exists(): raise KeyError("credential not found")
        return self.gpg("--decrypt", blob.read_bytes(), self._key()).decode()
    def update(self, name, service, kind, value):
        self.initialize(); metadata = self.path(name, ".json")
        if not metadata.exists(): raise KeyError("credential not found")
        data = json.loads(metadata.read_text()); data.update({"service": service or data["service"], "kind": kind or data["kind"], "updated": stamp()})
        if value is not None:
            blob = self.path(name, ".gpg"); blob.write_bytes(self.gpg("--symmetric", value.encode(), self._key())); os.chmod(blob, 0o600)
        metadata.write_text(json.dumps(data, sort_keys=True) + "\n"); os.chmod(metadata, 0o600)
    def delete(self, name):
        self.initialize(); metadata = self.path(name, ".json")
        if not metadata.exists(): raise KeyError("credential not found")
        metadata.unlink(); self.path(name, ".gpg").unlink(missing_ok=True)
    def listing(self): self.initialize(); return [json.loads(p.read_text()) for p in sorted(self.root.glob("*.json"))]
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

def secret_from_stdin(enabled):
    if not enabled: raise ValueError("use --secret-stdin; interactive secret input is disabled")
    value = sys.stdin.readline().rstrip("\n")
    if not value: raise ValueError("secret input was empty")
    return value

def main(argv=None):
    parser = argparse.ArgumentParser(); parser.add_argument("--store", type=Path, default=DEFAULT_STORE); actions = parser.add_subparsers(dest="action", required=True)
    actions.add_parser("init")
    add = actions.add_parser("add"); add.add_argument("name"); add.add_argument("--service", required=True); add.add_argument("--kind", required=True); add.add_argument("--secret-stdin", action="store_true")
    get = actions.add_parser("get"); get.add_argument("name")
    update = actions.add_parser("update"); update.add_argument("name"); update.add_argument("--service"); update.add_argument("--kind"); update.add_argument("--secret-stdin", action="store_true")
    delete = actions.add_parser("delete"); delete.add_argument("name")
    actions.add_parser("list")
    migrate = actions.add_parser("migrate"); migrate.add_argument("--old-passphrase-stdin", action="store_true")
    args = parser.parse_args(argv); store = Store(args.store)
    try:
        if args.action == "init": store.initialize(); print("key-manager initialized")
        elif args.action == "add": store.add(args.name, args.service, args.kind, secret_from_stdin(args.secret_stdin)); print("credential added")
        elif args.action == "get": sys.stdout.write(store.get(args.name))
        elif args.action == "update": store.update(args.name, args.service, args.kind, secret_from_stdin(args.secret_stdin) if args.secret_stdin else None); print("credential updated")
        elif args.action == "delete": store.delete(args.name); print("credential deleted")
        elif args.action == "list": print(json.dumps(store.listing(), indent=2, sort_keys=True))
        else: store.migrate(secret_from_stdin(args.old_passphrase_stdin)); print("legacy credentials migrated")
        return 0
    except (KeyError, ValueError, RuntimeError, PermissionError) as error:
        print(error, file=sys.stderr); return 1

if __name__ == "__main__": raise SystemExit(main())
