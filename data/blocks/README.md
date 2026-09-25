# Package blocks

Blocks are named groups of patterns. Deployable packages are assembled from them: a PurviewDeploy recipe (`requests/recipes/<package>.json`) lists the blocks a package takes, plus any single patterns it adds or leaves out, each with a reason. Blocks never overlap, so every pattern in a package traces back to exactly one block. The same block breakdown also answers the gap questions: what the council package takes of the health blocks, and why the rest is out.

Each file is `<id>.json`:

```json
{
  "schema": "testpattern.block.v1",
  "id": "finance-qg",
  "name": "Finance: Queensland Government layer",
  "domain": "finance",
  "layer": "queensland-government",
  "description": "What the block holds and who takes it.",
  "patterns": ["slug", "..."]
}
```

## Domains and layers

Every pattern has one **domain**, from its `package_tags.primary_component`: privacy, workforce, education, finance, health, legal, government, business, security-ops, credentials, ai, critical-infrastructure and council. Within a domain, blocks are cut into **layers**:

| Layer | Id | Holds |
|---|---|---|
| Shared core | `<domain>` | What the Queensland Government package and most sector packages all take |
| Queensland Government layer | `<domain>-qg` | The rest of the Queensland Government package's selection in the domain |
| Sector layer | `<domain>-<sector>` | Patterns outside the Queensland Government package that a sector package takes (council, education, ci, electoral) |
| Extended | `<domain>-extended` | Domain patterns outside every current package; the former standalone qgcreds, qgfin and qghealth carried them |

The Queensland Government package is the shared core plus the Queensland Government layer in each domain. The credentials, finance and health domain packages are every block in their domain.

A few patterns sit outside their own domain because their domain's block for them would have been too small to be useful: a people-records pattern goes with privacy, and operational-technology documentation goes with security operations.

## Rules (enforced by `scripts/ci-check.mjs`)

- `id` is kebab-case and matches the file name. `domain` and `layer` come from the lists above.
- Every pattern is a live pattern. When a pattern is deprecated, move its block entry to its `replaced_by` pattern in the same change.
- A pattern appears in at most one block.

The breakdown was derived on 2026-09-25 from the sealed QG, ECQ, LG, EDU and CI packages. Each package's recipe rebuilds its seal exactly.
