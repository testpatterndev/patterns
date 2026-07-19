import fs from "node:fs"
import yaml from "js-yaml"
const f = "data/patterns/global-bitcoin-address-bech32.yaml"
const d = yaml.load(fs.readFileSync(f, "utf8"))
d.case_sensitive = true
fs.writeFileSync(f, yaml.dump(d, { lineWidth: 120, noRefs: true, sortKeys: false, quotingType: "'" }))
console.log("set case_sensitive true")
