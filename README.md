# Bitopi Group Onboarding Suite

Hiring and onboarding from vacancy to joining day: requisitions, job postings, CV buckets, shortlisting,
calls, interview schedules, two interview rounds, the final decision, candidate reviews, the selected-candidate
database and printable joining documents. Built with React, Express and Supabase.

## Try it now (demo mode)

Needs Node.js 20 or newer.

```
npm install
npm run dev
```

Open http://localhost:3000. With no Supabase settings the app runs in demo mode: fictional sample data,
saved only in your browser, and a banner says so. Demo mode only exists in `npm run dev`; a production
build refuses to run without a database.

## Go live with Supabase

1. Create a project at https://supabase.com.
2. Open **SQL Editor**, paste all of [supabase/schema.sql](supabase/schema.sql) and press **Run**. It creates the
   tables, security rules, public form functions and private file storage. It is safe to run again after an update,
   and an update that changes the database needs exactly that: paste it and run it again.
3. Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   from **Project Settings > API**. To save the AI key from inside the app, also set `SUPABASE_SERVICE_ROLE_KEY`.
   This key bypasses all security rules: keep it on the server and never give it a `VITE_` prefix.
4. In **Authentication > Providers > Email**, turn off **Allow new users to sign up**. Accounts that do sign up
   still see nothing until approved, but there is no reason to allow it.
5. In **Authentication > Users > Add user**, create your account first. **The first account becomes admin.**
6. Run it:

   ```
   npm run build
   npm start
   ```

7. Sign in and fill in **Settings > Company**, especially who signs the offer letter.

To add staff: create them in Supabase as in step 5, then choose their role under **Settings > Team**.
Forgotten passwords are reset from the same Supabase page.

| Role | Can do |
|---|---|
| Admin | Everything, including settings, team, the AI key, deleting records and unlocking a final decision |
| HR | The whole hiring process; cannot delete candidates or change company settings |
| Viewer | Read only |
| Pending | Nothing, until an admin assigns a role |

Each person also has a **desk** under **Settings > Team**, which splits the work:

| Desk | Does | Is told about |
|---|---|---|
| CV screening and handover | Receives and uploads CVs, screens them, selects CVs and hands them to the process team (to one person or the whole team), changes who handles a candidate | The process team's big decisions only: confirmation letter, final rejection, joined, did not confirm. Smaller steps show in **Process team progress** on the dashboard |
| Process after handover | The call, both interviews, the decision, joining, for candidates handed to them or to the whole team. Cannot upload or screen CVs | New CVs (one line per bucket, however many), job postings, CVs handed to them |
| All steps | Everything. For the head of the team, and the default for existing accounts | Both of the above |

The database enforces the split, so it holds whatever a client sends. Profile details (contact, education and so on) stay
open to both desks. For Bitopi: Tareq Azij, Assistant General Manager, heads the team on **All steps** with the Admin role:
he can do any step himself, and hands the work to Nafis, Senior Manager, and Mili, Senior Executive, who are on
**Process after handover** with the HR role. Anyone who screens CVs while someone else is on the process desk sees
**Process team progress** on the dashboard. Names and designations
are edited on the same page. Updates appear under the bell at the top, as a pop-up when they arrive, and on the dashboard;
**Turn on desktop alerts** under the bell shows them while the app is in a background tab. There is no email or SMS alert yet.

In demo mode the login page offers these three accounts, and each browser tab can be signed in as a different one.

**Who is doing what.** Every step anyone saves is recorded by the database with their account and the time, including
who a candidate was handed to. **Team activity** in the menu shows who is online and which candidate card each person
has open right now, what each person did today, in 7 or 30 days (uploads, screening, handovers, calls, interviews,
decisions, joining, CV review time, candidates in hand), and every step in order, filtered by person or kind of work.
The head of the team also sees **Who is working now** on the dashboard, and a card says when someone else has it open.
Only account ids and the page are shared for this, never a candidate's details.

**Help.** The **?** at the top opens a tour of the page you are on and the whole hiring flow, step by step, where
**Show me** opens the right page (or a real candidate at that step) and points at what to press. Small **?** marks
beside titles and on each step of a card explain the buttons, for example what Select and Reject do. New people are
offered the tour once, on the dashboard.

Deploy on any host that runs Node.js, behind HTTPS. `npm start` listens on `PORT`. For Vercel, see below.

## Deploy on Vercel

