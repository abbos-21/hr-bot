# 🎯 HR Recruitment Telegram Bot System

A complete, production-ready HR recruitment platform with Telegram bot integration and a full-featured web admin panel.

## ✨ Feature Overview

### Telegram Bot Features
- 🤖 **Multi-bot** — add and manage unlimited Telegram bots
- 🌍 **Multi-language** — dynamic per-bot language management with fallback
- 📋 **Configurable surveys** — step-by-step surveys with text and choice (inline buttons) questions
- 💼 **Job listings** — candidates can browse and apply for multiple positions
- 📁 **File uploads** — resume/document uploads from candidates
- 💬 **Two-way messaging** — full admin ↔ candidate communication (text, photos, documents, voice, video)
- 🔄 **Survey resumption** — candidates can resume incomplete applications

### Admin Panel Features
- 📊 **Dashboard** — real-time overview with pipeline stats
- 🤖 **Bot management** — add bots by token, configure languages and settings
- 💼 **Job editor** — create jobs with per-language translations and survey questions
- 👥 **Candidate management** — full candidate profiles with status tracking
- 💬 **Chat interface** — hh.uz-style messaging interface with media support
- 📝 **Internal comments** — private admin notes on candidates
- ✏️ **Profile editing** — edit any candidate info including survey answers
- 📈 **Analytics** — charts for funnel, activity, per-job stats, completion rates
- ⚡ **Real-time updates** — WebSocket-powered live notifications
- 👤 **Multi-admin** — multiple admin accounts with role-based permissions (admin / super_admin)

## 🏗️ Architecture

```
hr-bot/
├── src/                          # Backend (Node.js + TypeScript)
│   ├── index.ts                  # Entry point
│   ├── config.ts                 # Configuration
│   ├── db.ts                     # Prisma client singleton
│   ├── websocket.ts              # WebSocket manager (real-time)
│   ├── bot/
│   │   ├── BotInstance.ts        # Single bot logic (grammY)
│   │   └── BotManager.ts        # Multi-bot orchestration
│   └── api/
│       ├── server.ts             # Express app setup
│       ├── middleware/
│       │   └── auth.ts           # JWT authentication middleware
│       └── routes/
│           ├── auth.ts           # Admin auth & management
│           ├── bots.ts           # Bot CRUD + language management
│           ├── jobs.ts           # Job CRUD
│           ├── questions.ts      # Survey question CRUD + reorder
│           ├── candidates.ts     # Candidate management + comments
│           ├── messages.ts       # Admin↔Candidate messaging
│           ├── analytics.ts      # Analytics endpoints
│           └── files.ts          # File download/serve
├── prisma/
│   └── schema.prisma             # Complete database schema
├── admin/                        # React admin panel (Vite + TypeScript)
│   └── src/
│       ├── App.tsx               # App shell with routing
│       ├── api/index.ts          # API client (axios)
│       ├── store/auth.ts         # Auth state (Zustand)
│       ├── hooks/
│       │   └── useWebSocket.ts   # Real-time WebSocket hook
│       ├── components/
│       │   ├── Sidebar.tsx       # Navigation sidebar
│       │   └── StatusBadge.tsx   # Candidate status badge
│       └── pages/
│           ├── Login.tsx         # Login page
│           ├── Dashboard.tsx     # Overview dashboard
│           ├── Bots.tsx          # Bot list
│           ├── BotDetail.tsx     # Bot settings + languages
│           ├── Jobs.tsx          # Job list
│           ├── JobDetail.tsx     # Job editor + questions
│           ├── Candidates.tsx    # Candidate list with filters
│           ├── CandidateDetail.tsx # Full candidate profile + chat
│           ├── Analytics.tsx     # Charts and metrics
│           └── Admins.tsx        # Admin user management
└── setup.sh                      # One-command setup script
```

## 🗄️ Database Schema

| Table | Description |
|-------|-------------|
| `Admin` | Admin accounts with roles |
| `Bot` | Telegram bot configurations |
| `BotLanguage` | Per-bot supported languages |
| `Job` | Job postings |
| `JobTranslation` | Per-language job titles/descriptions |
| `Question` | Survey questions |
| `QuestionTranslation` | Per-language question text |
| `QuestionOption` | Choice options for questions |
| `QuestionOptionTranslation` | Per-language option text |
| `Candidate` | Applicant records |
| `Answer` | Candidate survey answers |
| `CandidateComment` | Internal admin comments |
| `Message` | Full chat message history |
| `CandidateFile` | Uploaded files |

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone / download the project
cd hr-bot

# Run automated setup
chmod +x setup.sh && ./setup.sh

