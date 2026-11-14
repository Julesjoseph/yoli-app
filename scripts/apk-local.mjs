// Arma la APK en tu PC (sin EAS): npm run apk:local
// Necesita Android Studio instalado (trae el SDK y Java).
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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

// Busca un Java que sirva: la variable, o el "jbr" de Android Studio (donde sea que se haya instalado).
const okJava = (p) => p && existsSync(join(p, 'lib', 'jvm.cfg')) && existsSync(join(p, 'bin', win ? 'java.exe' : 'java'));
const studioDirs = (base) => {
  try {
    return readdirSync(base).filter((d) => /android studio/i.test(d)).map((d) => join(base, d, 'jbr'));
  } catch {
    return [];
  }
};
const javaCandidates = [
  env.JAVA_HOME,
  ...(win
    ? [
        ...studioDirs('C:\\Program Files\\Android'),
        ...studioDirs('C:\\Program Files'),
        ...(env.LOCALAPPDATA ? studioDirs(join(env.LOCALAPPDATA, 'Programs')) : []),
        ...(env.LOCALAPPDATA ? studioDirs(join(env.LOCALAPPDATA, 'Programs', 'Android')) : []),
      ]
    : ['/Applications/Android Studio.app/Contents/jbr/Contents/Home']),
];
const java = javaCandidates.find(okJava);
if (!java) {
  console.error(
    '\nNo encuentro un Java que sirva. Probé:\n' +
      javaCandidates.filter(Boolean).map((p) => `  - ${p}`).join('\n') +
      '\nBusca la carpeta donde se instaló Android Studio y dime su ruta.\n',
  );
  process.exit(1);
}
if (env.JAVA_HOME && env.JAVA_HOME !== java) console.log(`(JAVA_HOME apuntaba a ${env.JAVA_HOME}, que no sirve; uso otra.)`);
env.JAVA_HOME = java;
console.log(`SDK: ${sdk}\nJava: ${java}`);

// Windows: algunos archivos de compilación pasan de 260 letras. Hace falta "rutas largas" activado
// y una versión de CMake cuyo ninja las soporte (la 3.22 que trae Android no).
if (win) {
  let longOk = false;
  try {
    longOk = /0x1\b/.test(execSync('reg query HKLM\\SYSTEM\\CurrentControlSet\\Control\\FileSystem /v LongPathsEnabled', { encoding: 'utf8' }));
  } catch {}
  if (!longOk) {
    console.error(
      '\nWindows tiene apagadas las "rutas largas" y la APK no compila sin eso.\n' +
        'Abre PowerShell COMO ADMINISTRADOR (clic derecho > Ejecutar como administrador) y pega:\n\n' +
        '  New-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem" -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force\n\n' +
        'Luego reinicia la PC y vuelve a correr: npm run apk:local\n',
    );
    process.exit(1);
  }
}

console.log('\n1/3 Preparando el proyecto Android…');
run('npx expo prebuild --platform android --clean --no-install');
// CMake más nuevo (su ninja sí acepta rutas largas en Windows). Usa el más nuevo instalado en el SDK.
if (win) {
  const ver = (d) => d.split('.').map(Number);
  const newer = (a, b) => { const x = ver(a), y = ver(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
  const installed = () => { try { return readdirSync(join(sdk, 'cmake')).filter((d) => /^\d+\.\d+\.\d+/.test(d)); } catch { return []; } };
  let best = installed().filter((d) => newer(d, '3.29.9')).sort((a, b) => (newer(a, b) ? -1 : 1))[0];
  if (!best) {
    const sdkm = [join(sdk, 'cmdline-tools', 'latest', 'bin', 'sdkmanager.bat'), ...(() => { try { return readdirSync(join(sdk, 'cmdline-tools')).map((d) => join(sdk, 'cmdline-tools', d, 'bin', 'sdkmanager.bat')); } catch { return []; } })()].find((p) => existsSync(p));
    if (sdkm) {
      console.log('Instalando CMake 3.31.6…');
      try { execSync(`"${sdkm}" "cmake;3.31.6"`, { stdio: 'inherit', env, input: 'y\n' }); } catch {}
      best = installed().filter((d) => newer(d, '3.29.9'))[0];
    }
  }
  if (!best) {
    console.error(
      '\nFalta una versión nueva de CMake. En Android Studio: More Actions > SDK Manager > pestaña "SDK Tools".\n' +
        'Abajo a la derecha marca "Show Package Details", abre "CMake", marca la 3.31.6 (o la 3.31 más alta), Apply y OK.\n' +
        'Luego vuelve a correr: npm run apk:local\n',
    );
    process.exit(1);
  }
  console.log(`CMake: ${best}`);
  const appGradle = join('android', 'app', 'build.gradle');
  writeFileSync(appGradle, readFileSync(appGradle, 'utf8').replace(/\nandroid \{\n/, `\nandroid {\n    externalNativeBuild { cmake { version "${best}" } }\n`));
}
writeFileSync(join('android', 'local.properties'), `sdk.dir=${sdk.replace(/\\/g, '\\\\').replace(/:/g, '\\:')}\n`);

// Un Gradle viejo que quedó abierto puede dejar archivos trabados en Windows: se cierra antes.
try {
  execSync(win ? 'gradlew.bat --stop' : './gradlew --stop', { stdio: 'ignore', cwd: 'android', env });
} catch {}

console.log('\n2/3 Compilando la APK (la primera vez tarda 10-20 minutos)…');
// Solo los procesadores de celulares y tablets reales (no emuladores): compila en la mitad del tiempo.
const archs = '-PreactNativeArchitectures=arm64-v8a,armeabi-v7a';
run(`${win ? 'gradlew.bat' : './gradlew'} assembleRelease ${archs}`, 'android');

const out = join('android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
if (!existsSync(out)) {
  console.error(`\nNo encontré ${out}.`);
  process.exit(1);
}
copyFileSync(out, 'yoli-soft.apk');
console.log('\n3/3 Lista: yoli-soft.apk está en la carpeta del proyecto. Pásala al celular e instálala.\n');
