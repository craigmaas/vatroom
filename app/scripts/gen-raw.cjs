const fs = require('fs')
const path = require('path')
const root = 'C:/Users/camaa/Documents/Git Repos/winery'
const hist = path.join(root, 'docs', 'lot no history')
const comp = path.join(root, 'docs', 'lot compositions')
let out = '/** Raw Blended exports from Victor Vineyards (verbatim). Generated from /docs by scripts/gen-raw.cjs — do not hand-edit. */\n\n'
out += 'export const LOT_HISTORY_CSV: Record<string, string> = {\n'
for (const f of fs.readdirSync(hist).filter((f) => f.endsWith('.csv')).sort()) {
  const code = f.replace('.csv', '')
  const t = fs.readFileSync(path.join(hist, f), 'utf8').replace(/^\uFEFF/, '')
  out += `  ${JSON.stringify(code)}: ${JSON.stringify(t)},\n`
}
out += '}\n\nexport const LOT_COMPOSITION_CSV: Record<string, string> = {\n'
for (const f of fs.readdirSync(comp).filter((f) => f.endsWith('.csv')).sort()) {
  const code = f.replace(' composition.csv', '')
  const t = fs.readFileSync(path.join(comp, f), 'utf8').replace(/^\uFEFF/, '')
  out += `  ${JSON.stringify(code)}: ${JSON.stringify(t)},\n`
}
out += '}\n'
const dest = path.join(root, 'app', 'src', 'data', 'blended-raw.ts')
fs.writeFileSync(dest, out)
console.log('wrote', dest, out.length, 'chars')
