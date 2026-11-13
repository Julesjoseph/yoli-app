// Arma la APK en tu PC (sin EAS): npm run apk:local
// Necesita Android Studio instalado (trae el SDK y Java).
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const win = process.platform === 'win32';
const env = { ...process.env };
const run = (cmd, cwd) => execSync(cmd, { stdio: 'inherit', cwd, env });
const first = (list) => list.filter(Boolean).find((p) => existsSync(p));

// Busca el SDK de Android: la variable, o donde lo pone Android Studio por defecto.
const sdk = first([
  env.ANDROID_HOME,
  env.ANDROID_SDK_ROOT,
  env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Android', 'Sdk'),
  env.HOME && join(env.HOME, 'Library', 'Android', 'sdk'),
  env.HOME && join(env.HOME, 'Android', 'Sdk'),
]);
if (!sdk || !existsSync(join(sdk, 'platforms'))) {
  console.error(
    `\nNo encuentro el SDK de Android${env.ANDROID_HOME ? ` (ANDROID_HOME dice: ${env.ANDROID_HOME})` : ''}.\n` +
      'Abre Android Studio > More Actions > SDK Manager. Arriba dice "Android SDK Location":\n' +
      'si está vacío, instala el SDK desde ahí; si tiene otra ruta, pon esa ruta en ANDROID_HOME.\n',
  );
  process.exit(1);
}
env.ANDROID_HOME = sdk;

const java = first([
  env.JAVA_HOME,
  win && 'C:\\Program Files\\Android\\Android Studio\\jbr',
  !win && '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
]);
if (!java) {
  console.error('\nNo encuentro Java. Ponle a JAVA_HOME la carpeta "jbr" de Android Studio.\n');
  process.exit(1);
}
env.JAVA_HOME = java;
console.log(`SDK: ${sdk}\nJava: ${java}`);

console.log('\n1/3 Preparando el proyecto Android…');
run('npx expo prebuild --platform android --clean --no-install');
writeFileSync(join('android', 'local.properties'), `sdk.dir=${sdk.replace(/\\/g, '\\\\').replace(/:/g, '\\:')}\n`);

console.log('\n2/3 Compilando la APK (la primera vez tarda 10-20 minutos)…');
run(win ? 'gradlew.bat assembleRelease' : './gradlew assembleRelease', 'android');

const out = join('android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
if (!existsSync(out)) {
  console.error(`\nNo encontré ${out}.`);
  process.exit(1);
}
copyFileSync(out, 'yoli-soft.apk');
console.log('\n3/3 Lista: yoli-soft.apk está en la carpeta del proyecto. Pásala al celular e instálala.\n');
