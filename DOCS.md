# HR Recruitment Bot — Detailed Documentation

This document provides exhaustive documentation of every feature, configuration option, and behavior in the system.

---

## 1. Authentication System

### 1.1 Login

All user types (super_admin, admin, organization) use the same login endpoint with a **login** (username) field — not email.

**Endpoint**: `POST /api/auth/login`

```json
{ "login": "admin", "password": "admin123" }
```

The server checks the `Admin` table first, then the `Organization` table. The first matching active account wins.

**Response** includes a JWT and user object:
```json
{
  "token": "eyJ...",
  "admin": {
    "id": "clx...",
    "login": "admin",
    "name": "Super Admin",
    "role": "super_admin",
    "type": "admin"
  }
}
```

For organization users, the response also includes `organizationId` and `botId`.

### 1.2 JWT Token

- **Algorithm**: HS256
- **Expiry**: 7 days
- **Payload fields**: `adminId`, `login`, `role`, `type`, `organizationId?`, `botId?`
- **Delivery**: `Authorization: Bearer <token>` header, or `?token=<token>` query param (file endpoints only)

### 1.3 Token Refresh

When an organization user creates a bot, the server returns a `newToken` with the `botId` included. The frontend saves this token and reloads the page to apply it.

### 1.4 Data Scoping

Two async helper functions enforce data isolation:

- **`getBotFilter(req)`**: Returns `{ botId }` for org users (with DB fallback if JWT botId is missing), or `{}` for admins (no filter).
- **`requireBotAccess(req, res, botId)`**: Returns `true` if the user can access the specified bot, `false` (with 403 response) otherwise. Admins always have access.

Both functions perform a DB lookup if the JWT's `botId` is undefined (happens when a bot is assigned after login).

### 1.5 Middleware Stack

| Middleware | Purpose |
|-----------|---------|
| `authMiddleware` | Validates JWT, attaches `req.admin` |
| `adminOnlyMiddleware` | Blocks organization users |
| `superAdminMiddleware` | Allows only super_admin role |
| `tokenQueryAuth` | Extracts JWT from `?token=` query param (file routes) |

### 1.6 Admin Management

Super admins can:
- List all admins: `GET /api/auth/admins`
- Create admins: `POST /api/auth/admins` with `{ login, password, name, role }`
- Update admins: `PUT /api/auth/admins/:id` — change name, role, isActive, password
- Login uniqueness is enforced across both Admin and Organization tables

### 1.7 Profile Update

Any user can update their own profile: `PUT /api/auth/profile`
- Change name
- Change password (requires `currentPassword` + `newPassword`)

---

## 2. Bot Management

### 2.1 Creating a Bot

**Endpoint**: `POST /api/bots`

```json
{ "token": "1234567890:ABCDEFabcdef...", "name": "My HR Bot" }
```

**What happens on creation**:
1. Token is validated against the Telegram API (`bot.api.getMe()`)
2. Bot record is created with the returned username
3. Five required questions are auto-seeded (fullName, age, phone, email, position) with translations in `en`, `ru`, `uz`
4. A default English language is created
5. The grammY bot instance starts polling
6. For org users: bot is auto-linked to their organization, and a fresh JWT with `botId` is returned

### 2.2 Bot Instance Lifecycle

The `BotManager` class manages all running bot instances:

| Method | Behavior |
|--------|----------|
| `initialize()` | On server start, loads all active bots from DB and starts them |
| `startBot(botId, token)` | Creates new `BotInstance`, starts polling |
| `stopBot(botId)` | Stops the grammY bot gracefully |
| `restartBot(botId, token)` | Stops then starts (used when token is updated) |
| `getInstance(botId)` | Returns the running `BotInstance` (used for sending messages) |
| `stopAll()` | Graceful shutdown of all bots |

### 2.3 Bot Languages

Each bot can have multiple languages. The first added language or the one marked `isDefault` is the default.

