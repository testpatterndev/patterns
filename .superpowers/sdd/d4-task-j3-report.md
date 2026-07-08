# D4 Task j3-americas — Report

Task: Jurisdiction fill, Americas. Targets: ar-passport-number, cl-passport-number,
co-passport-number, ec-passport-number, plus research-then-ship-or-skip for
ar-drivers-license and cl-drivers-license.

Date: 2026-07-08. Conventions followed: `.superpowers/sdd/d4-jurisdiction-conventions.md`
(D1 identifier rules, purview regex bans, quality bar, gates).

## Outcome summary

| Slug | Verdict | Rationale (one line) |
|---|---|---|
| ar-passport-number | SHIPPED | Format confirmed by two official Argentine sources + independent corroboration |
| cl-passport-number | SKIPPED | Post-2013 document-number structure not documented by any credible source; pre-2013 number = RUN (duplicate of cl-rut) |
| co-passport-number | SKIPPED | Issuing authority documents only "alfanumérico"; no credible structural spec found |
| ec-passport-number | SKIPPED | Official sources confirm alphanumeric code replaced the cédula, but no structural spec exists publicly |
| ar-drivers-license | SKIPPED | Statute: licence is individualized by the holder's DNI number → pure duplicate of ar-dni |
| cl-drivers-license | SKIPPED | Licence number is the holder's RUT → pure duplicate of cl-rut |

Shipped 1 pattern, 5 documented skips. Per conventions ("a documented skip beats a guessed
regex"; driver-licence skips are the expected outcome), no pattern was forced from
uncorroborated structure.

## 1. ar-passport-number — SHIPPED

**Format**: exactly three uppercase letters followed by six digits (e.g. `AAC382190`),
unique per booklet, independent of the holder's DNI. Series `ZZA` (stateless), `ZZX`
(refugees), `ZZZ` (special cases) are reserved for RENAPER-issued travel documents. The
pre-2012 format (DNI number + "N") is intentionally not covered: it is retired and would
duplicate ar-dni's digit shapes.

**Primary sources (verified this session)**:
- https://www.argentina.gob.ar/interior/pasaporte/preguntasfrecuentes — official FAQ:
  "es una identificación compuesta por tres (3) letras y seis (6) números", and explicitly
  NOT the DNI number.
- https://www.argentina.gob.ar/normativa/nacional/disposici%C3%B3n-904-2021-357260/actualizacion —
  RENAPER Disposición 904/2021: "numeración por impacto de control, la cual es alfanumérica
  conformada por TRES (3) letras ... y SEIS (6) números" (quotes the ZZA/ZZX/ZZZ series).
- Corroboration: validator.js `isPassportNumber` `AR: /^[A-Z]{3}\d{6}$/`
  (https://raw.githubusercontent.com/validatorjs/validator.js/master/src/lib/isPassportNumber.js);
  https://en.wikipedia.org/wiki/Argentine_passport (nine-digit DNI-based serial replaced by
  alphanumeric serial with the 2012 biometric series).

**Design decisions (conventions applied)**:
- `pattern: \b[A-Z]{3}[0-9]{6}\b` with top-level `case_sensitive: true` — the format is
  case-fixed; this rejects lowercase serials/booking codes like `aab123456`.
- Ambiguous alnum run → NO bare tier. Tiers 85 (2 distinct keyword hits + template
  exclusion), 75 (keyword evidence + exclusion), 65 (keyword evidence);
  `recommended_confidence: 75` (evidence-gated workhorse tier, per D1 decision record).
  Structure mirrors the panel-approved `au-asic-director-id.yaml` exemplar.
- `AllDigitsSameFilter` (`Filter_ar_passport_same_digits`) — repeated-digit placeholders
  (`AAA000000`) suppressed, mirroring PR #9/#10 precedent (syntax copied from ar-dni.yaml).
- Purview bans respected: no wildcards, no anchors, bounded quantifiers, 0 capturing
  groups, word-boundary lookarounds prevent matches inside longer letter/digit runs.
- No check digit exists in the printed number — documented in false_positives; precision
  carried by structure + evidence + filter.
- Keywords: Spanish (pasaporte, número de pasaporte, libreta de pasaporte, documento de
  viaje, RENAPER [case-sensitive term], Registro Nacional de las Personas) + English
  (passport, passport number, travel document, Argentine/Argentina passport).
- Regulation `PDPL (AR)` and sensitivity-label cross-map copied from the ar-dni /
  ae-passport-number siblings; risk_rating 8 per passport convention.

**Empirical regex verification**: node script (String.raw + new RegExp, case-sensitive) ran
4 should_match, 4 hard should_not_match, the AllDigitsSameFilter case (matches top-level as
expected, warning-only in CI, suppressed by filter downstream), and 5 boundary probes
(XAAC382190, AAC3821901, AAC382190A, SUBTOTAL123456, AAAB123456) — ALL PASS.

## 2. cl-passport-number — SKIPPED (documented)

**Finding**: Until 2 September 2013 the Chilean passport number WAS the holder's RUN —
detecting those numbers is exactly `cl-rut` (already in the catalog). Since Resolución
Exenta 862/2013 (Registro Civil), passports carry an independent "Número de Documento" of
a unique series, but no official or otherwise credible source documents its structure.

**Sources checked**:
- https://en.wikipedia.org/wiki/Chilean_passport and
  https://es.wikipedia.org/wiki/Pasaporte_chileno — "passport number (same as RUN until
  2013)"; no post-2013 structure given.
