---
"nanoclaw-agenttrace": patch
---

Fix the claude.ts sdkopts splice silently never activating summarized thinking (issue #7). The snippet used a sync `require()` of ESM `observe.js`, which throws under ESM (or `ERR_REQUIRE_ESM` on Node < 22.12) and was swallowed by the surrounding catch. The splice now reads a `globalThis` bridge that `observe.js` registers on import (the poll-loop hook imports it before every provider query), warns loudly once if agenttrace is enabled but the bridge never loaded, and `upgrade` self-heals stale require-based blocks. Added a CLI test that splices the snippet into a scratch file and executes it as a real ES module.
