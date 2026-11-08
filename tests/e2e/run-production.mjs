// Production build + real supabase-js client + real schema.sql (see fake-supabase.mjs) + the real
// Content-Security-Policy. Run with: node tests/e2e/run-production.mjs
import { execSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startFakeSupabase } from './fake-supabase.mjs';
import { FACE_BASE64, FIXTURES, makeFixtures, scannedPdf } from './make-fixtures.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const shots = join(root, 'tests', '.tmp', 'shots');
mkdirSync(shots, { recursive: true });

const SUPABASE_PORT = 54399;
const APP_PORT = 3200;
const BASE = `http://localhost:${APP_PORT}`;
const SERVICE_KEY = 'test-service-role-key';
const env = {
  ...process.env,
  VITE_SUPABASE_URL: `http://localhost:${SUPABASE_PORT}`,
  VITE_SUPABASE_ANON_KEY: 'test-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  GEMINI_API_KEY: '',
  GEMINI_BASE_URL: `http://localhost:${SUPABASE_PORT}`,
  PORT: String(APP_PORT),
  NODE_ENV: 'production',
};

const results = [];
const problems = [];
function check(label, ok, detail = '') {
  results.push({ label, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
}

let appServer;
let supabase;

async function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch {
      /* try the next browser */
    }
  }
  throw new Error('Neither Edge nor Chrome is available.');
}

function watch(page, label) {
  page.on('pageerror', (error) => problems.push(`${label} pageerror: ${error.message}`));
  page.on('console', (message) => {
    const text = message.text();
    // Realtime needs a websocket server the stand-in does not have; that is not an app fault.
    if (message.type() === 'error' && !/WebSocket|realtime|favicon|the server responded with a status of 4/i.test(text)) {
      problems.push(`${label} console: ${text}`);
    }
    if (/Content Security Policy|Refused to/i.test(text)) problems.push(`${label} CSP: ${text}`);
  });
}

