import { Platform } from 'react-native';

import { buildXlsx, type Sheet } from '@/lib/xlsx';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Nombre de archivo sin acentos ni símbolos raros. */
export const fileName = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'reporte';

function download(bytes: Uint8Array | string, name: string, type: string) {
  const blob = new Blob([bytes as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

async function share(uri: string, mimeType: string, title: string, uti?: string) {
  const Sharing = await import('expo-sharing');
  if (!(await Sharing.isAvailableAsync())) throw new Error('Este equipo no permite compartir archivos.');
  await Sharing.shareAsync(uri, { mimeType, UTI: uti, dialogTitle: title });
}

/** Excel (.xlsx): en el celular se abre el menú para guardar o enviar (WhatsApp, correo, Drive); en la PC se descarga. */
export async function exportExcel(sheets: Sheet[], name: string) {
  const bytes = buildXlsx(sheets);
  const file = `${fileName(name)}.xlsx`;
  if (Platform.OS === 'web') return download(bytes, file, XLSX_MIME);
  const { File, Paths } = await import('expo-file-system');
  const f = new File(Paths.cache, file);
  if (f.exists) f.delete();
  f.create();
  f.write(bytes);
  await share(f.uri, XLSX_MIME, name, 'org.openxmlformats.spreadsheetml.sheet');
}

/** PDF en hoja carta: en el celular se crea el PDF y se comparte; en la PC se abre imprimir (elige "Guardar como PDF"). */
export async function exportPdf(html: string, name: string) {
  if (Platform.OS !== 'web') {
    const Print = await import('expo-print');
    const { uri } = await Print.printToFileAsync({ html, width: 612, height: 792 });
    // El PDF sale con un nombre al azar: se copia con un nombre claro.
    let shareUri = uri;
    try {
      const { File, Paths } = await import('expo-file-system');
      const target = new File(Paths.cache, `${fileName(name)}.pdf`);
      if (target.exists) target.delete();
      new File(uri).copy(target);
      shareUri = target.uri;
    } catch {
      // Si no se puede renombrar, se comparte con el nombre que puso el sistema.
    }
    return share(shareUri, 'application/pdf', name, 'com.adobe.pdf');
  }
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', left: '-10000px', top: '0', width: '216mm', height: '279mm', border: '0' });
  document.body.appendChild(frame);
  await new Promise<void>((resolve) => {
    frame.onload = () => resolve();
    frame.srcdoc = html;
  });
  frame.contentWindow!.document.title = name;
  frame.contentWindow!.focus();
  frame.contentWindow!.print();
  setTimeout(() => frame.remove(), 60_000);
}