- https://es.wikipedia.org/wiki/C%C3%A9dula_de_identidad_(Chile) — post-2013 "Número de
  Documento ... series únicas"; explicitly no format specification.
- https://www.bcn.cl/leychile/navegar?idNorma=1053880 (Resolución 862 Exenta 2013) — page
  failed to load its text; could not extract a numbering spec.
- https://www.chileatiende.gob.cl/fichas/3445-pasaporte-obtencion-y-renovacion (official) —
  no number format.
- https://regulaforensics.com/blog/chile-id-card-processing/ — RUN discussed; no document
  number structure.
- https://trustdochub.com/en/product/chilean-passport-validity/ — only the generic ICAO MRZ
  field width ("9 alphanumeric characters"), which is the MRZ field size, not the format.
- https://www.workingholiday.cl/el-nuevo-pasaporte/ — a travel blog claiming "one letter +
  eight digits (P/F prefix)" with internally inconsistent examples (P0067528 = 7 digits vs
  F12345678 = 8 digits). Single low-authority source → fails the corroboration bar.

**Rationale**: conventions §3 — a structural regex would be authored from one inconsistent
blog. Pre-2013 coverage duplicates cl-rut. Documented skip.

## 3. co-passport-number — SKIPPED (documented)

**Finding**: The issuing authority (Cancillería de Colombia) documents only that the number
"está compuesto por letras y números (alfanumérico)" located at the top right of the data
page; conventional (pre-MRZ) passports used the cédula de ciudadanía number (which would
duplicate co-national-id). No credible source specifies the letter/digit structure.

**Sources checked**:
- https://pasaportes.valledelcauca.gov.co/home/preguntas_frecuentes (official departmental
  passport office): "El número de su pasaporte electrónico y con zona de lectura mecánica
  (nuevos) está compuesto por letras y números (alfanumérico)"; conventional passports used
  the citizen ID number.
- https://www.cancilleria.gov.co/en/node/7348 and
  https://www.cancilleria.gov.co/sites/default/files/Normograma/docs/decreto_1514_2012.htm —
  HTTP 403 to fetcher; search snippets confirm only "alfanumérico".
- https://www.suin-juriscol.gov.co/viewDocument.asp?id=1301334 (Decreto 1514 de 2012) — TLS
  failure; unreachable.
- https://en.wikipedia.org/wiki/Colombian_passport and es.wikipedia — no number format.
- validator.js isPassportNumber — no CO entry. TrustDocHub — only ICAO MRZ field width.

**Rationale**: "alphanumeric" without positional structure cannot yield a defensible regex
(a bare 6-10 char alnum run is FP soup even label-gated). Conventions §3 → documented skip.

