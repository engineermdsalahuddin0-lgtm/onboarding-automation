import { backend } from '../backend';
import { extensionOf, extractFile, ocrPages, type ExtractedFile } from './extract';
import { canonicalIndustry, emptyParsedCv, normalizeDate, parseCvText, type ParsedCv } from './heuristics';
import { canvasToJpeg, cropFraction, findPhotoOnPage, pickBestPhoto } from './photo';

export type { ParsedCv } from './heuristics';
export { ACCEPTED_EXTENSIONS, extensionOf, MIME_BY_EXTENSION } from './extract';

export type ParseMode = 'rules' | 'ai';

export interface ParsedFile {
  parsed: ParsedCv;
  method: 'rules' | 'ai';
  photo: Blob | null;
}

// Largest AI request the server takes, in bytes of JSON. Vercel refuses anything over 4.5 MB, so a Vercel
// build stays under that; a self-hosted server takes about 20 MB (vite.config.ts sets which one).
const MAX_REQUEST_BYTES = Number(import.meta.env.VITE_AI_MAX_REQUEST_BYTES) || 21_000_000;
const INLINE_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];

/** Base64 makes 3 bytes into 4 characters; the rest leaves room for the text and the JSON around it. */
function fitsInline(file: File): boolean {
  return INLINE_EXTENSIONS.includes(extensionOf(file.name)) && Math.ceil(file.size / 3) * 4 + 50_000 <= MAX_REQUEST_BYTES;
}

/** Cuts the text so the request stays under the limit. Bangla takes up to 3 bytes a character. */
function fitText(text: string, reservedBytes: number): string {
  const room = MAX_REQUEST_BYTES - reservedBytes - 20_000;
  if (room <= 0) return '';
  const bytes = new TextEncoder().encode(text).length;
  return bytes <= room ? text : text.slice(0, Math.floor(room / 3));
}

export async function aiHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  const token = await backend.accessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (backend.mode === 'demo') {
    const key = localStorage.getItem('demo-ai-key');
    if (key) headers['x-demo-ai-key'] = key;
  }
  return headers;
}

async function toBase64(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function requestAi(body: object): Promise<any> {
  // Bulk runs can hit the provider's per-minute limit, and waiting is usually all it takes.
  const delays = [2000, 6000, 15000];
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch('/api/ai/parse-cv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await aiHeaders()) },
      body: JSON.stringify(body),
    });
    if (response.ok) return (await response.json()).data;
    const failure = await response.json().catch(() => ({}));
    // 504 is a host timeout, such as Vercel stopping a function that ran past its limit.
    if ((response.status === 429 || response.status === 502 || response.status === 504) && attempt < delays.length) {
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      continue;
    }
    throw new Error(failure.message ?? `AI request failed (${response.status}).`);
  }
}

const TEXT_FIELDS = [
  'full_name', 'email', 'phone', 'alt_phone', 'address', 'permanent_address', 'father_name', 'mother_name',
  'spouse_name', 'gender', 'marital_status', 'religion', 'nationality', 'blood_group', 'national_id',
  'passport_no', 'tin_no', 'linkedin', 'current_designation', 'current_company', 'industry', 'present_salary',
  'expected_salary', 'notice_period', 'career_summary',
] as const;

const LIST_FIELDS = ['education', 'experience', 'training', 'skills', 'languages', 'references_list'] as const;

/** AI values win over rule values, except contact details that do not appear in the document. */
export function mergeAiResult(rules: ParsedCv, ai: any, documentText: string): ParsedCv {
  const merged: ParsedCv = { ...rules, sections: { ...rules.sections }, warnings: [...rules.warnings] };

  for (const field of TEXT_FIELDS) {
    const value = typeof ai?.[field] === 'string' ? ai[field].trim() : '';
    if (value) merged[field] = value;
  }
  for (const field of LIST_FIELDS) {
    if (Array.isArray(ai?.[field]) && ai[field].length > 0) (merged as any)[field] = ai[field];
  }
  merged.industry = canonicalIndustry(merged.industry) ?? merged.industry;
  if (typeof ai?.total_experience_years === 'number') merged.total_experience_years = ai.total_experience_years;
  if (typeof ai?.date_of_birth === 'string' && ai.date_of_birth) {
    merged.date_of_birth = normalizeDate(ai.date_of_birth) ?? merged.date_of_birth;
  }

  // With readable text available, contact details can be checked against the source. A number that
  // is not in the document is a misread at best, and HR would be calling a stranger.
  const digitsOf = (value: string) => value.replace(/\D/g, '');
  const documentDigits = digitsOf(documentText);
  if (documentDigits.length > 0) {
    const phoneDigits = digitsOf(merged.phone).replace(/^880/, '0').replace(/^88/, '');
    if (merged.phone && !documentDigits.includes(phoneDigits)) {
      merged.warnings.push(`AI read the mobile as ${merged.phone}, which is not in the CV text. Kept the number found in the text.`);
      merged.phone = rules.phone;
    }
    if (merged.email && !documentText.toLowerCase().includes(merged.email.toLowerCase())) {
      merged.warnings.push(`AI read the email as ${merged.email}, which is not in the CV text. Kept the email found in the text.`);
      merged.email = rules.email;
    }
  }

  if (Array.isArray(ai?.other_information)) {
    for (const item of ai.other_information) {
      if (item?.heading && item?.content) merged.sections[`AI: ${item.heading}`] = item.content;
    }
  }
  if (typeof ai?.full_text === 'string' && ai.full_text.length > merged.raw_text.length) merged.raw_text = ai.full_text;

  // Fields found now no longer need a "not found" warning.
  merged.warnings = merged.warnings.filter((warning) => {
    if (warning.startsWith('Name not found')) return !merged.full_name;
    if (warning.startsWith('Mobile number not found')) return !merged.phone;
    if (warning.startsWith('Email not found')) return !merged.email;
    if (warning.startsWith('Education could not')) return merged.education.length === 0;
    if (warning.startsWith('Work experience could not')) return merged.experience.length === 0;
    return true;
  });
  return merged;
}

