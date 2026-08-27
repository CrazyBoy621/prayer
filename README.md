# Besh Vaqt — personal prayer tracker

A single-user web app for tracking the five daily prayers (Fajr, Dhuhr, Asr, Maghrib, Isha). Mark any prayer on any date — past, today, or future — and watch your qaza debt, streak, and monthly completion update automatically.

- **Prayer times** are calculated locally with [adhan](https://github.com/batoulapps/adhan-js) from your latitude/longitude — no external API, works offline.
- **Qaza** (missed prayers) is derived, never stored: an unmarked prayer counts as owed only after its window ends, starting from a configurable tracking start date. Marking a past prayer later pays the debt down.
- **Streak** counts consecutive days with all five prayers marked; an incomplete today never breaks it.

## Run

```sh
npm install
npm start          # http://localhost:3000
PORT=3737 npm start  # or any other port
npm run dev        # auto-restart on changes
npm test           # stats logic + API tests (node:test)
```

Data lives in `data/prayer.db` (SQLite, created on first run). Set `DB_PATH` to override.

## Settings

Defaults to Tashkent (Muslim World League method, Hanafi asr). Change location, timezone, calculation method, madhab, and the qaza tracking start date in the Settings tab.

## Stack

Node.js + Express 5, better-sqlite3, adhan, and a no-build vanilla JS frontend in `public/`.

## API

| Route | Description |
|---|---|
| `GET /api/records?from&to` | Marked prayers by date |
| `PUT /api/records/:date/:prayer` | Mark prayed (idempotent) |
| `DELETE /api/records/:date/:prayer` | Unmark (idempotent) |
| `GET /api/times?date` | Calculated prayer times for a date |
| `GET /api/stats?month` | Qaza, streak, monthly completion |
| `GET/PUT /api/settings` | Location, method, madhab, tracking start |
