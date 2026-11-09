// Netlify (arrastrar y soltar) ignora las carpetas llamadas "node_modules"
// y también las que empiezan con "@" (como "@expo", donde están los íconos).
// Aquí se renombran ("assets/node_modules" -> "assets/nm", "@expo" -> "scope-expo")
// y se actualizan las referencias en los archivos de la app.
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
const assets = path.join(dist, 'assets');
const replacements = [];

const from = path.join(assets, 'node_modules');
if (fs.existsSync(from)) {
  fs.renameSync(from, path.join(assets, 'nm'));
  replacements.push(['assets/node_modules/', 'assets/nm/']);
}

const nm = path.join(assets, 'nm');
if (fs.existsSync(nm)) {
  for (const e of fs.readdirSync(nm, { withFileTypes: true })) {
    if (!e.isDirectory() || !e.name.startsWith('@')) continue;
    const safe = `scope-${e.name.slice(1)}`;
    fs.renameSync(path.join(nm, e.name), path.join(nm, safe));
    replacements.push([`assets/nm/${e.name}/`, `assets/nm/${safe}/`]);
    replacements.push([`assets/nm/%40${e.name.slice(1)}/`, `assets/nm/${safe}/`]);
  }
}

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
let fixed = 0;
for (const file of walk(dist).filter((f) => /\.(js|html|json|css)$/.test(f))) {
  const text = fs.readFileSync(file, 'utf8');
  // node_modules primero, luego las carpetas "@".
  const out = replacements.reduce((t, [a, b]) => t.split(a).join(b), text);
  if (out === text) continue;
  fs.writeFileSync(file, out);
  fixed++;
}
console.log(`Listo para Netlify: ${fixed} archivos actualizados.`);
