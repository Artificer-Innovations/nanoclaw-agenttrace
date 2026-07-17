# Changelog

## 0.1.0

- Initial release: host delivery action, container Claude observe patch, silence keepalives (#1440), `/add-agenttrace` skill
- Redaction via `@sanity-labs/secret-scan@1.1.0` (same library as Skein)
- Session-scoped destination resolution (ignore content routing fields)
- Dispatch ladder catches `publishActivity`/`clearActivity` failures and falls through
- Writer tracks message ids per turn (no LIKE full-table prune) and caps orphan turn maps
- Forward `AGENTTRACE_*` into containers via `container-runner` (observe is fail-closed without it)