async function findPhoto(extracted: ExtractedFile, ai: any): Promise<Blob | null> {
  const embedded = await pickBestPhoto(extracted.images);
  if (embedded) return canvasToJpeg(embedded);
  if (!extracted.firstPage) return null;

  const box = ai?.photo_box;
  if (Array.isArray(box) && box.length === 4 && box.every((n) => typeof n === 'number')) {
    const [top, left, bottom, right] = box.map((n: number) => Math.min(1, Math.max(0, n / 1000)));
    if (bottom - top > 0.02 && right - left > 0.02) {
      return canvasToJpeg(cropFraction(extracted.firstPage, { left, top, right, bottom }));
    }
  }
  const region = findPhotoOnPage(extracted.firstPage);
  return region ? canvasToJpeg(region) : null;
}

export async function parseCvFile(file: File, mode: ParseMode): Promise<ParsedFile> {
  const extracted = await extractFile(file);
  let text = extracted.text;
  const warnings = [...extracted.warnings];
  let ai: any = null;
  let method: 'rules' | 'ai' = 'rules';

  let ocrDone = false;
  const runOcr = async () => {
    ocrDone = true;
    if (extracted.ocrPages.length === 0) return;
    try {
      text = await ocrPages(extracted.ocrPages);
      warnings.push('Scanned CV read with OCR. Please check the details, especially numbers.');
    } catch (error) {
      warnings.push(`OCR failed on this scan (${(error as Error).message}).`);
    }
  };

  if (mode === 'ai') {
    const canSendFile = fitsInline(file);
    // A scan too large to send has no text either; read it here so the AI still gets something.
    if (extracted.scanned && !canSendFile) await runOcr();
    try {
      const mimeType = extensionOf(file.name) === 'pdf' ? 'application/pdf' : file.type || 'image/jpeg';
      const fileBase64 = canSendFile ? await toBase64(file) : undefined;
      const sentText = fitText(text, fileBase64?.length ?? 0);
      ai = await requestAi({
        text: sentText || undefined,
        fileName: file.name,
        ...(fileBase64 ? { fileBase64, mimeType } : {}),
      });
      method = 'ai';
    } catch (error) {
      warnings.push(`AI could not read this CV (${(error as Error).message}). Used the rule-based reader instead.`);
    }
  }

  // Scans have no text layer: read them with OCR, unless AI already returned the document's text.
  if (!ocrDone && extracted.scanned && !(typeof ai?.full_text === 'string' && ai.full_text.length > 50)) {
    await runOcr();
  }

  const rules = text.trim() ? parseCvText(text, file.name) : parseCvText('', file.name);
  const parsed = ai ? mergeAiResult(rules, ai, extracted.scanned ? '' : text) : rules;
  parsed.warnings = [...warnings, ...parsed.warnings];

  const photo = await findPhoto(extracted, ai);
  if (!photo) parsed.warnings.push('No photo found in this CV.');
  return { parsed, method, photo };
}

export { emptyParsedCv };

/** Expands .zip files and drops anything that is not a CV, so a whole folder can be dropped at once. */
export async function expandUploads(files: File[]): Promise<{ accepted: File[]; skipped: string[] }> {
  const { ACCEPTED_EXTENSIONS } = await import('./extract');
  const accepted: File[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    const extension = extensionOf(file.name);
    if (extension === 'zip') {
      const { default: JSZip } = await import('jszip');
      const zip = await JSZip.loadAsync(file);
      for (const entry of Object.values(zip.files).slice(0, 2000)) {
        if (entry.dir || /(^|\/)(__MACOSX|\.)/.test(entry.name)) continue;
        const name = entry.name.split('/').pop()!;
        if (!ACCEPTED_EXTENSIONS.includes(extensionOf(name))) {
          skipped.push(name);
          continue;
        }
        accepted.push(new File([await entry.async('blob')], name));
      }
    } else if (ACCEPTED_EXTENSIONS.includes(extension)) {
      accepted.push(file);
    } else {
      skipped.push(file.name);
    }
  }
  return { accepted, skipped };
}
