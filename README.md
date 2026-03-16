# HR Recruitment Telegram Bot System

A complete, production-ready HR recruitment platform with Telegram bot integration, a full-featured web admin panel, multi-organization support, and real-time communication.

## Table of Contents

- [Feature Overview](#feature-overview)
- [Architecture](#architecture)
- [Database Schema](#database-schema)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [User Roles & Access Control](#user-roles--access-control)
- [Adding Your First Bot](#adding-your-first-bot)
- [Survey & Question Builder](#survey--question-builder)
- [Candidate Pipeline](#candidate-pipeline)
- [Communication](#communication)
- [Meeting Scheduling](#meeting-scheduling)
- [Organizations & Branches](#organizations--branches)
- [Multi-Language Support](#multi-language-support)
- [Analytics](#analytics)
- [API Reference](#api-reference)
- [WebSocket Events](#websocket-events)
- [Security](#security)
- [Docker Deployment](#docker-deployment)
- [Tech Stack](#tech-stack)

---

## Feature Overview

### Telegram Bot
- **Multi-bot support** — add and manage unlimited Telegram bots, each with its own survey
- **Multi-language** — dynamic per-bot language management with automatic fallback chain (candidate lang > default lang > English > first available)
- **Configurable surveys** — text, choice (inline buttons), phone sharing, date input, and file/photo upload questions
- **Conditional branching** — follow-up questions based on the chosen option (e.g., different questions per department)
- **5 required profile fields** — fullName, age (with DD.MM.YYYY validation), phone (via contact sharing button), email, position — auto-seeded on bot creation
- **File uploads** — resume, documents, photos from candidates stored locally and linked to profiles
- **Two-way messaging** — full admin-to-candidate communication (text, photos, documents, voice, video, audio)
- **Survey resumption** — candidates can resume incomplete applications; queue persisted in DB
- **Customizable bot messages** — 13 system message keys (welcome, survey_complete, meeting_scheduled, etc.) editable per language in admin UI
- **Meeting notifications** — Telegram messages sent to candidates when meetings are scheduled and before they start (configurable reminder)

### Admin Panel
- **Dashboard** — real-time overview with candidate counts, bot stats, question count, hire rate
- **Bot management** — add bots by token (auto-validated with Telegram API), configure languages, customize system messages, update tokens
- **Question builder (Playground)** — visual drag-and-drop question editor with branching, translations, reordering
- **Kanban pipeline** — drag-and-drop candidate board with custom stages, colors, archival
- **Chat interface** — WhatsApp-style messaging with conversations list, unread badges, media support
- **Candidate profiles** — full profile view with answers, chat, files, meetings, internal notes
- **Meeting scheduler** — schedule interviews, set reminder time, auto-notify via Telegram
- **Analytics** — funnel chart, activity timeline, per-bot stats, completion rate, status breakdown
- **Real-time updates** — WebSocket-powered live notifications across all pages
- **Multi-admin** — admin and super_admin roles with granular permissions
- **Organization support** — multi-tenant with org users scoped to their own bot and data
- **Branch management** — organizations can have multiple branches
- **Internationalization** — full admin panel translated in Uzbek, Russian, and English with language switcher
- **Broadcast messaging** — send bulk messages to all candidates in a pipeline stage
- **File management** — view, download, and inline-display candidate files (images, PDFs, audio, video)

---

## Architecture

```
hr-bot/
├── src/                              # Backend (Node.js + TypeScript)
│   ├── index.ts                      # Entry point, server startup
│   ├── config.ts                     # Environment configuration
│   ├── db.ts                         # Prisma client singleton
│   ├── seed.ts                       # Database seeder (creates super admin)
│   ├── websocket.ts                  # WebSocket manager (real-time events)
│   ├── constants/
│   │   └── botDefaults.ts            # Default bot message translations (13 keys, 3 languages)
│   ├── types/
│   │   └── index.ts                  # Shared TypeScript interfaces
│   ├── scheduler/
│   │   └── meetingReminder.ts        # Meeting reminder background job (60s interval)
│   ├── bot/
│   │   ├── BotInstance.ts            # Single Telegram bot (grammY): survey flow, messaging, meeting notifications
│   │   └── BotManager.ts            # Multi-bot lifecycle: start, stop, restart, instance registry
│   └── api/
│       ├── server.ts                 # Express app setup, route registration, static serving
│       ├── middleware/
│       │   └── auth.ts               # JWT auth, role guards, bot access scoping, helpers
│       └── routes/
│           ├── auth.ts               # Login, profile, admin CRUD
│           ├── bots.ts               # Bot CRUD, languages, token update, auto-seed questions
│           ├── botMessages.ts        # Bot system messages CRUD (per language per key)
│           ├── questions.ts          # Question CRUD, reorder, branching
│           ├── candidates.ts         # Candidate CRUD, answer editing, comments, filtering
│           ├── messages.ts           # Chat messaging, media upload, broadcast, read receipts
│           ├── meetings.ts           # Meeting CRUD with Telegram notifications
│           ├── analytics.ts          # Overview, funnel, activity, per-bot, completion rate
│           ├── files.ts              # File serving/download with JWT query param auth
│           ├── columns.ts            # Kanban stage CRUD, reorder, archive/restore
│           ├── organizations.ts      # Organization CRUD, bot assignment (super_admin)
│           └── branches.ts           # Branch CRUD (org-scoped)
├── prisma/
│   └── schema.prisma                 # Database schema (SQLite, 16 models)
├── admin/                            # React admin panel (Vite + TypeScript)
│   └── src/
│       ├── App.tsx                   # App shell, routing, protected layout
│       ├── api/index.ts              # Axios API client with JWT interceptor
│       ├── store/auth.ts             # Zustand auth store (login, fetchMe, role helpers)
│       ├── i18n/
│       │   ├── index.tsx             # i18n provider, useT() hook, language switching
│       │   ├── en.json               # English translations
│       │   ├── ru.json               # Russian translations
│       │   └── uz.json               # Uzbek translations
│       ├── hooks/
│       │   └── useWebSocket.ts       # Singleton WS connection, event subscriptions, auto-reconnect
│       ├── utils/
│       │   └── media.ts              # Browser-viewable MIME type detection
│       ├── components/
│       │   ├── Sidebar.tsx           # Navigation sidebar with role-based menu items, unread badge, lang switcher
│       │   ├── Candidatedetailpanel.tsx  # Reusable candidate detail (overlay/inline), tabs: answers/chat/files/meetings
│       │   ├── ConfirmModal.tsx      # Reusable confirmation dialog with useConfirm() hook
│       │   └── StatusBadge.tsx       # Colored status badge component
│       └── pages/
│           ├── Login.tsx             # Unified login (admin + org)
│           ├── Dashboard.tsx         # Overview stats with real-time updates
│           ├── Bots.tsx              # Bot list, create, toggle, delete
│           ├── BotDetail.tsx         # Bot config: languages, messages, settings, questions
│           ├── Playground.tsx        # Visual question builder with branching
│           ├── Candidates.tsx        # Kanban pipeline with drag-and-drop
│           ├── CandidateDetail.tsx   # Full candidate profile page
│           ├── Chats.tsx             # Conversations list + messaging
│           ├── HiredCandidates.tsx   # Hired candidates table
│           ├── PastCandidates.tsx    # Archived candidates (restore/delete)
│           ├── RetiredStages.tsx     # Archived pipeline stages (restore/delete)
│           ├── Analytics.tsx         # Charts and metrics
│           ├── Admins.tsx            # Admin user management
│           ├── Organizations.tsx     # Organization management (super_admin)
│           └── Branches.tsx          # Branch management (org users)
├── .env.example                      # Environment variable template
├── docker-compose.yml                # Docker deployment config
├── setup.sh                          # Automated setup script
└── package.json                      # Backend dependencies and scripts
```

---

## Database Schema

| Model | Description |
|-------|-------------|
| `Admin` | Admin/super_admin accounts (login, password, name, role) |
| `Organization` | Tenant organizations (login, password, branches, linked bot) |
| `Branch` | Organization branches (unique per org) |
| `Bot` | Telegram bot configs (token, name, username, default language, org link) |
| `BotLanguage` | Per-bot supported languages (code, name, isDefault) |
| `BotMessage` | Customized bot system messages (per bot, per language, per key) |
| `Question` | Survey questions (type, order, fieldKey, branching via parentOptionId) |
| `QuestionTranslation` | Per-language question text, success/error messages, phone button text |
| `QuestionOption` | Choice options for questions (ordered) |
| `QuestionOptionTranslation` | Per-language option labels |
| `Candidate` | Applicant records (profile fields, status, language, question queue, column assignment) |
| `Answer` | Candidate survey answers (text value or selected option) |
| `CandidateComment` | Internal admin notes on candidates |
| `Message` | Chat message history (text, photo, document, voice, video, audio) |
| `CandidateFile` | Uploaded files (Telegram file ID, local path, MIME type) |
| `Meeting` | Scheduled meetings (date/time, note, reminder minutes, reminder sent status) |
| `KanbanColumn` | Pipeline stages (name, color, dot color, order, archive status) |

---

## Quick Start

### Prerequisites
- Node.js 18+
- npm

### Installation

```bash
# Clone the project
cd hr-bot

# Install backend dependencies
npm install

# Install admin panel dependencies
cd admin && npm install && cd ..

# Generate Prisma client and push schema
npx prisma generate
npx prisma db push

# Seed the super admin account
npm run seed

# Configure environment
cp .env.example .env
# Edit .env with your settings
```

### Start Development

```bash
# Terminal 1: Backend (with hot reload)
npm run dev

# Terminal 2: Admin panel (with hot reload)
cd admin && npm run dev
```

- **Backend API**: http://localhost:3000
- **Admin Panel**: http://localhost:5173

### Production Build

```bash
# Build everything
npm run build:all

# Or separately:
npm run build:backend    # TypeScript → dist/
npm run build:frontend   # Vite → admin/dist/

# Start production (serves admin panel from admin/dist/)
npm start
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start backend with hot reload (ts-node-dev) |
| `npm run build` | Compile TypeScript backend |
| `npm run build:frontend` | Build React admin panel |
| `npm run build:all` | Build frontend + backend |
| `npm start` | Run compiled backend (production) |
| `npm run go` | Build all + start (one command) |
| `npm run seed` | Create the initial super admin account |
| `npm run prisma:generate` | Regenerate Prisma client |
| `npm run prisma:migrate` | Run database migrations |
| `npm run prisma:studio` | Open Prisma Studio (DB browser) |

---

## Configuration

### Environment Variables (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `JWT_SECRET` | `fallback-secret-...` | JWT signing secret (change in production!) |
| `DATABASE_URL` | `file:./dev.db` | SQLite database path |
| `UPLOAD_DIR` | `./uploads` | Directory for uploaded files |
| `ADMIN_LOGIN` | `admin` | Initial super admin login |
| `ADMIN_PASSWORD` | `admin123` | Initial super admin password |
| `NODE_ENV` | `development` | Environment (development/production) |
| `WEBHOOK_BASE_URL` | `` | Base URL for Telegram webhooks (optional) |

---

## User Roles & Access Control

The system supports three user types with different access levels:

### Super Admin
- Full access to everything
- Manage other admins (create, activate, deactivate)
- Manage organizations (create, edit, delete, assign bots)
- See all bots, candidates, and data across the system

### Admin
- Access to all features except organization/admin management
- See all bots and candidates
- Manage questions, pipeline, chats, analytics

### Organization User
- Scoped to their assigned bot only
- Can create a bot if none is assigned (auto-links to their org)
- Manage questions, candidates, chats for their bot
- Manage their own branches
- Cannot see other organizations' data
- Cannot access admin management or organization management pages

### Auth System
- Login-based authentication (not email — all users log in with a `login` field)
- JWT tokens with 7-day expiry
- Token auto-refresh when org user creates a bot (new token includes botId)
- Passwords hashed with bcrypt (cost factor 10)

---

## Adding Your First Bot

1. Message `@BotFather` on Telegram and create a new bot with `/newbot`
2. Copy the bot token
3. Open Admin Panel > **Bots** > **Add Bot**
4. Paste the token and give it a name
5. The bot starts automatically and is validated against the Telegram API
6. Five required profile questions are auto-created: Full Name, Age, Phone, Email, Position

### Bot Settings
- **Name**: Display name in the admin panel
- **Default Language**: Fallback language for translations
- **Languages**: Add multiple languages; bot shows a language picker when >1 language is configured
- **System Messages**: Customize all 13 bot messages per language (welcome, survey complete, reminders, etc.)
- **Token**: Can be updated without deleting the bot (bot restarts automatically)
- **Activate/Deactivate**: Toggle bot on/off

---

## Survey & Question Builder

### Question Types

| Type | Description | Bot Behavior |
|------|-------------|--------------|
| `text` | Free-text input | User types a text response |
| `choice` | Multiple choice | Inline keyboard buttons; one selection |
| `attachment` | File/photo upload | User sends a file, document, or photo |

### Special Field Keys

When a question has a `fieldKey`, the answer auto-populates the candidate's profile:

| Field Key | Profile Field | Validation |
|-----------|--------------|------------|
| `fullName` | Full name | None |
| `age` | Age | DD.MM.YYYY format, calculates years, range 14-80 |
| `phone` | Phone | Contact sharing button (not typed) |
| `email` | Email | None |
| `position` | Position | None |
| `profilePhoto` | Profile photo | Expects photo attachment |

### Conditional Branching

Choice questions support branching — each option can have child questions that only appear when that option is selected:

1. Create a choice question (e.g., "Which department?")
2. Add options (e.g., "Sales", "Engineering", "Marketing")
3. Create child questions under each option — these appear only when that option is chosen
4. Branch questions have their own ordering (`branchOrder`)

### Per-Language Translations

Every question and option supports translations for all configured bot languages:
- Question text
- Success message (shown after answering)
- Error message (shown on validation failure)
- Phone button text (for phone questions)
- Option labels

### Question Reordering

- Drag-and-drop in the Playground UI
- Required questions always appear first
- Batch reorder via API

---

## Candidate Pipeline

### Status Flow

```
incomplete ──> active ──> hired
                  │
                  └──> archived
```

- **incomplete**: Candidate started but hasn't finished the survey
- **active**: Survey completed; candidate is in the pipeline on the Kanban board
- **hired**: Offer accepted
- **archived**: Removed from active pipeline

### Kanban Board

- **Custom stages**: Create named stages with custom colors (background + dot color)
- **Drag-and-drop**: Move candidates between stages by dragging
- **Stage management**: Rename, recolor, reorder, archive, restore, delete stages
- **Candidate actions**: Right-click for context menu, click for detail panel
- **Filtering**: Filter by bot, search by name/username/phone, filter by answer to specific choice questions
- **Broadcast**: Send a bulk message to all candidates in a stage

### Archived Stages

Archived stages are moved to a separate "Retired Stages" page. Archiving a stage also archives all its candidates. Both can be restored.

---

## Communication

### Admin-to-Candidate Chat

Starting from **active** status, admins can communicate with candidates:

- **Text messages**: Sent from admin panel, delivered via Telegram bot
- **Media messages**: Photos, documents, voice, video, audio — uploaded in admin panel
- **Real-time**: Messages appear instantly via WebSocket
- **Read receipts**: Unread message counter per conversation
- **Conversation list**: WhatsApp-style interface with last message preview and timestamps
- **Bot filter**: Super admins can filter conversations by bot

### Candidate-to-Admin Messages

- Candidates reply through the Telegram bot after completing their survey
- All media types supported: text, photo, document, voice, video, audio
- Files are downloaded from Telegram and stored locally

### Broadcast Messaging

- Select a pipeline stage
- Type a message
- Sent to all candidates in that stage simultaneously
- Reports success/failure counts

---

## Meeting Scheduling

Schedule interviews with candidates directly from the admin panel:

1. Open a candidate's detail panel > **Meetings** tab
2. Click **Schedule Meeting**
3. Set date/time, optional note, and reminder time
4. Candidate receives a Telegram notification immediately

### Reminder System

- Background scheduler checks every 60 seconds for upcoming meetings
- When the current time is within the `reminderMinutes` window, a reminder is sent via Telegram
- Reminder is sent only once (`reminderSent` flag)
- Configurable reminder intervals: 10min, 15min, 30min, 1hr, 2hr, 1 day

### Meeting Management

- View all meetings for a candidate (color-coded: blue=upcoming, amber=past, gray=cancelled)
- Cancel meetings (status changes to "cancelled")
- Delete meetings permanently
- Real-time updates via WebSocket (MEETING_CREATED, MEETING_UPDATED, MEETING_DELETED)

### Customizable Notification Messages

Bot messages for meetings are customizable per language in the bot settings:

| Key | Placeholders | Usage |
|-----|-------------|-------|
| `meeting_scheduled` | `{date}`, `{time}`, `{note}` | Sent when meeting is created |
| `meeting_reminder` | `{date}`, `{time}`, `{minutes}`, `{note}` | Sent before the meeting |

---

## Organizations & Branches

### Organizations (Multi-Tenancy)

Super admins can create organizations that act as isolated tenants:

- Each organization has a **login** and **password** for accessing the admin panel
- One bot can be assigned per organization (1:1 relationship)
- Organization users only see their own bot's data (candidates, questions, chats, analytics)
- Organization users can create a bot if none is assigned (auto-links to their org)

### Branches

Organizations can have multiple branches:

- Created during org setup (comma-separated) or added individually later
- Branch names are unique within an organization
- Branches can be activated/deactivated
- Candidates can be associated with branches

---

## Multi-Language Support

### Admin Panel Languages

The admin panel itself is fully translated in three languages:
- **Uzbek** (uz) — default
- **Russian** (ru)
- **English** (en)

Switch languages via the sidebar dropdown. Preference is saved in localStorage.

### Bot Languages

Each bot can support multiple languages independently:

1. **Add languages** in Bot Detail > Languages tab (e.g., `uz` = O'zbek, `ru` = Русский)
2. **Translate questions**: Fill in translations for each language when creating/editing questions
3. **Language selection**: When a bot has >1 language, users see a language picker at `/start`
4. **Fallback chain**: Candidate's language > bot default language > English > first available translation
5. **System messages**: All 13 bot messages (welcome, errors, meeting notifications, etc.) can be customized per language

---

## Analytics

All analytics support filtering by bot.

| Chart | Description |
|-------|-------------|
| **Overview Cards** | Total candidates, total bots, total questions, hire rate |
| **Status Breakdown** | Pie/bar chart of candidates by status |
| **Activity Timeline** | Line chart of daily applications and completions (7/30/90 days) |
| **Recruitment Funnel** | Horizontal bar chart showing candidates at each status stage |
| **Per-Bot Stats** | Bar chart of candidate counts per bot |
| **Completion Rate** | Percentage of candidates who finished the survey |

---

## API Reference

All endpoints require JWT authentication via `Authorization: Bearer <token>` header unless noted.

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login with `{ login, password }` — returns JWT + user info |
| GET | `/api/auth/me` | Current user profile (includes org branches & bot for org users) |
| PUT | `/api/auth/profile` | Update name and/or password |
| GET | `/api/auth/admins` | List all admins (all authenticated users) |
| POST | `/api/auth/admins` | Create admin (super_admin only) — `{ login, password, name, role }` |
| PUT | `/api/auth/admins/:id` | Update admin (super_admin only) |

### Bots

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/bots` | List bots (org users see only theirs) |
| POST | `/api/bots` | Create bot — validates token with Telegram, auto-seeds 5 required questions |
| GET | `/api/bots/:id` | Get bot details with question/candidate counts |
| PUT | `/api/bots/:id` | Update bot (name, defaultLang, isActive) |
| PUT | `/api/bots/:id/token` | Update Telegram token (restarts bot) |
| DELETE | `/api/bots/:id` | Delete bot and all associated data |
| GET | `/api/bots/:id/languages` | List bot languages |
| POST | `/api/bots/:id/languages` | Add language `{ code, name }` |
| DELETE | `/api/bots/:id/languages/:langId` | Remove language (cannot remove default) |

### Bot Messages

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/bots/:id/bot-messages` | Get all customized messages `{ [lang]: { [key]: value } }` |
| PUT | `/api/bots/:id/bot-messages` | Upsert messages `[{ lang, key, value }]` |

### Questions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/questions?botId=` | List questions with translations and options |
| POST | `/api/questions` | Create question with translations, options, branching |
| GET | `/api/questions/:id` | Get single question |
| PUT | `/api/questions/:id` | Update question (some fields locked for required questions) |
| DELETE | `/api/questions/:id` | Delete question (only non-required) |
| PUT | `/api/questions/batch/reorder` | Batch reorder `{ questions: [{ id, order }] }` |

### Candidates

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/candidates` | List with filters: botId, status, search, question/option filters, pagination |
| GET | `/api/candidates/:id` | Full profile with answers, comments, messages, files |
| PUT | `/api/candidates/:id` | Update profile fields, status, columnId |
| PUT | `/api/candidates/:id/answers/:answerId` | Edit a specific answer |
| POST | `/api/candidates/:id/comments` | Add internal comment |
| DELETE | `/api/candidates/:id/comments/:commentId` | Delete comment |
| DELETE | `/api/candidates/:id` | Delete (only archived candidates) |

### Messages

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/messages/conversations` | List conversations with unread counts |
| GET | `/api/messages/:candidateId` | Get message history |
| POST | `/api/messages/:candidateId` | Send text message `{ text }` |
| POST | `/api/messages/:candidateId/media` | Send media (multipart: file + messageType + caption) |
| POST | `/api/messages/:candidateId/read` | Mark messages as read |
| POST | `/api/messages/broadcast` | Send to multiple `{ candidateIds, text }` |

### Meetings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/meetings?candidateId=` | List meetings for a candidate |
| POST | `/api/meetings` | Schedule meeting `{ candidateId, scheduledAt, note?, reminderMinutes? }` |
| PUT | `/api/meetings/:id` | Update meeting (scheduledAt, note, reminderMinutes, status) |
| DELETE | `/api/meetings/:id` | Delete meeting |

### Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analytics/overview?botId=` | Total counts, hire rate, status breakdown |
| GET | `/api/analytics/per-job?botId=` | Per-bot candidate statistics |
| GET | `/api/analytics/activity?botId=&days=` | Daily application/completion counts |
| GET | `/api/analytics/funnel?botId=` | Status funnel data |
| GET | `/api/analytics/completion-rate?botId=` | Survey completion percentage |

### Files

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/files/serve/:messageId?token=` | Inline-serve message attachment |
| GET | `/api/files/download/:fileId?token=` | Force-download candidate file |
| GET | `/api/files/serve-file/:fileId?token=` | Inline-serve candidate file |
| GET | `/api/files/message/:messageId?token=` | Download message attachment |

File endpoints accept JWT via `?token=` query param for browser-native loading (images, audio, video).

### Kanban Columns

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/columns` | List active columns (ordered) |
| GET | `/api/columns/archived` | List archived columns |
| POST | `/api/columns` | Create column `{ name, color?, dot? }` |
| PUT | `/api/columns/:id` | Update column |
| PUT | `/api/columns/reorder` | Batch reorder `{ columns: [{ id, order }] }` |
| POST | `/api/columns/:id/archive` | Archive column (candidates become archived) |
| POST | `/api/columns/:id/restore` | Restore column (candidates become active) |
| DELETE | `/api/columns/:id` | Delete column permanently |

### Organizations (Super Admin Only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/organizations` | List all organizations with branches and bot |
| POST | `/api/organizations` | Create org `{ name, login, password, branches?, botId? }` |
| GET | `/api/organizations/:id` | Get organization details |
| PUT | `/api/organizations/:id` | Update org (name, login, isActive, password) |
| DELETE | `/api/organizations/:id` | Delete organization (unlinks bot) |
| PUT | `/api/organizations/:id/bot` | Assign bot `{ botId }` |
| DELETE | `/api/organizations/:id/bot` | Unlink bot |

### Branches

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/branches?organizationId=` | List branches (org users see only theirs) |
| POST | `/api/branches` | Create branch `{ name, organizationId }` |
| PUT | `/api/branches/:id` | Update branch (name, isActive) |
| DELETE | `/api/branches/:id` | Delete branch |

---

## WebSocket Events

Connect to `ws://host/ws?token=<jwt>` to receive real-time events.

Organization users only receive events for their assigned bot.

| Event | Payload | Description |
|-------|---------|-------------|
| `NEW_APPLICATION` | `{ candidateId, botId, status? }` | New candidate or survey completed |
| `NEW_MESSAGE` | `{ candidateId, message, direction, unreadCount }` | Inbound/outbound message |
| `STATUS_CHANGE` | `{ candidateId, status }` | Candidate status updated |
| `CANDIDATE_UPDATE` | `{ candidateId, ... }` | Candidate profile changed |
| `MESSAGES_READ` | `{ candidateId, unreadCount }` | Messages marked as read |
| `MEETING_CREATED` | `{ candidateId, meeting }` | New meeting scheduled |
| `MEETING_UPDATED` | `{ candidateId, meeting }` | Meeting details changed |
| `MEETING_DELETED` | `{ candidateId, meetingId }` | Meeting removed |
| `PONG` | — | Heartbeat response |

The client sends `PING` every 25 seconds; server responds with `PONG`. Connections with no heartbeat for 30+ seconds are terminated.

---

## Security

- **Authentication**: JWT tokens with 7-day expiry, validated on every request
- **Password hashing**: bcrypt with cost factor 10
- **Input validation**: Login uniqueness checked across both Admin and Organization tables
- **File uploads**: Limited to 50MB via multer
- **WebSocket auth**: JWT validated via query parameter on connection
- **Data scoping**: Organization users can only access their own bot's data (enforced server-side via `getBotFilter` and `requireBotAccess`)
- **CORS**: Enabled with `origin: "*"` (restrict in production)
- **Role guards**: `authMiddleware`, `adminOnlyMiddleware`, `superAdminMiddleware` protect routes

---

## Docker Deployment

```bash
# Set environment variables
export JWT_SECRET="your-secret-key"
export ADMIN_LOGIN="admin"
export ADMIN_PASSWORD="secure-password"

# Start
docker-compose up -d
```

The Docker Compose file runs the app on port 3000 with SQLite data persisted in `./data/` and uploads in `./uploads/`.

---

## Tech Stack

### Backend
- **Node.js** + **TypeScript** — Server runtime
- **Express.js** — REST API framework
- **grammY** — Telegram Bot Framework
- **Prisma ORM** + **SQLite** — Database
- **ws** — WebSocket server
- **JWT** + **bcrypt** — Authentication
- **multer** — File upload handling
- **axios** — HTTP client (Telegram file downloads)
- **express-async-errors** — Automatic async error handling

### Admin Panel
- **React 18** + **TypeScript** — UI framework
- **Vite** — Build tool and dev server
- **Tailwind CSS** — Utility-first CSS
- **React Router v6** — Client-side routing
- **Zustand** — State management
- **Recharts** — Analytics charts
- **react-hot-toast** — Toast notifications
- **date-fns** — Date formatting
- **axios** — API client
