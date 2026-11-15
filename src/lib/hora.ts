// Sin dependencias: se usa en la app y en las pruebas.

/**
 * Entiende la hora como la escribe la gente: "5", "5pm", "5:30 pm", "17:30", "8 am".
 * Devuelve null si no se entiende.
 */
export function parseTime(text: string): { hour: number; minute: number } | null {
  const s = text.trim().toLowerCase().replace(/\s+/g, '').replace(/\./g, '');
  const m = s.match(/^(\d{1,2})(?::?(\d{2}))?(am|pm|a|p)?$/);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const ampm = m[3]?.[0];
  if (minute > 59 || hour > 23) return null;
  if (ampm) {
    if (hour < 1 || hour > 12) return null;
    if (ampm === 'p' && hour < 12) hour += 12;
    if (ampm === 'a' && hour === 12) hour = 0;
  }
  return { hour, minute };
}
