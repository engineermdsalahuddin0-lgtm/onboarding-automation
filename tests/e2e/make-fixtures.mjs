// Builds sample CV files (all fictional people) for the browser test.
import JSZip from 'jszip';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const FIXTURES = join(here, '..', '.tmp', 'fixtures');
const images = join(here, '..', '..', 'src', 'assets', 'images');

// pdf-lib reads the underlying ArrayBuffer from offset 0, so each image needs a buffer of its own.
const face = new Uint8Array(readFileSync(join(images, 'candidate_placeholder_avatar_1793850304562.jpg')));
const logo = new Uint8Array(readFileSync(join(images, 'bitopi_group_logo_for_tab.jpg')));

const CV_LINES = (name, phone, email) => [
  [name.toUpperCase(), 16],
  ['House 12, Road 3, Mirpur-10, Dhaka', 10],
  [`Mobile No: ${phone}`, 10],
  [`e-mail: ${email}`, 10],
  ['', 10],
  ['Career Objective:', 12],
  ['To build a career in human resources with a growing organization.', 10],
  ['', 10],
  ['Employment History:', 12],
  ['1. HR Executive (January 1, 2021 - Continuing)', 10],
  ['Sample Apparels Ltd.', 10],
  ['Handled recruitment and joining documents for 300 staff.', 10],
  ['', 10],
  ['Academic Qualification:', 12],
  ['MBA    Human Resource    University of Dhaka    CGPA:3.50 out of 4    2018', 10],
  ['BBA    Management    National University    CGPA:3.20 out of 4    2016', 10],
  ['', 10],
  ['Special Qualification:', 12],
  ['MS Office, HRIS, Payroll Management', 10],
  ['', 10],
  ['Personal Details :', 12],
  ["Father's Name : Abdul Malek", 10],
  ["Mother's Name : Rahima Begum", 10],
  ['Date of Birth : 14 March 1996', 10],
  ['Gender : Male', 10],
  ['National Id No : 1995269261012', 10],
  ['Permanent Address : Village Rampur, Comilla', 10],
];

async function textPdf(name, phone, email, image) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let y = 790;
  for (const [text, size] of CV_LINES(name, phone, email)) {
    if (text) page.drawText(text, { x: 50, y, size, font, color: rgb(0, 0, 0) });
    y -= size + 7;
  }
  if (image === 'face') {
    const jpg = await doc.embedJpg(face);
    page.drawImage(jpg, { x: 450, y: 700, width: 95, height: 115 });
  }
  if (image === 'logo') {
    const jpg = await doc.embedJpg(logo);
    page.drawImage(jpg, { x: 480, y: 760, width: 60, height: 60 });
  }
  return Buffer.from(await doc.save());
}

async function docx(name, phone, email) {
  const paragraph = (text) => `<w:p><w:r><w:t xml:space="preserve">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</w:t></w:r></w:p>`;
  const body = CV_LINES(name, phone, email).slice(0, 1).concat(CV_LINES(name, phone, email).slice(4)).map(([text]) => paragraph(text)).join('');
  const contactBox = `<w:p><w:r><w:pict><v:shape xmlns:v="urn:schemas-microsoft-com:vml"><v:textbox><w:txbxContent>${paragraph(`Mobile No: ${phone}`)}${paragraph(`e-mail: ${email}`)}</w:txbxContent></v:textbox></v:shape></w:pict></w:r></w:p>`;
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}${contactBox}</w:body></w:document>`);
  zip.file('word/media/image1.jpg', face);
  return zip.generateAsync({ type: 'nodebuffer' });
}

export async function makeFixtures() {
  mkdirSync(FIXTURES, { recursive: true });
  writeFileSync(join(FIXTURES, 'pdf-with-photo.pdf'), await textPdf('Rupa Akter', '01711-234501', 'rupa@example.com', 'face'));
  writeFileSync(join(FIXTURES, 'pdf-with-logo-only.pdf'), await textPdf('Polash Roy', '01811-234502', 'polash@example.com', 'logo'));
  writeFileSync(join(FIXTURES, 'word-with-photo.docx'), await docx('Mitu Sarker', '01911-234503', 'mitu@example.com'));
  writeFileSync(join(FIXTURES, 'same-person-again.pdf'), await textPdf('Rupa Akter', '+880 1711 234501', 'rupa@example.com', 'face'));
  writeFileSync(join(FIXTURES, 'cv-for-public-form.pdf'), await textPdf('Hena Begum', '01611-234504', 'hena@example.com', 'face'));
  return FIXTURES;
}

/** Wraps a JPEG of a full page in a PDF with no text layer, which is what a scanner produces. */
export async function scannedPdf(jpegBytes, fileName) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const jpg = await doc.embedJpg(new Uint8Array(jpegBytes));
  page.drawImage(jpg, { x: 0, y: 0, width: 595, height: 842 });
  const path = join(FIXTURES, fileName);
  writeFileSync(path, Buffer.from(await doc.save()));
  return path;
}

export const FACE_BASE64 = Buffer.from(face).toString('base64');