The repository is ready for Vercel as it is: [vercel.json](vercel.json) builds the web app into `dist`, serves it as
static files, and runs the API (`/api/*`, only the AI CV reader) as one serverless function, [api/index.js](api/index.js).
Supabase steps 1, 2, 4 and 5 above still apply; step 6 is replaced by this.

1. Push this folder to a GitHub repository. Keep it **private**. `src/assets/cv` and `recruitment-data` hold real
   applicants' data and are left out by `.gitignore`.
2. At https://vercel.com/new, import the repository. Leave every build setting as Vercel shows it; vercel.json sets them.
3. Under **Environment Variables**, add:

   | Name | Value | Needed |
   |---|---|---|
   | `VITE_SUPABASE_URL` | Supabase > Project Settings > API > Project URL | Yes |
   | `VITE_SUPABASE_ANON_KEY` | Same page, the `anon` `public` key | Yes |
   | `SUPABASE_SERVICE_ROLE_KEY` | Same page, the `service_role` key. Server only | To save the AI key from Settings |
   | `GEMINI_API_KEY` | A Google AI Studio key | Only if you do not save it in Settings |
   | `GEMINI_MODEL` | Defaults to `gemini-3.8-flash` | No |

   Or connect Vercel's **Supabase integration** instead of typing the first three: its `SUPABASE_URL`,
   `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are read as well.
4. Press **Deploy**. Then open `https://YOUR-APP.vercel.app/api/health`; it should answer `{"status":"ok"}`.
5. In Supabase, **Authentication > URL Configuration**, set **Site URL** to your Vercel address, so password reset
   emails link back to the app.

Things to know about Vercel:

- The `VITE_` values are built into the web app. After changing them, **redeploy**; a restart is not enough.
- Vercel refuses a request over 4.5 MB, so with AI reading on, a CV up to about 3 MB is sent whole and a larger one
  sends only its text (a large scan is read with OCR first). On your own server the limit stays at 15 MB.
- The function runs in Singapore (`sin1`), close to Bangladesh. If your Supabase project is in another region,
  change `regions` in vercel.json to the nearest one.
- The security header allows Supabase at `*.supabase.co`. A custom Supabase domain needs adding to
  `Content-Security-Policy` in vercel.json.
- One AI reading may take up to 60 seconds (`maxDuration`); one that times out is retried up to three times,
  then that CV falls back to the reader without AI.

## How the process maps to the app

| Your process | Where |
|---|---|
| Block A: vacant designations, requisitions, job postings | **Requisitions** |
| Block B: CV buckets as folders, with a table inside | **CV Buckets** |
| Bulk upload, with or without AI | **Upload CVs**, top right. The window states the limits: each file up to 15 MB, up to 1,000 files per upload (a ZIP counts each CV inside it). A large upload is read in batches of 50 with a 10-second break and a countdown between them; **Start now**, **Wait** and **Pause after this batch** control it. An admin changes all three numbers under **Settings > Company > CV uploads**. Within a batch, files are read three at a time (two with AI). **Show only files that need a look** lists the ones that failed, lack a name or are already in the bucket |
| Correcting what the CV reader missed | **Edit profile** on the card turns Full details into one form: contact, work, summary, every job, degree, training and referee, skills, languages and personal details. **Save profile** saves it all at once; leaving with unsaved changes asks first |
| Everything about one candidate, and their next step | Click their row anywhere in the app. The card opens on **Full details**, with the process bar and the next step above it. This is the only place the process moves forward |
| Select, call, primary schedule, primary interview, final schedule, final interview, final decision | The seven steps of the process bar, in that order |
| AGM selects a CV and asks the team to do the rest | **Select** on a new CV (or **Select and hand over** for several in a bucket) asks who handles it: the whole process team or one person, with an optional note. The card then says **Handled by**, and **Change** gives it to someone else |
| AGM sees the team's progress | The AGM's dashboard: **Process team progress** (per person: to call, interviews, decision, confirmed, joined, stopped) and **Updates from the process team** |
| The team sees what is new for them | Their dashboard: **Handed to you**, and new CVs, postings and handovers. Their To do list covers only their own candidates |
| Who is waiting for what | The tiles at the top of a bucket: every candidate is in exactly one of them. Each row also says what comes next |
| The call and the candidate's answer | **Candidate confirmed** or **Candidate rejected** on the card asks when you called and when they answered, each with a day and a time. **Follow up** is for no answer yet |
| Knowing a step is saved | Each step saves when you press Save in its dialog. The card then says when it was saved and where the candidate is now; **Save and close** leaves the card |
| Interview schedule and its message | **Set interview schedule**, for both rounds. Also prepares the message; **Change schedule** moves an interview |
| Candidate experience form | **Ask for feedback** on the card creates a private link; answers appear under **Candidate Reviews** |
| Filter by experience, salary range, industry, keyword | Above the table in a CV bucket. A slider at its ends means no limit; once narrowed, a CV with no figure on record cannot match, and the line under the filters says how many that left out. Clicking a source above them filters by source |
| Several interviewers, each with a score and a Recommended star | The interview result on the card; **Add more** adds an interviewer. Every interviewer is one star: full if they recommend the candidate, blank if not. Hover the stars for names |
| Time spent on each CV review | Counted only while the CV is new: from opening its card until **Select**, **Reject** or closing it. Opening the card again for later steps adds nothing. If a new CV is closed and reopened, both sittings add up. Shown on the row, in **History**, and as an average per CV on the dashboard. Viewers are not timed |
| Merit and waiting lists | Chosen when marking the final interview as selected, and changeable on the card until the decision. Letters go to Merit only |
| Final decision | **Send confirmation letter** asks when they were selected and when they join; **Reject** asks when they were rejected and informed. Either one locks the whole process, in the database as well as on screen |
| Joining call | After the letter, **Call for joining** records when HR called and the joining day and time the candidate confirmed. That can differ from the day in the letter, which stays as it was; the letters and the Selected list then use the confirmed day. If the candidate has not settled a day yet, only the call is recorded |
| After the lock | Only the joining call and **Joining details** stay open: salary, employee ID, documents received, and whether they joined. **Did not confirm** there opens the vacancy again, and the **Selected** page points to the waiting list. An admin can **Unlock** a decision made by mistake |
| Block C: selected database, download, sort | **Selected** |
| Question library: written, MCQ and interview questions | **Question library**. Each question has its marks, difficulty, topic, and the department and post it suits (blank means any). MCQs keep their right answer; written and interview questions keep a model answer. Tick questions and **Make question paper** prints a paper with name lines, with the answer key on a separate page, or with the answers under each question for the interview panel. During an interview step the card has **Interview questions**, filtered to that post |
| Who did what, and who is working on what now | **Team activity** |
| Joining documents to print and sign | **Letter and joining pack** on a confirmed candidate's card |
| Company application form | **Copy application link** in a bucket; share it anywhere |

