#!/bin/sh
# sui-agent-kit installer for macOS and Linux (x64 / arm64).
# No sudo, nothing global: everything goes to ~/.sui-agent-kit (remove that folder to uninstall).
# If Node.js >= 22 is missing, an official Node tarball is downloaded into that folder.
set -eu

REPO="${AGENT_KIT_REPO:-altaga/SUI-Agent-kit}"
REF="${AGENT_KIT_REF:-main}"
BASE="${AGENT_KIT_HOME:-$HOME/.sui-agent-kit}"
APP="$BASE/app"
BIN="$BASE/bin"
NODE_DIR="$BASE/node"

say() { printf '%s\n' "$*"; }
fail() { printf 'error: %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

have curl || fail "curl is required"
have tar || fail "tar is required"

case "$(uname -s)" in
  Linux) OS=linux ;;
  Darwin) OS=darwin ;;
  *) fail "unsupported OS $(uname -s). On Windows use install.ps1" ;;
esac
case "$(uname -m)" in
  x86_64 | amd64) ARCH=x64 ;;
  aarch64 | arm64) ARCH=arm64 ;;
  *) fail "unsupported CPU $(uname -m)" ;;
esac

node_major() { "$1" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }

mkdir -p "$BASE" "$BIN"

NODE=""
if have node && [ "$(node_major node)" -ge 22 ]; then
  NODE="$(command -v node)"
elif [ -x "$NODE_DIR/bin/node" ] && [ "$(node_major "$NODE_DIR/bin/node")" -ge 22 ]; then
  NODE="$NODE_DIR/bin/node"
else
  say "Node.js >= 22 not found; downloading a private copy to $NODE_DIR"
  IDX="https://nodejs.org/dist/latest-v22.x"
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  curl -fsSL "$IDX/SHASUMS256.txt" -o "$TMP/sums" || fail "cannot reach nodejs.org"
  LINE="$(grep -E " node-v22\.[0-9.]+-$OS-$ARCH\.tar\.gz\$" "$TMP/sums" | head -n 1)" || true
  [ -n "$LINE" ] || fail "no Node.js build for $OS-$ARCH (musl/Alpine is not supported: install Node 22 with your package manager)"
  SUM="${LINE%% *}"
  FILE="${LINE##* }"
  curl -fsSL "$IDX/$FILE" -o "$TMP/node.tgz"
  if have sha256sum; then GOT="$(sha256sum "$TMP/node.tgz" | cut -d' ' -f1)"; else GOT="$(shasum -a 256 "$TMP/node.tgz" | cut -d' ' -f1)"; fi
  [ "$GOT" = "$SUM" ] || fail "Node.js checksum mismatch"
  rm -rf "$NODE_DIR" && mkdir -p "$NODE_DIR"
  tar -xzf "$TMP/node.tgz" -C "$NODE_DIR" --strip-components=1
  NODE="$NODE_DIR/bin/node"
fi
NODE_BIN_DIR="$(dirname "$NODE")"
have "$NODE_BIN_DIR/npm" || have npm || fail "npm not found next to $NODE"

say "Using Node $("$NODE" -v) ($NODE)"
say "Downloading sui-agent-kit ($REPO@$REF)"
SRC="$(mktemp -d)"
curl -fsSL "https://codeload.github.com/$REPO/tar.gz/refs/heads/$REF" | tar -xz -C "$SRC" --strip-components=1
rm -rf "$APP" && mv "$SRC" "$APP"

say "Installing dependencies (no native modules, no build step)"
(cd "$APP" && PATH="$NODE_BIN_DIR:$PATH" npm install --omit=dev --no-audit --no-fund --loglevel=error)

cat > "$BIN/agent" <<LAUNCH
#!/bin/sh
exec "$NODE" "$APP/bin/agent.mjs" "\$@"
LAUNCH
chmod +x "$BIN/agent"

case ":$PATH:" in
  *":$HOME/.local/bin:"*) mkdir -p "$HOME/.local/bin" && ln -sf "$BIN/agent" "$HOME/.local/bin/agent" && RUN="agent" ;;
  *) RUN="$BIN/agent" ;;
esac

say ""
"$BIN/agent" doctor || true
say ""
say "Installed. Start with:  $RUN"
[ "$RUN" = "agent" ] || say "To use the short name 'agent', add to your shell profile:  export PATH=\"$BIN:\$PATH\""
say "Model access: set ANTHROPIC_API_KEY (or AWS credentials for Claude on Bedrock). Uninstall: rm -rf $BASE"
