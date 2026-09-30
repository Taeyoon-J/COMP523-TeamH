Platform Selection – COMP 523 Team H
UNC CS Calendar Integration and Classroom Scheduling
Last updated: September 28, 2026

Platform components

- Type of system: Client-server web app, used in a standard browser. No special hardware or OS.
- Language: TypeScript (Node.js) for front end, back end, and a command-line tool.
- Front end: React with Next.js, Tailwind CSS for styling, FullCalendar for the weekly schedule view.
- Back end: Next.js API routes in the same codebase as the front end.
- Database: PostgreSQL with the Prisma ORM. Runs locally in Docker during development.
- Integrations: Google Calendar API (the department keeps one calendar per room) and the 25Live (Series25) WebServices API (access pending; we use mock data until then).
- Sign-in: Auth.js with Google sign-in, limited to an admin list.
- Tools: GitHub, GitHub Actions for CI, Vitest for tests.
- Charts, images, video: none needed right now.

Alternatives considered

- Application type: web app (chosen) vs. desktop app vs. Google Apps Script. A desktop app would have to be installed on every admin's computer, which the client doesn't want. Apps Script has built-in Calendar access but a limited UI, execution quotas, and poor support for calling 25Live.
- Language: TypeScript (chosen) vs. JavaScript, Python, Java. TypeScript lets us use one language everywhere and catches type errors in scheduling data. Python or Java would mean a second language for the front end.
- Front end: React/Next.js (chosen) vs. Vue, Angular, Svelte. React has the largest ecosystem, including calendar components, and Next.js keeps the UI and API in one project.
- Schedule view: FullCalendar (chosen, free MIT edition) vs. react-big-calendar vs. commercial schedulers. FullCalendar has week views and drag and drop built in. Commercial options would cost the client money.
- Database: PostgreSQL (chosen) vs. MySQL, MongoDB, SQLite, Firebase. Our data (rooms, courses, meetings, bookings) is relational and needs transactions, and PostgreSQL is supported by every host we looked at.
- Back end: built into Next.js (chosen) vs. a separate Express server vs. Firebase/Supabase. One codebase is simpler for a small team. Firebase/Supabase would lock us into a vendor and could add fees.
- Sign-in: Google sign-in (chosen for now) vs. UNC SSO (onyen). Department users already have UNC Google accounts. UNC SSO is an option for production if the client requires it.

Client constraints

- The department's room bookings already live in Google Calendar (one calendar per room), so we must integrate with the Google Calendar API.
- 25Live is the official university scheduling system, so we must connect to it once we get API access.
- The client needs browser access without installing software, and only authorized admins may make changes.
- The system should not create ongoing costs for the client unless they agree.

Hosting / Heroku

We don't need hosting for development; everything runs locally. Heroku no longer has a free plan (the minimum is about $10–12/month), so we are not planning to use it unless the client wants it and agrees to pay. Our leading candidate for deployment is Carolina CloudApps (UNC ITS), which is free for UNC users and supports Node.js and PostgreSQL. A CS department server is another option. We will decide with the client.

References

- Next.js: https://nextjs.org/docs
- Prisma: https://www.prisma.io/docs
- Google Calendar API: https://developers.google.com/calendar/api/guides/overview
- Series25 WebServices API: https://knowledge25.knowledgeowl.com/help/series25-webservices-api
- FullCalendar: https://fullcalendar.io/docs
- Carolina CloudApps: https://cloudapps.unc.edu/
- Heroku pricing: https://www.heroku.com/pricing/
