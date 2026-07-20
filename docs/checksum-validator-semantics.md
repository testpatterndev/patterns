# Purview checksum-validator semantics (resolved 2026-07-20)

Source: https://learn.microsoft.com/purview/sit-regex-validators-additional-checks
(fetched 2026-07-20; page ms.date 2026-06-22).

## The acceptance rule

Given a `<Validator type="Checksum">` with parameters

```xml
<Param name="Weights">w1,...,wn</Param>
<Param name="Mod">m</Param>
<Param name="CheckDigit">k</Param>
```

the validator accepts a matched value with digits `d1..dn` iff

```
(sum_i w_i * d_i) mod m == d_k
```

i.e. the weighted sum of **all** digits (each digit multiplied by the weight at its
position) is reduced modulo `Mod`, and the result is compared **against the digit at
position `CheckDigit`** (a 1-based digit position, counting digits only — separators
are ignored).

### Supporting quotes from the docs

The worked example (eight-digit license number, mod 9, last digit is the check digit):

> ```
> Sum = digit 1 * Weight 1 + digit 2 * weight 2 + ... + digit 8 * weight 8
> Mod value = Sum % 9
> If Mod value == digit 8
>     Account number is valid
> ```

The zero-weight rule for the check-digit position:

> "If the check digit isn't part of the checksum calculation, use 0 as the weight for
> the check digit. For example, in the eight-digit license number example, weight 8 is
> equal to 0 if the check digit won't be used for calculating the check digit."

Parameter definitions:

> "**Weights:** To define the series of numbers with which each digit starting from
> position 1 to last position of the regex needs to be multiplied. This calculates the
> sum product. Weight positions refer to the order of the digits only, it doesn't
> consider any nondigit characters like dashes."
>
> "**CheckDigit:** Define the position of the check digit with which the calculated
> number will be compared against."

So `CheckDigit` is a **digit position**, never a target remainder. There is no
documented "Result"-style parameter meaning "weighted sum must equal this value".

## How the exporter (testpattern) translates the YAML block

`C:\claudecode\testpattern\src\lib\purview-state.js` (`mapValidator`, ~line 190) maps
YAML `validators[].params` names to the state fields verbatim — **no value
transformation**:

- `Weights`/`weights` -> `Weights`
- `Mod`/`Modulo`/... -> `Mod` (default 10)
- `CheckDigit`/`check_digit`/`Result`/`result` -> `CheckDigit` (default `'last'`)

`C:\claudecode\testpattern\src\lib\sit-builder-export.js` (`renderValidator`) then
renders those values into `<Param name="Weights|Mod|CheckDigit">` unchanged. So a YAML
block written with the "sum ≡ Result (mod Modulo)" mental model — `Result: '0'` — is
exported as `<Param name="CheckDigit">0</Param>`, which Purview **rejects**
("Param CheckDigit is invalid", 0x8000FFFF; CheckDigit is 1-based).

The deploy pipeline (`C:\claudecode\Compl8DLPDeploy\scripts\build-deploy-packages.py`,
`Deploy-Classifiers.ps1`) papers over that rejection by rewriting `CheckDigit 0` to the
**last weight index** — which is how `QGISCF-large-02.xml` ended up with
`Weights 1,4,3,7,5,8,6,9,10 / Mod 11 / CheckDigit 9`.

## Why the previous TFN encoding was wrong

The Australian TFN rule: with weights (1,4,3,7,5,8,6,9) on digits 1..8 plus `10*d9`,
the total is ≡ 0 (mod 11). Algebraically (since 10 ≡ -1 mod 11) this reduces to
`sum(first 8 weighted digits) mod 11 == d9`.

Under the documented Purview semantics, the deployed encoding
`Weights 1,4,3,7,5,8,6,9,10 / Mod 11 / CheckDigit 9` computes
`S = S8 + 10*d9` and accepts iff `S mod 11 == d9`. For a genuine TFN `S ≡ 0`, so it
accepts a genuine TFN **only when its check digit is 0** (and accepts assorted invalid
numbers where `S8 ≡ 2*d9 mod 11`). It is not a TFN validator.

The docs-compliant encoding is:

```
Weights   1,4,3,7,5,8,6,9,0     (0 = check-digit position excluded from the sum)
Mod       11
CheckDigit 9
```

which accepts iff `S8 mod 11 == d9` — exactly the reduced TFN rule. (Numbers where
`S8 mod 11 == 10` are correctly rejected: no digit equals 10.)

The same encoding style applies to the Medicare card checksum (weights 1,3,7,9,1,3,7,9
on digits 1-8, mod 10, check digit at position 9; zero weights for the check digit,
issue number, and IRN positions).

## Func_* validators are not usable in exported rulepacks

Microsoft's docs list `Func_australian_tax_file_number` as "Is a validator: yes" for
custom SITs, but live uploads of custom rulepacks that reference built-in `Func_*`
processors in a Regex `validators` attribute are rejected wholesale ("Data
classification identifiers referenced by these resources cannot be found") — see
`testpattern/src/lib/sit-builder-export.js` (`isBuiltInValidatorRef`, comment at top)
and `testpattern/scripts/regression-purview-validators.js`, which asserts `Func_*`
refs are stripped at export. Inline `type: Checksum` validators are therefore the only
enforceable encoding in this pipeline.
