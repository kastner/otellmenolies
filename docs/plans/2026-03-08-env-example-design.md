# Env Example and Bun Env Workflow Design

**Date:** 2026-03-08

## Goal

Add a repo-owned env template and make the startup docs match Bun's built-in `.env` file loading.

## Chosen Approach

Use one root `.env.example` file that contains only the environment variables the ingest app currently reads. Document three copy targets in the README:

- `.env` for shared defaults
- `.env.$NODE_ENV` for environment-specific overrides
- `.env.local` for machine-specific overrides

This keeps the configuration surface aligned with `apps/ingest/src/config.ts` and avoids maintaining multiple duplicate example files.

## Alternatives Considered

### 1. Single minimal template

Pros:

- lowest maintenance
- stays aligned with the actual app config
- easy to explain in the README

Cons:

- slightly less explicit than separate files for each environment

### 2. Multiple example files

Pros:

- very explicit by filename

Cons:

- duplicates the same values
- easier to let the examples drift apart

### 3. Comment-heavy template

Pros:

- more guidance in one file

Cons:

- noisier than needed for a small local-first repo

## Notes

- The user explicitly requested autonomous execution, so this design is recorded and implemented without stopping for formal approval on each section.
- Validation and progress notes live in `docs/`.
