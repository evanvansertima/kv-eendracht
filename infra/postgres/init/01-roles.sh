#!/bin/bash
# Creates the three database roles. Runs once, on first boot of an empty data volume.
#
# The kv_api role is the load-bearing part: if the API ever connects as a superuser or a
# BYPASSRLS role, every RLS policy in the system is silently skipped — no error, no log
# line, and the entire authorization model described in
# docs/Decisions/ADR-0003-keep-rls-as-the-authorization-layer.md stops existing.
#
# The RLS test suite asserts this rather than trusting it.
set -euo pipefail

: "${KV_MIGRATOR_PASSWORD:?KV_MIGRATOR_PASSWORD is required}"
: "${KV_API_PASSWORD:?KV_API_PASSWORD is required}"

psql -v ON_ERROR_STOP=1 \
     --username "$POSTGRES_USER" \
     --dbname "$POSTGRES_DB" \
     -v migrator_password="'${KV_MIGRATOR_PASSWORD}'" \
     -v api_password="'${KV_API_PASSWORD}'" \
     -v db_name="${POSTGRES_DB}" <<-'EOSQL'

    -- Installing an extension requires superuser, and kv_migrator deliberately is not
    -- one. So it happens here, during bootstrap, as POSTGRES_USER. The migrations keep
    -- their `create extension if not exists pgcrypto` line, which is then a harmless
    -- no-op that needs no elevated rights.
    create extension if not exists "pgcrypto";

    -- Owns the schema and runs all DDL. NOT a superuser: migrations should not be able
    -- to reach outside this database either.
    create role kv_migrator with login password :migrator_password;

    -- Runtime role for the API. DML only.
    -- Explicitly NOSUPERUSER and NOBYPASSRLS: these are the defaults, but they are stated
    -- so that anyone editing this file sees that removing them breaks all authorization.
    create role kv_api with login password :api_password nosuperuser nobypassrls
                           nocreatedb nocreaterole noinherit;

    -- Supabase ships `anon` and `authenticated` as built-in roles, and the ported RLS
    -- migration grants SELECT on three public views to them. Recreating them as NOLOGIN
    -- placeholders keeps that SQL byte-identical to v1, which matters when diffing
    -- against the original to debug a policy.
    --
    -- They are vestigial here: nothing connects as them, because our API always connects
    -- as kv_api and identity comes from request.jwt.claims rather than the database role
    -- (see ADR-0003). NOLOGIN makes that structural — they cannot be connected to at all.
    create role anon nologin;
    create role authenticated nologin;

    -- kv_migrator owns public; kv_api only uses it.
    alter schema public owner to kv_migrator;
    grant usage on schema public to kv_api;

    -- Owning a schema is not enough to recreate it after a drop: that needs CREATE on
    -- the database. `db.mjs reset` drops and rebuilds public and auth, so the DDL role
    -- needs this. kv_api deliberately does not get it.
    grant create on database :"db_name" to kv_migrator;

    -- Future tables created by kv_migrator are automatically usable by kv_api,
    -- so a new migration cannot forget to grant access.
    alter default privileges for role kv_migrator in schema public
      grant select, insert, update, delete on tables to kv_api;
    alter default privileges for role kv_migrator in schema public
      grant usage, select on sequences to kv_api;
    alter default privileges for role kv_migrator in schema public
      grant execute on functions to kv_api;

    -- The auth schema shim replacing Supabase's. Tables and functions land here in
    -- migration 0000; ownership and default privileges are set up now.
    create schema if not exists auth authorization kv_migrator;
    grant usage on schema auth to kv_api;
    alter default privileges for role kv_migrator in schema auth
      grant select, insert, update, delete on tables to kv_api;
    alter default privileges for role kv_migrator in schema auth
      grant execute on functions to kv_api;

EOSQL

echo "roles created: kv_migrator (DDL), kv_api (DML, RLS-enforced)"