- Add: `POST /api/bots/:id/languages` with `{ code: "uz", name: "O'zbek" }`
- Remove: `DELETE /api/bots/:id/languages/:langId` (cannot remove if it's the only one or default)
- When a bot has >1 language, the `/start` command shows a language selection menu

### 2.4 Bot System Messages

13 customizable message keys:

| Key | When Sent |
|-----|-----------|
| `welcome` | Language selection prompt (when >1 language) |
| `survey_complete` | After the last question is answered |
| `invalid_option` | User typed text when a choice was expected |
| `upload_file` | Prompt to send file/photo for attachment questions |
| `please_send_file` | User sent text when a file was expected |
| `invalid_date_format` | Birth date not in DD.MM.YYYY format |
| `invalid_date_value` | Birth date out of range (14-80 years) |
| `phone_use_button` | User typed text instead of using the phone share button |
| `meeting_scheduled` | Meeting scheduled notification (uses `{date}`, `{time}`, `{note}`) |
| `meeting_reminder` | Meeting reminder (uses `{date}`, `{time}`, `{minutes}`, `{note}`) |

**Translation fallback chain**: DB message (exact lang) > DB message (English) > hardcoded default (exact lang) > hardcoded default (English)

Messages are edited in Bot Detail > Messages tab, per language.

### 2.5 Token Update

`PUT /api/bots/:id/token` with `{ token: "new-token" }` — validates the new token with Telegram, updates the record, and restarts the bot instance.

---

## 3. Survey / Question System

### 3.1 Question Types

**text** — Free-text answer. Special behaviors based on `fieldKey`:
- `age`: Validates DD.MM.YYYY format, calculates age, rejects if outside 14-80
- `phone`: Shows a contact sharing keyboard button instead of free text

**choice** — Inline keyboard with options. User taps one. Supports branching (child questions per option).

**attachment** — Expects a file, photo, document, voice, video, or audio message. Text answers are rejected.

### 3.2 Question Queue System

Each candidate has a `questionQueue` (JSON array of question IDs) stored in the database:

1. On survey start, the queue is built from all top-level active questions (non-branch), ordered by `isRequired DESC, order ASC`
2. The first item in the queue is the current question
3. After answering, the current question is removed from the front
4. If a choice answer is given and the selected option has branch questions, those are prepended to the remaining queue
5. When the queue is empty, the survey is complete

This approach supports:
- Resuming incomplete surveys (queue is persisted)
- Dynamic branching (queue is modified at runtime)
- Skipping inactive/deleted questions

### 3.3 Required Questions

Five questions are auto-seeded when a bot is created:

| Order | Field Key | Type | Translations |
|-------|-----------|------|-------------|
| 0 | `fullName` | text | "Full name" / "ФИО" / "To'liq ism" |
| 1 | `age` | text | "Date of birth (DD.MM.YYYY)" / ... |
| 2 | `phone` | text | "Phone number" / ... |
| 3 | `email` | text | "Email" / ... |
| 4 | `position` | text | "Desired position" / ... |

Required questions:
- Cannot be deleted
- `fieldKey`, `type`, and `isRequired` fields are locked (cannot be changed via PUT)
- Always appear before optional questions

### 3.4 Conditional Branching

A question can have `parentOptionId` pointing to a `QuestionOption`. This makes it a "branch question" that only appears when that specific option is chosen.

**Example**: Question "Which department?" has options "Sales" and "Engineering". Under "Sales", there's a branch question "Sales experience?". Under "Engineering", there's "Programming languages?".

Branch questions have their own ordering via `branchOrder`.

### 3.5 Per-Question Messages

Each question translation can have:
- `successMessage`: Shown after a valid answer
- `errorMessage`: Shown on validation failure (overrides generic error messages)
- `phoneButtonText`: Label for the phone sharing button

---

## 4. Candidate Management

### 4.1 Candidate Creation

A candidate record is created when a Telegram user sends `/start` to the bot:
- One candidate per (bot, telegramId) pair
- If the user already has a completed application, they're told "already submitted"
- If incomplete, the survey resumes from where they left off

### 4.2 Status Lifecycle

| Status | Meaning | Messaging Enabled |
|--------|---------|-------------------|
| `incomplete` | Survey in progress | No |
| `active` | Survey completed, in pipeline | Yes |
| `hired` | Offer accepted | Yes |
| `archived` | Removed from pipeline | Yes |

### 4.3 Profile Fields

Automatically populated from survey answers via `fieldKey`:

| Field | Source |
|-------|--------|
| `fullName` | Text answer to fullName question |
| `age` | "DD.MM.YYYY (X years old)" format |
| `phone` | From contact sharing |
| `email` | Text answer |
| `position` | Text answer |
| `profilePhoto` | File path from attachment answer |
| `username` | From Telegram profile |
| `lang` | Selected language |

Admins can edit any profile field via `PUT /api/candidates/:id`.

### 4.4 Kanban Pipeline

Active candidates are placed on a Kanban board with customizable columns:

- **Columns**: Named stages with `color` (background) and `dot` (status indicator) Tailwind classes
- **Ordering**: Columns have an `order` field; drag to reorder
- **Assignment**: Candidates have a `columnId`; drag between columns
- **Unassigned**: Candidates with no column appear in a special "Unassigned" section
- **Archive**: Archiving a column archives all its candidates; restoring reverses this
- **Delete**: Deleting an active column moves its candidates to Unassigned; deleting an archived column hard-deletes its candidates

### 4.5 Candidate Filtering

`GET /api/candidates` supports:
- `?botId=` — Filter by bot (auto-applied for org users)
- `?status=` — Filter by status
- `?search=` — Search by fullName, username, phone, email (case-insensitive)
- `?filters=[{"questionId":"...","optionId":"..."}]` — Filter by specific answer to choice questions
- `?page=&limit=` — Pagination (default: page 1, limit 20)

### 4.6 Answer Editing

Admins can edit any candidate answer: `PUT /api/candidates/:id/answers/:answerId`
- For text answers: `{ textValue: "new value" }`
- For choice answers: `{ optionId: "new-option-id" }`
- Auto-updates the corresponding profile field if the question has a `fieldKey`

### 4.7 Internal Comments

Comments are private admin notes visible only in the admin panel:
- Add: `POST /api/candidates/:id/comments` with `{ text }`
- Delete: `DELETE /api/candidates/:id/comments/:commentId`
- Each comment records the admin who wrote it (null for org users)
- Displayed in the Answers tab of the candidate detail panel

### 4.8 Candidate Deletion

Only archived candidates can be deleted: `DELETE /api/candidates/:id`
- Active, incomplete, and hired candidates cannot be deleted
- Deletion cascades to answers, comments, messages, files, and meetings

---

## 5. Messaging System

### 5.1 Outbound Messages (Admin to Candidate)

Admins send messages through the admin panel chat interface:

**Text**: `POST /api/messages/:candidateId` with `{ text }`

**Media**: `POST /api/messages/:candidateId/media` (multipart form)
- `file`: The media file
- `messageType`: "photo", "document", "voice", "audio", "video"
- `caption`: Optional text caption

The message is saved to DB, then sent to the candidate via the Telegram bot's `sendMessage`/`sendPhoto`/`sendDocument`/etc. The Telegram message ID is saved for reference.

### 5.2 Inbound Messages (Candidate to Admin)

When a candidate (status != "incomplete") sends a message to the bot:
1. The message is saved to the `Message` table with `direction: "inbound"` and `isRead: false`
2. If it's a file/photo/document, it's downloaded from Telegram and saved locally
3. A `NEW_MESSAGE` WebSocket event is broadcast
4. The unread count is included in the payload

### 5.3 Read Receipts

`POST /api/messages/:candidateId/read` marks all inbound messages for that candidate as read and broadcasts a `MESSAGES_READ` WebSocket event.

### 5.4 Conversations List

`GET /api/messages/conversations` returns all candidates who have messages, sorted by last message time, with:
- Last message text/type
- Unread message count
- Candidate profile info (name, username, photo)

For org users, conversations are filtered to their bot only.

### 5.5 Broadcast

`POST /api/messages/broadcast` with `{ candidateIds: [...], text: "..." }`
- Sends the same text to multiple candidates
- Returns `{ sent: N, failed: N }` counts
- Each message is saved individually and broadcast via WebSocket

### 5.6 File Serving

Messages with media have `localPath` pointing to the downloaded file. Four endpoints serve files:

| Endpoint | Content-Disposition | Use Case |
|----------|-------------------|----------|
| `/api/files/serve/:messageId` | inline | Display in browser (images, PDFs, audio) |
| `/api/files/download/:fileId` | attachment | Force download |
| `/api/files/serve-file/:fileId` | inline | Serve candidate files inline |
| `/api/files/message/:messageId` | attachment | Download message attachments |

All accept `?token=` for browser-native loading (e.g., `<img src>`, `<audio src>`).

---

## 6. Meeting System

### 6.1 Creating a Meeting

**Endpoint**: `POST /api/meetings`

```json
{
  "candidateId": "clx...",
  "scheduledAt": "2026-03-20T14:00:00.000Z",
  "note": "Interview at office, 2nd floor",
  "reminderMinutes": 30
}
```

On creation:
1. Meeting record saved to DB
2. Telegram notification sent to candidate immediately (using `meeting_scheduled` message template)
3. `MEETING_CREATED` WebSocket event broadcast

### 6.2 Reminder Scheduler

A background job (`src/scheduler/meetingReminder.ts`) runs every 60 seconds:

1. Queries all meetings where `status = "scheduled"`, `reminderSent = false`, and `scheduledAt > now`
2. For each, calculates minutes until the meeting
3. If `minutesUntilMeeting <= reminderMinutes`, sends the `meeting_reminder` Telegram message
4. Sets `reminderSent = true` to prevent duplicate reminders

### 6.3 Meeting States

| Status | Meaning |
|--------|---------|
| `scheduled` | Active upcoming meeting |
| `cancelled` | Cancelled by admin |

### 6.4 Meeting Management

- **Update**: `PUT /api/meetings/:id` — changing `scheduledAt` resets `reminderSent` to false
- **Cancel**: `PUT /api/meetings/:id` with `{ status: "cancelled" }`
- **Delete**: `DELETE /api/meetings/:id`

### 6.5 Frontend UI

The Meetings tab in the candidate detail panel shows:
- A "Schedule Meeting" button that expands a form
- Form fields: date/time picker, note textarea, reminder dropdown (10min, 15min, 30min, 1hr, 2hr, 1day)
- Meeting cards color-coded: blue (upcoming), amber (past), gray (cancelled)
- Each card shows: date/time, note, reminder status (pending/sent)
- Cancel and Delete buttons per meeting

---

## 7. Organization System

### 7.1 Creating an Organization

Super admin creates via `POST /api/organizations`:

```json
{
  "name": "Acme Corp",
  "login": "acme",
  "password": "secure123",
  "botId": "clx...",         // optional: assign existing bot
  "branches": ["HQ", "Branch 1"]  // optional: create branches
}
```

Login uniqueness is checked across both Admin and Organization tables.

### 7.2 Bot Assignment

- **Assign**: `PUT /api/organizations/:id/bot` with `{ botId }`
- **Unlink**: `DELETE /api/organizations/:id/bot`
- Each organization can have at most one bot (1:1 via `Bot.organizationId`)
- Assigning a bot to an org first unlinks any previously assigned bot

### 7.3 Organization User Experience

When an org user logs in:
- Navigation shows only: Dashboard, Bots, Playground, Chats, Pipeline, Hired, Archived, Analytics, Branches
- Hidden pages: Admins, Organizations
- All data queries are automatically filtered to their bot via `getBotFilter(req)`
- If no bot is assigned, they can create one from the Bots page (auto-links to their org)

### 7.4 Branches

Organizations can have branches for geographical or logical divisions:
- Branches are unique per organization (enforced by `@@unique([organizationId, name])`)
- Candidates can be associated with a branch via `branchId`
- Org users manage branches from the Branches page
- Super admins manage branches from the Organizations page

---

## 8. WebSocket System

### 8.1 Connection

```javascript
const ws = new WebSocket(`ws://localhost:3000/ws?token=${jwtToken}`);
```

The JWT is validated on connection. Invalid tokens result in immediate close.

### 8.2 Heartbeat

- Client sends `{ type: "PING" }` every 25 seconds
- Server responds with `{ type: "PONG" }`
- Server-side heartbeat check every 30 seconds terminates unresponsive clients

### 8.3 Event Scoping

When broadcasting events, the `wsManager.broadcast(message, botId?)` function:
- Sends to all connected admins/super_admins
- For org users: only sends if the event's `botId` matches their assigned bot

### 8.4 Frontend Integration

The `useWebSocket` hook provides:
- Singleton connection (one WS per browser tab)
- Event subscription via callback map
- Auto-reconnect with 3-second delay
- Automatic cleanup when components unmount

Usage:
```tsx
useWebSocket({
  NEW_MESSAGE: (payload) => { /* handle */ },
  NEW_APPLICATION: (payload) => { /* handle */ },
});
```

---

## 9. Internationalization

### 9.1 Admin Panel i18n

Three languages with full coverage:
- **Uzbek (uz)** — Default language
- **Russian (ru)**
- **English (en)**

The `useT()` hook provides:
- `t("dotted.key")` — Returns translated string
- `t("key", { count: 5 })` — With `{{count}}` interpolation
- `setLang("ru")` — Switch language (persisted in localStorage)
- Falls back to Uzbek if a key is missing

### 9.2 Translation Key Sections

| Section | Coverage |
|---------|----------|
| `common.*` | Shared UI labels (save, cancel, delete, etc.) |
| `lang.*` | Language names and switcher label |
| `nav.*` | Sidebar navigation items |
| `login.*` | Login page |
| `dashboard.*` | Dashboard stats and labels |
| `bots.*` | Bot list and creation |
| `botDetail.*` | Bot configuration tabs (languages, messages, settings) |
| `playground.*` | Question builder |
| `pipeline.*` | Kanban board and stages |
| `chats.*` | Chat interface |
| `candidates.*` | Candidate detail panel |
| `hired.*` | Hired candidates page |
| `pastCandidates.*` | Archived candidates page |
| `analytics.*` | Analytics page |
| `admins.*` | Admin management |
| `organizations.*` | Organization management |
| `meetings.*` | Meeting scheduling |
| `confirm.*` | Confirmation modal buttons |

### 9.3 Bot Message i18n

Bot messages are separate from admin panel i18n. They are stored in the `BotMessage` table and edited per-bot, per-language in the admin UI. Default translations for all 13 keys are provided in `src/constants/botDefaults.ts` in en, ru, and uz.

---

## 10. Analytics System

All analytics endpoints accept an optional `?botId=` parameter. For org users, this is automatically applied.

### 10.1 Overview (`/api/analytics/overview`)

Returns:
- `totalCandidates` — All candidates
- `totalBots` — All bots
- `totalQuestions` — All questions
- `conversionRate` — Hired / (Active + Hired + Archived) as percentage
- `byStatus` — Object with counts per status

### 10.2 Per-Bot Stats (`/api/analytics/per-job`)

Returns array of bots with:
- Bot name and ID
- Active, hired, archived, incomplete counts

### 10.3 Activity Timeline (`/api/analytics/activity`)

Returns daily data points for the last N days (default 30):
- `date` — Day string
- `applications` — New candidates created that day
- `completed` — Candidates who completed the survey that day

### 10.4 Funnel (`/api/analytics/funnel`)

Returns status funnel:
- Array of `{ status, count, percent }` ordered by pipeline stage

### 10.5 Completion Rate (`/api/analytics/completion-rate`)

Returns:
- `total` — All candidates
- `completed` — Non-incomplete candidates
- `rate` — Completion percentage

---

## 11. File System

### 11.1 Upload Directories

Files are stored under `UPLOAD_DIR` (default `./uploads/`):
- `uploads/{botId}/` — Candidate files and attachments (downloaded from Telegram)
- `uploads/messages/` — Media files uploaded by admins

### 11.2 Telegram File Downloads

When a candidate sends a file/photo to the bot:
1. grammY's `bot.api.getFile()` gets the file path
2. The file is downloaded via `https://api.telegram.org/file/bot{token}/{filePath}`
3. Saved locally with a timestamped random filename
4. `CandidateFile` record created with `telegramFileId`, `fileName`, `mimeType`, `localPath`

### 11.3 Browser-Compatible Serving

The `isViewableInBrowser(mimeType)` utility checks if a file can be displayed inline:
- `image/*` — All image types
- `video/*` — All video types
- `audio/*` — All audio types
- `text/*` — All text types
- `application/pdf` — PDF files

Viewable files are served with `Content-Disposition: inline`; others with `attachment` (force download).

---

## 12. Database Models — Detailed Field Reference

### Admin
| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| login | String (unique) | Login username |
| password | String | bcrypt hash |
| name | String | Display name |
| role | String | "admin" or "super_admin" |
| isActive | Boolean | Can this user log in? |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### Organization
| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| name | String | Organization name |
| login | String (unique) | Login username |
| password | String | bcrypt hash |
| isActive | Boolean | Can this org log in? |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### Branch
| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| organizationId | String | FK to Organization |
| name | String | Branch name (unique per org) |
| isActive | Boolean | |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### Bot
| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| token | String (unique) | Telegram bot token |
| name | String | Display name |
| username | String? | Telegram @username (from API) |
| defaultLang | String | Default language code |
| isActive | Boolean | Is the bot running? |
| webhookSet | Boolean | Reserved for webhook mode |
| organizationId | String? (unique) | FK to Organization (1:1) |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### BotMessage
| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| botId | String | FK to Bot |
| lang | String | Language code |
| key | String | Message key (e.g., "welcome") |
| value | String | Custom message text |
| **Unique** | | (botId, lang, key) |

### BotLanguage
| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| botId | String | FK to Bot |
| code | String | Language code (e.g., "uz") |
| name | String | Display name (e.g., "O'zbek") |
| isDefault | Boolean | Is this the default language? |
| **Unique** | | (botId, code) |

### Question
| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| botId | String | FK to Bot |
| type | String | "text", "choice", or "attachment" |
| order | Int | Display order (within top-level questions) |
| isActive | Boolean | Include in survey? |
| isRequired | Boolean | System question (locked) |
| fieldKey | String? | Maps answer to candidate profile field |
| filterLabel | String? | Label for candidate filter UI |
| parentOptionId | String? | FK to QuestionOption (branching) |
| branchOrder | Int | Order within branch |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### QuestionTranslation
| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| questionId | String | FK to Question |
| lang | String | Language code |
| text | String | Question text |
| successMessage | String? | Shown after valid answer |
| errorMessage | String? | Shown on validation failure |
| phoneButtonText | String? | Label for phone share button |
| **Unique** | | (questionId, lang) |

### QuestionOption
| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| questionId | String | FK to Question |
| order | Int | Display order |
| branchId | String? | FK to Branch (optional link) |

### QuestionOptionTranslation
| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| optionId | String | FK to QuestionOption |
| lang | String | Language code |
| text | String | Option label |
| **Unique** | | (optionId, lang) |

### Candidate
| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| botId | String | FK to Bot |
| telegramId | String | Telegram user ID |
| username | String? | Telegram @username |
| fullName | String? | From survey |
| age | String? | "DD.MM.YYYY (X years old)" |
| phone | String? | From contact sharing |
| email | String? | From survey |
| position | String? | From survey |
| profilePhoto | String? | Local file path |
| lang | String | Selected language |
| status | String | incomplete/active/hired/archived |
| branchId | String? | FK to Branch |
| columnId | String? | FK to KanbanColumn |
| currentStep | Int | Legacy step counter |
| questionQueue | String? | JSON array of question IDs |
| createdAt | DateTime | |
| updatedAt | DateTime | |
| lastActivity | DateTime | Last interaction |
| **Unique** | | (botId, telegramId) |

### Answer
| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| candidateId | String | FK to Candidate |
| questionId | String | FK to Question |
| optionId | String? | FK to QuestionOption (for choice) |
| textValue | String? | Text answer or file name |
| createdAt | DateTime | |
| updatedAt | DateTime | |
| **Unique** | | (candidateId, questionId) |

### CandidateComment
| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| candidateId | String | FK to Candidate |
| adminId | String? | FK to Admin (null for org users) |
| text | String | Comment text |
| createdAt | DateTime | |

### Message
| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| candidateId | String | FK to Candidate |
| adminId | String? | FK to Admin (null for inbound) |
| direction | String | "inbound" or "outbound" |
| type | String | text/photo/document/voice/video/audio |
| text | String? | Message text or caption |
| fileId | String? | Telegram file ID |
| fileName | String? | Original file name |
| mimeType | String? | MIME type |
| localPath | String? | Local storage path |
| telegramMsgId | Int? | Telegram message ID |
| isRead | Boolean | Read by admin? |
| createdAt | DateTime | |

### CandidateFile
| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| candidateId | String | FK to Candidate |
| telegramFileId | String? | Telegram file ID |
| fileName | String | Display name |
| mimeType | String? | MIME type |
| localPath | String? | Local storage path |
| size | Int? | File size in bytes |
| createdAt | DateTime | |

### Meeting
| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| candidateId | String | FK to Candidate |
| scheduledAt | DateTime | Meeting date and time |
| note | String? | Meeting details |
| reminderMinutes | Int | Minutes before to send reminder (default 30) |
| reminderSent | Boolean | Has reminder been sent? |
| status | String | "scheduled" or "cancelled" |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### KanbanColumn
| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| name | String | Stage name |
| color | String | Tailwind background class (e.g., "bg-blue-50") |
| dot | String | Tailwind dot class (e.g., "bg-blue-400") |
| order | Int | Display order |
| isArchived | Boolean | Is this stage archived? |
| createdAt | DateTime | |
| updatedAt | DateTime | |

---

## 13. Frontend Pages — Detailed Reference

### 13.1 Login Page (`/login`)
- Text input for login (not email)
- Password input
- Sign in button with loading state
- Error toast on failure
- Redirects to `/` on success

### 13.2 Dashboard (`/`)
- Four stat cards: Total Candidates, Total Bots, Total Questions, Hire Rate
- Real-time updates via WebSocket (NEW_APPLICATION increments counter)
- Bot filter dropdown for super admins

### 13.3 Bots Page (`/bots`)
- Grid of bot cards showing: name, @username, status badge, question count, candidate count, language count
- "Add Bot" button (hidden for org users who already have a bot)
- Bot creation form: token input + name input
- Toggle active/inactive per bot
- Delete bot (admin only, with confirmation)
- Click bot card to navigate to detail page

### 13.4 Bot Detail (`/bots/:id`)
- **Stats**: Candidate count and question count with links
- **Languages tab**: List languages, add new, remove (cannot remove default/only), set default
- **Messages tab**: Per-language message editor for all 13 keys, with hints and default values shown, reset to default button
- **Settings tab**: Edit name, default language, save. Token update section with warning.

### 13.5 Playground (`/playground`)
- Visual question list grouped as: Required questions (locked), then custom questions
- Drag-and-drop reordering
- Create question: type selector, translations per language, options for choice type
- Edit question: inline editing of all fields
- Branching: expand a choice option to see/add child questions
- Delete non-required questions
- Question card shows: type icon, translation text, option count, branching indicator

### 13.6 Pipeline / Candidates (`/candidates`)
- Kanban board with columns
- Drag candidates between columns
- "Unassigned" section for candidates without a column
- Toolbar: search, bot filter, answer filter (by choice question), add stage button
- Column header: name (click to rename), candidate count, context menu (rename, archive, delete, broadcast)
- Candidate card: avatar, name, position, status, last activity
- Click candidate to open detail panel (overlay)
- Broadcast modal: send message to all candidates in a column

### 13.7 Candidate Detail (`/candidates/:id`)
- Full-page view with all candidate info
- Tabs: Answers, Chat, Files, Meetings
- Status/stage dropdowns
- All features from CandidateDetailPanel component

### 13.8 Chats (`/chats`)
- Left panel: conversation list with search, sorted by last message
- Right panel: CandidateDetailPanel in inline mode (chat tab focused)
- Unread badges on conversations
- Bot filter for super admins
- Real-time message updates

### 13.9 Hired Candidates (`/hired`)
- Table view: candidate name, position, phone, hire date, bot name
- Search by name/phone/username
- Click row to open detail panel

### 13.10 Past Candidates / Archived (`/past-candidates`)
- Table view of archived candidates
- Search functionality
- Restore to active (with confirmation)
- Permanently delete (with confirmation)

### 13.11 Retired Stages (`/retired-stages`)
- List of archived Kanban columns with candidate counts
- Restore stage (reactivates candidates)
- Delete stage permanently

### 13.12 Analytics (`/analytics`)
- Bot filter dropdown
- Date range selector (7/30/90 days)
- Overview cards
- Recharts visualizations: line chart (activity), bar chart (funnel, per-bot), status breakdown

### 13.13 Admins (`/admins`)
- Table of admin accounts
- Super admin actions: create admin, toggle active/inactive
- Create form: name, login, password, role selector
- Current user highlighted with "(you)" badge

### 13.14 Organizations (`/organizations`)
- Super admin only
- Organization cards with: name, login, status badge, creation date, assigned bot, branch list
- Create form: name, login, password, bot assignment, comma-separated branches
- Edit mode: inline editing of name, login, bot assignment
- Branch management: add/remove branches per org
- Toggle active/inactive, delete with confirmation

### 13.15 Branches (`/branches`)
- Org users only
- List of branches with candidate count
- Add new branch
- Toggle active/inactive
- Delete branch

---

## 14. Real-Time Features

The following UI elements update in real-time via WebSocket:

| Feature | Event | Behavior |
|---------|-------|----------|
| Dashboard stats | NEW_APPLICATION | Increments candidate counter |
| Chat messages | NEW_MESSAGE | New message appears in conversation |
| Unread badges | NEW_MESSAGE, MESSAGES_READ | Badge count updates in sidebar and chat list |
| Pipeline | NEW_APPLICATION, STATUS_CHANGE | New candidates appear, status changes reflected |
| Candidate panel | CANDIDATE_UPDATE | Profile changes reflected |
| Meetings | MEETING_CREATED/UPDATED/DELETED | Meeting list updates |

---

## 15. Sidebar Navigation

The sidebar shows different items based on user role:

| Item | Icon | Route | Visible To |
|------|------|-------|-----------|
| Dashboard | chart icon | `/` | All |
| Bots | bot icon | `/bots` | All |
| Playground | puzzle icon | `/playground` | All |
| Chats | chat icon | `/chats` | All |
| Pipeline | users icon | `/candidates` | All |
| Hired | check icon | `/hired` | All |
| Archived | archive icon | `/past-candidates` | All |
| Analytics | chart icon | `/analytics` | All |
| Admins | gear icon | `/admins` | Admin, Super Admin |
| Organizations | building icon | `/organizations` | Super Admin |
| Branches | building icon | `/branches` | Organization Users |

The sidebar also includes:
- Language switcher dropdown (uz/ru/en)
- User profile card (name, role)
- Sign out button
- Unread message count badge on Chats item
