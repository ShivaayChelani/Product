import type { Column } from "@/components/DataTable";

export function escapeCsvCell(value: unknown): string {
  const str = value == null ? "" : String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function rowsToCsv<T extends Record<string, unknown>>(
  columns: Column<T>[],
  data: T[],
): string {
  const exportCols = columns.filter((c) => c.key !== "actions");
  const header = exportCols.map((c) => escapeCsvCell(c.header)).join(",");
  const rows = data.map((item) =>
    exportCols
      .map((col) => {
        const val = col.exportValue
          ? col.exportValue(item)
          : col.render
            ? undefined
            : item[col.key];
        return escapeCsvCell(val ?? "");
      })
      .join(","),
  );
  return [header, ...rows].join("\n");
}

export function downloadTextFile(
  content: string,
  filename: string,
  mime = "text/csv;charset=utf-8;",
  excelCompatible = false,
) {
  const body = excelCompatible ? `\uFEFF${content}` : content;
  const blob = new Blob([body], { type: mime });
  downloadBlob(blob, filename);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportTableData<T extends Record<string, unknown>>(
  columns: Column<T>[],
  data: T[],
  filename: string,
  format: "csv" | "excel" = "csv",
) {
  const csv = rowsToCsv(columns, data);
  const ext = format === "excel" ? "xls" : "csv";
  downloadTextFile(
    csv,
    `${filename}-${new Date().toISOString().slice(0, 10)}.${ext}`,
    "text/csv;charset=utf-8;",
    format === "excel",
  );
}

export function printReport(title: string, contentHtml: string) {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`<!DOCTYPE html>
<html><head><title>${title}</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 24px; color: #111; }
  h1 { font-size: 18px; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 16px; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
  th { background: #f5f5f5; }
  @media print { body { padding: 0; } }
</style></head><body>
<h1>${title}</h1>
<p>Generated ${new Date().toLocaleString()}</p>
${contentHtml}
<script>window.onload=function(){window.print();}</script>
</body></html>`);
  win.document.close();
}

export function jsonRowsToHtmlTable(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "<p>No data</p>";
  const keys = Object.keys(rows[0]).slice(0, 12);
  const header = keys.map((k) => `<th>${escapeCsvCell(k)}</th>`).join("");
  const body = rows
    .slice(0, 500)
    .map(
      (row) =>
        `<tr>${keys.map((k) => `<td>${escapeCsvCell(row[k])}</td>`).join("")}</tr>`,
    )
    .join("");
  return `<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
}
