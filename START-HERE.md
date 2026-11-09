# Start here (Dylan)

1. Install Claude Desktop and open the **Code** tab.
2. Make a folder: `OneDrive › Sir. Claude Claudentin › Rolex Service › jva-service-app`
3. Unzip this package into that folder (CLAUDE.md must sit at the top of the folder).
4. In Claude Code: **Open folder** → pick `jva-service-app`.
5. First message:
   > Read CLAUDE.md and docs/. Then walk me through setting up Netlify, Supabase and Microsoft sign-in, one step at a time. I've never coded.
6. Say yes when it asks to install things (Node.js etc.). It will ask before anything risky.

## What's in here
| File | What it is |
|---|---|
| `CLAUDE.md` | The spec. Claude Code reads it every session. Keep it current. |
| `prototype/parts-artifact.html` | Code of the live Parts page (claude.ai), as a reference to rebuild from |
| `docs/parts-handoff.md` | Parts section handoff (v29), for detail |
| `data/parts.json/.csv` | 906 parts, counts and costs (export 2026-11-09) |
| `data/models.json/.csv` | 412 watch refs → calibres |
| `data/log.json/.csv` | 924 stock changes |
| `data/ctr_job_analysis.csv` | How often each part shows up on in-house CTR jobs |

## Keep running until cut-over
- The Parts artifact stays live (certification). Counts made there after 2026-11-09 need a fresh export before import.

## Files Claude Code reads straight from OneDrive (not copied)
- Jared's lists: `Rolex Service › Watchmaking (Jared's Documents) › Calibre Inventory`
- Intake worksheet: `Rolex › 1. Service - Rolex › … › SERVICE Forms (Workshop intake form) › index.html`
- ROLP invoices: `Rolex Service › ROLP Invoices` (costs only)

## Original Setup doc
https://claude.ai/artifact/JvooNHqjLgg2MCjmcdfK3w — its rules are folded into CLAUDE.md, which wins where they differ.
