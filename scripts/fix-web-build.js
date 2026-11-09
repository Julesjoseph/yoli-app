// Netlify (arrastrar y soltar) ignora las carpetas llamadas "node_modules",
// y ahí queda el archivo de SQLite (.wasm). Se renombra a "assets/nm" y se
// actualizan las referencias en los archivos de la app.
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
const from = path.join(dist, 'assets', 'node_modules');
if (!fs.existsSync(from)) process.exit(0);
fs.renameSync(from, path.join(dist, 'assets', 'nm'));

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
let fixed = 0;
for (const file of walk(dist).filter((f) => /\.(js|html|json|css)$/.test(f))) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes('assets/node_modules/')) continue;
  fs.writeFileSync(file, text.split('assets/node_modules/').join('assets/nm/'));
  fixed++;
}
console.log(`Listo para Netlify: ${fixed} archivos actualizados (assets/node_modules -> assets/nm).`);
