set -euo pipefail

OUT="${1:-REPO_SNAPSHOT.md}"

echo "# Repo Snapshot" > "$OUT"
echo "" >> "$OUT"
echo "Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")" >> "$OUT"
echo "" >> "$OUT"

section () {
  echo "" >> "$OUT"
  echo "## $1" >> "$OUT"
  echo "" >> "$OUT"
}

codeblock () {
  local lang="$1"; shift
  echo "\`\`\`$lang" >> "$OUT"
  "$@" >> "$OUT" 2>/dev/null || true
  echo "\`\`\`" >> "$OUT"
}

section "Git status"
codeblock "text" git status -sb

section "Top-level tree (depth 4)"
if command -v tree >/dev/null 2>&1; then
  codeblock "text" tree -a -L 4 -I "node_modules|.git|dist|build|.next|coverage|.turbo|.vercel"
else
  codeblock "text" bash -lc 'find . -maxdepth 4 -type f | sed "s|^\./||" | sort'
fi

section "Key manifests"
for f in package.json pnpm-workspace.yaml turbo.json nx.json lerna.json; do
  if [ -f "$f" ]; then
    echo "### $f" >> "$OUT"
    codeblock "json" cat "$f"
  fi
done

section "Apps/packages manifests (package.json)"
codeblock "text" bash -lc 'find apps packages -name package.json -maxdepth 4 2>/dev/null | sort'

section "Docker + compose"
for f in docker-compose.yml docker-compose.*.yml; do
  if [ -f "$f" ]; then
    echo "### $f" >> "$OUT"
    codeblock "yaml" cat "$f"
  fi
done
codeblock "text" bash -lc 'find . -name Dockerfile -maxdepth 5 2>/dev/null | sort'

section "API entrypoints (best-effort list)"
codeblock "text" bash -lc 'ls -la apps/api/src 2>/dev/null || true'
codeblock "text" bash -lc 'find apps/api/src -maxdepth 3 -type f | sort'

section "Migrations (node-pg-migrate / prisma / drizzle)"
if [ -d "apps/api/migrations" ]; then
  echo "### apps/api/migrations" >> "$OUT"
  codeblock "text" bash -lc 'ls -la apps/api/migrations | sed -n "1,200p"'
fi
for f in apps/api/migrate.config.* apps/api/prisma/schema.prisma drizzle.config.*; do
  if ls $f >/dev/null 2>&1; then
    echo "### $f" >> "$OUT"
    codeblock "text" cat $f
  fi
done

section "Selected key files (if present)"
KEY_FILES=(
  "apps/api/src/server.ts"
  "apps/api/src/app.ts"
  "apps/api/src/routes.ts"
  "apps/api/src/lib/db.ts"
  "apps/api/src/lib/tx.ts"
  "apps/api/src/config/env.ts"
  "apps/api/src/middleware/auth.ts"
  "apps/api/src/middleware/error-handler.ts"
  "apps/web/next.config.ts"
  "apps/web/app/layout.tsx"
  "apps/web/app/page.tsx"
)

for f in "${KEY_FILES[@]}"; do
  if [ -f "$f" ]; then
    echo "### $f" >> "$OUT"
    codeblock "text" sed -n '1,220p' "$f"
  fi
done

echo "" >> "$OUT"
echo "_End of snapshot._" >> "$OUT"

echo "Wrote $OUT"
BASH

chmod +x scripts/repo_snapshot.sh

# run it

./scripts/repo_snapshot.sh
exit
