# AI Interview Prep Mentor

AI Interview Prep Mentor is a full stack web application that helps you practice interview questions. The frontend is built with React and Vite. The backend uses Express and communicates with Google Gemini to generate questions and evaluate answers.

## Features
- Generate interview questions for a skill and experience level
- Evaluate answers and provide feedback using Gemini
- Track practice history and create revision summaries
- Google login to save progress and quota information
- Purchase extra question quota through Stripe
- Caching and rate limiting with Redis
- SQLite database for local development and PostgreSQL in production

## Project layout
- `App.tsx`, `index.tsx`, `components/` – React client code
- `server/` – Express server, database setup and API routes
- `services/` – Frontend helpers for calling Gemini APIs
- `hooks/` – React hooks such as local storage helper
- `config/` – Static configuration like purchase options
- `types.ts` – Shared TypeScript types
- `start_dev.sh` – Helper script to run backend and frontend during development

## Environment variables
Create a `.env.local` file in the project root. Important keys:
- `GEMINI_API_KEY` – API key for Gemini
- `GOOGLE_CLIENT_ID` – OAuth client id for Google login
- `STRIPE_SECRET_KEY` – key for creating checkout sessions
- `STRIPE_WEBHOOK_SECRET` – webhook validation secret
- `CLIENT_URL` – address of the frontend for Stripe redirects
- `DATABASE_URL` – Postgres connection string when running in production
- `REDIS_URL` – Redis connection url
- `SQLITE_DB_PATH` – optional path to dev SQLite file

## Running locally
1. Install dependencies with `npm install`
2. Create `.env.local` and provide the variables above
3. Start the backend with `npm start`
4. In another terminal run `npm run dev` to start the frontend

You can also run `npm run build` to build the frontend for production. The `Procfile` starts the Express server when deployed.

## Logs and data
Log files are written to the `logs` directory by Winston. When using the local SQLite database the file `dev.sqlite` is created automatically. Redis is required for caching and rate limiting.

## Metadata
The `metadata.json` file contains a short description used by AI Studio.

## License
This project is licensed under the ISC license.