## CV reading

- **Without AI** runs on your computer and sends the CV nowhere. Reads PDF, Word and text. Scans and photos go through built-in OCR (English only). PDFs with a sidebar are read one column at a time, and a scan of any page size is enlarged to a readable size first. The CVs in `src/assets/cv` are the test set for layouts the reader must handle.
- **With AI** sends each CV to Google Gemini. Add the key under **Settings > AI**, or set `GEMINI_API_KEY` on the server.
- **Nothing is invented.** A value not found stays empty and raises a "to check" note. The AI's mobile or email is rejected when it does not appear in the CV's text.
- **Nothing is lost.** The original file, the complete text and every section heading are kept, under **Original CV** and **All CV text** in a candidate's profile.
- **Photos** are taken from inside the CV. Logos, signatures and page scans are told apart by their pixels. This can occasionally be wrong; the camera button on a profile replaces the photo.

## Messages

Interview messages use the wording in [src/assets/images/sample_message_for_onboarding.txt](src/assets/images/sample_message_for_onboarding.txt), editable under **Settings > Messages**.
The app does not send SMS by itself yet: it prepares each message and opens your SMS app, WhatsApp or email, or gives you a CSV to upload to an SMS gateway. Setting a schedule records the channel you chose, but nothing is sent until you press one of those buttons.

## Development

```
npm test                       # unit tests, and schema.sql with its security rules in embedded Postgres
npm run lint                   # type check
node tests/e2e/run.mjs         # whole process in Edge or Chrome, demo mode
node tests/e2e/run-production.mjs   # production build, real supabase-js and schema.sql, stand-in HTTP layer
```

- `server/app.js`: the API routes, used by `npm run dev`, `npm start` and the Vercel function `api/index.js`. Plain
  JavaScript with `// @ts-check`, because Vercel cannot compile it with this project's TypeScript 7.
- `src/lib/backend/`: the data layer. `supabase.ts` is production, `demo.ts` is the browser-only review mode.
- `src/lib/pipeline.ts`: the single source of truth for stages and allowed moves. The database enforces the same order with constraints.
- `src/lib/cv/`: CV reading. `supabase/schema.sql`: all database objects.
- `archive/ai-studio-prototype/`: the earlier prototype, kept for reference and not used by the app. Safe to delete once you no longer need it.
