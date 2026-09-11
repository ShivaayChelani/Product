import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  REQUIRED_HEADERS,
  buildImportPreview,
  normalizeHeader,
  validateTreasureHuntExcelFile,
} from '../modules/riddles/riddles-import';

const H = REQUIRED_HEADERS as readonly string[];

type RowLike = Array<string | null>;

function validRow(
  city: string | null,
  clueEn: string | null,
  ansEn: string | null,
  clueHi: string | null,
  ansHi: string | null,
): RowLike {
  return [city, clueEn, ansEn, clueHi, ansHi];
}

function makeRows(headers: string[], data: Array<RowLike>): Array<Array<unknown>> {
  return [headers, ...data.map((r) => r.map((c) => c ?? ''))];
}

function workbookBufferFromAOA(data: Array<Array<string | null>>): Buffer {
  const worksheet = XLSX.utils.aoa_to_sheet(data.map((r) => r.map((c) => c ?? '')));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Riddles');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

describe('normalizeHeader', () => {
  it('trims, collapses whitespace and lowercases for comparison only', () => {
    expect(normalizeHeader('  RiDDle   in ENGLISH  ')).toBe('riddle in english');
    expect(normalizeHeader('City name')).toBe('city name');
    expect(normalizeHeader(' CITY NAME ')).toBe('city name');
    expect(normalizeHeader('\uFEFFAnswer in Hindi')).toBe('answer in hindi');
  });
});

describe('header handling', () => {
  it('accepts exact valid headers', () => {
    const preview = buildImportPreview(
      makeRows([...H], [
        validRow('Alipurduar', 'Riddle one en', 'Answer one en', 'Riddle one hi', 'Answer one hi'),
        validRow('Cooch Behar', 'Riddle two en', 'Answer two en', 'Riddle two hi', 'Answer two hi'),
      ]),
    );
    expect(preview.summary).toEqual({ total: 2, valid: 2, invalid: 0, citiesCount: 2 });
    expect(preview.data[0]).toMatchObject({
      city: 'Alipurduar',
      status: 'VALID',
      error: null,
    });
    expect(preview.data[1]).toMatchObject({
      city: 'Cooch Behar',
      status: 'VALID',
      error: null,
    });
  });

  it('accepts headers with leading spaces (the production " Riddle in English" case)', () => {
    const preview = buildImportPreview(
      makeRows(
        ['City name', ' Riddle in English', 'Answer in English', 'Riddle in Hindi', 'Answer in Hindi'],
        [validRow('Alipurduar', 'R1', 'A1', 'H1', 'AH1')],
      ),
    );
    expect(preview.summary.valid).toBe(1);
    expect(preview.data[0].clueEnglish).toBe('R1');
  });

  it('accepts headers with trailing spaces', () => {
    const preview = buildImportPreview(
      makeRows(
        ['City name ', 'Riddle in English ', 'Answer in English ', 'Riddle in Hindi ', 'Answer in Hindi '],
        [validRow('Alipurduar', 'R1', 'A1', 'H1', 'AH1')],
      ),
    );
    expect(preview.summary.valid).toBe(1);
  });

  it('accepts headers with mixed casing', () => {
    const preview = buildImportPreview(
      makeRows(
        ['CiTy NaMe', 'RiDDle in ENGLISH', 'ANSWER in english', 'riddle IN hindi', 'answer IN HINDI'],
        [validRow('Alipurduar', 'R1', 'A1', 'H1', 'AH1')],
      ),
    );
    expect(preview.summary.valid).toBe(1);
  });

  it('accepts headers with both whitespace and mixed casing', () => {
    const preview = buildImportPreview(
      makeRows(
        ['  CiTy   NaMe  ', '  RIDDLE IN  ENGLISH ', ' Answer  in English ', 'RIDDLE IN  HINDI ', '  ANSWER IN HINDI  '],
        [validRow('Alipurduar', 'R1', 'A1', 'H1', 'AH1')],
      ),
    );
    expect(preview.summary.valid).toBe(1);
  });

  it('rejects a missing required header', () => {
    const headers = ['City name', 'Riddle in English', 'Answer in English', 'Riddle in Hindi'];
    expect(() =>
      buildImportPreview(makeRows(headers, [validRow('Alipurduar', 'R1', 'A1', 'H1', 'AH1')])),
    ).toThrow(/Invalid Excel Format\. Missing column: Answer in Hindi/);
  });

  it('rejects a wrong header name instead of silently accepting it', () => {
    const headers = ['City name', 'Riddle', 'Answer in English', 'Riddle in Hindi', 'Answer in Hindi'];
    expect(() =>
      buildImportPreview(makeRows(headers, [validRow('Alipurduar', 'R1', 'A1', 'H1', 'AH1')])),
    ).toThrow(/Invalid Excel Format\. Missing column: Riddle in English/);
  });

  it('rejects a duplicate logical header after normalization', () => {
    const headers = ['City name', 'CITY NAME', 'Riddle in English', 'Answer in English', 'Riddle in Hindi', 'Answer in Hindi'];
    expect(() =>
      buildImportPreview(makeRows(headers, [validRow('Alipurduar', 'R1', 'A1', 'H1', 'AH1')])),
    ).toThrow(/Duplicate column: City name/);
  });

  it('rejects an empty worksheet', () => {
    expect(() => buildImportPreview([])).toThrow(/The selected Excel sheet is empty/);
    expect(() => buildImportPreview([[]])).toThrow(/The selected Excel sheet is empty/);
    expect(() =>
      buildImportPreview([
        ['', '', '', '', ''],
        ['', '', '', '', ''],
      ]),
    ).toThrow(/The selected Excel sheet is empty/);
  });

  it('tolerates extra unexpected columns beyond the five-column contract', () => {
    const headers = [...H, 'Notes', '', '__EMPTY'];
    const preview = buildImportPreview(
      makeRows(headers, [
        validRow('Alipurduar', 'R1', 'A1', 'H1', 'AH1').concat('ignored', 'ignored', 'ignored'),
      ]),
    );
    expect(preview.summary.valid).toBe(1);
  });
});

describe('grouped city forward-fill', () => {
  it('keeps the city on rows where it is repeated', () => {
    const preview = buildImportPreview(
      makeRows([...H], [
        validRow('Alipurduar', 'R1', 'A1', 'H1', 'AH1'),
        validRow('Cooch Behar', 'R2', 'A2', 'H2', 'AH2'),
        validRow('Jalpaiguri', 'R3', 'A3', 'H3', 'AH3'),
      ]),
    );
    expect(preview.data.map((r) => r.city)).toEqual(['Alipurduar', 'Cooch Behar', 'Jalpaiguri']);
    expect(preview.summary.valid).toBe(3);
  });

  it('forward-fills a blank city from the immediately previous city', () => {
    const preview = buildImportPreview(
      makeRows([...H], [
        validRow('Alipurduar', 'R1', 'A1', 'H1', 'AH1'),
        validRow('', 'R2', 'A2', 'H2', 'AH2'),
        validRow('', 'R3', 'A3', 'H3', 'AH3'),
      ]),
    );
    expect(preview.data.map((r) => r.city)).toEqual(['Alipurduar', 'Alipurduar', 'Alipurduar']);
    expect(preview.data.every((r) => r.status === 'VALID')).toBe(true);
  });

  it('supports multiple city groups with blank rows between them', () => {
    const preview = buildImportPreview(
      makeRows([...H], [
        validRow('Alipurduar', 'R1', 'A1', 'H1', 'AH1'),
        validRow('', 'R2', 'A2', 'H2', 'AH2'),
        validRow('Cooch Behar', 'R3', 'A3', 'H3', 'AH3'),
        validRow('', 'R4', 'A4', 'H4', 'AH4'),
        validRow('Jalpaiguri', 'R5', 'A5', 'H5', 'AH5'),
        validRow('', 'R6', 'A6', 'H6', 'AH6'),
      ]),
    );
    expect(preview.data.map((r) => r.city)).toEqual([
      'Alipurduar',
      'Alipurduar',
      'Cooch Behar',
      'Cooch Behar',
      'Jalpaiguri',
      'Jalpaiguri',
    ]);
    expect(preview.summary).toEqual({ total: 6, valid: 6, invalid: 0, citiesCount: 3 });
  });

  it('fails the first data row when its city is blank, with a row-specific error', () => {
    const preview = buildImportPreview(
      makeRows([...H], [
        validRow('', 'R1', 'A1', 'H1', 'AH1'),
      ]),
    );
    expect(preview.data[0].status).toBe('INVALID');
    expect(preview.data[0].error).toBe(
      'Row 2: City name is required because no previous city is available.',
    );
  });

  it('a blank city does not mask missing riddle/answer validation', () => {
    const preview = buildImportPreview(
      makeRows([...H], [
        validRow('Alipurduar', 'R1', 'A1', 'H1', 'AH1'),
        validRow('', '', 'A2', 'H2', 'AH2'),
      ]),
    );
    expect(preview.data[1].status).toBe('INVALID');
    expect(preview.data[1].error).toBe('Row 3: Riddle in English is required');
  });
});

describe('required cell validation', () => {
  const headers = [...H];
  const base = validRow('Alipurduar', 'R1', 'A1', 'H1', 'AH1');

  it('flags a blank English riddle', () => {
    const preview = buildImportPreview(
      makeRows(headers, [validRow('Alipurduar', '', 'A1', 'H1', 'AH1'), base]),
    );
    expect(preview.data[0].status).toBe('INVALID');
    expect(preview.data[0].error).toBe('Row 2: Riddle in English is required');
  });

  it('flags a blank English answer', () => {
    const preview = buildImportPreview(
      makeRows(headers, [validRow('Alipurduar', 'R1', '', 'H1', 'AH1'), base]),
    );
    expect(preview.data[0].status).toBe('INVALID');
    expect(preview.data[0].error).toBe('Row 2: Answer in English is required');
  });

  it('flags a blank Hindi riddle', () => {
    const preview = buildImportPreview(
      makeRows(headers, [validRow('Alipurduar', 'R1', 'A1', '', 'AH1'), base]),
    );
    expect(preview.data[0].status).toBe('INVALID');
    expect(preview.data[0].error).toBe('Row 2: Riddle in Hindi is required');
  });

  it('flags a blank Hindi answer', () => {
    const preview = buildImportPreview(
      makeRows(headers, [validRow('Alipurduar', 'R1', 'A1', 'H1', ''), base]),
    );
    expect(preview.data[0].status).toBe('INVALID');
    expect(preview.data[0].error).toBe('Row 2: Answer in Hindi is required');
  });

  it('treats whitespace-only cells as missing', () => {
    const preview = buildImportPreview(
      makeRows(headers, [validRow('Alipurduar', '   ', 'A1', 'H1', 'AH1')]),
    );
    expect(preview.data[0].status).toBe('INVALID');
    expect(preview.data[0].error).toBe('Row 2: Riddle in English is required');
  });

  it('treats whitespace-only cities as blank (forward-fill)', () => {
    const preview = buildImportPreview(
      makeRows(headers, [
        validRow('Alipurduar', 'R1', 'A1', 'H1', 'AH1'),
        validRow('   ', 'R2', 'A2', 'H2', 'AH2'),
      ]),
    );
    expect(preview.data[1].city).toBe('Alipurduar');
    expect(preview.data[1].status).toBe('VALID');
  });
});

describe('sequence preservation', () => {
  it('preserves Excel row order as the riddle sequence after city forward-fill', () => {
    const preview = buildImportPreview(
      makeRows([...H], [
        validRow('Alipurduar', 'R1', 'A1', 'H1', 'AH1'),
        validRow('', 'R2', 'A2', 'H2', 'AH2'),
        validRow('Cooch Behar', 'R3', 'A3', 'H3', 'AH3'),
        validRow('', 'R4', 'A4', 'H4', 'AH4'),
        validRow('Jalpaiguri', 'R5', 'A5', 'H5', 'AH5'),
        validRow('', 'R6', 'A6', 'H6', 'AH6'),
      ]),
    );
    expect(preview.data.map((r) => r.clueEnglish)).toEqual(['R1', 'R2', 'R3', 'R4', 'R5', 'R6']);
    expect(preview.data.map((r) => r.city)).toEqual([
      'Alipurduar',
      'Alipurduar',
      'Cooch Behar',
      'Cooch Behar',
      'Jalpaiguri',
      'Jalpaiguri',
    ]);
    expect(preview.data.every((r) => r.status === 'VALID')).toBe(true);
  });
});

describe('real Excel file import', () => {
  it('successfully previews a grouped-city workbook with leading-space headers', () => {
    const buffer = workbookBufferFromAOA([
      ['City name', ' Riddle in English', 'Answer in English', 'Riddle in Hindi', 'Answer in Hindi'],
      ['Alipurduar', 'R1', 'A1', 'H1', 'AH1'],
      ['', 'R2', 'A2', 'H2', 'AH2'],
      ['', 'R3', 'A3', 'H3', 'AH3'],
      ['Cooch Behar', 'R4', 'A4', 'H4', 'AH4'],
      ['', 'R5', 'A5', 'H5', 'AH5'],
    ]);
    const preview = validateTreasureHuntExcelFile(buffer);
    expect(preview.summary).toEqual({ total: 5, valid: 5, invalid: 0, citiesCount: 2 });
    expect(preview.data.map((r) => r.city)).toEqual([
      'Alipurduar',
      'Alipurduar',
      'Alipurduar',
      'Cooch Behar',
      'Cooch Behar',
    ]);
    expect(preview.data.map((r) => r.clueEnglish)).toEqual(['R1', 'R2', 'R3', 'R4', 'R5']);
    expect(preview.data.every((r) => r.status === 'VALID')).toBe(true);
  });

  it('rejects a header-only workbook as an empty sheet', () => {
    const buffer = workbookBufferFromAOA([[...H]]);
    expect(() => validateTreasureHuntExcelFile(buffer)).toThrow(
      /The selected Excel sheet is empty/,
    );
  });

  it('rejects a garbage/non-Excel stream', () => {
    expect(() =>
      validateTreasureHuntExcelFile(
        Buffer.from('this is definitely not an excel file, just plain text bytes'),
      ),
    ).toThrow();
  });
});