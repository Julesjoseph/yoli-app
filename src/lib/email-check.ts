// Revisa el correo antes de crear la cuenta: que tenga forma de correo y que no tenga
// un error común de escritura en el dominio (gmial.com, hotmal.com, gmail.con...).
// Sin dependencias: se usa en la app y en las pruebas.

const DOMAINS = [
  'gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'live.com', 'msn.com',
  'hotmail.es', 'outlook.es', 'yahoo.es', 'me.com', 'aol.com', 'protonmail.com', 'claro.net.do',
];
const TLDS = ['com', 'net', 'org', 'es', 'do', 'com.do', 'edu', 'edu.do', 'gob.do', 'gov', 'io', 'co', 'app', 'me', 'us', 'info', 'biz'];

function distance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      // Dos letras cambiadas de lugar (gmial → gmail) cuentan como un solo error.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

export interface EmailCheck {
  /** Correo limpio (sin espacios, en minúsculas). */
  email: string;
  /** Qué está mal, si no se puede usar. */
  error?: string;
  /** Correo que probablemente quiso escribir. */
  suggestion?: string;
}

export function checkEmail(raw: string): EmailCheck {
  const email = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (!email) return { email, error: 'Escribe tu correo.' };
  const at = email.split('@');
  if (at.length !== 2) return { email, error: 'El correo debe tener una sola @ (ejemplo: juana@gmail.com).' };
  const [user, domain] = at;
  if (!user) return { email, error: 'Falta lo que va antes de la @.' };
  if (!/^[a-z0-9._%+-]+$/.test(user) || user.startsWith('.') || user.endsWith('.') || user.includes('..')) {
    return { email, error: 'Lo que va antes de la @ tiene caracteres que no se permiten.' };
  }
  if (!domain || !domain.includes('.')) return { email, error: 'Falta el final del correo (por ejemplo @gmail.com).' };
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain) || domain.split('.').some((p) => !p || p.startsWith('-') || p.endsWith('-'))) {
    return { email, error: 'Lo que va después de la @ no es válido.' };
  }
  const tld = domain.split('.').pop()!;
  if (tld.length < 2 || /\d/.test(tld)) return { email, error: 'El final del correo no es válido (por ejemplo .com).' };

  if (DOMAINS.includes(domain)) return { email };
  // Dominio muy parecido a uno común: gmial.com → gmail.com
  let best: string | null = null;
  let bestD = 3;
  for (const d of DOMAINS) {
    const dist = distance(domain, d);
    if (dist < bestD) {
      best = d;
      bestD = dist;
    }
  }
  if (best && bestD <= (best.length > 9 ? 2 : 1)) return { email, suggestion: `${user}@${best}` };
  // Mismo nombre que uno común con otro final: gmail.co, gmail.con, hotmail.cm
  const name = domain.slice(0, domain.indexOf('.'));
  const common = DOMAINS.find((d) => d.startsWith(`${name}.`));
  if (common && !TLDS.includes(domain.slice(name.length + 1))) return { email, suggestion: `${user}@${common}` };
  if (!TLDS.includes(tld) && ['con', 'cmo', 'cm', 'om', 'comm', 'vom', 'xom'].includes(tld)) {
    return { email, suggestion: `${user}@${domain.slice(0, -tld.length)}com` };
  }
  return { email };
}
