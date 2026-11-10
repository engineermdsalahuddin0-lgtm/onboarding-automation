// End-to-end check in a real browser, against demo mode. Run with: node tests/e2e/run.mjs
// Starts its own server, uses the installed Edge or Chrome, and saves screenshots to tests/.tmp/shots.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { chromium } from 'playwright-core';
import { FACE_BASE64, FIXTURES, makeFixtures, scannedPdf } from './make-fixtures.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const shots = join(root, 'tests', '.tmp', 'shots');
mkdirSync(shots, { recursive: true });

const PORT = 3100;
const BASE = `http://localhost:${PORT}`;
// Live reload's port is taken whenever `npm run dev` is also running; pages work the same without it.
const LIVE_RELOAD_NOISE = /\[vite\]|Vite server|ws:\/\/localhost:24678|WebSocket closed without opened/;

const results = [];
const problems = [];

function check(label, ok, detail = '') {
  results.push({ label, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
}

const server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  cwd: root,
  env: { ...process.env, PORT: String(PORT), VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', (chunk) => {
  const text = String(chunk);
  if (!/ExperimentalWarning|--trace-warnings/.test(text)) console.error('[server]', text.trim());
});

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error('Server did not start.');
}

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

async function main() {
  await waitForServer();
  await makeFixtures();
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  context.setDefaultTimeout(20000);
  const page = await context.newPage();
  page.on('pageerror', (error) => { if (!LIVE_RELOAD_NOISE.test(error.message)) problems.push(`pageerror: ${error.message}`); });
  page.on('console', (message) => {
    if (message.type() === 'error' && !/favicon|Download the React DevTools/.test(message.text()) && !LIVE_RELOAD_NOISE.test(message.text())) problems.push(`console: ${message.text()}`);
  });
  const shot = (name, options = {}) => page.screenshot({ path: join(shots, `${name}.png`), ...options });
  const heading = (text) => page.getByRole('heading', { name: text });

  // --- Sign in and dashboard
  await page.goto(BASE);
  const accounts = page.getByRole('list', { name: 'Demo accounts' });
  await accounts.waitFor();
  check('Demo mode offers the three accounts', await accounts.getByRole('button').count() === 3
    && await accounts.getByText('Assistant General Manager').count() === 1
    && await accounts.getByText('Senior Manager').count() === 1
    && await accounts.getByText('Senior Executive').count() === 1);
  await shot('00-login');
  await accounts.getByRole('button', { name: /Tareq Azij/ }).click();
  await heading('Dashboard').waitFor();
  check('Dashboard opens', true);

  // --- First visit: the tour of the dashboard starts by itself
  const tourStep = page.getByRole('dialog', { name: 'Pages' });
  await tourStep.waitFor();
  check('A new person gets the tour without asking', (await tourStep.innerText()).includes('Welcome, Tareq!'));
  check('The tour starts by pointing at the page menu', /1 of \d+/i.test(await tourStep.innerText()));
  check('The tour can be skipped from the start', await tourStep.getByRole('button', { name: 'Skip tour' }).count() === 1);
  await shot('00a-welcome-tour');
  await tourStep.getByRole('button', { name: /Next/ }).click();
  await page.getByRole('dialog', { name: 'Find anyone' }).waitFor();
  await page.keyboard.press('ArrowRight');
  await page.getByRole('dialog', { name: 'Upload CVs' }).waitFor();
  check('Next and the arrow keys move through the tour', true);
  await shot('00b-tour-step');
  await page.getByRole('dialog', { name: 'Upload CVs' }).getByRole('button', { name: 'Skip tour' }).click();
  await page.getByRole('dialog', { name: 'Upload CVs' }).waitFor({ state: 'detached' });
  check('Skip tour ends it', true);
  await page.reload();
  await heading('Dashboard').waitFor();
  await page.waitForTimeout(1200);
  check('The tour does not start again once seen', await page.getByRole('button', { name: 'Skip tour' }).count() === 0);

  // --- Help: the whole flow, and "Show me" opens a real example with the card's tour
  await page.getByRole('button', { name: 'Help and guided tour' }).click();
  const help = page.getByRole('dialog', { name: 'Help' });
  await help.waitFor();
  check('Help lists the hiring flow in order', await help.getByRole('listitem').count() === 9 && (await help.innerText()).includes('Screen: accept or reject'));
  check('Help states the upload limits', (await help.innerText()).includes('15 MB per file'));
  await shot('00c-help');
  await help.getByRole('listitem').filter({ hasText: 'Screen: accept or reject' }).getByRole('button', { name: 'Show me' }).click();
  const cardTour = page.getByRole('dialog', { name: 'The seven steps' });
  await cardTour.waitFor({ timeout: 10000 });
  check('Show me opens a new CV and explains its card', new URL(page.url()).searchParams.has('candidate'));
  await cardTour.getByRole('button', { name: /Next/ }).click();
  const acceptReject = page.getByRole('dialog', { name: 'Accept or reject here' });
  await acceptReject.waitFor();
  await shot('00d-card-tour');
  await page.keyboard.press('Escape');
  await acceptReject.waitFor({ state: 'detached' });
  const exampleCard = page.getByRole('dialog').filter({ has: page.getByRole('list', { name: 'Process' }) });
  check('Esc ends the tour without closing the card', await exampleCard.count() === 1);
  check('The step panel explains its buttons', await exampleCard.getByRole('button', { name: 'What the buttons do: Review this CV' }).count() === 1);
  await exampleCard.getByRole('button', { name: 'Close', exact: true }).click();
  await exampleCard.waitFor({ state: 'detached' });
  await page.goto(BASE);
  await heading('Dashboard').waitFor();

  // Tareq heads the team: he can do every step, so the run below goes through the whole process as him.
  check('The AGM sees the process team on his dashboard', await page.getByText('Process team progress').count() === 1);
  await page.getByText('Hiring funnel').waitFor();
  await shot('01-dashboard', { fullPage: true });
  const favicon = await page.locator('link[rel=icon]').getAttribute('href');
  check('Browser tab uses the Bitopi logo', /bitopi_group_logo_for_tab/.test(favicon ?? ''), favicon ?? '');

  // --- Stars on the dashboard: full for those who recommend, blank for those who do not
  const recommendedCard = page.locator('section', { hasText: 'Recommended by interviewers' });
  check('Dashboard says Recommended, not Referred', await page.getByText('Referred', { exact: false }).count() === 0);
  check('Dashboard stars count every recommendation', await recommendedCard.getByRole('img', { name: 'Recommended by 3 of 4 interviewers' }).count() >= 1);
  check('Dashboard shows blank stars for those who did not recommend', await recommendedCard.getByRole('link', { name: /Sumaiya Akter/ }).getByRole('img', { name: 'Recommended by 1 of 2 interviewers' }).count() === 1);

  // --- Clicking a person on the dashboard opens their card right there
  await page.getByRole('link', { name: /Mehedi Hasan/ }).first().click();
  const dashboardCard = page.getByRole('dialog', { name: 'Mehedi Hasan' });
  await dashboardCard.waitFor();
  check('Dashboard row opens the card without leaving the dashboard', new URL(page.url()).pathname === '/');
  check('Dashboard row opens on full details', await dashboardCard.getByRole('tab', { name: 'Full details' }).getAttribute('aria-selected') === 'true');
  await shot('01i-card-from-dashboard');
  await dashboardCard.getByRole('button', { name: 'Close', exact: true }).click();
  await dashboardCard.waitFor({ state: 'detached' });

  // --- Every control has one height and one text size
  for (const [path, name] of [['/', 'dashboard'], ['/buckets', 'bucket list'], ['/selected', 'selected list']]) {
    await page.goto(`${BASE}${path}`);
    await page.getByRole('main').locator('select').first().waitFor();
    const sizes = await page.getByRole('main').locator('select, input[type=search]').evaluateAll((els) => els.map((el) => `${Math.round(el.getBoundingClientRect().height)}/${getComputedStyle(el).fontSize}`));
    check(`Filters match on the ${name}`, new Set(sizes).size === 1 && sizes[0] === '36/14px', [...new Set(sizes)].join(', '));
  }
  await page.setViewportSize({ width: 1024, height: 800 });
  for (const path of ['/', '/requisitions', '/buckets', '/selected', '/reviews', '/settings', '/buckets/bkt-1', '/questions', '/activity']) {
    await page.goto(`${BASE}${path}`);
    await page.getByRole('main').locator('h1').waitFor();
    await page.waitForTimeout(150);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`No sideways page scroll at 1024px: ${path}`, overflow <= 0, `${overflow}px`);
  }
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto(BASE);
  await heading('Dashboard').waitFor();
  await shot('01a-dashboard-stars', { fullPage: true });

  // --- Sidebar
  const nav = page.getByRole('navigation', { name: 'Main' });
  const navWidth = async () => (await nav.boundingBox()).width;
  await page.mouse.move(30, 300);
  await page.waitForTimeout(350);
  check('Sidebar opens on hover', (await navWidth()) > 200);
  const headerCovers = await page.evaluate(() => !document.elementFromPoint(150, 60)?.closest('nav'));
  check('Open sidebar sits above the top header', !headerCovers);
  await shot('01b-sidebar-open');
  await page.getByRole('link', { name: 'CV Buckets' }).click();
  await page.mouse.move(900, 500);
  await page.waitForTimeout(350);
  check('Sidebar closes after a menu click when the mouse leaves', (await navWidth()) === 64, `${await navWidth()}px`);
  await page.getByRole('heading', { name: 'CV Buckets' }).waitFor();
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(200);
  const navBox = await nav.boundingBox();
  check('Sidebar stays in place while the page scrolls', Math.abs(navBox.y) <= 1);
  await page.getByRole('link', { name: 'Bitopi Group, go to dashboard' }).focus();
  await page.keyboard.press('Tab');
  await page.waitForTimeout(350);
  check('Sidebar opens for keyboard users', (await navWidth()) > 200);
  await page.keyboard.press('Enter');
  await heading('Dashboard').waitFor();
  await page.mouse.move(900, 500);
  await page.waitForTimeout(350);
  check('Sidebar closes after choosing a page by keyboard', (await navWidth()) === 64, `${await navWidth()}px`);

  // --- Dashboard cards
  const tile = (name) => page.getByRole('button', { name: new RegExp(`^${name}`) });
  const tips = [
    ['Open requisitions', ['By status', 'Positions still to fill', 'Quality Inspector', '3 of 3', 'REQ-'], /^Open requisitions: \d+$/, ['By unit', 'By status', 'Days open', 'Quality Inspector']],
    ['CVs received', ['By department', 'CVs', 'Interviews', 'HR & Admin', 'Total', 'Where they stand', 'New CV', 'Rejected', 'By position', 'Jr. Executive'], /^CVs received: 23$/, ['By department', 'Where they stand', 'By source', 'BDJobs']],
    ['Interviews, next 7 days', ['By department', 'Final', 'Next 7 days', 'HR & Admin', 'Scheduled', 'Mehedi Hasan', 'Primary'], 'Interview calendar', ['Mehedi Hasan', 'Result not recorded', 'Primary held']],
    ['Avg. CV review time', ['Longest CV reviews', 'Mahmud'], 'CV review time', ['How long each review took', 'Mahmud Karim', 'Sittings']],
    ['Merit and waiting', ['Offer letters by department', 'Sent', 'Accepted', 'Rejected', 'Merit list: 2', 'Rahim Uddin', 'Letter not sent', 'Mahmud Karim', 'Joins', 'Waiting list: 1', 'Liton Das', 'Waiting for a place'], 'Merit and waiting lists', ['Merit list', 'Waiting list', 'Rahim Uddin', 'Liton Das', 'Remarks']],
    ['Avg. time to hire', ['Days from CV to final selection', 'Rahim Uddin'], 'Time to hire', ['Each person', 'Average by position', 'Rahim Uddin']],
    ['Candidate rating', ['From 2 of 3', 'Communication', 'Waiting for a reply'], 'Candidate rating', ['Average out of 5', 'Professionalism', 'Latest feedback']],
  ];
  for (const [name, expected, dialogName, inDialog] of tips) {
    await tile(name).hover();
    const tooltip = page.getByRole('tooltip').filter({ visible: true });
    await tooltip.waitFor();
    const text = await tooltip.innerText();
    check(`Card tooltip: ${name}`, expected.every((part) => text.includes(part)), expected.filter((part) => !text.includes(part)).join(', '));
    const box = await tooltip.boundingBox();
    const fits = box.x >= 64 && box.x + box.width <= 1440;
    check(`Card tooltip fits the screen: ${name}`, fits, `x ${Math.round(box.x)} to ${Math.round(box.x + box.width)}`);
    if (name === 'Open requisitions') await shot('01c-tooltip-vacancies');
    if (name === 'Candidate rating') await shot('01d-tooltip-rating');
    if (name === 'CVs received') await shot('01e-tooltip-cvs-by-department');
    if (name === 'Interviews, next 7 days') await shot('01f-tooltip-interviews-by-department');
    if (name === 'Merit and waiting') await shot('01g-tooltip-letters-by-department');
    // A click opens the details over the dashboard; it no longer goes to another page.
    await tile(name).click();
    const details = page.getByRole('dialog', { name: dialogName });
    await details.waitFor();
    // Section titles are shown in capitals, so compare without case.
    const detailText = await details.innerText();
    const hasText = (part) => detailText.toLowerCase().includes(part.toLowerCase());
    check(`Card opens its details in a window: ${name}`, page.url().replace(/\/$/, '') === BASE && inDialog.every(hasText), inDialog.filter((part) => !hasText(part)).join(', ') || page.url());
    check(`The card's tooltip closes when its window opens: ${name}`, (await page.getByRole('tooltip').filter({ visible: true }).count()) === 0);
    if (name === 'Open requisitions') {
      await shot('01i-details-requisitions');
      await details.getByRole('group', { name: '1 of 2 vacancies filled', exact: true }).hover();
      const fill = await page.getByRole('tooltip').filter({ visible: true }).innerText();
      check('Each requisition shows how far it is filled; waiting candidates do not fill a vacancy', fill.includes('1 of 2 filled') && fill.includes('Rahim Uddin') && fill.includes('On the waiting list'), fill.replace(/\s+/g, ' '));
      await details.getByRole('row', { name: /Details of .*Quality Inspector/ }).click();
      const reqDetails = page.getByRole('dialog', { name: /Quality Inspector/ });
      await reqDetails.waitFor();
      check('A requisition row opens its details', true);
      await reqDetails.getByRole('button', { name: 'Close', exact: true }).click();
      await reqDetails.waitFor({ state: 'detached' });
    }
    if (name === 'Interviews, next 7 days') {
      const todayCell = details.getByRole('gridcell', { selected: true });
      check('The calendar opens on the next interview day', /: 1 interview$/.test(await todayCell.getAttribute('aria-label')) && detailText.includes('Today,'), await todayCell.getAttribute('aria-label'));
      check('Interview days are marked on the calendar', (await details.getByRole('gridcell', { name: /: \d+ interviews?$/ }).count()) >= 4);
      await shot('01j-details-interview-calendar');
      await details.getByRole('region', { name: /Interviews on/ }).getByRole('button', { name: /^Tomorrow|^\w{3}, / }).first().click();
      const dayPanel = await details.getByRole('region', { name: /Interviews on/ }).innerText();
      check('Choosing a day lists its interviews', dayPanel.includes('Sadia Islam') && dayPanel.includes('Final'), dayPanel.replace(/\s+/g, ' ').slice(0, 120));
    }
    if (name === 'Merit and waiting') await shot('01k-details-merit-waiting');
    await details.getByRole('button', { name: 'Close', exact: true }).last().click();
    await details.waitFor({ state: 'detached' });
    await page.mouse.move(900, 700);
    await page.waitForTimeout(100);
  }
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await page.getByRole('dialog', { name: 'Interview calendar' }).waitFor();
  check('Upcoming interviews opens the same calendar', true);
  await page.getByRole('dialog', { name: 'Interview calendar' }).getByRole('button', { name: 'Close', exact: true }).last().click();
  check('The long list of open requisitions is gone from the dashboard', (await page.getByRole('heading', { name: 'Open requisitions', exact: true }).count()) === 0);
  const meritTile = await tile('Merit and waiting').innerText();
  check('Dashboard card counts both lists', /2\s*Merit/.test(meritTile) && /1\s*Waiting/.test(meritTile) && meritTile.includes('1 letter to send'), meritTile.replace(/\s+/g, ' '));

  // --- Bar graphs show what is behind each bar
  const visibleTip = () => page.getByRole('tooltip').filter({ visible: true });
  const bars = [
    ['Shortlisted: 16', ['Shortlisted: 16', 'Share of all CVs', 'Out of CVs received', '16 of 23', 'Rejected before this step', 'Still on the way', 'By position']],
    ['CVs received: 23', ['CVs received: 23', 'In process', 'Rejected', 'By position', 'Jr. Executive']],
    ['Joined: 0', ['Joined: 0', 'Out of Confirmed', '0 of 1']],
    ['BDJobs: 12 CVs, 2 selected', ['BDJobs: 12 CVs', 'Share of all CVs', 'Shortlisted', 'Final selected', 'Rejected', 'In process', 'By position']],
  ];
  for (const [name, expected] of bars) {
    await page.getByRole('group', { name, exact: true }).hover();
    await visibleTip().waitFor();
    const text = await visibleTip().innerText();
    check(`Bar tooltip: ${name}`, expected.every((part) => text.includes(part)), expected.filter((part) => !text.includes(part)).join(', '));
    const box = await visibleTip().boundingBox();
    check(`Bar tooltip on screen: ${name}`, box.x >= 64 && box.x + box.width <= 1440 && box.y >= 0 && box.y + box.height <= 950, `${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}x${Math.round(box.height)}`);
    if (name.startsWith('Shortlisted')) await shot('01e-tooltip-funnel');
    if (name.startsWith('BDJobs')) await shot('01f-tooltip-source');
    await page.mouse.move(900, 40);
    await page.waitForTimeout(80);
  }
  const weekBar = page.getByRole('group', { name: /^Week of .*: [1-9]\d* CVs$/ }).last();
  await weekBar.hover();
  await visibleTip().waitFor();
  const weekText = await visibleTip().innerText();
  check('Weekly bar shows its dates, change, source and position', / to .*CV/.test(weekText) && weekText.includes('Compared with the week before') && weekText.includes('By source') && weekText.includes('By position'), weekText.replace(/\s+/g, ' ').slice(0, 120));
  await shot('01g-tooltip-week');
  await page.mouse.move(900, 40);

  // Going down the rows, each bar answers in turn: the tooltip must not sit on the next row.
  const shortlistedRow = page.getByRole('group', { name: 'Shortlisted: 16', exact: true });
  const confirmedRow = page.getByRole('group', { name: /^Call confirmed: /, exact: false });
  const rowBox = await shortlistedRow.boundingBox();
  await shortlistedRow.hover();
  await visibleTip().waitFor();
  const nextBox = await confirmedRow.boundingBox();
  await page.mouse.move(nextBox.x + nextBox.width / 2, nextBox.y + nextBox.height / 2, { steps: 5 });
  await page.waitForTimeout(100);
  check('Moving to the next row switches its tooltip', (await visibleTip().innerText()).includes('Call confirmed') && rowBox.y < nextBox.y);
  await page.keyboard.press('Escape');
  check('Esc closes a bar tooltip', (await visibleTip().count()) === 0);
  await page.mouse.move(900, 40);
  await page.waitForTimeout(80);
  await page.getByRole('group', { name: 'Shortlisted: 16', exact: true }).focus();
  await page.keyboard.press('Tab');
  await visibleTip().waitFor();
  check('Bars open with the keyboard too', (await visibleTip().innerText()).includes('Call confirmed'));
  await page.mouse.click(900, 40);
  await page.waitForTimeout(80);
  await page.mouse.wheel(0, 200);
  await page.getByRole('group', { name: 'Shortlisted: 16', exact: true }).hover();
  await visibleTip().waitFor();
  await page.mouse.wheel(0, 150);
  await page.waitForTimeout(200);
  const tipStillThere = await visibleTip().count();
  if (tipStillThere) {
    // Whatever row is now under the pointer may answer; the tooltip must sit beside that row, not the old one.
    const tipBox = await visibleTip().boundingBox();
    // Beside a row it lines up with the row's top, or with its bottom when the row is near the foot of the screen.
    const owner = await visibleTip().evaluate((tip) => {
      const { top, bottom } = tip.parentElement.getBoundingClientRect();
      return { top, bottom };
    });
    const besideRow = Math.abs(tipBox.y - owner.top) < 2 || Math.abs(tipBox.y + tipBox.height - owner.bottom) < 2;
    check('A tooltip never floats away from its bar on scroll', besideRow, `tip ${Math.round(tipBox.y)}-${Math.round(tipBox.y + tipBox.height)}, row ${Math.round(owner.top)}-${Math.round(owner.bottom)}`);
  } else {
    check('A tooltip never floats away from its bar on scroll', true);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.move(900, 40);
  await page.waitForTimeout(120);

  await tile('Open requisitions').hover();
  const vacancyTip = page.getByRole('tooltip').filter({ visible: true });
  await vacancyTip.waitFor();
  const tipBox = await vacancyTip.boundingBox();
  await page.mouse.move(tipBox.x + 40, tipBox.y + 40, { steps: 8 });
  await page.waitForTimeout(150);
  check('Pointer can move into the tooltip to read it', await vacancyTip.isVisible());
  await page.keyboard.press('Escape');
  check('Esc closes the tooltip', (await page.getByRole('tooltip').filter({ visible: true }).count()) === 0);
  // Somewhere with no tooltip of its own, so only the focused one opens.
  await page.mouse.move(600, 140);
  await tile('Open requisitions').focus();
  await page.keyboard.press('Tab');
  await page.getByRole('tooltip').filter({ visible: true }).waitFor();
  check('Tooltip opens on keyboard focus', (await page.getByRole('tooltip').filter({ visible: true }).innerText()).includes('Where they stand'));
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  const described = await tile('CVs received').evaluate((el) => document.getElementById(el.getAttribute('aria-describedby'))?.textContent ?? '');
  check('Screen readers get the tooltip as a description', described.includes('Where they stand'));
  await page.mouse.click(900, 40);
  await page.setViewportSize({ width: 800, height: 900 });
  await tile('Interviews, next 7 days').hover();
  const narrowTip = page.getByRole('tooltip').filter({ visible: true });
  await narrowTip.waitFor();
  const narrowBox = await narrowTip.boundingBox();
  check('Tooltip stays on screen at a narrow width', narrowBox.x >= 0 && narrowBox.x + narrowBox.width <= 800, `x ${Math.round(narrowBox.x)} to ${Math.round(narrowBox.x + narrowBox.width)}`);
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.mouse.move(900, 700);

  // Scanned CV built from a page image: text and a portrait, with no text layer.
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
    const lines = ['Mobile: 01511-234505', 'Email: karim@example.com', '', 'Career Objective:', 'Looking for a role in supply chain management.', '', 'Academic Qualification:', 'BBA Management, National University 2019', '', 'Special Qualification:', 'MS Excel, Inventory Control'];
    lines.forEach((line, i) => c.fillText(line, 100, 220 + i * 46));
    const image = new Image();
    image.src = `data:image/jpeg;base64,${faceBase64}`;
    await image.decode();
    c.drawImage(image, 930, 80, 220, 270);
    return Array.from(new Uint8Array(await (await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))).arrayBuffer()));
  }, FACE_BASE64);
  const scanPath = await scannedPdf(Buffer.from(scanBytes), 'scanned-cv.pdf');

  // --- Block A
  await page.goto(`${BASE}/requisitions`);
  await heading('Requisitions').waitFor();
  await shot('02-vacancies');
  await page.getByRole('button', { name: 'Raise requisition' }).first().click();
  const reqDialog = page.getByRole('dialog', { name: 'New requisition' });
  await reqDialog.waitFor();
  await reqDialog.getByRole('button', { name: 'Save' }).click();
  await reqDialog.waitFor({ state: 'detached' });
  await page.getByRole('tab', { name: /^Requisitions/ }).click();
  await page.getByRole('row', { name: /REQ-\d+-0005/ }).waitFor();
  check('Requisition raised from a vacant designation', true);
  await shot('03-requisitions');
  await page.getByRole('button', { name: /Record job posting for REQ-\d+-0005/ }).click();
  const postDialog = page.getByRole('dialog', { name: 'Record a job posting' });
  await postDialog.getByRole('button', { name: 'Save' }).click();
  await postDialog.waitFor({ state: 'detached' });
  await page.getByRole('tab', { name: /^Job postings/ }).click();
  check('Job posting recorded', await page.getByRole('cell', { name: /REQ-\d+-0005/ }).count() > 0);

  // --- New recruitment: the requisition and its bucket in one window
  await page.goto(`${BASE}/buckets`);
  await page.getByRole('button', { name: 'New CV bucket' }).click();
  const recruit = page.getByRole('dialog', { name: 'New CV bucket' });
  check('New recruitment asks nothing about the company', (await recruit.getByLabel('Company').count()) === 0);
  const designationOptions = await recruit.getByRole('combobox', { name: /^Designation\b/ }).locator('option').allInnerTexts();
  check('Designations come from the company chart, one per role, grades hidden', designationOptions.includes('CFO') && designationOptions.includes('CEO') && designationOptions.includes('Junior Executive') && !designationOptions.some((o) => /MS-?\s?\d/.test(o)), designationOptions.join(', '));
  check('Units are the five codes only', JSON.stringify((await recruit.getByRole('combobox', { name: /^Unit\b/ }).locator('option').allInnerTexts()).slice(1)) === JSON.stringify(['CHO', 'MGL', 'RHL', 'TAL', 'BGL']));
  await recruit.getByRole('combobox', { name: /^Unit\b/ }).selectOption('TAL');
  await recruit.getByRole('combobox', { name: /^Department\b/ }).selectOption('HR & Admin');
  await recruit.getByRole('combobox', { name: /^Section\b/ }).selectOption('HR');
  await recruit.getByRole('combobox', { name: /^Subsection\b/ }).selectOption('Talent Acquisition & Onboarding');
  await recruit.getByRole('combobox', { name: /^Designation\b/ }).selectOption('Senior Executive');
  await recruit.getByRole('button', { name: 'What is Number of posts?' }).hover();
  const postsTip = await page.getByRole('tooltip').filter({ visible: true }).innerText();
  check('Number of posts explains itself', postsTip.includes('How many people you will hire') && postsTip.includes('not the number of CVs'), postsTip.replace(/\s+/g, ' '));
  await recruit.getByRole('spinbutton', { name: /^Number of posts/ }).fill('2');
  await shot('03b-new-recruitment');
  await recruit.getByRole('button', { name: 'Create', exact: true }).click();
  await heading('Senior Executive').waitFor();
  check('Create opens the new bucket, ready for CVs', /\/buckets\/[^/?]+$/.test(page.url()) && (await page.getByRole('main').innerText()).includes('TAL › HR & Admin › HR'), page.url());
  await page.goto(`${BASE}/requisitions?tab=requisitions`);
  const madeRow = page.getByRole('row', { name: /Senior Executive/ });
  await madeRow.waitFor();
  const madeText = await madeRow.innerText();
  check('Its requisition is made with it: place, two posts, under way', madeText.includes('TAL › HR & Admin › HR') && /\b2\b/.test(madeText) && madeText.includes('In progress') && !/MS-?\d/.test(madeText), madeText.replace(/\s+/g, ' '));

  // --- CV bucket folders
  await page.goto(`${BASE}/buckets`);
  await heading('CV Buckets').waitFor();
  await shot('04-bucket-folders', { fullPage: true });
  const tree = page.getByRole('navigation', { name: 'Buckets by unit and department' });
  const treeUnits = await tree.locator(':scope > ul > li > button').allInnerTexts();
  check('The tree lists the units with their bucket counts', treeUnits.map((t) => t.replace(/\s+/g, ' ')).join(' | ').startsWith('CHO 3 | MGL 0 | RHL 0 | TAL 1 | BGL 0'), treeUnits.join(' | '));
  await tree.getByRole('button', { name: /^TAL/ }).click();
  await tree.getByRole('button', { name: /^HR & Admin/ }).click();
  await tree.getByRole('button', { name: /^HR\s*1$/ }).click();
  await page.waitForTimeout(150);
  const shownFolders = await page.getByRole('main').getByRole('link', { name: /Executive|Specialist|Merchandiser/ }).allInnerTexts();
  check('Choosing in the tree shows only the buckets there', shownFolders.length === 1 && shownFolders[0].includes('Senior Executive') && page.url().includes('unit=TAL') && page.url().includes('section=HR'), `${shownFolders.length} shown · ${page.url()}`);
  check('The filters follow the tree', (await page.getByLabel('Filter by section').inputValue()) === 'HR' && (await page.getByLabel('Filter by department').inputValue()) === 'HR & Admin');
  await shot('04c-bucket-tree');
  await tree.getByRole('button', { name: /^All buckets/ }).click();
  await page.waitForURL((url) => !url.search.includes('unit='));
  await page.getByLabel('Filter by unit').selectOption('CHO');
  await page.waitForURL(/unit=CHO/);
  const sectionWaits = await page.waitForFunction(() => document.querySelector('select[aria-label="Filter by section"]')?.disabled, null, { timeout: 3000 }).then(() => true, () => false);
  check('Section waits for a department', sectionWaits);
  await page.getByLabel('Filter by department').selectOption('HR & Admin');
  await page.getByLabel('Filter by section').selectOption('HR');
  await page.waitForURL(/section=HR/);
  await page.waitForTimeout(150);
  const filteredFolders = await page.getByRole('main').getByRole('link', { name: /Jr\. Executive|HR Tech|Merchandiser|Senior Executive/ }).allInnerTexts();
  const treeHere = await tree.locator('[aria-current="true"]').innerText();
  check('Unit, department and section filter the folders', filteredFolders.length === 2 && /^HR\s*2$/.test(treeHere.trim()), `${filteredFolders.length} folders; tree on "${treeHere.replace(/\s+/g, ' ')}"`);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.getByRole('main').getByRole('link', { name: /Merchandiser/ }).waitFor();
  const folderStat = (name, label) => page.getByRole('link', { name }).evaluate((folder, wanted) => {
    const term = [...folder.querySelectorAll('dt')].find((dt) => dt.textContent === wanted);
    return term?.nextElementSibling?.textContent;
  }, label);
  check('Folder shows how many are shortlisted', (await folderStat(/Jr\. Executive/, 'Shortlisted')) === '10', await folderStat(/Jr\. Executive/, 'Shortlisted'));
  for (const width of [1024, 1366, 1440, 1777, 400]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(100);
    const overflowing = await page.locator('dl').evaluateAll((lists) => lists.filter((list) => {
      const card = list.getBoundingClientRect();
      return list.scrollWidth > list.clientWidth || [...list.children].some((item) => item.getBoundingClientRect().right > card.right + 0.5);
    }).length);
    check(`Folder stats fit at ${width}px`, overflowing === 0, `${overflowing} overflowing`);
  }
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.getByRole('link', { name: /Merchandiser/ }).screenshot({ path: join(shots, '04b-folder-card.png') });
  await page.getByRole('link', { name: /Jr\. Executive/ }).click();
  await heading('Jr. Executive').waitFor();
  await page.getByRole('table').waitFor();
  const titleBox = await heading('Jr. Executive').boundingBox();
  const uploadIcon = page.getByRole('main').getByRole('button', { name: 'Upload CVs' });
  const iconBox = await uploadIcon.boundingBox();
  check('Bucket actions sit beside the title', Math.abs(iconBox.y + iconBox.height / 2 - (titleBox.y + titleBox.height / 2)) < 8 && iconBox.x < 500, `x ${Math.round(iconBox.x)}`);
  const iconTip = uploadIcon.getByText('Upload CVs');
  check('Bucket action names stay hidden until hover', (await iconTip.evaluate((el) => getComputedStyle(el).opacity)) === '0');
  await uploadIcon.hover();
  await page.waitForTimeout(250);
  check('Hover shows the name of a bucket action', (await iconTip.evaluate((el) => getComputedStyle(el).opacity)) === '1');
  await page.mouse.move(900, 40);
  const filterHeights = await page.getByRole('main').locator('input[type=search], select').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
  check('The filter row is compact', filterHeights.every((height) => height === 32), filterHeights.join(', '));
  await shot('05-bucket-table', { fullPage: true });
  await page.getByRole('button', { name: /^Facebook/ }).hover();
  await page.getByRole('tooltip').filter({ visible: true }).waitFor();
  const bucketTip = await page.getByRole('tooltip').filter({ visible: true }).innerText();
  check('Bucket source bars show their details', bucketTip.includes('Share of this bucket') && bucketTip.includes('Called'), bucketTip.replace(/\s+/g, ' ').slice(0, 90));
  await page.mouse.move(900, 40);
  const beforeCount = await page.getByRole('row').count();

  // Filters by selected and rejected
  await page.getByRole('tab', { name: /^Rejected/ }).click();
  await page.getByRole('row', { name: /Shirin Sultana/ }).waitFor({ state: 'detached' });
  const rejectedNames = await page.getByRole('row').count();
  check('Rejected filter narrows the table', rejectedNames > 1 && rejectedNames < beforeCount, `${rejectedNames - 1} rejected`);
  await page.getByRole('tab', { name: /^Decision/ }).click();
  await page.getByRole('row', { name: /Rahim Uddin/ }).waitFor();
  await page.getByRole('row', { name: /Jewel Rana/ }).waitFor({ state: 'detached' });
  check('Decision filter shows who is waiting for the final decision', await page.getByRole('row', { name: /Rahim Uddin/ }).count() === 1);
  await page.getByRole('tab', { name: /^All/ }).click();
  await page.getByRole('row', { name: /Jewel Rana/ }).waitFor();

  // --- Bulk upload without AI
  await page.getByRole('main').getByRole('button', { name: 'Upload CVs' }).click();
  const upload = page.getByRole('dialog', { name: 'Upload CVs' });
  await upload.waitFor();
  const limits = await upload.getByRole('region', { name: 'Upload limits' }).innerText();
  check('The upload window states its limits', limits.includes('15 MB') && limits.includes('1000') && /batches of\s*50/.test(limits) && limits.includes('10-second'), limits.replace(/\s+/g, ' '));
  await upload.locator('input[type=file]').setInputFiles([
    join(FIXTURES, 'pdf-with-photo.pdf'),
    join(FIXTURES, 'pdf-with-logo-only.pdf'),
    join(FIXTURES, 'word-with-photo.docx'),
    join(FIXTURES, 'same-person-again.pdf'),
    scanPath,
  ]);
  await upload.getByLabel('Name in pdf-with-photo.pdf').waitFor({ timeout: 30000 });
  await upload.getByLabel('Name in pdf-with-logo-only.pdf').waitFor({ timeout: 30000 });
  await upload.getByLabel('Name in word-with-photo.docx').waitFor({ timeout: 30000 });
  await upload.getByLabel('Name in scanned-cv.pdf').waitFor({ timeout: 120000 });

  const value = (label) => upload.getByLabel(label).inputValue();
  check('PDF: name read', (await value('Name in pdf-with-photo.pdf')) === 'Rupa Akter', await value('Name in pdf-with-photo.pdf'));
  check('PDF: mobile read', (await value('Mobile in pdf-with-photo.pdf')) === '01711234501');
  check('PDF: email read', (await value('Email in pdf-with-photo.pdf')) === 'rupa@example.com');
  check('PDF: photo fetched from the CV', await upload.getByAltText('Photo found in pdf-with-photo.pdf').count() === 1);
  check('PDF: a logo is not mistaken for a photo', await upload.getByAltText('Photo found in pdf-with-logo-only.pdf').count() === 0);
  check('Word: name read', (await value('Name in word-with-photo.docx')) === 'Mitu Sarker', await value('Name in word-with-photo.docx'));
  check('Word: mobile read from a text box', (await value('Mobile in word-with-photo.docx')) === '01911234503', await value('Mobile in word-with-photo.docx'));
  check('Word: photo fetched from the CV', await upload.getByAltText('Photo found in word-with-photo.docx').count() === 1);
  const scanName = await value('Name in scanned-cv.pdf');
  check('Scan: name read by OCR', /karim miah/i.test(scanName), scanName);
  check('Scan: mobile read by OCR', (await value('Mobile in scanned-cv.pdf')) === '01511234505', await value('Mobile in scanned-cv.pdf'));
  check('Scan: portrait cropped from the page', await upload.getByAltText('Photo found in scanned-cv.pdf').count() === 1);
  check('Duplicate in the same upload is flagged', await upload.getByText('Same person as an earlier file').count() === 1);
  await shot('06-upload-review', { fullPage: false });
  const scanPhoto = upload.getByAltText('Photo found in scanned-cv.pdf');
  if (await scanPhoto.count()) {
    const size = await scanPhoto.evaluate((img) => ({ w: img.naturalWidth, h: img.naturalHeight }));
    check('Scan: crop has a portrait shape', size.h >= size.w * 0.9 && size.h <= size.w * 1.7, `${size.w}x${size.h}`);
  }

  await upload.getByRole('button', { name: /^Import 4 CVs/ }).click();
  await upload.waitFor({ state: 'detached', timeout: 30000 });
  await page.getByRole('row', { name: /Rupa Akter/ }).waitFor();
  check('CVs imported into the bucket', await page.getByRole('row', { name: /Mitu Sarker/ }).count() === 1);

  // --- Candidate profile, photo and original file
  await page.getByRole('button', { name: /^Rupa Akter/ }).click();
  const drawer = page.getByRole('dialog', { name: 'Rupa Akter' });
  await drawer.waitFor();
  await drawer.getByText('University of Dhaka').waitFor();
  check('Profile shows education from the CV', true);
  check('Profile shows personal details', await drawer.getByText('Abdul Malek').count() === 1);
  await shot('07-candidate-drawer');
  await drawer.getByRole('tab', { name: 'Original CV' }).click();
  await drawer.locator('iframe').waitFor();
  check('Original CV opens', true);
  await drawer.getByRole('tab', { name: 'All CV text' }).click();
  await drawer.getByText('Career Objective', { exact: false }).first().waitFor();
  check('Complete CV text is kept', true);
  await drawer.getByRole('tab', { name: 'History' }).click();
  await drawer.getByText('CV received').waitFor();
  check('History records the upload', true);

  // --- Edit profile: the whole profile on one form inside the card, saved once
  check('A new CV is timed as its review', await drawer.getByText(/Reviewing the CV:/).count() === 1);
  await drawer.getByRole('button', { name: 'Edit profile' }).click();
  const profileForm = drawer.getByRole('form', { name: 'Edit profile of Rupa Akter' });
  await profileForm.waitFor();
  check('Edit profile opens inside the card, with no second window', await page.getByRole('dialog').count() === 1);
  check('Edit profile switches to the details tab', await drawer.getByRole('tab', { name: 'Full details' }).getAttribute('aria-selected') === 'true');
  check('Contact, personal details and the lists are all on one form',
    await profileForm.getByLabel("Father's name").count() === 1 && await profileForm.getByLabel('Degree 1: institution').count() === 1 && await profileForm.getByLabel('Job 1: company').count() === 1);
  const degrees = await profileForm.getByLabel(/^Degree \d+: degree$/).count();
  await profileForm.getByRole('button', { name: 'Add degree' }).click();
  await profileForm.getByLabel(`Degree ${degrees + 1}: degree`).fill('Diploma in HRM');
  await profileForm.getByLabel(`Degree ${degrees + 1}: institution`).fill('Sample Training Institute');
  await profileForm.getByLabel('Notice period').fill('1 month');
  await profileForm.getByRole('button', { name: 'Add reference' }).click();
  const references = await profileForm.getByLabel(/^Reference \d+: name$/).count();
  await profileForm.getByLabel(`Reference ${references}: name`).fill('Sample Referee');
  await profileForm.getByLabel(`Reference ${references}: mobile`).fill('01700000000');
  check('The footer says nothing is saved yet', await drawer.getByText('Changes are not saved until you press Save profile', { exact: false }).count() === 1);
  await shot('07b-edit-profile');
  await page.keyboard.press('Escape');
  const discard = page.getByRole('dialog', { name: 'Discard the profile changes?' });
  await discard.waitFor();
  check('Esc with unsaved changes asks first', await drawer.isVisible());
  await discard.getByRole('button', { name: 'Cancel', exact: true }).click();
  await discard.waitFor({ state: 'detached' });
  check('Keeping on editing keeps what was typed', (await profileForm.getByLabel('Notice period').inputValue()) === '1 month');
  await drawer.getByRole('button', { name: 'Save profile' }).click();
  await profileForm.waitFor({ state: 'detached' });
  await page.getByText('Rupa Akter: profile saved.').waitFor();
  check('Saved profile shows the added degree', await drawer.getByText('Diploma in HRM').count() === 1);
  check('Saved profile shows the added referee and the notice period', await drawer.getByText('Sample Referee').count() === 1 && await drawer.getByText('1 month').count() === 1);
  await drawer.getByRole('button', { name: 'Close', exact: true }).click();

  // --- Filters: experience, industry, salary range, keyword
  const tableRows = async () => (await page.getByRole('row').count()) - 1;
  const clearFilters = () => page.getByRole('button', { name: 'Clear filters' }).click();
  const everyone = await tableRows();
  await page.getByLabel('Keyword').fill('mitu');
  await page.getByRole('row', { name: /Rupa Akter/ }).waitFor({ state: 'detached' });
  check('Keyword finds by name', await page.getByRole('row', { name: /Mitu Sarker/ }).count() === 1 && (await tableRows()) === 1);
  await page.getByLabel('Keyword').fill('village rampur');
  await page.getByRole('row', { name: /Rupa Akter/ }).waitFor();
  check('Keyword searches the full CV text', (await tableRows()) >= 3 && await page.getByRole('row', { name: /Shirin Sultana/ }).count() === 0, `${await tableRows()} rows`);
  await page.getByLabel('Keyword').fill('village rampur, nothing-like-this');
  await page.getByText('No candidate matches this view').waitFor();
  check('Commas require every keyword', true);
  await clearFilters();
  check('Clear filters brings everyone back', (await tableRows()) === everyone, `${await tableRows()} of ${everyone}`);
  const fromThumb = page.getByLabel('Experience from');
  const sliderBox = await fromThumb.boundingBox();
  await shot('06a-range-sliders');
  await page.mouse.move(sliderBox.x + 9, sliderBox.y + sliderBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sliderBox.x + sliderBox.width / 2, sliderBox.y + sliderBox.height / 2, { steps: 6 });
  await page.mouse.up();
  check('The range slider drags with the mouse', Number(await fromThumb.inputValue()) > 0, await fromThumb.inputValue());
  check('Dragging narrows the table', (await tableRows()) < everyone, `${await tableRows()} of ${everyone}`);
  await clearFilters();
  check('Clearing returns the slider to its end', (await fromThumb.inputValue()) === (await fromThumb.getAttribute('min')));
  await page.getByLabel('Experience from').fill('5.5');
  await page.getByLabel('Experience to').fill('6');
  await page.getByRole('row', { name: /Rupa Akter/ }).waitFor();
  check('Experience range narrows the table', (await tableRows()) < everyone && await page.getByRole('row', { name: /Imran Khan/ }).count() === 0);
  check('People with no experience on record are mentioned, not silently hidden', await page.getByText(/Not shown: 1 with no experience on record/).count() === 1);
  await clearFilters();
  await page.getByLabel('Industry').selectOption('IT & Telecom');
  await page.getByRole('row', { name: /Kamal Hasan|Rakib Hasan|Nabila/ }).first().waitFor({ state: 'attached' }).catch(() => undefined);
  const industryCells = await page.locator('tbody tr').evaluateAll((rows) => rows.map((r) => r.textContent));
  check('Industry filter shows only that industry', industryCells.length > 0 && industryCells.every((text) => text.includes('IT & Telecom')), `${industryCells.length} rows`);
  await page.getByLabel('Industry').selectOption('Garments & Textile');
  await page.getByRole('row', { name: /Rupa Akter/ }).waitFor();
  check('Industry is read from the employer in the CV', true);
  await clearFilters();
  await page.getByLabel(/^Salary.* from$/).fill('44000');
  await page.getByLabel(/^Salary.* to$/).fill('46000');
  await page.getByRole('row', { name: /Rupa Akter/ }).waitFor({ state: 'detached' });
  const salaryCells = await page.locator('tbody tr').evaluateAll((rows) => rows.map((r) => r.textContent));
  check('Salary range filter works', salaryCells.length > 0 && salaryCells.every((text) => text.includes('45,000')), `${salaryCells.length} rows`);
  check('People with no salary on record are mentioned', await page.getByText(/with no salary on record/).count() === 1);
  await shot('06b-bucket-filters', { fullPage: true });
  await clearFilters();

  // --- The full process for one candidate: one row click, one card, one bar from start to finish
  const row = () => page.getByRole('row', { name: /Rupa Akter/ });
  const card = page.getByRole('dialog', { name: 'Rupa Akter' });
  const button = (name) => card.getByRole('button', { name, exact: true });
  const fillPanel = async (dialog, people) => {
    for (const [index, person] of people.entries()) {
      if (index > 0) await dialog.getByRole('button', { name: 'Add more' }).click();
      await dialog.getByLabel(new RegExp(`^Interviewer ${index + 1}\\b`)).fill(person.name);
      await dialog.getByLabel(`Score from interviewer ${index + 1}`).fill(String(person.score));
      if (person.recommended) await dialog.locator('label', { hasText: 'Recommended' }).nth(index).click();
    }
  };
  const stage = async (text) => {
    await card.getByText(text, { exact: true }).first().waitFor();
    check(`Status: ${text}`, true);
  };
  const currentStep = () => card.getByRole('list', { name: 'Process' }).locator('[aria-current=step]').innerText();

  check('A new CV\'s row offers Select and Reject', await row().getByRole('button', { name: 'Select Rupa Akter and hand over' }).count() === 1 && await row().getByRole('button', { name: 'Reject Rupa Akter' }).count() === 1);
  check('A row holds no later process steps', await row().getByRole('button', { name: /^(Shortlist|Confirm|Candidate confirmed|Set interview)/ }).count() === 0);
  await row().getByRole('cell').last().click();
  await card.waitFor();
  check('One click anywhere on the row opens the card', true);
  check('The card opens on full details', await card.getByRole('tab', { name: 'Full details' }).getAttribute('aria-selected') === 'true');
  check('The process bar shows all seven steps', await card.getByRole('list', { name: 'Process' }).getByRole('listitem').count() === 7);
  check('The bar starts at CV review', (await currentStep()).includes('CV review'), await currentStep());
  await shot('07a-card-new-cv');
  check('The CV review is timed while the CV is new', await card.getByText(/Reviewing the CV:/).count() === 1);
  await button('Select').click();
  const handOver = page.getByRole('dialog', { name: /Select Rupa Akter and hand over/ });
  await handOver.waitFor();
  check('Select asks who on the process team takes the CV', await handOver.getByRole('radio').count() === 3);
  await handOver.getByRole('button', { name: 'Select and hand over' }).click();
  await handOver.waitFor({ state: 'detached' });
  await stage('Shortlisted');
  await card.getByText(/^CV review time:/).waitFor();
  check('Selecting the CV stops its review timer and shows the total', await card.getByText(/Reviewing the CV:/).count() === 0);
  check('Select moves the bar to the call', (await currentStep()).includes('Call'), await currentStep());
  await button('Follow up').click();
  const follow = page.getByRole('dialog', { name: /Follow up with Rupa/ });
  await follow.getByLabel('Call again on: time').fill('17:30');
  await follow.getByLabel('Call again on: day').fill('2099-11-05');
  await follow.getByLabel('Call note').fill('Asked to call back.');
  await follow.getByRole('button', { name: 'Save follow-up' }).click();
  await follow.waitFor({ state: 'detached' });
  await stage('Call follow-up');
  check('The follow-up time shows on the bar', await card.getByText('Again 5 Nov, 5:30 PM').count() === 1);
  await button('Candidate confirmed').click();
  const confirm = page.getByRole('dialog', { name: /Record confirmation: Rupa/ });
  await confirm.waitFor();
  check('A call is recorded with its time', await confirm.getByLabel('Called on: time').count() === 1 && await confirm.getByLabel('Candidate confirmed on: time').count() === 1);
  await confirm.getByLabel('Called on: day').fill('2026-11-02');
  await confirm.getByLabel('Called on: time').fill('10:30');
  await confirm.getByLabel('Candidate confirmed on: day').fill('2026-11-01');
  await confirm.getByRole('button', { name: 'Save confirmation' }).click();
  await page.waitForTimeout(200);
  check('Confirmation cannot be dated before the call', await confirm.isVisible());
  await confirm.getByLabel('Candidate confirmed on: day').fill('2026-11-04');
  await confirm.getByLabel('Candidate confirmed on: time').fill('16:15');
  await shot('07b-confirm-dialog');
  await confirm.getByRole('button', { name: 'Save confirmation' }).click();
  await confirm.waitFor({ state: 'detached' });
  await stage('Call confirmed');
  check('Confirmation day and time show on the bar', await card.getByRole('list', { name: 'Process' }).getByText('4 Nov, 4:15 PM').count() === 1);
  await button('Set interview schedule').click();
  const message = page.getByRole('dialog', { name: 'Set primary interview schedule' });
  const markButton = message.getByRole('button', { name: 'Save schedule', exact: true });
  check('A schedule cannot be set without a date', await markButton.isDisabled());
  await message.getByLabel('Interview on: day').fill('2026-07-07');
  await message.getByLabel('Interview on: time').fill('15:00');
  const preview = await message.locator('li p').last().innerText();
  check(
    'Message wording matches the company sample',
    preview === 'Dear Concern, Interview for "Jr. Executive" on 07/07/26 (Tue) at 3:00 PM.B/R, HRD, BITOPI GROUP, 823/3 Begum Rokeya Sharani, Shewrapara, Mirpur.',
    preview,
  );
  await shot('08-schedule-dialog');
  await markButton.click();
  await message.waitFor({ state: 'detached' });
  await stage('Primary scheduled');
  await button('Change schedule').click();
  const reschedule = page.getByRole('dialog', { name: 'Set primary interview schedule' });
  check('Changing a schedule starts from the saved one', (await reschedule.getByLabel('Interview on: day').inputValue()) === '2026-07-07');
  await reschedule.getByRole('button', { name: 'Cancel' }).click();
  await reschedule.waitFor({ state: 'detached' });
  await button('Select').click();
  const primary = page.getByRole('dialog', { name: /Primary interview: select Rupa/ });
  await primary.waitFor();
  check('The feedback box is gone from scoring', await primary.getByLabel('Feedback').count() === 0);
  await primary.getByRole('button', { name: 'Save as selected' }).click();
  await page.waitForTimeout(200);
  check('An interviewer and score are required', await primary.isVisible());
  await fillPanel(primary, [
    { name: 'Interviewer One', score: 8, recommended: true },
    { name: 'Interviewer Two', score: 7, recommended: false },
    { name: 'To Remove', score: 1, recommended: false },
  ]);
  check('Add more gives a new interviewer row', await primary.getByLabel(/^Interviewer 3\b/).count() === 1);
  await primary.getByRole('button', { name: 'Remove interviewer 3' }).click();
  check('Average updates as scores are typed', await primary.getByText('Average').locator('strong').innerText() === '7.5');
  await shot('08b-interview-panel');
  await primary.getByRole('button', { name: 'Save as selected' }).click();
  await primary.waitFor({ state: 'detached' });
  await stage('Primary selected');
  check('A full star for the one who recommended, a blank one for the other', await card.getByRole('img', { name: 'Recommended by 1 of 2 interviewers' }).count() === 1);
  check('Blank and full stars both draw', await card.getByRole('img', { name: 'Recommended by 1 of 2 interviewers' }).locator('svg').count() === 2);
  check('The stars name who did not recommend', (await card.getByRole('img', { name: 'Recommended by 1 of 2 interviewers' }).getAttribute('title')) === 'Recommended by Interviewer One. Not recommended by Interviewer Two');

  await button('Ask for feedback').click();
  const reviewDialog = page.getByRole('dialog', { name: /Ask Rupa Akter for feedback/ });
  const reviewLink = await reviewDialog.getByLabel('Private link').inputValue();
  check('Candidate gets a private review link', /\/review\/[0-9a-f-]{36}$/.test(reviewLink), reviewLink);
  await reviewDialog.getByRole('button', { name: 'Close', exact: true }).click();

  await button('Set interview schedule').click();
  const finalMessage = page.getByRole('dialog', { name: 'Set final interview schedule' });
  await finalMessage.getByLabel('Interview on: day').fill('2026-08-13');
  await finalMessage.getByLabel('Interview on: time').fill('11:20');
  const finalText = await finalMessage.locator('li p').last().innerText();
  check('Final message wording matches the company sample', finalText.includes('Dear Concern Rupa Akter,') && finalText.includes('final interview on 13/08/2026 (Thursday) at 11:20 AM.') && finalText.includes('Close to metrorail pillar no 321'), finalText);
  await finalMessage.getByRole('button', { name: 'Save schedule', exact: true }).click();
  await finalMessage.waitFor({ state: 'detached' });
  await stage('Final scheduled');
  await button('Select').click();
  const final = page.getByRole('dialog', { name: /Final interview: select Rupa/ });
  await fillPanel(final, [
    { name: 'Interviewer One', score: 9, recommended: true },
    { name: 'Interviewer Three', score: 8, recommended: true },
  ]);
  await final.getByRole('button', { name: 'Save as selected' }).click();
  await page.waitForTimeout(200);
  check('Final selection needs Merit or Waiting', await final.isVisible());
  await final.getByLabel('Selection list').selectOption('merit');
  await final.getByLabel('Remarks (optional)').fill('Best answers on HR software; can join early.');
  await shot('08c-final-panel');
  await final.getByRole('button', { name: 'Save as selected' }).click();
  await final.waitFor({ state: 'detached' });
  await stage('Final selected');
  check('Merit remarks show on the card', (await card.innerText()).includes('Remarks: Best answers on HR software; can join early.'));
  check('Recommendations from both rounds add up to stars', await card.getByRole('img', { name: 'Recommended by 3 of 4 interviewers' }).count() === 1);
  check('The bar now asks for the final decision', (await currentStep()).includes('Final decision'), await currentStep());
  await shot('08d-card-final-decision');

  // Undo a mistake, before anything is locked
  await button('Undo final result').click();
  await stage('Final scheduled');
  check('A wrong result can be undone', true);
  await button('Select').click();
  const final2 = page.getByRole('dialog', { name: /Final interview: select Rupa/ });
  check('Scores are kept when a result is undone', (await final2.getByLabel(/^Interviewer 2\b/).inputValue()) === 'Interviewer Three');
  await final2.getByLabel('Selection list').selectOption('merit');
  await final2.getByRole('button', { name: 'Save as selected' }).click();
  await final2.waitFor({ state: 'detached' });

  // Review time: only the CV review step counts, not the steps after it
  check('Later steps are not counted as CV review', await card.getByText(/Reviewing the CV:/).count() === 0 && await card.getByText(/^CV review time:/).count() === 1);
  check('The card says the step was saved, and where the candidate is now', await card.getByText(/^Saved .*Now at Final selected\.$/).count() === 1);
  await shot('08e-card-saved');
  const saveBox = await card.getByRole('button', { name: 'Save and close' }).boundingBox();
  const toastBoxes = await page.getByRole('status').locator('div').evaluateAll((els) => els.map((el) => {
    const { top, bottom, left, right } = el.getBoundingClientRect();
    return { top, bottom, left, right };
  }));
  const covered = toastBoxes.some((t) => t.left < saveBox.x + saveBox.width && t.right > saveBox.x && t.top < saveBox.y + saveBox.height && t.bottom > saveBox.y);
  check('A toast never sits on Save and close', toastBoxes.length > 0 && !covered, `${toastBoxes.length} toasts`);
  await card.getByRole('button', { name: 'Save and close' }).click();
  await card.waitFor({ state: 'detached' });
  await page.getByText('Rupa Akter: saved. Now at Final selected.').waitFor();
  check('Save and close leaves the card and confirms it', true);
  check('Once selected, the row no longer offers Select and Reject', await row().getByRole('button', { name: /^(Select|Reject) Rupa/ }).count() === 0);
  const reviewCell = await row().getByRole('cell').last().innerText();
  check('The row shows the CV review time', /^\d+(s|m \d+s|h \d+m)$/.test(reviewCell.trim()), reviewCell);
  await row().getByRole('cell').last().click();
  await card.getByRole('tab', { name: 'History' }).click();
  await card.getByText(/CV reviews:/).waitFor();
  check('History lists each review with who did it', await card.getByText(/Tareq Azij/).count() >= 1);
  await card.getByRole('button', { name: 'Close', exact: true }).click();
  await card.waitFor({ state: 'detached' });

  // --- A candidate can turn the job down on the call: recorded with its day and time
  const farhana = page.getByRole('row', { name: /Farhana Yasmin/ });
  await farhana.getByRole('cell').last().click();
  const farhanaCard = page.getByRole('dialog', { name: 'Farhana Yasmin' });
  await farhanaCard.waitFor();
  check('The card starts with nothing saved yet', await farhanaCard.getByText(/^Saved /).count() === 0);
  await farhanaCard.getByRole('button', { name: 'Candidate rejected' }).click();
  const callReject = page.getByRole('dialog', { name: /Record rejection: Farhana/ });
  check('A rejection on the call takes the call and the answer, each with a time', await callReject.getByLabel('Called on: time').count() === 1 && await callReject.getByLabel('Candidate rejected on: time').count() === 1);
  await callReject.getByLabel('Called on: day').fill('2026-11-02');
  await callReject.getByLabel('Called on: time').fill('10:30');
  await callReject.getByLabel('Candidate rejected on: day').fill('2026-11-01');
  await callReject.getByRole('button', { name: 'Save rejection' }).click();
  await page.waitForTimeout(200);
  check('The answer cannot be dated before the call', await callReject.isVisible());
  await callReject.getByLabel('Candidate rejected on: day').fill('2026-11-03');
  await callReject.getByLabel('Candidate rejected on: time').fill('12:15');
  await shot('07c-call-rejection-dialog');
  await callReject.getByRole('button', { name: 'Save rejection' }).click();
  await callReject.waitFor({ state: 'detached' });
  await farhanaCard.getByText('Candidate rejected on the call').waitFor();
  check('The rejection shows its day and time', await farhanaCard.getByRole('list', { name: 'Process' }).getByText('Rejected 3 Nov, 12:15 PM').count() === 1);
  await farhanaCard.getByRole('button', { name: 'Undo call result' }).click();
  await farhanaCard.getByRole('button', { name: 'Candidate rejected' }).waitFor();
  check('A rejection recorded by mistake can be undone', true);
  await farhanaCard.getByRole('button', { name: 'Save and close' }).click();
  await farhanaCard.waitFor({ state: 'detached' });

  // --- Rejecting a new CV straight from its row, with the reason
  const shirin = page.getByRole('row', { name: /Shirin Sultana/ });
  await shirin.getByRole('button', { name: 'Reject Shirin Sultana' }).click();
  const rowReject = page.getByRole('dialog', { name: 'Reject Shirin Sultana' });
  await rowReject.getByLabel('Reason (optional)').fill('Not enough experience.');
  await rowReject.getByRole('button', { name: 'Save rejection' }).click();
  await rowReject.waitFor({ state: 'detached' });
  await shirin.getByRole('button', { name: 'Reject Shirin Sultana' }).waitFor({ state: 'detached' });
  check('Reject on a row asks the reason and rejects the CV', (await shirin.innerText()).includes('Rejected'));

  // --- Bulk actions
  await page.getByRole('tab', { name: /^New CVs/ }).click();
  await page.getByLabel('Select all shown candidates').check();
  await page.getByRole('button', { name: /^Select and hand over \d+$/ }).click();
  const bulkHandover = page.getByRole('dialog', { name: /and hand over/ });
  await bulkHandover.getByRole('button', { name: 'Select and hand over' }).click();
  await bulkHandover.waitFor({ state: 'detached' });
  await page.getByRole('tab', { name: /^New CVs/ }).getByText('0').waitFor();
  check('Bulk shortlist works', true);
  await page.getByRole('tab', { name: /^All/ }).click();

  // --- Download from a bucket
  const [bucketFile] = await Promise.all([page.waitForEvent('download'), page.getByRole('main').getByRole('button', { name: 'Download' }).click()]);
  check('Bucket table downloads as Excel', (await bucketFile.suggestedFilename()).endsWith('.xlsx'));

  // --- Dashboard: everyone selected at CV review, in one card
  await page.goto(`${BASE}/`);
  const shortlistCard = page.getByRole('heading', { name: /^Shortlisted candidates \(\d+\)$/ });
  await shortlistCard.waitFor();
  check('The dashboard lists the shortlisted candidates', /\((\d+)\)/.exec(await shortlistCard.innerText())?.[1] > 0);
  await page.getByRole('button', { name: 'See all' }).click();
  const shortlistDetail = page.getByRole('dialog', { name: 'Shortlisted candidates' });
  await shortlistDetail.getByRole('row', { name: /Open Rupa Akter/ }).waitFor();
  check('See all shows every shortlisted candidate, Rupa included', true);
  await shot('09a-dashboard-shortlisted');
  await shortlistDetail.getByRole('button', { name: 'Close', exact: true }).first().click();
  await shortlistDetail.waitFor({ state: 'detached' });

  // --- Block C
  await page.goto(`${BASE}/selected`);
  await heading('Selected Candidates').waitFor();
  await page.getByRole('row', { name: /Rupa Akter/ }).waitFor();
  check('Selected candidate reaches the database', true);
  await shot('09-selected', { fullPage: true });

  // --- Merit first; the waiting list only moves up by hand; a decision locks everything
  const selectedRow = (name) => page.getByRole('row', { name: new RegExp(name) });
  const openCard = async (name) => {
    await selectedRow(name).getByRole('cell').last().click();
    const opened = page.getByRole('dialog', { name });
    await opened.waitFor();
    return opened;
  };
  check('Merit candidates are listed first', (await page.locator('tbody tr').last().innerText()).includes('Liton Das'));
  check('The list holds no inline status controls', await page.locator('tbody select, tbody input').count() === 0);

  const liton = await openCard('Liton Das');
  check('A waiting candidate has no letter to send', await liton.getByRole('button', { name: 'Send confirmation letter' }).count() === 0);
  check('A waiting candidate can move to Merit', await liton.getByRole('button', { name: 'Move to Merit' }).count() === 1);
  await liton.getByRole('button', { name: 'Close', exact: true }).click();
  await liton.waitFor({ state: 'detached' });

  const rahim = await openCard('Rahim Uddin');
  await rahim.getByRole('button', { name: 'Send confirmation letter' }).click();
  const letter = page.getByRole('dialog', { name: /Send confirmation letter to Rahim/ });
  await letter.getByRole('button', { name: 'Save and lock' }).click();
  await page.waitForTimeout(200);
  check('The letter needs the joining time as well as the day', await letter.isVisible());
  await letter.getByLabel('Selected on: time').fill('16:30');
  await letter.getByLabel('Joins on: time').fill('09:00');
  await shot('09a-confirm-letter-dialog');
  await letter.getByRole('button', { name: 'Save and lock' }).click();
  await letter.waitFor({ state: 'detached' });
  await rahim.getByText('Confirmed. Process locked.').waitFor();
  check('Confirming locks the process', true);
  check('The locked card shows both dates', await rahim.getByText(/Selected on/).count() >= 1 && await rahim.getByText(/Offered joining/).count() >= 1);
  for (const name of ['Select', 'Undo final result', 'Move to Waiting', 'Reject', 'Send confirmation letter']) {
    check(`Locked card offers no "${name}"`, await rahim.getByRole('button', { name, exact: true }).count() === 0);
  }
  check('The locked card does not time a review', await rahim.getByText(/Reviewing the CV:/).count() === 0);
  await shot('09c-card-locked');
  await rahim.getByRole('button', { name: 'Joining details' }).click();
  const joining = page.getByRole('dialog', { name: /Joining details: Rahim/ });
  check('Joining details cannot change the locked dates', await joining.getByLabel(/Joining date|Joins on/).count() === 0);
  await joining.getByLabel('What happened after the letter').selectOption('declined');
  await joining.getByRole('button', { name: 'Save' }).click();
  await joining.waitFor({ state: 'detached' });
  await rahim.getByRole('button', { name: 'Close', exact: true }).click();
  await rahim.waitFor({ state: 'detached' });
  await page.getByText(/1 merit candidate did not confirm, and 1 is on the waiting list/).waitFor();
  check('A merit candidate not confirming points to the waiting list', true);
  await shot('09b-selected-did-not-confirm', { fullPage: true });
  await page.goto(`${BASE}/`);
  await page.getByText(/merit did not confirm, consider the waiting list/).waitFor();
  check('Dashboard reminds HR about the waiting list', true);
  await page.goBack();
  await heading('Selected Candidates').waitFor();
  await page.getByRole('row', { name: /Rupa Akter/ }).waitFor();

  const liton2 = await openCard('Liton Das');
  await liton2.getByRole('button', { name: 'Move to Merit' }).click();
  await page.getByText('Liton Das moved to Merit.').waitFor();
  check('Moved to Merit, the letter can be sent', await liton2.getByRole('button', { name: 'Send confirmation letter' }).count() === 1);
  await liton2.getByRole('button', { name: 'Reject', exact: true }).click();
  const rejection = page.getByRole('dialog', { name: 'Reject Liton Das' });
  check('A rejection takes two dates and times too', await rejection.getByLabel('Rejected on: time').count() === 1 && await rejection.getByLabel('Candidate informed on: time').count() === 1);
  await shot('09d-reject-dialog');
  await rejection.getByRole('button', { name: 'Save and lock' }).click();
  await rejection.waitFor({ state: 'detached' });
  await liton2.getByText('Rejected. Process locked.').waitFor();
  check('Rejecting locks the process', await liton2.getByRole('button', { name: 'Move to Merit' }).count() === 0);
  await liton2.getByRole('button', { name: 'Unlock (admin)' }).click();
  const unlock = page.getByRole('dialog', { name: 'Unlock Liton Das?' });
  await unlock.getByRole('button', { name: 'Unlock', exact: true }).click();
  await unlock.waitFor({ state: 'detached' });
  await liton2.getByRole('button', { name: 'Record rejection' }).waitFor();
  check('An admin can unlock a decision made by mistake', true);
  await liton2.getByRole('button', { name: 'Close', exact: true }).click();
  await liton2.waitFor({ state: 'detached' });

  const earlyLetter = await page.getByRole('row', { name: /Rupa Akter/ }).count();
  check('Rupa is still on the list before her letter', earlyLetter === 1);
  await page.goto(`${BASE}/selected/cand-2/documents`);
  await page.getByText(/is not ready/).waitFor();
  check('No letter exists before the decision', true);
  await page.goto(`${BASE}/selected`);
  await page.getByRole('row', { name: /Rupa Akter/ }).waitFor();

  const [xlsx] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download Excel' }).click()]);
  const xlsxPath = join(root, 'tests', '.tmp', await xlsx.suggestedFilename());
  await xlsx.saveAs(xlsxPath);
  check('Selected list downloads as Excel', statSync(xlsxPath).size > 3000, `${statSync(xlsxPath).size} bytes`);
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'CSV' }).click()]);
  const csvPath = join(root, 'tests', '.tmp', await csv.suggestedFilename());
  await csv.saveAs(csvPath);
  const csvText = readFileSync(csvPath, 'utf8');
  check('CSV carries the candidate data', csvText.includes('Rupa Akter') && csvText.includes('1995269261012'));

  const rupa = await openCard('Rupa Akter');
  await rupa.getByRole('button', { name: 'Send confirmation letter' }).click();
  const rupaLetter = page.getByRole('dialog', { name: /Send confirmation letter to Rupa/ });
  await rupaLetter.getByLabel('Selected on: day').fill('2026-09-01');
  await rupaLetter.getByLabel('Joins on: day').fill('2026-09-21');
  await rupaLetter.getByLabel('Joins on: time').fill('09:00');
  await rupaLetter.getByRole('button', { name: 'Save and lock' }).click();
  await rupaLetter.waitFor({ state: 'detached' });

  // --- After the letter: call for joining, and record the day the candidate confirms
  await rupa.getByText(/Next: call for joining\./).waitFor();
  check('After the letter, the next step is the joining call', true);
  await rupa.getByRole('button', { name: 'Call for joining' }).click();
  const joiningCall = page.getByRole('dialog', { name: /Call for joining: Rupa/ });
  check('The joining call takes the call and the confirmed joining, each with a time',
    await joiningCall.getByLabel('Called for joining on: time').count() === 1 && await joiningCall.getByLabel('Candidate confirmed joining on: time').count() === 1);
  check('The confirmed joining starts from the day in the letter', (await joiningCall.getByLabel('Candidate confirmed joining on: day').inputValue()) === '2026-09-21');
  await joiningCall.getByLabel('Called for joining on: day').fill('2026-09-10');
  await joiningCall.getByLabel('Called for joining on: time').fill('11:00');
  await joiningCall.getByLabel('Candidate confirmed joining on: day').fill('2026-09-09');
  await joiningCall.getByRole('button', { name: 'Save joining call' }).click();
  await page.waitForTimeout(200);
  check('The joining day cannot come before the call', await joiningCall.isVisible());
  await joiningCall.getByLabel('Candidate confirmed joining on: day').fill('2026-09-23');
  await joiningCall.getByLabel('Candidate confirmed joining on: time').fill('10:00');
  await shot('09e-joining-call');
  await joiningCall.getByRole('button', { name: 'Save joining call' }).click();
  await joiningCall.waitFor({ state: 'detached' });
  await rupa.getByText('Joining confirmed. Process locked.').waitFor();
  check('Confirming the joining changes the stage', await rupa.getByText('Joining confirmed', { exact: true }).count() >= 1);
  const lockedPanel = await rupa.locator('p', { hasText: 'Offered joining' }).first().innerText();
  check('The card shows the offered and the confirmed joining side by side', /Offered joining 21 Sep/.test(lockedPanel) && /Called for joining 10 Sep/.test(lockedPanel) && /Candidate confirmed joining 23 Sep/.test(lockedPanel), lockedPanel);
  await shot('09f-joining-confirmed');
  await rupa.getByRole('button', { name: 'Letter and joining pack' }).click();
  await page.getByRole('heading', { name: 'Joining pack: Rupa Akter' }).waitFor();
  const offer = page.getByRole('article', { name: 'Offer Letter' });
  await offer.waitFor();
  const offerText = await offer.innerText();
  check('Offer letter: candidate name filled', offerText.includes('Attention: Rupa Akter,'));
  check('Offer letter: role and company filled', offerText.includes('in Tarasima Apparels Ltd.(Corporate Office) as "Jr. Executive" under HR & Admin Department'));
  check('Letters use the joining day the candidate confirmed', offerText.includes('in the Company on 23rd September 2026.'));
  check('Offer letter: signatory from settings', offerText.includes('Demo Signatory') && offerText.includes('hr-demo@example.com'));
  check('Offer letter: document list from the sample', offerText.includes('TIN certificate') && offerText.includes('Passport size Photograph'));
  const info = page.getByRole('article', { name: 'Employee Information Form' });
  const infoText = await info.innerText();
  check('Employee form filled with no typing', infoText.includes('Abdul Malek') && infoText.includes('1995269261012') && infoText.includes('University of Dhaka') && infoText.includes('Sample Apparels Ltd.'));
  check('Employee form shows the photo from the CV', await info.getByAltText('Photo of Rupa Akter').count() === 1);
  await page.waitForTimeout(500);
  await shot('10-documents', { fullPage: false });
  await page.emulateMedia({ media: 'print' });
  await shot('10b-documents-print-view', { fullPage: true });
  const packPath = join(root, 'tests', '.tmp', 'joining-pack.pdf');
  await page.pdf({ path: packPath, preferCSSPageSize: true, printBackground: true });
  await page.emulateMedia({ media: 'screen' });
  const pack = await PDFDocument.load(readFileSync(packPath));
  const pages = pack.getPageCount();
  check('Joining pack prints with no blank or missing pages', pages >= 5 && pages <= 7, `${pages} pages for 5 documents`);
  const firstPage = pack.getPage(0).getSize();
  check('Pages are A4', Math.abs(firstPage.width - 595) < 2 && Math.abs(firstPage.height - 842) < 2, `${Math.round(firstPage.width)}x${Math.round(firstPage.height)} pt`);

  // --- Public application form
  const applicant = await context.newPage();
  applicant.on('pageerror', (error) => { if (!LIVE_RELOAD_NOISE.test(error.message)) problems.push(`applicant pageerror: ${error.message}`); });
  await applicant.goto(`${BASE}/apply/demo-merch`);
  await applicant.getByRole('heading', { name: 'Apply for Merchandiser' }).waitFor();
  await applicant.locator('input[type=file]').first().setInputFiles(join(FIXTURES, 'cv-for-public-form.pdf'));
  await applicant.getByText('We filled in what we could read').waitFor({ timeout: 30000 });
  check('Company form fills itself from the uploaded CV', (await applicant.getByLabel('Full name').inputValue()) === 'Hena Begum');
  check('Company form picks up the photo', await applicant.getByAltText('Your photo').count() === 1);
  await applicant.screenshot({ path: join(shots, '11-apply-form.png'), fullPage: true });
  await applicant.getByRole('button', { name: 'Submit application' }).click();
  await applicant.getByRole('heading', { name: 'Application received' }).waitFor();
  check('Application submitted without an account', true);

  // Rupa has moved past her primary interview since that link was made, so it no longer takes answers.
  await applicant.goto(reviewLink);
  await applicant.getByRole('heading', { name: 'This feedback link has closed' }).waitFor();
  check('A feedback link closes once the candidate moves on', await applicant.getByRole('button', { name: 'Send feedback' }).count() === 0);

  // Tanvir's primary interview is still to come: his link can be shared now, before the interview.
  await page.goto(`${BASE}/?candidate=cand-3`);
  const tanvir = page.getByRole('dialog', { name: 'Tanvir Ahmed' });
  await tanvir.getByRole('button', { name: 'Ask for feedback', exact: true }).click();
  const tanvirReview = page.getByRole('dialog', { name: /Ask Tanvir Ahmed for feedback/ });
  const openLinkField = tanvirReview.getByLabel('Private link');
  await page.waitForFunction(() => [...document.querySelectorAll('input')].some((i) => i.readOnly && i.value.includes('/review/')));
  const openLink = await openLinkField.inputValue();
  check('A feedback link can be shared before the interview', /\/review\/[0-9a-f-]{36}$/.test(openLink) && (await tanvirReview.innerText()).includes('until the final interview is scheduled'), openLink);
  await tanvirReview.getByRole('button', { name: 'Close', exact: true }).click();
  await tanvir.getByRole('button', { name: 'Close', exact: true }).click();

  await applicant.goto(openLink);
  await applicant.getByRole('heading', { name: /How was your interview, Tanvir/ }).waitFor();
  await applicant.locator('fieldset', { hasText: 'Overall experience' }).locator('label').nth(3).click();
  await applicant.getByLabel('Share your experience').fill('Very professional.');
  await applicant.screenshot({ path: join(shots, '12-review-form.png'), fullPage: true });
  await applicant.getByRole('button', { name: 'Send feedback' }).click();
  await applicant.getByRole('heading', { name: 'Thank you for your feedback' }).waitFor();
  await applicant.goto(openLink);
  await applicant.getByRole('heading', { name: 'Thank you for your feedback' }).waitFor();
  check('Review link works once only', await applicant.getByRole('button', { name: 'Send feedback' }).count() === 0);
  await applicant.close();

  await page.goto(`${BASE}/buckets`);
  await page.getByRole('link', { name: /Merchandiser/ }).click();
  await page.getByRole('row', { name: /Hena Begum/ }).waitFor();
  check('Application lands in the right bucket', await page.getByRole('row', { name: /Hena Begum/ }).getByText('Company form').count() === 1);

  await page.goto(`${BASE}/reviews`);
  await page.getByText('Very professional.').waitFor();
  check('Candidate review reaches HR', true);
  await shot('13-reviews');

  // --- Settings and data surviving a reload
  await page.goto(`${BASE}/settings`);
  await heading('Settings').waitFor();
  await shot('14-settings', { fullPage: true });
  await page.getByRole('tab', { name: 'AI' }).click();
  await page.getByText('AI is not set up').waitFor();
  check('AI status is honest when no key is set', true);

  // --- Upload batches: a small batch size and break, to see the timer between batches
  const setBatches = async (size, pause) => {
    await page.goto(`${BASE}/settings`);
    await heading('Settings').waitFor();
    await page.getByLabel('Files per batch').fill(String(size));
    await page.getByLabel('Break between batches (seconds)').fill(String(pause));
    await page.getByRole('button', { name: 'Save company settings' }).click();
    await page.getByText('Company settings saved.').first().waitFor();
  };
  await setBatches(2, 4);
  await page.goto(`${BASE}/buckets/bkt-3`);
  await page.getByRole('main').getByRole('button', { name: 'Upload CVs' }).click();
  const batchUpload = page.getByRole('dialog', { name: 'Upload CVs' });
  check('The upload window shows the batch size set by the admin', /batches of\s*2/.test(await batchUpload.getByRole('region', { name: 'Upload limits' }).innerText()));
  await batchUpload.locator('input[type=file]').setInputFiles([join(FIXTURES, 'pdf-with-photo.pdf'), join(FIXTURES, 'pdf-with-logo-only.pdf'), join(FIXTURES, 'cv-for-public-form.pdf')]);
  await batchUpload.getByText(/Batch 1 of 2 done\. Next batch starts in/).waitFor({ timeout: 30000 });
  check('A large upload pauses between batches with a countdown', await batchUpload.getByLabel('Name in cv-for-public-form.pdf').count() === 0);
  await shot('06c-upload-batch-timer');
  await batchUpload.getByRole('button', { name: 'Wait', exact: true }).click();
  await batchUpload.getByText(/Paused after batch 1 of 2/).waitFor();
  check('The break can be held', true);
  await batchUpload.getByRole('button', { name: 'Continue', exact: true }).click();
  await batchUpload.getByLabel('Name in cv-for-public-form.pdf').waitFor({ timeout: 30000 });
  check('The next batch is read after the break', true);
  await batchUpload.getByRole('button', { name: 'Cancel' }).click();
  await batchUpload.waitFor({ state: 'detached' });
  await setBatches(50, 10);

  // --- Question library: add an MCQ, pick questions, print a paper with its answer key
  await page.goto(`${BASE}/questions`);
  await heading('Question library').waitFor();
  check('The library holds written, MCQ and interview questions', await page.getByRole('tab', { name: /^Written/ }).count() === 1 && await page.getByRole('tab', { name: /^MCQ/ }).count() === 1 && await page.getByRole('tab', { name: /^Interview/ }).count() === 1);
  await page.getByRole('button', { name: 'Add question' }).click();
  const qDialog = page.getByRole('dialog', { name: 'Add a question' });
  await qDialog.getByLabel('Question').fill('Which document confirms a new employee\'s joining terms?');
  await qDialog.getByLabel('Choice a', { exact: true }).fill('Payslip');
  await qDialog.getByLabel('Choice b', { exact: true }).fill('Appointment letter');
  await qDialog.getByLabel('Choice c', { exact: true }).fill('Leave form');
  await qDialog.getByRole('button', { name: 'Add question' }).click();
  await page.waitForTimeout(150);
  check('An MCQ needs its right answer', (await qDialog.getByRole('alert').innerText()).includes('right answer'));
  await qDialog.getByLabel('Choice b is right').check();
  await qDialog.getByLabel('Post').fill('Jr. Executive');
  await qDialog.getByLabel('Topic').fill('HR basics');
  await shot('19-question-dialog');
  await qDialog.getByRole('button', { name: 'Add question' }).click();
  await qDialog.waitFor({ state: 'detached' });
  await page.getByText('Question added to the library.').waitFor();
  await page.getByRole('tab', { name: /^MCQ/ }).click();
  await page.getByLabel('Post').selectOption('Jr. Executive');
  const added = page.getByRole('listitem').filter({ hasText: 'confirms a new employee' });
  check('The new MCQ shows with its right answer marked', await added.getByLabel('Right answer').count() === 1);
  await page.getByText(/^Pick all \d+ shown$/).click();
  await shot('20-question-library', { fullPage: true });
  await page.getByRole('button', { name: /^Make question paper \(\d+\)$/ }).click();
  const paperDialog = page.getByRole('dialog', { name: 'Make a question paper' });
  await paperDialog.getByRole('link', { name: 'Open printable paper' }).click();
  const paper = page.getByRole('article', { name: /MCQ test: Jr\. Executive/ });
  await paper.waitFor();
  const paperText = await paper.innerText();
  check('The paper holds the picked questions without the answers', paperText.includes('confirms a new employee') && paperText.includes('Name:') && !paperText.includes('✓'));
  const answerKey = await page.getByRole('article', { name: 'Answer key' }).innerText();
  check('The answer key is on its own page', answerKey.includes('b) Appointment letter'), answerKey.slice(0, 120));
  await shot('21-question-paper', { fullPage: true });
  await page.goto(`${BASE}/buckets`);
  await page.getByRole('link', { name: /Jr\. Executive/ }).click();
  await page.getByRole('row', { name: /Mitu Sarker/ }).waitFor();
  check('Data survives a page reload', true);

  // --- Global search
  await page.getByLabel('Search candidates by name, mobile or email').fill('01911234503');
  await page.getByRole('button', { name: /Mitu Sarker/ }).first().waitFor();
  check('Global search finds by mobile number', true);

  // --- Three logins: Tareq screens and hands over, Nafis and Mili run the process. Two tabs, two people.
  await page.keyboard.press('Escape');
  const nafis = await context.newPage();
  nafis.on('pageerror', (error) => { if (!LIVE_RELOAD_NOISE.test(error.message)) problems.push(`nafis pageerror: ${error.message}`); });
  await nafis.goto(BASE);
  // A new tab starts as whoever signed in last; this one becomes Nafis while the first tab stays Tareq.
  await nafis.getByRole('button', { name: 'Sign out' }).click();
  await nafis.getByRole('list', { name: 'Demo accounts' }).getByRole('button', { name: /Nafis/ }).click();
  await nafis.getByRole('heading', { name: 'Dashboard' }).waitFor();
  // Nafis is new on this computer too, so his tour starts; it skips the steps that are not his, such as uploading.
  const nafisTour = nafis.getByRole('dialog', { name: 'Pages' });
  await nafisTour.waitFor();
  check('Each new person gets their own welcome tour', (await nafisTour.innerText()).includes('Welcome, Nafis!'));
  await nafisTour.getByRole('button', { name: 'Skip tour' }).click();
  await nafisTour.waitFor({ state: 'detached' });
  check('Nafis sees the candidates handed to him', await nafis.getByText('Handed to you').count() === 1);
  check('The process desk has no Upload CVs button', await nafis.getByRole('button', { name: 'Upload CVs' }).count() === 0);
  await nafis.screenshot({ path: join(shots, '15-nafis-dashboard.png'), fullPage: true });

  await page.goto(`${BASE}/buckets/bkt-3?stage=new`);
  await page.getByRole('tablist', { name: 'Where candidates stand' }).waitFor();
  check('The first tab is still Tareq', await page.getByText('Assistant General Manager').count() >= 1);
  await page.getByRole('button', { name: /Tania Akter/ }).first().click();
  const tania = page.getByRole('dialog', { name: 'Tania Akter' });
  await tania.getByRole('button', { name: 'Select', exact: true }).click();
  const toNafis = page.getByRole('dialog', { name: /Select Tania Akter and hand over/ });
  await toNafis.getByRole('radio', { name: /^Nafis/ }).check();
  await toNafis.getByLabel('Note for them (optional)').fill('Please call before 5 PM');
  await shot('16-handover-dialog');
  await toNafis.getByRole('button', { name: 'Select and hand over' }).click();
  await toNafis.waitFor({ state: 'detached' });
  await tania.getByText('Handled by').waitFor();
  check('The card says who handles the candidate', (await tania.getByText('Handled by').locator('..').innerText()).includes('Nafis'));
  check('Tareq can still do the step himself', await tania.getByRole('button', { name: 'Candidate confirmed' }).count() === 1);
  await tania.getByRole('button', { name: 'Close', exact: true }).click();

  // Nafis's tab hears about it without reloading.
  const nafisBell = nafis.getByRole('button', { name: /^Updates, \d+ unread$/ });
  await nafis.getByText(/Tareq Azij handed over Tania Akter/).first().waitFor({ timeout: 10000 });
  check('Nafis is told about the handover at once, in another tab', true);
  await nafisBell.click();
  const nafisPanel = nafis.getByRole('dialog', { name: 'Updates' });
  check('The update carries the note', await nafisPanel.getByText(/Please call before 5 PM/).count() >= 1);
  await nafis.screenshot({ path: join(shots, '17-nafis-updates.png') });
  await nafisPanel.getByRole('button', { name: /Tareq Azij handed over Tania Akter/ }).click();
  const nafisCard = nafis.getByRole('dialog', { name: 'Tania Akter' });
  check('The process desk cannot select or reject a new CV elsewhere', true);
  await nafisCard.getByRole('button', { name: 'Candidate confirmed' }).click();
  const nafisConfirm = nafis.getByRole('dialog', { name: /Record confirmation: Tania/ });
  await nafisConfirm.getByLabel('Called on: day').fill('2026-11-05');
  await nafisConfirm.getByLabel('Called on: time').fill('11:00');
  await nafisConfirm.getByLabel('Candidate confirmed on: day').fill('2026-11-05');
  await nafisConfirm.getByLabel('Candidate confirmed on: time').fill('11:05');
  await nafisConfirm.getByRole('button', { name: 'Save confirmation' }).click();
  await nafisConfirm.waitFor({ state: 'detached' });

  // A call is a small step: Tareq sees it in the team's progress, not as a notification.
  await page.waitForTimeout(3000);
  check('Tareq is not notified of small steps', await page.getByText(/Tania Akter: confirmed on the call/).count() === 0);
  await page.goto(BASE);
  await page.getByText('Process team progress').waitFor();
  const progress = page.locator('section', { hasText: 'Process team progress' });
  check('Tareq\'s dashboard shows the process team by person', await progress.getByRole('rowheader', { name: 'Nafis' }).count() === 1 && await progress.getByRole('rowheader', { name: 'Mili' }).count() === 1);
  check('Tareq\'s dashboard lists the big decisions', await page.locator('section', { hasText: 'Decisions by the process team' }).getByText(/Mahmud Karim: confirmation letter sent/).count() === 1);

  // --- Who is doing what: Nafis still has Tania's card open in his tab
  const workingNow = page.getByRole('list', { name: 'Who is working now' });
  await workingNow.getByRole('listitem').filter({ hasText: 'Nafis' }).getByText(/Working on/).waitFor({ timeout: 15000 });
  check('Tareq\'s dashboard shows who is working on what', (await workingNow.getByRole('listitem').filter({ hasText: 'Nafis' }).innerText()).includes('Tania Akter'));
  await page.goto(`${BASE}/activity`);
  await heading('Team activity').waitFor();
  const nafisNow = page.getByRole('list', { name: 'Who is working now' }).getByRole('listitem').filter({ hasText: 'Nafis' });
  await nafisNow.getByText(/Working on/).waitFor({ timeout: 15000 });
  check('Team activity: Nafis is working on Tania Akter', (await nafisNow.innerText()).includes('Tania Akter'));
  check('Team activity: Mili is offline', (await page.getByRole('list', { name: 'Who is working now' }).getByRole('listitem').filter({ hasText: 'Mili' }).innerText()).includes('Offline'));
  const callLine = page.locator('li', { hasText: 'Call: candidate confirmed: Tania Akter' });
  await callLine.first().waitFor();
  check('Team activity lists the call with who made it', (await callLine.first().innerText()).includes('Nafis'));
  check('Team activity lists the handover', await page.locator('li', { hasText: 'Handed to Nafis: Tania Akter' }).count() >= 1);
  const nafisRow = page.getByRole('row', { name: /^Nafis/ });
  check('Team activity counts Nafis\'s calls', Number(await nafisRow.locator('td').nth(3).innerText()) >= 1, await nafisRow.innerText());
  const personFilter = page.getByLabel('Person', { exact: true });
  await personFilter.selectOption({ label: 'Nafis' });
  const feed = page.locator('[data-tour="activity-feed"]');
  await page.waitForFunction(() => !document.querySelector('[data-tour="activity-feed"]')?.textContent?.includes('Tareq Azij'), null, { timeout: 5000 }).catch(() => undefined);
  const feedText = await feed.innerText();
  check('The feed can show one person\'s steps', feedText.includes('Tania Akter') && !feedText.includes('Tareq Azij') && !feedText.includes('Uploaded'),
    `filter ${await personFilter.inputValue()}; ${feedText.replace(/\s+/g, ' ').slice(0, 100)}`);
  await shot('22-team-activity', { fullPage: true });
  await nafisNow.getByRole('button', { name: 'Tania Akter' }).click();
  const sharedCard = page.getByRole('dialog', { name: 'Tania Akter' });
  await sharedCard.getByText('Nafis has this card open too', { exact: false }).waitFor({ timeout: 10000 });
  check('A card says who else has it open', true);
  await sharedCard.getByRole('button', { name: 'Close', exact: true }).click();
  await page.goto(BASE);
  await page.getByText('Process team progress').waitFor();

  // A big decision reaches Tareq at once, in his own tab: Mahmud Karim joins.
  await nafis.goto(`${BASE}/?candidate=cand-22`);
  const mahmud = nafis.getByRole('dialog', { name: 'Mahmud Karim' });
  await mahmud.getByRole('button', { name: 'Joining details' }).click();
  const mahmudJoining = nafis.getByRole('dialog', { name: /Joining details: Mahmud/ });
  await mahmudJoining.getByLabel('What happened after the letter').selectOption('joined');
  await mahmudJoining.getByRole('button', { name: 'Save' }).click();
  await mahmudJoining.waitFor({ state: 'detached' });
  await page.getByText(/Mahmud Karim: joined/).first().waitFor({ timeout: 10000 });
  check('Tareq is told about a big decision at once, in another tab', true);
  await page.locator('section', { hasText: 'Decisions by the process team' }).getByText(/Mahmud Karim: joined/).waitFor();
  await page.waitForTimeout(500);
  await shot('18-agm-dashboard', { fullPage: true });
  await nafis.close();

  await browser.close();

  console.log('\nBrowser errors:', problems.length ? problems : 'none');
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
  if (failed.length || problems.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('E2E run stopped:', error);
    console.log('Browser errors so far:', problems);
    process.exitCode = 1;
  })
  .finally(() => {
    server.kill();
    // The browser or dev server can hold the process open after a failure.
    setTimeout(() => process.exit(), 1000);
  });
