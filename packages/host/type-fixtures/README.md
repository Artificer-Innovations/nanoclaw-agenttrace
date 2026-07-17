# Host type fixtures

Thin stubs for NanoClaw host modules (`env`, `log`, `delivery`, …) so
`packages/host` can `tsc --noEmit` in this repo without a full NanoClaw tree.

They are **not** shipped by the CLI install (only `src/agenttrace-*` is copied).
Do not put production logic here.
