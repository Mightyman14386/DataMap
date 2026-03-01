# DataMap

A privacy risk assessment tool that analyzes your online accounts and services based on their data-sharing policies and breach history.

## Features

- **Risk Scoring Engine**: Calculates privacy risk scores (0-100) based on:
  - Data selling policies (1-10 scale)
  - AI training data usage (1-10 scale)
  - Account deletion difficulty (1-10 scale)
  - Historical breach detection
  - Account staleness (unused for 2+ years)

- **Multi-tier Risk Assessment**:
  - 🟢 Green (0-39): Low risk
  - 🟡 Yellow (40-69): Moderate risk  
  - 🔴 Red (70-100): High risk

- **API Integration**:
  - Risk scoring endpoints (single and batch)
  - Privacy policy analysis with LLM integration
  - Breach detection via Have I Been Pwned API
  - Firebase/Firestore integration for persistence

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL (optional, for seed scripts)
- Firebase project with Firestore enabled

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

Required environment variables:
- **Firebase**: `REACT_APP_FIREBASE_*` variables
- **Google OAuth**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- **NextAuth**: `AUTH_SECRET` (generate with `npx auth secret`)
- **Optional APIs**: `OPENAI_API_KEY`, `HIBP_API_KEY`

## Testing

### Run Tests

The test suite validates the risk scoring engine and sample payloads:

```bash
# Test risk scoring engine
npm run test

# Validate sample JSON files
npm run test:sample
```

### Test Results

✓ **All 7 tests passing**:
- ✓ Basic scoring with high risk (breach + stale account)
- ✓ Green tier scoring (low-risk service)
- ✓ Red tier scoring with stale high-risk account (old breach + stale)
- ✓ Stale account penalty (2+ years unused)
- ✓ Schema validation
- ✓ Sample JSON file validation
- ✓ Batch sample JSON validation

### Sample Data

Example payloads in `/scripts`:
- `risk-score-sample.json` - Single service risk assessment
- `risk-score-batch-sample.json` - Batch risk assessment (3 services)

## Database Scripts

### Seed Demo Data

```bash
npm run seed:demo
```

Seeds risk demo data for a demo user. Requires:
- Active database connection
- Demo user created via NextAuth login

### Seed Policy Cache

```bash
npm run seed:policies
```

Pre-populates the policy cache with hardcoded assessments for major companies (TikTok, Meta, Google, LinkedIn, etc.)

## API Endpoints

### Score Risk
- **POST** `/api/risk/score` - Score a single service
- **GET** `/api/risk/score?domain=example.com` - Get latest risk for domain

### Batch Score Risk
- **POST** `/api/risk/score/batch` - Score multiple services
- **GET** `/api/risk/score/batch` - Get user's services with risks

### Analyze Policy
- **POST** `/api/policy/analyze` - Analyze privacy policy (with LLM or cache)

### Check Breach
- **GET** `/api/breach/check?domain=example.com` - Check for breaches via HIBP

## Architecture

### Backend Structure
```
src/
├── Backend/
│   ├── app/api/          # Next.js API routes
│   └── Firebase/         # Firebase config
├── components/           # React components
├── lib/                  # Firebase admin setup
├── server/              # Shared server utilities
│   ├── auth.ts          # NextAuth configuration
│   ├── firebase-db.ts   # Database abstractions
│   └── risk/
│       └── engine.ts    # Risk scoring logic
└── env.js               # Environment validation
```

### Risk Scoring Algorithm

```
Total Score = Policy Score + Breach Score + Stale Score

Policy Score:
  = (dataSelling × 2.5) + (aiTraining × 1.8) + (deleteDifficulty × 1.7)
  
Breach Score:
  = 20 (if breached)
  + 5 (if breach > 3 years old)
  
Stale Score:
  = MIN(15, 5 + (years_unused - 2) × 3) if unused 2+ years
  
Final Score = CLAMP(Total, 0, 100)
```

## Key Files Modified/Created

- ✅ `src/server/auth.ts` - NextAuth configuration
- ✅ `src/server/firebase-db.ts` - Database operations
- ✅ `src/server/risk/engine.ts` - Risk scoring engine
- ✅ `src/lib/firebase-admin.ts` - Firebase admin SDK
- ✅ `scripts/test-risk-engine.mjs` - Test suite
- ✅ `scripts/test-samples.mjs` - Sample validation
- ✅ `package.json` - Updated with required dependencies
- ✅ `.env.example` - Environment configuration template

## Development

### Running the Development Server

```bash
npm run dev
```

Opens the app at http://localhost:3000

### Building for Production

```bash
npm run build
npm start
```

## License

ISC