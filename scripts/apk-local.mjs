// Arma la APK en tu PC (sin EAS): npm run apk:local
// Necesita Android Studio instalado (trae el SDK y Java) y las variables ANDROID_HOME y JAVA_HOME.
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const win = process.platform === 'win32';
const run = (cmd, cwd) => execSync(cmd, { stdio: 'inherit', cwd, env: process.env });

if (!process.env.ANDROID_HOME && !process.env.ANDROID_SDK_ROOT) {
  console.error('\nFalta ANDROID_HOME. Instala Android Studio y pon la variable (mira los pasos que te pasó Claude).\n');
  process.exit(1);
}
if (!process.env.JAVA_HOME) {
  console.error('\nFalta JAVA_HOME. Ponla apuntando a la carpeta "jbr" de Android Studio.\n');
  process.exit(1);
}

console.log('\n1/3 Preparando el proyecto Android…');
run('npx expo prebuild --platform android --clean --no-install');

console.log('\n2/3 Compilando la APK (la primera vez tarda 10-20 minutos)…');
run(win ? 'gradlew.bat assembleRelease' : './gradlew assembleRelease', 'android');

const out = join('android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
if (!existsSync(out)) {
  console.error(`\nNo encontré ${out}.`);
  process.exit(1);
}
copyFileSync(out, 'yoli-soft.apk');
console.log('\n3/3 Lista: yoli-soft.apk está en la carpeta del proyecto. Pásala al celular e instálala.\n');