## 4. ec-passport-number — SKIPPED (documented)

**Finding**: Ecuadorian passport numbers were the 10-digit cédula number until the 2020
biometric series (cédula digits are already covered by `ec-unique-id`); the current number
is an "código alfanumérico" assigned by the Registro Civil, but no official source
publishes its structure. The only structural claim found is an SEO blog
(renovarpapeles.com) describing a 9-char breakdown (E + CZ + serial + check + office
letters) that no other source corroborates and that reads as an MRZ-composite, not the
printed number.

**Sources checked**:
- https://www.eluniverso.com/noticias/ecuador/conozca-los-detalles-y-el-numero-que-identifica-al-pasaporte-ecuatoriano-nota/ —
  "Antes este dato correspondía al mismo número de cédula, sin embargo, ahora es un código
  alfanumérico." No structure.
- https://www.elcomercio.com/actualidad/pasaportes-codigo-alfanumerico-registro-civil/ —
  alphanumeric code assigned from the queue number; no structure.
- https://en.wikipedia.org/wiki/Ecuadorian_passport, es.wikipedia — no format.
- https://www.gob.ec/tramites/buscar?search_api_fulltext=Pasaporte (official) — no format.
- https://www.renovarpapeles.com/tramites/cuantos-numeros-tiene-un-pasaporte-ecuatoriano/ —
  uncorroborated blog breakdown; rejected as single low-authority source.
- PRADO ECU pages — HTTP 403 to fetcher.

**Rationale**: conventions §3 → documented skip.

## 5. ar-drivers-license — SKIPPED (documented; number = DNI)

**Finding (statutory, decisive)**: Ley 24.449 art. 13 (as amended by Ley 26.363 art. 25):
the Licencia Nacional de Conducir "se individualizará por la mención expresa, en campo
predeterminado, de la autoridad local emisora y el número de documento nacional de
identidad del requirente" — the licence number IS the holder's DNI number.

**Sources**:
- https://servicios.infoleg.gob.ar/infolegInternet/anexos/165000-169999/168141/texact.htm —
  consolidated ANSV/licence normative text quoting the article above (InfoLEG, official).
- https://www.argentina.gob.ar/seguridadvial/licencianacional and the LNC digital FAQ —
  no separate licence-number scheme mentioned anywhere.

**Rationale**: detecting the licence number is detecting a 7-8 digit DNI, which is exactly
`ar-dni` (including its keyword/label surface — "licencia" documents always carry DNI
labels too). Pure duplicate → documented skip per conventions §4.

## 6. cl-drivers-license — SKIPPED (documented; number = RUT)

**Finding**: The Chilean licence number is the holder's RUT/RUN; the only other printed
number is an administrative folio with no fixed national format.

**Sources**:
- https://practicatest.cl/blog/licencias-de-conducir/informacion-obligatoria-licencia-conducir —
  (403 to fetcher; search snippet, corroborated below): "the license number is the RUT of
  its holder"; the printed code on the right edge is the folio of the application form,
  administrative only.
- https://rutrutificador.cl/rut-y-licencias-de-conducir/ and
  https://rutificadorchile.com/licencia-por-rut/ — licence lookup is by RUT; the licence
  number is the RUT.
- https://tramites.munistgo.cl/consultalicencia/ (Municipalidad de Santiago, official) —
  licence consultation keyed by RUN.

**Rationale**: pure duplicate of `cl-rut` (checksum-validated, already in catalog) →
documented skip per conventions §4 (the task brief anticipated exactly this outcome).

## Gates

Run in this worktree after `npm install`:
- `npm run check` — 0 errors (the AAA000000 filter case surfaces as a warning by design:
  "should_not_match matched top-level" is warning-only for filter-documented negatives).
- `npm run check:quality` — PASSED.
- `npm run compile` — succeeds; `git checkout -- patterns.json` before staging.

Empirical regex verification: scratchpad node script, 14/14 PASS (see §1).

## Files changed

- `data/patterns/ar-passport-number.yaml` (new)
- `.superpowers/sdd/d4-task-j3-report.md` (this report)
