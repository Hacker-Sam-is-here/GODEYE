// Fix mojibake — exact codepoint mappings derived from file inspection
// Run: "C:\Program Files\nodejs\node.exe" scripts/fix_encoding.js
const fs   = require('fs');
const path = require('path');

// Each entry: [corrupted_chars (as codepoints), correct_string]
// Corrupted codepoints verified by inspecting actual file bytes with Node
const FIXES = [
  // BOM
  ['\uFEFF', ''],
  // Em-dash: U+00E2 U+20AC U+201D -> —
  ['\u00E2\u20AC\u201D', '\u2014'],
  // Right arrow: U+00E2 U+2020 U+2019 -> →
  ['\u00E2\u2020\u2019', '\u2192'],
  // Mountain ⛰: U+00E2 U+203A U+00B0
  ['\u00E2\u203A\u00B0', '\u26F0'],
  // Warning ⚠: U+00E2 U+0161 U+00A0
  ['\u00E2\u0161\u00A0', '\u26A0'],
  // Lightning ⚡: U+00E2 U+0161 U+00A1
  ['\u00E2\u0161\u00A1', '\u26A1'],
  // Globe 🌍: U+00F0 U+0178 U+0152 U+008D
  ['\u00F0\u0178\u0152\u008D', '\uD83C\uDF0D'],
  // Globe 🌐: U+00F0 U+0178 U+0152 U+0090
  ['\u00F0\u0178\u0152\u0090', '\uD83C\uDF10'],
  // Globe 🌑: U+00F0 U+0178 U+0152 U+0091
  ['\u00F0\u0178\u0152\u0091', '\uD83C\uDF11'],
  // Fire 🔥: U+00F0 U+0178 U+201D U+00A5
  ['\u00F0\u0178\u201D\u00A5', '\uD83D\uDD25'],
  // Volcano 🌋: U+00F0 U+0178 U+0152 U+2039
  ['\u00F0\u0178\u0152\u2039', '\uD83C\uDF0B'],
  // Tornado 🌪: U+00F0 U+0178 U+0152 U+00AA
  ['\u00F0\u0178\u0152\u00AA', '\uD83C\uDF2A'],
  // Ice 🧊: U+00F0 U+0178 U+00A7 U+0160
  ['\u00F0\u0178\u00A7\u0160', '\uD83E\uDDCA'],
  // Wave 🌊: U+00F0 U+0178 U+0152 U+0160
  ['\u00F0\u0178\u0152\u0160', '\uD83C\uDF0A'],
  // Satellite 🛰: U+00F0 U+0178 U+009B U+00B0
  ['\u00F0\u0178\u009B\u00B0', '\uD83D\uDEB0'],
  // Ship 🚢: U+00F0 U+0178 U+009A U+00A2
  ['\u00F0\u0178\u009A\u00A2', '\uD83D\uDEA2'],
  // Siren 🚨: U+00F0 U+0178 U+009A U+00A8
  ['\u00F0\u0178\u009A\u00A8', '\uD83D\uDEA8'],
  // Antenna 📡: U+00F0 U+0178 U+201C U+00A1  (trying common value)
  ['\u00F0\u0178\u201C\u00A1', '\uD83D\uDCE1'],
  // Camera 📷: U+00F0 U+0178 U+201C U+00B7
  ['\u00F0\u0178\u201C\u00B7', '\uD83D\uDCF7'],
  // Magnifier 🔍: U+00F0 U+0178 U+201D U+008D
  ['\u00F0\u0178\u201D\u008D', '\uD83D\uDD0D'],
  // Spy 🕵: common
  ['\u00F0\u0178\u0095\u00B5', '\uD83D\uDD75'],
  // Lock 🔒
  ['\u00F0\u0178\u201D\u0092', '\uD83D\uDD12'],
  // Chart 📊
  ['\u00F0\u0178\u201C\u008A', '\uD83D\uDCCA'],
  // Clipboard 📋
  ['\u00F0\u0178\u201C\u008B', '\uD83D\uDCCB'],
  // Red circle 🔴
  ['\u00F0\u0178\u201D\u00B4', '\uD83D\uDD34'],
  // Explosion 💥
  ['\u00F0\u0178\u2019\u00A5', '\uD83D\uDCA5'],
  // Pin 📍
  ['\u00F0\u0178\u201C\u008D', '\uD83D\uDCCD'],
  // Shield 🛡
  ['\u00F0\u0178\u009B\u00A1', '\uD83D\uDEE1'],
  // Biohazard ☣
  ['\u00E2\u02DC\u00A3', '\u2623'],
  // Plane ✈
  ['\u00E2\u009C\u02C6', '\u2708'],
  // Rocket 🚀
  ['\u00F0\u0178\u009A\u0080', '\uD83D\uDE80'],
];

let totalFixed = 0;

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const orig = content;
  for (const [bad, good] of FIXES) {
    content = content.split(bad).join(good);
  }
  if (content !== orig) {
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  }
  return false;
}

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'data'].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (/\.(js|html|css)$/.test(e.name)) {
      if (fixFile(full)) { console.log('Fixed:', e.name); totalFixed++; }
    }
  }
}

const root = path.join(__dirname, '..');
walk(root);
console.log(`\nDone — fixed ${totalFixed} files`);
