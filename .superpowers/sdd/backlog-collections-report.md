# Backlog ticket: collections-curation — report

Date: 2026-07-08. Branch: feat/coverage-waves-d4 (isolated worktree).

Deliverables: (1) cloud-credentials-detection extended 15 → 75 members, (2) new
`protective-markings` collection (17 candidates judged, 16 members), (3) new
`company-registries` collection (25+ candidates judged, 11 members), (4) collection-integrity
check added to `scripts/ci-check.mjs` (dangling members now fail CI).

Registry compiles to 1655 patterns / **20 collections** (was 18).

---

## 1. cloud-credentials-detection (extended, 15 → 75 members)

Frozen since 2026-02; description rewritten to reflect the wider scope. Members grouped with
YAML comments (core cloud / dev platforms / AI keys / payments / crypto exchanges / SaaS &
observability / private keys / tokens & dumps).

### Added — named in ticket (27)

- **D2 SITs (19):** global-xai-api-key, global-groq-api-key, global-perplexity-api-key,
  global-cohere-api-key, global-replicate-api-key, global-langsmith-api-key,
  global-pinecone-api-key, global-shopify-token, global-square-token,
  global-braintree-access-token, global-plaid-token, global-vercel-token, global-netlify-token,
  global-supabase-key, global-auth0-token, global-notion-token, global-sentry-token,
  global-discord-bot-token, global-telegram-bot-token.
- **D3 exchange keys (3):** global-coinbase-api-key, global-binance-api-key, global-kraken-api-key.
- **Ledger known-missing (5):** global-anthropic-api-key, global-huggingface-access-token,
  global-twilio-api-key, global-sendgrid-api-key, and **azure-databricks-personal-access-token**
  ("databricks" exists only under the azure- prefix; included because the ticket ledger names it —
  see the azure-* judgment below).

### Added — found by systematic grep of `global-*` key/token/pat/secret/credential slugs (33)

- **Dev platforms / CI / IaC (13):** global-gitlab-personal-access-token, global-gitlab-deploy-token,
  global-gitlab-pipeline-trigger-token, global-gitlab-runner-authentication-token,
  global-atlassian-api-token, global-circleci-personal-access-token, global-terraform-cloud-token,
  global-hashicorp-vault-service-token, global-docker-hub-personal-access-token,
  global-kubernetes-config-credential, global-heroku-api-key,
  global-digitalocean-personal-access-token, global-cloudflare-api-token.
- **Package registries (4):** global-npm-access-token, global-pypi-api-token, global-nuget-api-key,
  global-rubygems-api-key.
- **SaaS / observability (7):** global-mailchimp-api-key, global-mailgun-api-key,
  global-okta-api-token, global-datadog-api-key, global-new-relic-api-key, global-grafana-api-key,
  global-microsoft-bing-maps-key.
- **Cloud (2):** global-snowflake-token; global-gcp-service-account-key — already a member of
  connection-string-detection, but a GCP service-account JSON key is squarely a cloud credential
  and users enabling this collection would expect it; cross-collection overlap has precedent
  (global-aws-access-key / global-github-pat appear in both this collection and
  high-confidence-starter-pack).
- **Private key material (4):** global-pgp-private-key, global-putty-private-key,
  global-x509-certificate-private-key, global-aspnet-machine-key (high-confidence config-file
  secret, sibling of the existing private-key members).
- **Tokens / headers / dumps (3):** global-http-authorization-header (high confidence; sibling of
  existing global-bearer-token), global-session-cookie-token (high confidence, name+value session
  cookies), global-credential-combolist (medium confidence, concrete email:password /
  host:user:pass formats — genuine leaked-credential material).

### Judged and excluded

