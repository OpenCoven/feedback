#!/usr/bin/env bash
# railway-setup.sh — wire OpenCoven/feedback to the Railway project
# Usage: RAILWAY_TOKEN=xxx ./deploy/railway-setup.sh
set -euo pipefail

PROJECT_ID="8180b4b8-b193-4f3f-b089-87fb9bea312e"
ENVIRONMENT_ID="4dca195a-a3e9-44a8-b739-1f3a5c2507d6"
TOKEN="${RAILWAY_TOKEN:-}"

if [ -z "$TOKEN" ]; then
  echo "ERROR: set RAILWAY_TOKEN first"
  exit 1
fi

GQL="https://backboard.railway.com/graphql/v2"

gql() {
  curl -sf -X POST "$GQL" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$1"
}

echo "Fetching project services..."
gql '{"query":"{ project(id: \"'"$PROJECT_ID"'\") { name services { edges { node { id name } } } } }"}' | python3 -c "
import sys, json
d = json.load(sys.stdin)
p = d['data']['project']
print('Project:', p['name'])
for e in p['services']['edges']:
    print(' -', e['node']['id'], e['node']['name'])
"
