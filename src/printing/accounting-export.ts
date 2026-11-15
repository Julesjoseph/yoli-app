import type { SQLiteDatabase } from 'expo-sqlite';

import { loadAccounting, type Accounting } from '@/db/accounting';
import { getLocalProfile } from '@/db/business-profile';
import type { Context } from '@/db/repo';
import type { AccPeriod } from '@/lib/accounting';
import { buildReportHtml, buildReportSheets, type ExportData } from '@/lib/report-export';

import { exportExcel, exportPdf } from './export';

export async function accountingExportData(db: SQLiteDatabase, ctx: Context, data: Accounting): Promise<ExportData> {
  const profile = await getLocalProfile(db).catch(() => null);
  return {
    businessName: ctx.businessName || profile?.legalName || "",
    rnc: profile?.rnc || null,
    scope: data.source === 'nube' ? 'Todos los locales' : `${ctx.locationName} (datos de este equipo)`,
    periodLabel: data.range.label,
    statement: data.statement,
    orders: data.orders,
    expenses: data.expenses,
    receivables: data.receivables,
    payables: data.payables,
    locations: data.locations,
  };
}

/** Descarga la contabilidad del período en PDF o Excel. */
export async function exportAccounting(db: SQLiteDatabase, ctx: Context, kind: 'pdf' | 'excel', period: AccPeriod, loaded?: Accounting) {
  const data = loaded ?? (await loadAccounting(db, ctx, period));
  const d = await accountingExportData(db, ctx, data);
  const name = `Contabilidad ${ctx.businessName} ${data.range.fromKey}`;
  if (kind === 'pdf') return exportPdf(buildReportHtml(d), name);
  return exportExcel(buildReportSheets(d), name);
}
