# Create T3 App

This is a [T3 Stack](https://create.t3.gg/) project bootstrapped with `create-t3-app`.

## What's next? How do I make an app with this?

We try to keep this project as simple as possible, so you can start with just the scaffolding we set up for you, and add additional things later when they become necessary.

If you are not familiar with the different technologies used in this project, please refer to the respective docs. If you still are in the wind, please join our [Discord](https://t3.gg/discord) and ask for help.

- [Next.js](https://nextjs.org)
- [NextAuth.js](https://next-auth.js.org)
- [Prisma](https://prisma.io)
- [Drizzle](https://orm.drizzle.team)
- [Tailwind CSS](https://tailwindcss.com)
- [tRPC](https://trpc.io)

## Learn More

To learn more about the [T3 Stack](https://create.t3.gg/), take a look at the following resources:

- [Documentation](https://create.t3.gg/)
- [Learn the T3 Stack](https://create.t3.gg/en/faq#what-learning-resources-are-currently-available) — Check out these awesome tutorials

You can check out the [create-t3-app GitHub repository](https://github.com/t3-oss/create-t3-app) — your feedback and contributions are welcome!

## How do I deploy this?

Follow our deployment guides for [Vercel](https://create.t3.gg/en/deployment/vercel), [Netlify](https://create.t3.gg/en/deployment/netlify) and [Docker](https://create.t3.gg/en/deployment/docker) for more information.

## DataMap Risk Engine (Hackathon Quickstart)

### 1) Apply schema changes

```bash
npm run db:push
```

### 2) Seed demo risk records (optional)

Sign in once to create a user, then seed sample services and risk scores:

```bash
npm run seed:risk-demo
```

If you want a specific account, set `DEMO_USER_EMAIL` in your shell first.

### 3) Test the scoring endpoint quickly

Run your app and post the included sample payload:

```bash
curl -X POST http://localhost:3000/api/risk/score \
	-H "Content-Type: application/json" \
	--data-binary @scripts/risk-score-sample.json
```

PowerShell alternative:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/risk/score" -Method Post -ContentType "application/json" -InFile "scripts/risk-score-sample.json"
```

`persist: false` in the sample payload allows scoring without auth. For persisted records (`persist: true`), the request must be authenticated.

### 4) Test batch scoring (multiple services at once)

```bash
curl -X POST http://localhost:3000/api/risk/score/batch \
  -H "Content-Type: application/json" \
  --data-binary @scripts/risk-score-batch-sample.json
```

PowerShell alternative:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/risk/score/batch" -Method Post -ContentType "application/json" -InFile "scripts/risk-score-batch-sample.json"
```

Returns all services scored and sorted by `deletePriority`, plus a summary of tier counts (`red`/`yellow`/`green`).
