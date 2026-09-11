import { ApiError } from '../../shared/utils/ApiError';
import { cityDisplayName } from '../../shared/utils/cityIdentity';
import * as XLSX from 'xlsx';

export const REQUIRED_HEADERS = [
  'City name',
  'Riddle in English',
  'Answer in English',
  'Riddle in Hindi',
  'Answer in Hindi',
] as const;

export function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .replace(/\uFEFF/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export interface TreasureHuntImportRow {
  city: string;
  clueEnglish: string;
  answerEnglish: string;
  clueHindi: string;
  answerHindi: string;
  status: 'VALID' | 'INVALID';
  error: string | null;
}

export interface TreasureHuntImportPreview {
  summary: {
    total: number;
    valid: number;
    invalid: number;
    citiesCount: number;
  };
  data: TreasureHuntImportRow[];
}

function isBlankCell(value: unknown): boolean {
  return String(value ?? '').trim() === '';
}

function isBlankRow(row: readonly unknown[] | undefined): boolean {
  if (!row || row.length === 0) return true;
  return row.every(isBlankCell);
}

function requiredColumnsPresent(normalizedToColumn: Map<string, number>): void {
  for (const header of REQUIRED_HEADERS) {
    if (!normalizedToColumn.has(normalizeHeader(header))) {
      throw new ApiError(400, `Invalid Excel Format. Missing column: ${header}`);
    }
  }
}

function canonicalLabelFor(normalized: string): string {
  for (const header of REQUIRED_HEADERS) {
    if (normalizeHeader(header) === normalized) return header;
  }
  return normalized;
}

export function buildImportPreview(rawRows: readonly (readonly unknown[])[]): TreasureHuntImportPreview {
  let headerIndex = -1;
  for (let i = 0; i < rawRows.length; i++) {
    if (!isBlankRow(rawRows[i])) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    throw new ApiError(400, 'The selected Excel sheet is empty.');
  }

  const headerRow = rawRows[headerIndex].map((cell) => String(cell ?? ''));
  const normalizedToColumn = new Map<string, number>();

  headerRow.forEach((header, column) => {
    const normalized = normalizeHeader(header);
    if (!normalized) return;
    if (normalizedToColumn.has(normalized)) {
      throw new ApiError(400, `Duplicate column: ${canonicalLabelFor(normalized)}`);
    }
    normalizedToColumn.set(normalized, column);
  });

  requiredColumnsPresent(normalizedToColumn);

  const column = (normalized: string): number => normalizedToColumn.get(normalized) ?? -1;
  const cityColumn = column('city name');
  const clueEnglishColumn = column('riddle in english');
  const answerEnglishColumn = column('answer in english');
  const clueHindiColumn = column('riddle in hindi');
  const answerHindiColumn = column('answer in hindi');

  const cellAt = (row: readonly unknown[] | undefined, columnIndex: number): unknown =>
    row && columnIndex >= 0 ? row[columnIndex] : '';

  let validCount = 0;
  let invalidCount = 0;
  const citiesDetected = new Set<string>();
  const results: TreasureHuntImportRow[] = [];
  const seen = new Set<string>();
  let lastCity = '';

  for (let i = headerIndex + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    const excelRow = i + 1;

    const cityCell = cellAt(row, cityColumn);
    const clueEnglishCell = cellAt(row, clueEnglishColumn);
    const answerEnglishCell = cellAt(row, answerEnglishColumn);
    const clueHindiCell = cellAt(row, clueHindiColumn);
    const answerHindiCell = cellAt(row, answerHindiColumn);

    if (
      isBlankCell(cityCell) &&
      isBlankCell(clueEnglishCell) &&
      isBlankCell(answerEnglishCell) &&
      isBlankCell(clueHindiCell) &&
      isBlankCell(answerHindiCell)
    ) {
      continue;
    }

    const cityText = String(cityCell ?? '').trim();
    if (cityText) {
      lastCity = cityText;
    }
    const city = lastCity ? cityDisplayName(lastCity) : '';

    let status: 'VALID' | 'INVALID' = 'VALID';
    let error: string | null = null;

    if (!city) {
      status = 'INVALID';
      error = `Row ${excelRow}: City name is required because no previous city is available.`;
    } else if (isBlankCell(clueEnglishCell)) {
      status = 'INVALID';
      error = `Row ${excelRow}: Riddle in English is required`;
    } else if (isBlankCell(answerEnglishCell)) {
      status = 'INVALID';
      error = `Row ${excelRow}: Answer in English is required`;
    } else if (isBlankCell(clueHindiCell)) {
      status = 'INVALID';
      error = `Row ${excelRow}: Riddle in Hindi is required`;
    } else if (isBlankCell(answerHindiCell)) {
      status = 'INVALID';
      error = `Row ${excelRow}: Answer in Hindi is required`;
    }

    const clueEnglish = String(clueEnglishCell ?? '').trim();
    const answerEnglish = String(answerEnglishCell ?? '').trim();
    const clueHindi = String(clueHindiCell ?? '').trim();
    const answerHindi = String(answerHindiCell ?? '').trim();

    if (status === 'VALID') {
      const dedupeKey = [city, clueEnglish, answerEnglish, clueHindi, answerHindi]
        .join('|')
        .toLowerCase();
      if (seen.has(dedupeKey)) {
        status = 'INVALID';
        error = `Row ${excelRow}: Duplicate row (same city, riddle and answers as a previous row)`;
      } else {
        seen.add(dedupeKey);
      }
    }

    if (status === 'VALID') {
      validCount++;
      citiesDetected.add(city);
    } else {
      invalidCount++;
    }

    results.push({
      city,
      clueEnglish,
      answerEnglish,
      clueHindi,
      answerHindi,
      status,
      error,
    });
  }

  if (results.length === 0) {
    throw new ApiError(400, 'The selected Excel sheet is empty.');
  }

  return {
    summary: {
      total: results.length,
      valid: validCount,
      invalid: invalidCount,
      citiesCount: citiesDetected.size,
    },
    data: results,
  };
}

export function treasureHuntRowsFromWorkbook(fileBuffer: Buffer): Array<Array<unknown>> {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  } catch {
    throw new ApiError(
      400,
      'Could not read this Excel file. Make sure it is a valid .xlsx or .xls file.',
    );
  }

  if (workbook.SheetNames.length === 0) {
    throw new ApiError(400, 'The selected Excel sheet is empty.');
  }

  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!worksheet || !worksheet['!ref']) {
    throw new ApiError(400, 'The selected Excel sheet is empty.');
  }

  return XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    blankrows: true,
    raw: false,
  });
}

export function validateTreasureHuntExcelFile(fileBuffer: Buffer): TreasureHuntImportPreview {
  return buildImportPreview(treasureHuntRowsFromWorkbook(fileBuffer));
}