# Prediction record

Append-only daily snapshots of exactly what the production app served:
`universe.json` (every published metric value for every security, with
membership and segment benchmarks) plus `manifest.json` and a provenance
stamp, one directory per dataset as-of date.

This is the forward point-in-time record. Backtests over today's index
members suffer survivorship bias; this branch accumulates the bias-free
alternative, one trading day at a time. Rules:

- A snapshot is written once and never modified. Recomputing a historical
  snapshot with newer information would destroy the record's meaning.
- Snapshots are captured from the live site after the morning publish, so
  they record what a user actually saw — not a rebuild.
- Written by the `record-predictions` workflow on `main`; a recorder
  failure has zero effect on publishing or the app.
