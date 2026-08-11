#!/bin/bash
set -e

# Install dependencies
pnpm install --frozen-lockfile

# NOTE: drizzle-kit push is intentionally omitted.
# The database schema (mr_unlock_codes etc.) is managed via raw SQL, not Drizzle ORM.
# Running push against an empty schema would drop all existing tables.
# Add drizzle push back here only when Drizzle-managed tables are introduced.