async function signIn(page, email, password) {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

async function main() {
  supabase = await startFakeSupabase({ port: SUPABASE_PORT, schemaPath: join(root, 'supabase', 'schema.sql'), serviceKey: SERVICE_KEY });
  await supabase.addUser('admin@bitopi.test', 'admin-pass');
  await supabase.addUser('hr@bitopi.test', 'hr-pass');
  await supabase.addUser('viewer@bitopi.test', 'viewer-pass');
  await supabase.addUser('new@bitopi.test', 'new-pass');
  await makeFixtures();

  console.log('Building for production…');
  execSync('npm run build', { cwd: root, env, stdio: 'pipe' });
  appServer = spawn(process.execPath, ['dist-server/index.js'], { cwd: root, env, stdio: ['ignore', 'inherit', 'inherit'] });
  for (let i = 0; i < 40; i += 1) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  const headers = (await fetch(BASE)).headers;
  check('Security headers are sent', Boolean(headers.get('content-security-policy')) && headers.get('x-powered-by') === null);
  const anonymousAi = await fetch(`${BASE}/api/ai/parse-cv`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"text":"x"}' });
  check('AI endpoint rejects anonymous callers', anonymousAi.status === 401, String(anonymousAi.status));
  const spoofedAi = await fetch(`${BASE}/api/ai/status`, { headers: { 'x-demo-ai-key': 'stolen' } });
  check('Demo key header is ignored when Supabase is configured', spoofedAi.status === 401, String(spoofedAi.status));

  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, permissions: ['clipboard-read', 'clipboard-write'] });
  context.setDefaultTimeout(20000);
  const page = await context.newPage();
  watch(page, 'admin');

  // --- Sign in
  await page.goto(BASE);
  await signIn(page, 'admin@bitopi.test', 'wrong');
  await page.getByText('Invalid login credentials').waitFor();
  check('Wrong password is refused', true);
  await signIn(page, 'admin@bitopi.test', 'admin-pass');
  await page.getByRole('heading', { name: 'Dashboard' }).waitFor();
  check('First account signs in as admin', (await supabase.db.query("select role from public.profiles where email = 'admin@bitopi.test'")).rows[0].role === 'admin');
  check('No demo banner in production', await page.getByText('Demo mode').count() === 0);
  await page.screenshot({ path: join(shots, 'prod-01-empty-dashboard.png'), fullPage: true });

  // --- Default wording was seeded into the empty database
  const templates = await supabase.db.query('select key from public.message_templates order by key');
  check('Default messages seeded on first login', templates.rows.length === 3);
  const docs = await supabase.db.query('select key from public.document_templates');
  check('Default documents seeded on first login', docs.rows.length === 6);
  const settings = (await supabase.db.query('select * from public.settings')).rows[0];
  check('Company defaults seeded', settings.corporate_address.includes('823/3') && settings.media.includes('BDJobs'));

  // --- Settings save through RLS
  await page.goto(`${BASE}/settings`);
  await page.getByRole('heading', { name: 'Settings' }).waitFor();
  await page.getByLabel('Name', { exact: true }).fill('Test Signatory');
  await page.getByLabel('Designation', { exact: true }).fill('Head of HR');
  await page.getByLabel('Mobile', { exact: true }).fill('01700000000');
  await page.getByRole('button', { name: 'Save company settings' }).click();
  await page.getByText('Company settings saved.').waitFor();
  check('Admin saves company settings', (await supabase.db.query('select signatory_name from public.settings')).rows[0].signatory_name === 'Test Signatory');

  // --- AI key: saved through the database, read by the server with the service role
  await page.getByRole('tab', { name: 'AI' }).click();
  await page.getByText('AI is not set up').waitFor();
  await page.getByLabel('Gemini API key').fill('bad-key');
  await page.getByRole('button', { name: 'Save key' }).click();
  await page.getByText(/AI is ready/).waitFor();
  await page.getByText('Key saved, ending in -key').waitFor();
  check('Saved AI key reaches the server but not the browser', await page.getByLabel('Gemini API key').inputValue() === '');

  // --- Team roles
  await page.getByRole('tab', { name: 'Team' }).click();
  await page.getByLabel('Role of hr').selectOption('hr');
  await page.getByText(/hr is now hr/).waitFor();
  await page.getByLabel('Role of viewer').selectOption('viewer');
  await page.getByText(/viewer is now viewer/).waitFor();
  check('Admin assigns roles', true);

  // --- Block A through real tables
  await page.goto(`${BASE}/requisitions`);
  await page.getByRole('button', { name: 'Add designation' }).click();
  const designation = page.getByRole('dialog', { name: 'Add designation' });
  await designation.getByLabel('Designation').fill('Jr. Executive');
  await designation.getByLabel('Approved headcount').fill('3');
  await designation.getByRole('button', { name: 'Save' }).click();
  await designation.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Raise requisition' }).click();
  const requisition = page.getByRole('dialog', { name: 'New requisition' });
  await requisition.getByLabel('Job description').fill('Handle joining documents.');
  await requisition.getByRole('button', { name: 'Save' }).click();
  await requisition.waitFor({ state: 'detached' });
  await page.getByRole('tab', { name: /^Requisitions/ }).click();
  const ref = (await supabase.db.query('select ref_no from public.requisitions')).rows[0].ref_no;
  check('Requisition gets its reference from the database', /^REQ-\d{4}-0001$/.test(ref), ref);
  await page.getByRole('button', { name: `Record job posting for ${ref}` }).click();
  const posting = page.getByRole('dialog', { name: 'Record a job posting' });
  await posting.getByRole('button', { name: 'Save' }).click();
  await posting.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Create bucket' }).click();
  const bucketForm = page.getByRole('dialog', { name: 'New CV bucket' });
  await bucketForm.getByRole('button', { name: 'Create bucket' }).click();
  await page.getByRole('heading', { name: 'Jr. Executive' }).waitFor();
  check('CV bucket created from the requisition', true);
  const bucketCode = (await supabase.db.query('select code from public.cv_buckets')).rows[0].code;

  // --- Scanned file, for checking OCR under the production CSP
  const scanBytes = await page.evaluate(async (faceBase64) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1240;
    canvas.height = 1754;
    const c = canvas.getContext('2d');
    c.fillStyle = '#fff';
    c.fillRect(0, 0, canvas.width, canvas.height);
    c.fillStyle = '#000';
    c.font = 'bold 44px Arial';
    c.fillText('KARIM MIAH', 100, 140);
    c.font = '30px Arial';
    ['Mobile: 01511-234505', 'Email: karim@example.com', '', 'Academic Qualification:', 'BBA Management, National University 2019'].forEach((line, i) => c.fillText(line, 100, 220 + i * 46));
    const image = new Image();
    image.src = `data:image/jpeg;base64,${faceBase64}`;
    await image.decode();
    c.drawImage(image, 930, 80, 220, 270);
    return Array.from(new Uint8Array(await (await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))).arrayBuffer()));
  }, FACE_BASE64);
  const scanPath = await scannedPdf(Buffer.from(scanBytes), 'scanned-cv.pdf');

  // --- Bulk upload into private storage
  await page.getByRole('main').getByRole('button', { name: 'Upload CVs' }).first().click();
  const upload = page.getByRole('dialog', { name: 'Upload CVs' });
  await upload.locator('input[type=file]').setInputFiles([join(FIXTURES, 'pdf-with-photo.pdf'), join(FIXTURES, 'word-with-photo.docx'), scanPath]);
  await upload.getByLabel('Name in scanned-cv.pdf').waitFor({ timeout: 120000 });
  await upload.getByLabel('Name in word-with-photo.docx').waitFor({ timeout: 30000 });
  await upload.getByLabel('Name in pdf-with-photo.pdf').waitFor({ timeout: 30000 });
  check('PDF worker runs under the production CSP', (await upload.getByLabel('Name in pdf-with-photo.pdf').inputValue()) === 'Rupa Akter');
  check('OCR runs under the production CSP', /karim miah/i.test(await upload.getByLabel('Name in scanned-cv.pdf').inputValue()));
  await upload.getByRole('button', { name: /^Import 3 CVs/ }).click();
  await upload.waitFor({ state: 'detached', timeout: 30000 });
  await page.getByRole('row', { name: /Rupa Akter/ }).waitFor();

  const saved = (await supabase.db.query(`select full_name, phone, email, father_name, date_of_birth, national_id, education, skills, raw_text, sections, cv_path, photo_path, parse_method from public.candidates where full_name = 'Rupa Akter'`)).rows[0];
  check('CV details stored in Postgres', saved.father_name === 'Abdul Malek' && saved.national_id === '1995269261012' && saved.phone === '01711234501');
  check('Education stored as structured rows', saved.education.length === 2 && saved.education[0].institution === 'University of Dhaka', JSON.stringify(saved.education[0]));
  check('Skills stored as an array', saved.skills.includes('HRIS'));
  check('Complete CV text and sections stored', saved.raw_text.includes('Career Objective') && Object.keys(saved.sections).length > 2);
  check('Original CV and photo stored in private storage', supabase.files.has(saved.cv_path) && supabase.files.has(saved.photo_path), `${saved.cv_path}`);
  const storedPdf = supabase.files.get(saved.cv_path).bytes;
  check('Stored CV is an intact PDF', storedPdf.subarray(0, 5).toString() === '%PDF-', storedPdf.subarray(0, 5).toString());
  const avatar = page.getByRole('row', { name: /Rupa Akter/ }).locator('img');
  await avatar.waitFor();
  check('Photo loads through a signed link under the CSP', await avatar.evaluate((img) => img.decode().then(() => img.naturalWidth > 0).catch(() => false)));
  await page.screenshot({ path: join(shots, 'prod-02-bucket.png'), fullPage: true });

  // --- AI with a key Google will refuse: must fall back honestly, not invent data
  await page.getByRole('main').getByRole('button', { name: 'Upload CVs' }).first().click();
  const aiUpload = page.getByRole('dialog', { name: 'Upload CVs' });
  await aiUpload.getByText('With AI (Gemini)').click();
  await aiUpload.locator('input[type=file]').setInputFiles(join(FIXTURES, 'pdf-with-logo-only.pdf'));
  await aiUpload.getByLabel('Name in pdf-with-logo-only.pdf').waitFor({ timeout: 90000 });
  check('AI failure falls back to the built-in reader', (await aiUpload.getByLabel('Name in pdf-with-logo-only.pdf').inputValue()) === 'Polash Roy');
  await aiUpload.getByText(/things? to check/).click();
  check('AI failure is reported, not hidden', await aiUpload.getByText(/AI could not read this CV/).count() === 1);
  await aiUpload.getByRole('button', { name: 'Cancel' }).click();
  await aiUpload.waitFor({ state: 'detached' });

  // --- AI working: a good key, on a text PDF and on a scan
  const currentUrl = page.url();
  await page.goto(`${BASE}/settings`);
  await page.getByRole('tab', { name: 'AI' }).click();
  await page.getByLabel('Gemini API key').fill('good-key-1234');
  await page.getByRole('button', { name: 'Save key' }).click();
  await page.getByText('Key saved, ending in 1234').waitFor();
  await page.goto(currentUrl);
  await page.getByRole('table').waitFor();

  supabase.geminiReplies.push({
    full_name: 'Polash Chandra Roy',
    phone: '01999999999',
    email: 'polash@example.com',
    father_name: 'Nikhil Roy',
    education: [{ degree: 'BSc in Textile', institution: 'BUTEX', result: '3.8', year: '2017' }],
    experience: [{ company: 'Sample Knit Ltd.', role: 'Merchandiser', duration: '2018 - Present', details: 'Handled buyers.' }],
    skills: ['Sourcing'],
    other_information: [{ heading: 'Awards', content: 'Best employee 2020' }],
  });
  await page.getByRole('main').getByRole('button', { name: 'Upload CVs' }).first().click();
  const aiGood = page.getByRole('dialog', { name: 'Upload CVs' });
  await aiGood.getByText('With AI (Gemini)').click();
  await aiGood.locator('input[type=file]').setInputFiles(join(FIXTURES, 'pdf-with-logo-only.pdf'));
  await aiGood.getByLabel('Name in pdf-with-logo-only.pdf').waitFor({ timeout: 60000 });
  check('AI: value from the AI is used', (await aiGood.getByLabel('Name in pdf-with-logo-only.pdf').inputValue()) === 'Polash Chandra Roy');
  check('AI: a mobile not in the CV is refused', (await aiGood.getByLabel('Mobile in pdf-with-logo-only.pdf').inputValue()) === '01811234502');
  const call = supabase.geminiCalls.at(-1);
  check('AI: server uses the key saved in Settings', call.key === 'good-key-1234');
  const parts = call.body.contents[0].parts;
  check('AI: the PDF itself is sent, along with its text', parts.some((p) => p.inlineData?.mimeType === 'application/pdf') && parts.some((p) => p.text?.includes('polash@example.com')));
  check('AI: told to treat the CV as untrusted and never invent', JSON.stringify(call.body.systemInstruction ?? call.body.config?.systemInstruction ?? '').includes('Never invent'));
  await aiGood.getByRole('button', { name: /^Import 1 CV/ }).click();
  await aiGood.waitFor({ state: 'detached', timeout: 30000 });
  await page.getByRole('row', { name: /Polash Chandra Roy/ }).waitFor();
  const aiRow = (await supabase.db.query(`select parse_method, father_name, education, sections from public.candidates where full_name = 'Polash Chandra Roy'`)).rows[0];
  check('AI: result stored, nothing lost', aiRow.parse_method === 'ai' && aiRow.father_name === 'Nikhil Roy' && aiRow.education[0].institution === 'BUTEX' && aiRow.sections['AI: Awards'] === 'Best employee 2020');

  // On a scan the AI points at the portrait; the box is [ymin, xmin, ymax, xmax] out of 1000.
  supabase.geminiReplies.push({
    full_name: 'Karim Miah',
    phone: '01511234505',
    email: 'karim@example.com',
    full_text: 'KARIM MIAH Mobile: 01511-234505 Email: karim@example.com',
    education: [],
    experience: [],
    skills: [],
    photo_box: [45, 750, 200, 927],
  });
  await page.getByRole('main').getByRole('button', { name: 'Upload CVs' }).first().click();
  const aiScan = page.getByRole('dialog', { name: 'Upload CVs' });
  await aiScan.getByText('With AI (Gemini)').click();
  await aiScan.getByLabel('Name in scanned-cv.pdf').waitFor({ state: 'detached' });
  await aiScan.locator('input[type=file]').setInputFiles(scanPath);
  await aiScan.getByLabel('Name in scanned-cv.pdf').waitFor({ timeout: 60000 });
  check('AI: reads a scan without OCR', (await aiScan.getByLabel('Name in scanned-cv.pdf').inputValue()) === 'Karim Miah');
  check('AI: crops the portrait from the scan', await aiScan.getByAltText('Photo found in scanned-cv.pdf').count() === 1);
  await aiScan.getByRole('button', { name: 'Cancel' }).click();
  await aiScan.waitFor({ state: 'detached' });

  // --- Full pipeline against the real constraints and triggers
  const row = () => page.getByRole('row', { name: /Rupa Akter/ });
  const card = page.getByRole('dialog', { name: 'Rupa Akter' });
  const step = (name) => card.getByRole('button', { name, exact: true });
  const fillPanel = async (dialog, people) => {
    for (const [index, person] of people.entries()) {
      if (index > 0) await dialog.getByRole('button', { name: 'Add more' }).click();
      await dialog.getByLabel(new RegExp(`^Interviewer ${index + 1}\\b`)).fill(person.name);
      await dialog.getByLabel(`Score from interviewer ${index + 1}`).fill(String(person.score));
      if (person.recommended) await dialog.locator('label', { hasText: 'Recommended' }).nth(index).click();
    }
  };
  await row().getByRole('cell').last().click();
  // The CV review is timed from opening the new CV to Select; under a second is not counted.
  await page.waitForTimeout(1500);
  await step('Select').click();
  // Another account can take the process, so Select asks who handles the candidate.
  const handover = page.getByRole('dialog', { name: /Select Rupa Akter and hand over/ });
  await handover.getByRole('radio', { name: /^hr/ }).check();
  await handover.getByLabel('Note for them (optional)').fill('Strong profile');
  await handover.getByRole('button', { name: 'Select and hand over' }).click();
  await handover.waitFor({ state: 'detached' });
  const handed = (await supabase.db.query(`select n.event, n.detail, n.subject from public.notifications n join public.profiles p on p.id = n.recipient_id where p.email = 'hr@bitopi.test' and n.event = 'handover'`)).rows;
  check('The handover reaches the chosen account through the real triggers', handed.length === 1 && handed[0].detail === 'Strong profile' && handed[0].subject === 'Rupa Akter', JSON.stringify(handed));
  const assigned = (await supabase.db.query(`select c.assigned_to::text as a, p.id::text as hr from public.candidates c, public.profiles p where c.full_name = 'Rupa Akter' and p.email = 'hr@bitopi.test'`)).rows[0];
  check('The candidate is stored as handled by that account', assigned.a === `{${assigned.hr}}`, JSON.stringify(assigned));
  await step('Candidate confirmed').click();
  const confirm = page.getByRole('dialog', { name: /Record confirmation: Rupa/ });
  await confirm.getByLabel('Called on: day').fill('2026-11-02');
  await confirm.getByLabel('Called on: time').fill('10:30');
  await confirm.getByLabel('Candidate confirmed on: day').fill('2026-11-04');
  await confirm.getByLabel('Candidate confirmed on: time').fill('16:15');
  await confirm.getByRole('button', { name: 'Save confirmation' }).click();
  await confirm.waitFor({ state: 'detached' });
  await step('Set interview schedule').click();
  const message = page.getByRole('dialog', { name: 'Set primary interview schedule' });
  await message.getByLabel('Interview on: day').fill('2026-12-07');
  await message.getByLabel('Interview on: time').fill('15:00');
  await message.getByRole('button', { name: 'Save schedule', exact: true }).click();
  await message.waitFor({ state: 'detached' });
  await step('Select').click();
  const primary = page.getByRole('dialog', { name: /Primary interview/ });
  await fillPanel(primary, [{ name: 'Interviewer One', score: 8, recommended: true }, { name: 'Interviewer Two', score: 7, recommended: false }]);
  await primary.getByRole('button', { name: 'Save as selected' }).click();
  await primary.waitFor({ state: 'detached' });

  await step('Ask for feedback').click();
  const reviewDialog = page.getByRole('dialog', { name: /Ask Rupa Akter for feedback/ });
  const reviewField = reviewDialog.getByLabel('Private link');
  await page.waitForFunction(() => {
    const input = [...document.querySelectorAll('input')].find((i) => i.readOnly);
    return input && input.value.includes('/review/');
  });
  const reviewLink = await reviewField.inputValue();
  await reviewDialog.getByRole('button', { name: 'Close', exact: true }).click();

  await step('Set interview schedule').click();
  const finalMessage = page.getByRole('dialog', { name: 'Set final interview schedule' });
  await finalMessage.getByLabel('Interview on: day').fill('2026-12-09');
  await finalMessage.getByLabel('Interview on: time').fill('11:20');
  await finalMessage.getByRole('button', { name: 'Save schedule', exact: true }).click();
  await finalMessage.waitFor({ state: 'detached' });
  await step('Select').click();
  const final = page.getByRole('dialog', { name: /Final interview/ });
  await fillPanel(final, [{ name: 'Interviewer One', score: 9, recommended: true }]);
  await final.getByLabel('Selection list').selectOption('merit');
  await final.getByRole('button', { name: 'Save as selected' }).click();
  await final.waitFor({ state: 'detached' });
  await card.getByText('Final selected', { exact: true }).first().waitFor();
  check('Full pipeline passes the database constraints', true);

  const person = (await supabase.db.query(`select id, selected_at, primary_date, secondary_status, call_date, call_time, confirmed_date, confirmed_time, primary_panel, primary_score, primary_interviewer, secondary_panel, selection_category, industry from public.candidates where full_name = 'Rupa Akter'`)).rows[0];
  check('Call and confirmation days and times stored', String(person.call_date).includes('2026') && person.confirmed_date !== null && person.call_time === '10:30' && person.confirmed_time === '16:15');
  check('Interview panel stored with a fractional average', person.primary_panel.length === 2 && Number(person.primary_score) === 7.5 && person.primary_interviewer === 'Interviewer One, Interviewer Two');
  check('Recommendations stored per interviewer', person.primary_panel[0].referred === true && person.primary_panel[1].referred === false && person.secondary_panel[0].referred === true);
  check('Selection list stored', person.selection_category === 'merit');
  check('Industry read from the CV and stored', person.industry === 'Garments & Textile', person.industry);
  check('Database stamps the selection time', person.selected_at !== null);
  const events = await supabase.db.query('select field, to_value, actor_name from public.candidate_events where candidate_id = $1', [person.id]);
  check('Audit trail written by the database, with the user', events.rows.length >= 7 && events.rows.every((e) => e.actor_name === 'admin'), `${events.rows.length} events`);
  const logged = await supabase.db.query('select body from public.message_log where candidate_id = $1', [person.id]);
  check('Sent messages are logged', logged.rows.length === 2);

  // Undo works against the real constraints too
  await step('Undo final result').click();
  await card.getByText('Final scheduled', { exact: true }).first().waitFor();
  await card.getByRole('tab', { name: 'History' }).click();
  await card.getByText('Final interview', { exact: false }).first().waitFor();
  await card.getByRole('tab', { name: 'Original CV' }).click();
  await card.locator('iframe').waitFor();
  await card.getByRole('tab', { name: 'All CV text' }).click();
  await card.getByText('Complete text').waitFor();
  check('Card tabs work on full records', true);
  await step('Select').click();
  const final2 = page.getByRole('dialog', { name: /Final interview/ });
  await final2.getByLabel('Selection list').selectOption('merit');
  await final2.getByRole('button', { name: 'Save as selected' }).click();
  await final2.waitFor({ state: 'detached' });
  await page.waitForTimeout(1200);
  await card.getByRole('button', { name: 'Save and close' }).click();
  await card.waitFor({ state: 'detached' });
  await row().getByRole('cell').last().getByText(/^\d+s$/).waitFor();
  const reviewed = (await supabase.db.query('select review_seconds, review_count from public.candidates where id = $1', [person.id])).rows[0];
  // Only the CV review step is timed: the later steps in the same open card added nothing.
  check('Review time reaches the database through its trigger, once', reviewed.review_count === 1 && reviewed.review_seconds >= 1 && reviewed.review_seconds < 10, JSON.stringify(reviewed));
  const credited = (await supabase.db.query('select s.reviewer_id::text = p.id::text as mine from public.cv_review_sessions s, public.profiles p where s.candidate_id = $1 and p.email = $2', [person.id, 'admin@bitopi.test'])).rows;
  check('Review time is credited to the signed-in account', credited.length === 1 && credited[0].mine === true);

  // Team activity reads the audit trail for a period through a filter of its own.
  const bucketPath = new URL(page.url()).pathname;
  await page.goto(`${BASE}/activity`);
  await page.getByRole('heading', { name: 'Team activity' }).waitFor();
  await page.locator('li', { hasText: /Handed to .*: Rupa Akter/ }).first().waitFor();
  check('Team activity lists the handover from the real audit trail', true);
  check('Team activity counts the admin\'s steps', Number(await page.getByRole('row', { name: /^admin/ }).locator('td').nth(1).innerText()) >= 1);

  // Question library: stored through the security rules, with the author stamped by the database.
  await page.goto(`${BASE}/questions`);
  await page.getByRole('heading', { name: 'Question library' }).waitFor();
  await page.getByRole('button', { name: 'Add question' }).click();
  const qDialog = page.getByRole('dialog', { name: 'Add a question' });
  await qDialog.getByRole('radio', { name: 'Interview' }).check();
  await qDialog.getByLabel('Question').fill('Why do you want to join us?');
  await qDialog.getByLabel(/What a good answer covers/).fill('Knows the company.');
  await qDialog.getByRole('button', { name: 'Add question' }).click();
  await qDialog.waitFor({ state: 'detached' });
  const storedQuestion = (await supabase.db.query(`select kind, created_by_name, created_by is not null as stamped from public.questions where question = 'Why do you want to join us?'`)).rows[0];
  check('A question is stored with its author', storedQuestion?.kind === 'interview' && storedQuestion.created_by_name === 'admin' && storedQuestion.stamped, JSON.stringify(storedQuestion));
  await page.goto(`${BASE}${bucketPath}`);
  await row().waitFor();

  // The keyword filter loads CV text through a query of its own.
  await page.getByLabel('Keyword').fill('village rampur');
  await page.getByRole('row', { name: /Rupa Akter/ }).waitFor();
  check('Keyword searches stored CV text', await page.getByRole('row', { name: /Rupa Akter/ }).count() === 1);
  await page.getByRole('button', { name: 'Clear filters' }).click();

  // --- The database itself refuses an offer to the waiting list, whatever the screen shows
  const refused = await page.evaluate(async ([url, key, id]) => {
    const session = JSON.parse(Object.entries(localStorage).find(([name]) => name.includes('auth-token'))[1]);
    const send = (body) => fetch(`${url}/rest/v1/candidates?id=eq.${id}`, {
      method: 'PATCH',
      headers: { apikey: key, Authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(body),
    });
    return (await send({ selection_category: 'waiting', joining_status: 'offer_sent' })).status;
  }, [env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, person.id]);
  check('Database refuses an offer to the waiting list', refused >= 400, String(refused));

  // --- Final decision and the lock, through the real trigger
  await page.goto(`${BASE}/selected`);
  await page.getByRole('row', { name: /Rupa Akter/ }).getByRole('cell').last().click();
  await step('Send confirmation letter').click();
  const letter = page.getByRole('dialog', { name: /Send confirmation letter to Rupa/ });
  await letter.getByLabel('Selected on: time').fill('16:00');
  await letter.getByLabel('Joins on: day').fill('2099-12-21');
  await letter.getByLabel('Joins on: time').fill('09:00');
  await letter.getByRole('button', { name: 'Save and lock' }).click();
  await letter.waitFor({ state: 'detached' });
  await card.getByText('Confirmed. Process locked.').waitFor();
  const decided = (await supabase.db.query('select final_decision, joining_status, joining_time, decision_time, decided_by from public.candidates where id = $1', [person.id])).rows[0];
  check('Decision stored with both times', decided.final_decision === 'confirmed' && decided.joining_status === 'offer_sent' && decided.joining_time === '09:00' && decided.decision_time === '16:00');
  const lockedStatus = await page.evaluate(async ([url, key, id]) => {
    const session = JSON.parse(Object.entries(localStorage).find(([name]) => name.includes('auth-token'))[1]);
    const response = await fetch(`${url}/rest/v1/candidates?id=eq.${id}`, {
      method: 'PATCH',
      headers: { apikey: key, Authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ joining_date: '2099-01-01' }),
    });
    return response.status;
  }, [env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, person.id]);
  check('Database refuses a change to a locked process', lockedStatus >= 400, String(lockedStatus));

  // --- Documents
  await step('Letter and joining pack').click();
  const offer = page.getByRole('article', { name: 'Offer Letter' });
  await offer.waitFor();
  const offerText = await offer.innerText();
  check('Offer letter filled from the database', offerText.includes('on 21st December 2099.') && offerText.includes('Test Signatory'));
  check('Fields not on file are listed for HR', await page.getByText('Not on file:').count() === 1);

  // --- Public pages with no account, through anon access only
  const visitor = await browser.newContext({ viewport: { width: 420, height: 860 } });
  visitor.setDefaultTimeout(20000);
  const applicant = await visitor.newPage();
  watch(applicant, 'applicant');
  await applicant.goto(`${BASE}/apply/${bucketCode}`);
  await applicant.getByRole('heading', { name: 'Apply for Jr. Executive' }).waitFor();
  check('Public form shows the job description', await applicant.getByText('Handle joining documents.').count() === 1);
  await applicant.locator('input[type=file]').first().setInputFiles(join(FIXTURES, 'cv-for-public-form.pdf'));
  await applicant.getByText('We filled in what we could read').waitFor({ timeout: 30000 });
  await applicant.screenshot({ path: join(shots, 'prod-03-apply-mobile.png'), fullPage: true });
  await applicant.getByRole('button', { name: 'Submit application' }).click();
  await applicant.getByRole('heading', { name: 'Application received' }).waitFor();
  const applied = (await supabase.db.query(`select source, parse_method, cv_path, photo_path, education, screening_status from public.candidates where full_name = 'Hena Begum'`)).rows[0];
  check('Anonymous application stored through the public function', applied?.source === 'Company form' && applied.screening_status === 'new');
  check('Applicant files stored under applications/', applied.cv_path.startsWith('applications/') && supabase.files.has(applied.cv_path) && applied.photo_path.startsWith('applications/'));

  await applicant.goto(`${BASE}/apply/not-a-real-code`);
  await applicant.getByText('This application link is not valid.').waitFor();
  check('Unknown application link is refused', true);

  await applicant.goto(reviewLink);
  await applicant.getByRole('heading', { name: /How was your interview, Rupa/ }).waitFor();
  await applicant.locator('fieldset', { hasText: 'Overall experience' }).locator('label').nth(4).click();
  await applicant.getByRole('radio', { name: 'Yes' }).check();
  await applicant.getByLabel('Share your experience').fill('Very professional.');
  await applicant.getByRole('button', { name: 'Send feedback' }).click();
  await applicant.getByRole('heading', { name: 'Thank you for your feedback' }).waitFor();
  const review = (await supabase.db.query('select overall, would_recommend, comments, submitted_at from public.candidate_reviews')).rows[0];
  check('Anonymous review stored through the public function', review.overall === 5 && review.would_recommend === true && review.comments === 'Very professional.');
  await visitor.close();

  // --- Direct attacks with the anon key, the way anyone with the public key could try
  const anon = (path, init = {}) => fetch(`http://localhost:${SUPABASE_PORT}${path}`, { ...init, headers: { apikey: 'test-anon-key', 'content-type': 'application/json', ...init.headers } });
  const leak = await (await anon('/rest/v1/candidates?select=full_name,phone,national_id')).json();
  check('Anon key cannot read candidates', Array.isArray(leak) && leak.length === 0);
  const secrets = await (await anon('/rest/v1/app_secrets?select=*')).json();
  check('Anon key cannot read the AI key', Array.isArray(secrets) && secrets.length === 0);
  const write = await anon('/rest/v1/candidates', { method: 'PATCH', body: JSON.stringify({ secondary_status: 'selected' }), headers: { prefer: 'return=representation' } });
  check('Anon key cannot change candidates', (await write.json()).length === 0);
  const download = await anon('/storage/v1/object/sign/candidate-files', { method: 'POST', body: JSON.stringify({ expiresIn: 60, paths: [saved.cv_path] }) });
  check('Anon key cannot get a link to a CV', (await download.json())[0].signedURL === null);

  // --- Role limits
  await page.getByRole('button', { name: 'Sign out' }).click().catch(() => undefined);
  const logoutTarget = page.getByRole('button', { name: 'Sign in' });
  if (!(await logoutTarget.isVisible().catch(() => false))) {
    await page.goto(`${BASE}/`);
    await page.getByRole('button', { name: 'Sign out' }).click();
  }
  await logoutTarget.waitFor();

  await signIn(page, 'new@bitopi.test', 'new-pass');
  await page.getByRole('heading', { name: 'Waiting for approval' }).waitFor();
  check('Unapproved account sees nothing', true);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await logoutTarget.waitFor();

  await signIn(page, 'viewer@bitopi.test', 'viewer-pass');
  await page.getByRole('heading', { name: 'Dashboard' }).waitFor();
  check('Viewer has no upload button', await page.getByRole('button', { name: 'Upload CVs' }).count() === 0);
  await page.goto(`${BASE}/buckets`);
  await page.getByRole('link', { name: /Jr\. Executive/ }).click();
  await page.getByRole('row', { name: /Rupa Akter/ }).waitFor();
  await page.getByRole('row', { name: /Hena Begum/ }).getByRole('cell').last().click();
  const viewerCard = page.getByRole('dialog', { name: 'Hena Begum' });
  await viewerCard.waitFor();
  check('Viewer can read but gets no action buttons', await viewerCard.getByRole('button', { name: 'Select', exact: true }).count() === 0 && await viewerCard.getByRole('list', { name: 'Process' }).count() === 1);
  check('A viewer reading a CV is not timed as a review', await viewerCard.getByText(/Reviewing the CV:/).count() === 0);
  await viewerCard.getByRole('button', { name: 'Close', exact: true }).click();
  await page.goto(`${BASE}/`);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await logoutTarget.waitFor();

  await signIn(page, 'hr@bitopi.test', 'hr-pass');
  await page.getByRole('heading', { name: 'Dashboard' }).waitFor();
  await page.goto(`${BASE}/settings`);
  await page.getByText('Only an admin can change these settings.').waitFor();
  check('HR cannot change company settings', await page.getByRole('button', { name: 'Save company settings' }).count() === 0);
  await page.goto(`${BASE}/buckets`);
  await page.getByRole('link', { name: /Jr\. Executive/ }).click();
  await page.getByRole('button', { name: /^Hena Begum/ }).click();
  const hrDrawer = page.getByRole('dialog', { name: 'Hena Begum' });
  await hrDrawer.waitFor();
  check('HR cannot delete a candidate', await hrDrawer.getByRole('button', { name: 'Delete candidate' }).count() === 0);
  await hrDrawer.getByRole('button', { name: 'Close', exact: true }).click();

  await browser.close();

  console.log('\nBrowser errors:', problems.length ? problems : 'none');
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
  if (failed.length || problems.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('Production run stopped:', error);
    console.log('Browser errors so far:', problems);
    process.exitCode = 1;
  })
  .finally(async () => {
    appServer?.kill();
    await supabase?.stop();
    setTimeout(() => process.exit(), 500);
  });