| Pattern(s) | Reason |
|---|---|
| global-all-credential-types, global-general-password, global-general-symmetric-key, global-user-login-credentials, global-client-secret-api-key | Low-confidence, keyword-based Purview "bundled/broad detector" ports that flag documents for review rather than matching concrete secret formats. Including them would flood a precision-oriented credentials collection with FPs. |
| global-*-connection-string x9, global-generic-db-credentials-url, global-kubernetes-service-url | Already the charter of connection-string-detection (the deliberate D2-era split). Only global-gcp-service-account-key was cross-listed (rationale above). |
| global-bip39-seed-phrase | Crypto wallet recovery phrase — wallet-secret material that belongs with the cryptocurrency-wallets family, not cloud/API credentials. (Noted: cryptocurrency-wallets is address-focused today; adding bip39 there is a possible future curation item, out of this ticket's scope.) |
| azure-* family (37 remaining patterns: azure-sas, azure-entra-client-secret, azure-devops-personal-access-token, …) | A self-contained Purview-derived Azure-service family (38 files) that would triple the collection and swamp non-Azure members; better served by a dedicated azure-credentials collection (future ticket). Exception made only for azure-databricks-personal-access-token because the ticket ledger explicitly names databricks as known-missing. |
| global-top500-26x/27x (oauth-client-secrets, password-reset-tokens, mfa-seeds, …) | top500 family are document-topic classifiers (keyword/proximity concept detectors), not credential-format SITs. |
| snaffler-* credential patterns | Covered by the snaffler-parity collection; they detect credential-bearing *file types*, not credential token formats. |

---

## 2. protective-markings (new, 16 members)

Slug `protective-markings`; jurisdictions au/nz/uk/us/ca/eu/nato. Covers classification
markings and banners across allied government schemes.

| Members | Scheme / rationale |
|---|---|
| au-marking-official, au-marking-sensitive, au-marking-protected, au-marking-secret-topsecret | Australia PSPF — the four per-category classifiers (full set present in registry). |
| nz-marking-in-confidence, nz-marking-sensitive, nz-marking-restricted, nz-marking-confidential, nz-marking-secret-topsecret | NZ PSR — all five, mirroring the existing nz-protective-markings collection (that jurisdiction-scoped collection is left untouched; overlap is intentional and has precedent). |
| uk-marking-official, uk-marking-secret-topsecret | UK GSCP — both existing UK marking patterns. |
| us-classification-banner, us-cui-banner-marking | US EO 13526 banners + 32 CFR 2002 CUI banner markings. |
| ca-marking | Canada — Directive on Security Management markings. |
| eu-marking-restreint | EU — EUCI RESTREINT UE/EU RESTRICTED (Council Decision 2013/488/EU). |
| nato-marking | NATO Security Policy C-M(2002)49 markings. |

**Judged and excluded: au-pspf-security-classification.** No `status:` field exists in the
pattern schema, but its changelog (v1.1.0, 2026-06-29) records: "Marked deprecated for
auto-labelling; superseded by the au-marking-* per-category classifiers. Retained for broad
discovery." Since the collection's purpose is marking detection and all four superseding
au-marking-* classifiers are members, including the deprecated umbrella pattern would
double-fire on every AU marking hit.

---

## 3. company-registries (new, 11 members)

Slug `company-registries`. Inclusion bar: the identifier must primarily denote a **business /
legal entity** in an official register (not a natural person, licence, or payment-routing code).

### Included

| Member | Rationale |
|---|---|
| global-lei | ISO 17442 Legal Entity Identifier (GLEIF) — the canonical global entity registry ID. Ticket-named. |
| uk-companies-house-number | UK CRN, 8-char company registration. Ticket-named. |
| eu-vat-number | Consolidated all-27-member-state VAT registration pattern (VIES structures). Ticket-named. |
| nz-nzbn | NZ Business Number (MBIE, GS1 GLN-based). Ticket-named. |
| au-company-number | ACN — ASIC company registration number; the AU analogue of Companies House. High confidence. |
| au-business-number | ABN — Australian Business Register identifier for entities carrying on business. |
| br-cnpj | Cadastro Nacional da Pessoa Jurídica — registry of *legal persons* exclusively (individuals use CPF, a separate pattern). Mod-11 validated. |
| pl-regon | Polish national official business register (statistical registry number) — entity-only. |
| jp-my-number-corporate | Japan Corporate Number (NTA-issued, 13-digit) — entity-only; found during the systematic sweep, data_categories already `business-identifier`. |
| in-gst-number | GSTIN — GST *registration* number issued per registered business/state; an entity registration identifier (embeds the entity PAN). |
| tr-tax-number | VKN (Vergi Kimlik Numarası) — since 2022 natural persons use their TCKN as tax ID, so the 10-digit VKN is in practice the legal-entity tax registration number. Ticket-suggested. |

### Judged and excluded

| Pattern | Reason |
|---|---|
| mx-rfc | RFC is issued to both individuals (13-char) and companies (12-char); the pattern covers both formats, is low-confidence, and its corroboration keywords are personal-PII lists (pii-civic-credentials). Majority-personal identifier → excluded. |
| ar-cuit-cuil | Same mixed-population problem: CUIT (entities) and CUIL (individuals) share one pattern that cannot distinguish them → excluded. |
| at/be/de/fr/hu/it/nl-vat-number (7 per-country patterns) | Structurally redundant inside a collection that already carries the consolidated eu-vat-number (all 27 states + EL/XI quirks); including both would double-fire on every EU VAT hit. Per-country patterns remain available for granular deployment. |
| my-tax-number, ua-tax-number, za-tax-number | Individual/personal TINs per their own descriptions (LHDN individual TIN; РНОКПП individual taxpayer card; SARS personal income-tax reference) → personal identifiers, not entity registry IDs. |
| au-asic-director-id | Identifies a natural person (a director), not an entity. |
| au-asic-agent-number | Identifies a lodging agent, not a registered entity; also very weak format (3–6 digits). |
| au-afsl-number | A *licence* number (authorisation to provide financial services), not a registry identifier. |
| global-swift-bic | Identifies financial institutions but is payment-routing infrastructure; already lives in the financial/PCI space, and scope creep here would pull in every institution-code scheme. |

---

## 4. Collection-integrity check (ci-check.mjs)

**Design.** `npm run check` (scripts/ci-check.mjs) was the natural home: it already loads every
pattern YAML, so a `patternSlugs` set is collected for free during the existing pattern loop
(added right after the required-fields check, before any type-based `continue`). A new block
after the pattern loop then loads each `data/collections/*.yaml` and reports as **errors**
(exit 1):

- YAML parse failure of a collection file;
- missing/empty/non-array `patterns` list;
- any member that is not a string or does not match an existing pattern `slug` (dangling
  member) — message: `collections/<slug>: dangling member '<m>' — no pattern with that slug exists`.

Duplicate members within one collection are reported as **warnings** (visible under
`CI_VERBOSE`), matching the script's existing error/warn severity convention. Membership is
checked against the pattern files' `slug:` fields (the compile-time join key used by
patterns.json consumers), not against filenames.

**Verification (empirical).**

1. `npm run check` on the curated set: `CI check: 0 error(s), 57 warning(s)`, exit 0 (warnings
   pre-existing, unrelated to collections).
2. Injected a synthetic member `global-nonexistent-synthetic-test` into
   company-registries.yaml: `CI check: 1 error(s)` with the dangling-member error above, exit 1.
3. Removed the synthetic member; re-ran all gates: `npm run check` 0 errors,
   `npm run check:quality` PASSED, `npm run compile` → 1655 patterns, 20 collections.

**Scope guard honoured:** no jurisdiction/concept collections were created; the existing
nz-protective-markings collection was left unmodified.
