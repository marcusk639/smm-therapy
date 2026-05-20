#!/usr/bin/env bash
# setup-e2e.sh — prepare everything needed to run E2E tests
#
# Usage:
#   ./scripts/setup-e2e.sh                     # setup only
#   ./scripts/setup-e2e.sh --run               # setup + run e2e tests
#   TEST_CLIENT_ID=<uuid> ./scripts/setup-e2e.sh --run

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$REPO_ROOT/apps/web"
DB_DIR="$REPO_ROOT/packages/db"
ENV_LOCAL="$WEB_DIR/.env.local"
RUN_TESTS=false

for arg in "$@"; do
  [[ "$arg" == "--run" ]] && RUN_TESTS=true
done

# ─── colours ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}▶${NC} $*"; }
warn()  { echo -e "${YELLOW}⚠${NC}  $*"; }
error() { echo -e "${RED}✗${NC}  $*" >&2; }
die()   { error "$*"; exit 1; }

# ─── 1. prereqs ───────────────────────────────────────────────────────────────
info "Checking required environment variables..."

missing=()
[[ -z "${DATABASE_URL:-}" ]]       && missing+=("DATABASE_URL")
[[ -z "${ANTHROPIC_API_KEY:-}" ]]  && missing+=("ANTHROPIC_API_KEY")
[[ -z "${VOYAGE_API_KEY:-}" ]]     && missing+=("VOYAGE_API_KEY")

if [[ ${#missing[@]} -gt 0 ]]; then
  die "Missing required env vars: ${missing[*]}
  Export them before running this script:
    export DATABASE_URL=postgres://...
    export ANTHROPIC_API_KEY=sk-ant-...
    export VOYAGE_API_KEY=pa-..."
fi

cd "$REPO_ROOT"

# ─── 2. install dependencies (includes @playwright/test) ──────────────────────
info "Installing dependencies..."
pnpm install --frozen-lockfile=false

# ─── 3. install playwright browsers ───────────────────────────────────────────
info "Installing Playwright Chromium browser (idempotent — skips if present)..."
pnpm --filter @smm/web exec playwright install chromium

# ─── 4. generate + run DB migrations ──────────────────────────────────────────
info "Generating Drizzle migrations..."
pnpm --filter @smm/db generate

info "Applying migrations to database..."
pnpm --filter @smm/db migrate

# ─── 5. seed compliance rules, crisis resources, disclaimer templates ──────────
info "Seeding compliance data..."
pnpm db:seed

# ─── 6. write TEST_CLIENT_ID to apps/web/.env.local ───────────────────────────
info "Configuring E2E test client..."

if [[ -n "${TEST_CLIENT_ID:-}" ]]; then
  # Env var already set — write/update .env.local
  if grep -q "^TEST_CLIENT_ID=" "$ENV_LOCAL" 2>/dev/null; then
    # Update existing line
    if [[ "$(uname)" == "Darwin" ]]; then
      sed -i '' "s|^TEST_CLIENT_ID=.*|TEST_CLIENT_ID=${TEST_CLIENT_ID}|" "$ENV_LOCAL"
    else
      sed -i "s|^TEST_CLIENT_ID=.*|TEST_CLIENT_ID=${TEST_CLIENT_ID}|" "$ENV_LOCAL"
    fi
    info "Updated TEST_CLIENT_ID in $ENV_LOCAL"
  else
    echo "TEST_CLIENT_ID=${TEST_CLIENT_ID}" >> "$ENV_LOCAL"
    info "Wrote TEST_CLIENT_ID to $ENV_LOCAL"
  fi
else
  # Not in environment — check .env.local
  if grep -q "^TEST_CLIENT_ID=" "$ENV_LOCAL" 2>/dev/null; then
    warn "TEST_CLIENT_ID found in $ENV_LOCAL — using existing value."
  else
    echo ""
    warn "TEST_CLIENT_ID is not set."
    echo "  Most E2E tests will be skipped without it."
    echo ""
    read -rp "  Enter a client UUID from your dev database (or press Enter to skip): " client_id
    if [[ -n "$client_id" ]]; then
      echo "TEST_CLIENT_ID=${client_id}" >> "$ENV_LOCAL"
      info "Wrote TEST_CLIENT_ID=$client_id to $ENV_LOCAL"
    else
      warn "Skipping TEST_CLIENT_ID — tests requiring it will be skipped."
    fi
  fi
fi

# ─── 7. run e2e tests (optional) ──────────────────────────────────────────────
echo ""
info "Setup complete."

if [[ "$RUN_TESTS" == "true" ]]; then
  echo ""
  info "Running E2E tests..."
  echo "  (requires pnpm dev running on :3000 — start it in another terminal if needed)"
  echo ""
  cd "$WEB_DIR"
  # Load .env.local into environment for the test run
  set -o allexport
  # shellcheck disable=SC1091
  [[ -f "$ENV_LOCAL" ]] && source "$ENV_LOCAL"
  set +o allexport
  pnpm test:e2e
else
  echo ""
  echo "  To run E2E tests:"
  echo "    1. Start dev server:  pnpm dev"
  echo "    2. In another terminal:"
  echo "       cd apps/web && pnpm test:e2e"
  echo ""
  echo "  Or re-run this script with --run:"
  echo "    ./scripts/setup-e2e.sh --run"
fi