# Configure environment
cp .env.example .env
# Edit .env with your settings
```

### Configuration (`.env`)

```env
PORT=3000
JWT_SECRET=your-super-secret-jwt-key-at-least-32-chars
DATABASE_URL="file:./dev.db"
UPLOAD_DIR=./uploads
ADMIN_EMAIL=admin@yourcompany.com
ADMIN_PASSWORD=secure-password-here
NODE_ENV=development
```

### Start Development

```bash
# Terminal 1: Backend
npm run dev

# Terminal 2: Admin panel
cd admin && npm run dev
```

- **Backend API**: http://localhost:3000
- **Admin Panel**: http://localhost:5173

### Production Build

```bash
# Build backend
npm run build

# Build admin panel
cd admin && npm run build

# Start production
npm start
```

## 🤖 Adding Your First Bot

1. Message `@BotFather` on Telegram → `/newbot`
2. Copy the bot token
3. Open Admin Panel → **Bots** → **Add Bot**
4. Paste the token and give it a name
5. The bot starts automatically!

## 📋 Setting Up a Job & Survey

1. **Admin Panel → Jobs → New Job**
2. Select the bot, enter job title (per language)
3. **Admin Panel → Jobs → [Your Job] → Questions tab**
4. Add questions (text or choice type)
5. Set `Field Key` for questions that map to profile fields:
   - `fullName` → Candidate's full name
   - `age` → Candidate's age
   - `phone` → Phone number
   - `email` → Email address

## 👥 Candidate Status Flow

```
Incomplete → Applied → Screening → Interviewing → Offered → Hired
                                                          ↘ Rejected
                                                          ↘ Archived
```

- **Incomplete**: Started but hasn't finished survey
- **Applied**: Survey completed, application submitted
- **Screening+**: Messaging enabled between admin and candidate

## 💬 Communication

Starting from **Applied** status:
- Admins can send text, photos, files, and voice messages from the chat interface
- Candidates reply through the Telegram bot
- Full history stored and displayed in real-time

## 🌍 Multi-Language Setup

1. **Admin Panel → Bots → [Bot] → Languages tab**
2. Add languages (e.g., `ru` = Russian, `uz` = Uzbek)
3. When creating jobs/questions, fill in translations for each language
4. Bot shows language selection menu to new users
5. Fallback to default language if translation missing

## 📈 Analytics

- **Overview**: Total applicants, bots, jobs, hire rate
- **Funnel chart**: Candidates at each stage
- **Activity chart**: Applications over time (7/30/90 days)
- **Per-job chart**: Candidate count per position
- **Completion rate**: Survey completion statistics

All analytics support filtering by bot.

## 🔌 API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Admin login |
| GET | `/api/auth/me` | Current admin profile |
| PUT | `/api/auth/profile` | Update profile/password |
| GET | `/api/auth/admins` | List admins |
| POST | `/api/auth/admins` | Create admin (super_admin only) |

### Bots
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/bots` | List bots |
| POST | `/api/bots` | Add bot (validates token with Telegram) |
| PUT | `/api/bots/:id` | Update bot settings |
| DELETE | `/api/bots/:id` | Delete bot |
| POST | `/api/bots/:id/languages` | Add language |
| DELETE | `/api/bots/:id/languages/:langId` | Remove language |

### Jobs, Questions, Candidates, Messages, Analytics
- Full CRUD for all entities
- See source code in `src/api/routes/` for complete reference

### WebSocket Events
Connect to `ws://host/ws?token=<jwt>` to receive:
- `NEW_APPLICATION` — New candidate applied
- `NEW_MESSAGE` — Inbound message from candidate
- `STATUS_CHANGE` — Candidate status updated
- `CANDIDATE_UPDATE` — Candidate profile updated

## 🔒 Security Notes

- JWT tokens with 7-day expiry
- bcrypt password hashing (cost factor 10)
- File uploads limited to 50MB
- WebSocket authenticated via JWT query param
- CORS enabled (restrict in production)

## 🐳 Docker Deployment

```bash
# Configure environment
export JWT_SECRET="your-secret"
export ADMIN_EMAIL="admin@company.com"
export ADMIN_PASSWORD="secure-pass"

# Start
docker-compose up -d
```

## 📝 Tech Stack

**Backend**
- Node.js + TypeScript
- Express.js (REST API)
- grammY (Telegram Bot Framework)
- Prisma ORM + SQLite
- ws (WebSockets)
- JWT + bcrypt (Auth)
- multer (File uploads)
- axios (Telegram file downloads)

**Admin Panel**
- React 18 + TypeScript
- Vite
- Tailwind CSS
- React Router v6
- Zustand (state management)
- Recharts (analytics charts)
- react-hot-toast (notifications)
- date-fns (date formatting)
