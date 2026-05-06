<div align="center">

# 📋 MedCareAlert+ — Full Application Documentation

### Intelligent Medication Management & Pharmacy Coordination Platform

**Version 0.0.0** · **Last Updated: April 9, 2026**

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](#prerequisites)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](#tech-stack)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)](#database)
[![Kafka](https://img.shields.io/badge/Apache%20Kafka-3.7-231F20?logo=apache-kafka&logoColor=white)](#kafka-event-streaming)
[![Gemini AI](https://img.shields.io/badge/Gemini-2.5--Flash-4285F4?logo=google&logoColor=white)](#ai-prescription-scanning)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](#tech-stack)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8-010101?logo=socket.io&logoColor=white)](#real-time-features)

---

*A full-stack healthcare application enabling patients to manage medications, scan prescriptions with AI, coordinate with pharmacies in real-time, and receive intelligent medication reminders — all powered by modern event-driven architecture.*

</div>

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Prerequisites](#4-prerequisites)
5. [Installation & Setup](#5-installation--setup)
6. [Environment Variables](#6-environment-variables)
7. [Features](#7-features)
   - 7.1 [Authentication & User Management](#71-authentication--user-management)
   - 7.2 [Role-Based Access Control (RBAC)](#72-role-based-access-control-rbac)
   - 7.3 [Medication Management](#73-medication-management)
   - 7.4 [AI Prescription Scanner (Gemini OCR)](#74-ai-prescription-scanner-gemini-ocr)
   - 7.5 [Image Preprocessing Pipeline](#75-image-preprocessing-pipeline)
   - 7.6 [Medication Scheduling & Reminders](#76-medication-scheduling--reminders)
   - 7.7 [Pharmacy Map & Discovery](#77-pharmacy-map--discovery)
   - 7.8 [Pharmacy Inventory Management](#78-pharmacy-inventory-management)
   - 7.9 [Patient-Pharmacy Request System](#79-patient-pharmacy-request-system)
   - 7.10 [Real-Time Chat System](#710-real-time-chat-system)
   - 7.11 [Email Notifications](#711-email-notifications)
   - 7.12 [Kafka Event Streaming](#712-kafka-event-streaming)
   - 7.13 [Admin Panel & Analytics Dashboard](#713-admin-panel--analytics-dashboard)
   - 7.14 [Profile Management](#714-profile-management)
   - 7.15 [Medication History & Adherence Tracking](#715-medication-history--adherence-tracking)
   - 7.16 [Notification Provider (In-App)](#716-notification-provider-in-app)
8. [API Reference](#8-api-reference)
9. [Data Models](#9-data-models)
10. [Real-Time Events (Socket.IO)](#10-real-time-events-socketio)
11. [Testing Procedures](#11-testing-procedures)
12. [Kafka Setup (Optional)](#12-kafka-setup-optional)
13. [Project Structure](#13-project-structure)
14. [Troubleshooting](#14-troubleshooting)
15. [Contribution Guidelines](#15-contribution-guidelines)
16. [Change Log](#16-change-log)
17. [License](#17-license)

---

## 1. Overview

**MedCareAlert+** is a comprehensive healthcare platform designed for the Tunisian/French-speaking market. It connects **patients**, **pharmacists**, and **administrators** in a unified ecosystem for medication management.

### Core Purpose

- **Patients** manage their medications, receive smart reminders, scan prescriptions using AI, and request medications from pharmacies.
- **Pharmacists** manage their pharmacy inventory, process patient requests, and communicate via real-time chat.
- **Administrators** oversee the entire platform: manage users, pharmacies, categories, and access deep analytics.

### Key Highlights

| Capability | Description |
|---|---|
| 🤖 AI Prescription OCR | Gemini 2.5 Flash powered prescription scanning with confidence scoring |
| ⏰ Smart Reminders | Multi-tier reminders at 30, 15, 5, 1, and 0 minutes before each dose |
| 💬 Real-Time Chat | Socket.IO powered patient-pharmacist messaging |
| 📊 Event Streaming | Apache Kafka for event-driven architecture and audit trail |
| 📧 Email Alerts | Automated emails for reminders, stock alerts, password resets, and request updates |
| 🗺️ Pharmacy Map | Google Maps integration for pharmacy discovery |
| 📈 Analytics Dashboard | Comprehensive admin analytics with growth trends, adherence rates, and inventory health |

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     FRONTEND (React 19 + Vite)               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐   │
│  │Dashboard │ │Pharmacy  │ │Prescrip. │ │ Admin Panel   │   │
│  │          │ │Map       │ │Scanner   │ │ + Analytics   │   │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └───────┬───────┘   │
│       │             │            │                │           │
│       └─────────────┴────────────┴────────┬───────┘           │
│                                           │                   │
│              Gemini AI (Client-Side OCR)   │ Socket.IO Client │
└──────────────────────────────────┬────────┼──────────────────┘
                                   │ REST   │ WebSocket
                                   ▼        ▼
┌──────────────────────────────────────────────────────────────┐
│                   BACKEND (Express 5 + TypeScript)            │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌────────────┐  │
│  │Auth/JWT  │  │Routes    │  │Socket.IO  │  │Scheduler   │  │
│  │Middleware│  │+ Ctrl    │  │Server     │  │(node-cron) │  │
│  └──────────┘  └──────────┘  └───────────┘  └────────────┘  │
│       │              │              │               │         │
│  ┌────▼──────────────▼──────────────▼───────────────▼──────┐ │
│  │              Business Logic Layer                        │ │
│  └──────────────────────┬───────────────────────────────────┘ │
│                         │                                     │
│  ┌──────────────────────▼───────────────────────────────────┐ │
│  │       Kafka Producers → Topics → Consumers               │ │
│  │    ┌────────────────┐ ┌──────────────┐ ┌──────────────┐  │ │
│  │    │patient-requests│ │medication-   │ │stock-updates │  │ │
│  │    │                │ │events        │ │              │  │ │
│  │    └────────────────┘ └──────────────┘ └──────────────┘  │ │
│  └──────────────────────────────────────────────────────────┘ │
│                         │                                     │
│  ┌──────────────────────▼───────────────────────────────────┐ │
│  │    Email Service (Nodemailer → SMTP/Mailtrap)            │ │
│  └──────────────────────────────────────────────────────────┘ │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
            ┌─────────────────────────┐
            │    MongoDB Atlas        │
            │  (Mongoose ODM)         │
            └─────────────────────────┘
```

---

## 3. Tech Stack

### Frontend

| Technology | Version | Purpose |
|---|---|---|
| React | 19.2.4 | UI framework |
| TypeScript | 5.8 | Type safety |
| Vite | 6.2 | Build tool & dev server |
| Socket.IO Client | 4.8.3 | Real-time communication |
| Google GenAI SDK | 1.41.0 | Gemini AI prescription OCR |

### Backend

| Technology | Version | Purpose |
|---|---|---|
| Express | 5.2.1 | HTTP server framework |
| Mongoose | 9.2.1 | MongoDB ODM |
| Socket.IO | 4.8.3 | WebSocket server |
| KafkaJS | 2.2.4 | Apache Kafka client |
| JSON Web Tokens | 9.0.3 | Authentication |
| bcryptjs | 3.0.3 | Password hashing |
| node-cron | 4.2.1 | Scheduled tasks |
| Nodemailer | 8.0.1 | Email sending |
| Multer | 2.1.1 | File upload handling |
| LangChain | 1.3.0 | RAG framework (placeholder) |
| dotenv | 17.3.1 | Environment configuration |
| tsx | 4.20.6 | TypeScript execution |

### Infrastructure

| Technology | Purpose |
|---|---|
| MongoDB Atlas | Cloud database |
| Apache Kafka 3.7 (KRaft) | Event streaming |
| External Kafka broker (optional) | Event streaming |
| Mailtrap SMTP | Email sandbox/testing |

---

## 4. Prerequisites

- **Node.js** ≥ 18.x
- **npm** ≥ 9.x
- **MongoDB Atlas** account (or local MongoDB instance)
- **Gemini API Key** (from [Google AI Studio](https://ai.google.dev/))
- **Google Maps API Key** (Maps JS API + Places API enabled)
- **SMTP credentials** (Mailtrap for testing, or any SMTP provider)

---

## 5. Installation & Setup

### 5.1 Clone the Repository

```bash
git clone https://github.com/your-username/medcarealert-plus.git
cd medcarealert-plus
```

### 5.2 Install Dependencies

```bash
npm install
```

This installs both frontend and backend dependencies from the unified `package.json`.

### 5.3 Configure Environment Variables

Create a `.env` file in the project root (see [Section 6](#6-environment-variables) for all variables):

```env
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/medcare
PORT=5000
JWT_SECRET=your_secure_jwt_secret_key
JWT_EXPIRES_IN=24h
GEMINI_API_KEY=your_gemini_api_key
VITE_GOOGLE_MAPS_KEY=your_google_maps_key
SMTP_HOST=sandbox.smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_pass
SMTP_FROM=MedCareAlert+ <no-reply@medcarealert.com>
KAFKA_ENABLED=false
KAFKA_BROKERS=localhost:9092
```

### 5.4 Kafka (Disabled by Default)

Set `KAFKA_ENABLED=false` for normal local development.

If you want event streaming, set `KAFKA_ENABLED=true` and point `KAFKA_BROKERS` at a reachable Kafka broker.

### 5.5 Start the Backend Server

```bash
npm run server
```

The server starts on **port 5000** (configurable via `PORT`).

### 5.6 Start the Frontend Dev Server

```bash
npm run dev
```

The frontend starts on **http://localhost:3000**.

### 5.7 Full-Stack (Single Command)

```bash
npm run dev:full
```

> This starts the backend server. Run `npm run dev` in a separate terminal for the frontend.

### 5.8 Production Build

```bash
npm run build
npm run preview
```

---

## 6. Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `MONGODB_URI` | ✅ Yes | — | MongoDB connection string |
| `PORT` | No | `5000` | Backend server port |
| `JWT_SECRET` | No | `medcare_secret_key_2024` | JWT signing secret (change in production!) |
| `JWT_EXPIRES_IN` | No | `24h` | JWT token expiration duration |
| `GEMINI_API_KEY` | ✅ Yes | — | Google Gemini AI API key |
| `VITE_GOOGLE_MAPS_KEY` | No | — | Google Maps JavaScript API key |
| `SMTP_HOST` | No | `sandbox.smtp.mailtrap.io` | SMTP server host |
| `SMTP_PORT` | No | `2525` | SMTP server port |
| `SMTP_USER` | No | — | SMTP authentication username |
| `SMTP_PASS` | No | — | SMTP authentication password |
| `SMTP_FROM` | No | `MedCareAlert+ <noreply@medcarealert.com>` | Sender email address |
| `KAFKA_BROKERS` | No | `localhost:9092` | Comma-separated Kafka broker addresses |
| `FRONTEND_URL` | No | `http://localhost:5173` | Frontend URL (used in password reset emails) |

---

## 7. Features

### 7.1 Authentication & User Management

Full JWT-based authentication system with secure password handling.

**Capabilities:**

- **Registration** — Users can register as `PATIENT` or `PHARMACIST` (Admin creation is restricted)
- **Login** — Email/password authentication returning a JWT token
- **Token Verification** — Automatic session restoration on page load via `GET /api/auth/me`
- **Password Reset** — Forgot-password flow with cryptographic reset tokens, sent via email (1-hour expiry)
- **Profile Update** — Users can update name, location (geolocation), and password
- **Password Hashing** — bcrypt with salt round 10
- **Email Enumeration Prevention** — Forgot-password always returns success regardless of whether the email exists

**Security Features:**

- Passwords minimum 6 characters
- JWT tokens with configurable expiration
- Token stored in `localStorage` and sent via `Authorization: Bearer <token>` header
- Reset tokens are SHA-256 hashed before storage

---

### 7.2 Role-Based Access Control (RBAC)

Three distinct user roles with granular permissions:

| View/Feature | Patient | Pharmacist | Admin |
|---|:---:|:---:|:---:|
| Dashboard | ✅ | ✅ | ✅ |
| Schedule | ✅ | ❌ | ❌ |
| History | ✅ | ❌ | ❌ |
| Pharmacy Map | ✅ | ✅ | ❌ |
| Inventory Management | ❌ | ✅ | ✅ |
| Requests | ✅ | ✅ | ✅ |
| Admin Panel | ❌ | ❌ | ✅ |
| Profile | ✅ | ✅ | ✅ |

**Backend Enforcement:**
- `authenticate` middleware validates JWT on every protected route
- `authorize(['ROLE'])` middleware enforces role-based access per endpoint
- Frontend `canAccess()` function prevents unauthorized UI navigation

---

### 7.3 Medication Management

Complete CRUD operations for patient medications with stock tracking.

**Fields:**

| Field | Type | Description |
|---|---|---|
| `name` | String | Medication name (required) |
| `dosage` | String | Dosage amount (e.g., "500mg") |
| `frequency` | String | How often to take (e.g., "3 fois par jour") |
| `durationInDays` | Number | Treatment duration (default: 7) |
| `startDate` | Date | When the treatment starts |
| `stockCount` | Number | Current stock units (default: 30) |
| `threshold` | Number | Low-stock alert threshold (default: 5) |
| `schedules` | String[] | Time slots (e.g., ["08:00", "14:00", "20:00"]) |
| `isActive` | Boolean | Whether the medication is currently active |
| `history` | Array | Dose history with date, time, and status (taken/missed) |
| `imageUrl` | String | Optional medication image |

**Operations:**

- **Create** — Add new medication with schedules
- **Update** — Modify name, dosage, frequency, schedules, stock, active status
- **Take Dose** — Record a taken dose, decrement stock count
- **Update Stock** — Adjust stock count and threshold
- **Upload Image** — Attach a photo to a medication
- **Delete** — Remove a medication

**Kafka Integration:** All create and take-dose actions publish events to `medication-events` topic. Stock changes publish to `stock-updates` topic.

---

### 7.4 AI Prescription Scanner (Gemini OCR)

Powered by **Gemini 2.5 Flash**, the prescription scanner extracts medication data from photos of handwritten/printed prescriptions.

**How It Works:**

1. User uploads or photographs a prescription
2. Client-side image preprocessing pipeline enhances the image
3. Gemini AI analyzes the image with a specialized medical OCR prompt
4. Structured JSON is returned with extracted medications
5. Results are saved to the database and emailed to the user

**Extracted Data:**

| Field | Description |
|---|---|
| `medications[]` | Array of medication objects |
| `medications[].name` | Medication name (auto-corrected for common OCR errors) |
| `medications[].dosage` | Strength/amount |
| `medications[].frequency` | Dosing frequency (French) |
| `medications[].durationInDays` | Treatment duration |
| `medications[].instructions` | Special instructions |
| `medications[].suggestedSchedules` | Auto-generated time schedules |
| `medications[].confidence` | Per-medication extraction confidence (0.0–1.0) |
| `doctorName` | Prescribing doctor |
| `doctorSpecialty` | Doctor's specialty |
| `prescriptionDate` | Prescription date |
| `overallConfidence` | Overall extraction confidence |
| `warnings` | Readability warnings |
| `processingTimeMs` | Processing time in milliseconds |

**Smart Features:**

- **NLP Post-Processing**: Normalizes medication names (e.g., "dolipran" → "Doliprane"), dosages, and frequencies
- **Bilingual Support**: Handles Arabic/French bilingual prescriptions (common in Tunisia)
- **Confidence Scoring**: Individual medication and overall confidence scores
- **Common OCR Corrections**: Built-in dictionary for frequently misread medication names
- **Schedule Generation**: Automatically suggests dose times based on frequency

---

### 7.5 Image Preprocessing Pipeline

Client-side image enhancement before sending to Gemini AI.

**Pipeline Steps:**

1. **Resolution Normalization** — Scales to max 2048px width
2. **Contrast Enhancement** — Factor 1.4x for better text visibility
3. **Brightness Adjustment** — +10 for darker prescriptions
4. **Noise Reduction** — 3×3 median filter
5. **Sharpening** — Unsharp mask with 3×3 convolution kernel
6. **Grayscale Conversion** — Optional (disabled by default — Gemini handles color well)
7. **Auto-Rotation/Deskew** — Attempts to correct tilted scans

**Quality Assessment:**

- Blur detection via Laplacian variance
- Contrast analysis via luminance standard deviation
- Combined quality score (0–100)

---

### 7.6 Medication Scheduling & Reminders

Intelligent multi-tier reminder system using `node-cron`.

**Reminder Schedule:**

| Offset | Trigger | Type |
|---|---|---|
| 30 minutes before | Pre-reminder | `DOSE_UPCOMING` |
| 15 minutes before | Pre-reminder | `DOSE_UPCOMING` |
| 5 minutes before | Pre-reminder | `DOSE_UPCOMING` |
| 1 minute before | Urgent reminder | `DOSE_UPCOMING` |
| At dose time | Take-now alert | `DOSE_NOW` |

**Additional Cron Jobs:**

| Schedule | Function |
|---|---|
| Every minute (`* * * * *`) | Check and send dose reminders |
| Every 15 minutes (`*/15 * * * *`) | Detect missed doses (30–120 min window) |
| Daily at 9 AM (`0 9 * * *`) | Low stock email alerts |

**Notification Channels:**
- ✉️ **Email** — HTML-formatted with medication image attachment
- 🔔 **In-App** — Socket.IO real-time push notifications
- 📱 **Missed Dose Tracking** — Automatic `missed` status after 30 minutes

---

### 7.7 Pharmacy Map & Discovery

Google Maps integration for finding nearby pharmacies.

**Features:**

- Interactive map display with pharmacy markers
- Search by pharmacy name or address
- Filter pharmacies by medication availability
- View pharmacy services (24/7, Vaccinations, Delivery, etc.)
- Geolocation support for finding nearby pharmacies

---

### 7.8 Pharmacy Inventory Management

Pharmacists and admins can manage medication inventory per pharmacy.

**Stock Statuses:**

| Status | Badge | Description |
|---|---|---|
| `available` | 🟢 | Medication in stock |
| `low` | 🟡 | Running low |
| `out_of_stock` | 🔴 | Not available |
| `expired` | ⚫ | Expired medication |

**Operations:**

- View inventory by pharmacy
- Add/update medication stock status
- Delete inventory items
- Kafka event publishing on stock changes
- Role-restricted: Pharmacists can only manage their own pharmacy

---

### 7.9 Patient-Pharmacy Request System

Patients can request specific medications from pharmacies.

**Request Lifecycle:**

```
pending → confirmed → resolved
pending → out_of_stock → resolved
```

**Flow:**

1. **Patient** creates request (medication name + pharmacy + optional note)
2. **Pharmacist/Admin** reviews and updates status
3. Real-time Socket.IO notifications for all status changes
4. Kafka events published for each action
5. Email notifications on status changes

---

### 7.10 Real-Time Chat System

Full-featured chat between patients and pharmacists, scoped to medication requests.

**Architecture:**

- Socket.IO server with JWT authentication
- Room-based messaging (`request:{id}`, `user:{id}`, `pharmacy:{id}`)
- Messages stored in MongoDB with read receipts

**Features:**

| Feature | Description |
|---|---|
| Send messages | Text messages tied to a specific request |
| Read receipts | Track which users have read each message |
| Room joining | Auto-join based on request context |
| Real-time delivery | Instant message delivery via WebSocket |
| Access control | Only involved parties can access the chat |
| REST fallback | HTTP endpoints for message history |

**Socket Events:**

| Event | Direction | Description |
|---|---|---|
| `chat:join` | Client → Server | Join a request's chat room |
| `chat:leave` | Client → Server | Leave a chat room |
| `chat:send` | Client → Server | Send a message |
| `chat:read` | Client → Server | Mark messages as read |
| `chat:message` | Server → Client | New message broadcast |
| `chat:read` | Server → Client | Read receipt broadcast |
| `chat:error` | Server → Client | Error notification |

---

### 7.11 Email Notifications

Automated HTML email system via Nodemailer/SMTP.

**Email Types:**

| Email | Trigger | Content |
|---|---|---|
| **Medication Reminder** | Scheduled dose time | Medication name, dosage, time, attached image |
| **Stock Alert** | Daily at 9 AM (if stock ≤ threshold) | Medication name, remaining units |
| **Password Reset** | Forgot password request | Secure reset link (1-hour expiry) |
| **Request Status Update** | Pharmacist changes request status | Status update with pharmacy name |
| **Prescription Confirmation** | New prescription scanned | Extracted medication list, attached prescription image |

**Email Features:**
- Beautifully styled HTML templates
- Inline image attachments (CID embedding)
- Urgency-colored headers (red for NOW, amber for soon, blue for upcoming)
- Graceful degradation when SMTP is not configured
- French-language content (aligned with Tunisian market)

---

### 7.12 Kafka Event Streaming

Apache Kafka integration for event-driven architecture and audit trail.

**Topics:**

| Topic | Key | Description |
|---|---|---|
| `patient-requests` | pharmacyId | Request creation and status changes |
| `medication-events` | userId | Medication CRUD and dose tracking |
| `stock-updates` | entityId | Stock level changes for medications and pharmacy inventory |

**Consumer Actions:**

| Topic | Action | Handler |
|---|---|---|
| `patient-requests` | `created` | Log new request, resolve pharmacy name |
| `patient-requests` | `status_changed` | Send email to patient with updated status |
| `stock-updates` | `low_stock_alert` | Send stock alert email to user |
| `stock-updates` | `stock_change` | Log stock change |
| `medication-events` | `created` | Log medication creation with schedules |
| `medication-events` | `dose_taken` | Log dose taken event |

**Event Store:**
- In-memory circular buffer (max 500 events)
- Per-topic statistics (total events, last timestamp, error count)
- REST API for viewing events and stats (`GET /api/kafka/events`, `GET /api/kafka/stats`)
- Real-time Socket.IO broadcast of Kafka events (`kafka:event`)

**Resilience:**
- Graceful degradation when Kafka is unavailable
- Auto-retry consumer connection (10 attempts, 5-second delay)
- Auto-topic creation via Kafka admin client

---

### 7.13 Admin Panel & Analytics Dashboard

Comprehensive administrative interface with deep analytics.

**User Management:**

- List all users with filters
- Create new users (including ADMIN role)
- Update user profiles
- Reset user passwords
- Delete/deactivate users

**Pharmacy Supervision:**

- List all pharmacies
- View pharmacy details and inventory
- Update pharmacy information
- Toggle pharmacy active/inactive
- Delete pharmacies

**Category Management:**

- Create medication categories
- Update category names and descriptions
- Toggle category active/inactive
- Delete categories

**Analytics (GET /api/analytics/admin):**

| Metric | Description |
|---|---|
| **Core Counts** | Total users, patients, pharmacists, admins, pharmacies, medications, prescriptions, requests, inventory items, categories |
| **Growth Trends** | 30-day growth charts for users, requests, prescriptions, medications |
| **Weekly Comparisons** | Week-over-week change percentages |
| **Monthly Comparisons** | Month-over-month change percentages |
| **Top Medications** | Most frequently added medications |
| **Top Pharmacies** | Pharmacies with most requests |
| **Adherence Rate** | Platform-wide medication adherence percentage |
| **Adherence Trend** | 14-day daily taken vs. missed chart |
| **Prescription Stats** | Average confidence, processing time, total medications extracted |
| **Inventory Health** | Per-pharmacy stock status breakdown |
| **Request Resolution** | Average/min/max resolution time |
| **Hourly Activity** | Activity heatmap |

**Personal Analytics (GET /api/analytics/me):**
- Available to Patient and Pharmacist roles
- Shows personal statistics relevant to the user's role

---

### 7.14 Profile Management

Users can manage their profile information.

**Capabilities:**

- Update display name
- Set geolocation (latitude/longitude)
- Change password (requires current password verification)
- View account details
- Logout (clears local storage)

---

### 7.15 Medication History & Adherence Tracking

Detailed history of all medication actions.

**Tracked Events:**

| Status | Description | Trigger |
|---|---|---|
| `taken` | Dose successfully recorded | User clicks "Take Dose" |
| `missed` | Dose was not taken in time | Scheduler detects 30+ min past due |

**Data Points Per Entry:**
- `date` — ISO date string (YYYY-MM-DD)
- `time` — Time of the event (HH:MM)
- `status` — `taken` or `missed`

**Views:**
- History View: Chronological list of all dose events
- Schedule View: Today's upcoming, completed, and missed doses
- Dashboard: Today's taken count per medication

---

### 7.16 Notification Provider (In-App)

React context-based notification system.

**Features:**
- Wraps the entire app to intercept Socket.IO events
- Displays real-time medication reminder notifications
- Shows upcoming, current, and missed dose alerts
- Integrates with the medication schedule
- Provides `onViewChange` callback for navigating to relevant views

---

## 8. API Reference

### Authentication (`/api/auth`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/register` | No | Register a new user |
| `POST` | `/login` | No | Authenticate and receive JWT |
| `POST` | `/forgot-password` | No | Request password reset email |
| `POST` | `/reset-password` | No | Reset password with token |
| `GET` | `/me` | ✅ | Get current user profile |
| `PATCH` | `/me` | ✅ | Update current user profile |

### Medications (`/api/medications`)

| Method | Endpoint | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/` | ✅ | All | List user's medications |
| `POST` | `/` | ✅ | All | Create new medication |
| `PATCH` | `/:id` | ✅ | All | Update medication |
| `PATCH` | `/:id/take` | ✅ | All | Record a taken dose |
| `PATCH` | `/:id/stock` | ✅ | All | Update stock count/threshold |
| `POST` | `/:id/image` | ✅ | All | Upload medication image |
| `DELETE` | `/:id` | ✅ | All | Delete a medication |

### Prescriptions (`/api/prescriptions`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/` | ✅ | Create prescription (with image upload) |
| `GET` | `/` | ✅ | List user's prescriptions |
| `GET` | `/:id` | ✅ | Get prescription by ID |

### Pharmacies (`/api/pharmacies`)

| Method | Endpoint | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/` | No | Public | List active pharmacies (search & filter) |
| `POST` | `/` | ✅ | Admin | Create new pharmacy |
| `PATCH` | `/:id` | ✅ | Admin | Update pharmacy |
| `GET` | `/:id/inventory` | No | Public | Get pharmacy inventory |
| `PATCH` | `/:id/inventory` | ✅ | Pharmacist, Admin | Update inventory item |
| `DELETE` | `/:id/inventory/:itemId` | ✅ | Pharmacist, Admin | Delete inventory item |

### Requests (`/api/requests`)

| Method | Endpoint | Auth | Roles | Description |
|---|---|---|---|---|
| `POST` | `/` | ✅ | Patient | Create medication request |
| `GET` | `/` | ✅ | All | List requests (filtered by role) |
| `PATCH` | `/:id/status` | ✅ | Pharmacist, Admin | Update request status |
| `GET` | `/:id/chat/messages` | ✅ | All | Get chat messages for request |
| `POST` | `/:id/chat/messages` | ✅ | All | Send chat message |
| `PATCH` | `/:id/chat/read` | ✅ | All | Mark chat as read |

### Admin (`/api/admin`)

| Method | Endpoint | Roles | Description |
|---|---|---|---|
| `GET` | `/users` | Admin | List all users |
| `POST` | `/users` | Admin | Create user (any role) |
| `PATCH` | `/users/:id` | Admin | Update user |
| `PATCH` | `/users/:id/reset-password` | Admin | Reset user's password |
| `DELETE` | `/users/:id` | Admin | Delete user |
| `GET` | `/stats` | Admin | Get global statistics |
| `GET` | `/pharmacies` | Admin | List all pharmacies |
| `GET` | `/pharmacies/:id` | Admin | Get pharmacy detail |
| `PATCH` | `/pharmacies/:id` | Admin | Update pharmacy |
| `PATCH` | `/pharmacies/:id/toggle` | Admin | Toggle pharmacy active |
| `DELETE` | `/pharmacies/:id` | Admin | Delete pharmacy |
| `GET` | `/requests` | Admin | List all requests |
| `GET` | `/categories` | Admin | List categories |
| `POST` | `/categories` | Admin | Create category |
| `PATCH` | `/categories/:id` | Admin | Update category |
| `PATCH` | `/categories/:id/toggle` | Admin | Toggle category |
| `DELETE` | `/categories/:id` | Admin | Delete category |

### Categories (`/api/categories`)

| Method | Endpoint | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/` | ✅ | Admin | List all categories |
| `POST` | `/` | ✅ | Admin | Create category |
| `PATCH` | `/:id` | ✅ | Admin | Update category |

### Analytics (`/api/analytics`)

| Method | Endpoint | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/admin` | ✅ | Admin | Full platform analytics |
| `GET` | `/me` | ✅ | All | Personal analytics |

### Kafka (`/api/kafka`)

| Method | Endpoint | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/events?limit=100&topic=...` | ✅ | Admin | Get recent Kafka events |
| `GET` | `/stats` | ✅ | Admin | Get Kafka connection and topic stats |

---

## 9. Data Models

### User

```typescript
{
  name: string;              // Required
  email: string;             // Required, unique
  password: string;          // Required, bcrypt hashed
  role: 'PATIENT' | 'PHARMACIST' | 'ADMIN';  // Default: 'PATIENT'
  isActive: boolean;         // Default: true
  location?: { lat: number; lng: number };
  pharmacyId?: ObjectId;     // Ref: Pharmacy (for pharmacists)
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

### Medication

```typescript
{
  userId: ObjectId;           // Ref: User (required)
  name: string;               // Required
  dosage?: string;
  frequency?: string;
  imageUrl?: string;
  durationInDays: number;     // Default: 7
  startDate: Date;            // Default: now
  stockCount: number;         // Default: 30
  threshold: number;          // Default: 5
  schedules: string[];        // e.g., ["08:00", "14:00", "20:00"]
  isActive: boolean;          // Default: true
  history: Array<{
    date: string;
    time: string;
    status: 'taken' | 'missed';
  }>;
  createdAt: Date;
  updatedAt: Date;
}
```

### Pharmacy

```typescript
{
  name: string;               // Required
  address: string;            // Required
  location: {
    lat: number;              // Required
    lng: number;              // Required
  };
  phone?: string;
  ownerId?: ObjectId;         // Ref: User
  services: string[];         // e.g., ["24/7", "Vaccinations", "Delivery"]
  isActive: boolean;          // Default: true
  createdAt: Date;
  updatedAt: Date;
}
```

### PharmacyInventory

```typescript
{
  pharmacyId: ObjectId;       // Ref: Pharmacy (required)
  medicationName: string;     // Required
  stockStatus: 'available' | 'low' | 'out_of_stock' | 'expired';  // Default: 'available'
  lastUpdated: Date;          // Default: now
  createdAt: Date;
  updatedAt: Date;
}
```

### Prescription

```typescript
{
  userId: ObjectId;           // Ref: User (required)
  imageUrl?: string;
  extractedData: {
    medications: Array<{
      name?: string;
      dosage?: string;
      frequency?: string;
      durationInDays?: number;
      instructions?: string;
      confidence?: number;
      suggestedSchedules?: string[];
    }>;
    doctorName?: string;
    doctorSpecialty?: string;
    prescriptionDate?: string;
  };
  overallConfidence: number;  // 0–1
  processingTimeMs?: number;
  status: 'pending' | 'processed' | 'failed';  // Default: 'pending'
  createdAt: Date;
  updatedAt: Date;
}
```

### PatientRequest

```typescript
{
  patientId: ObjectId;        // Ref: User (required)
  pharmacyId: ObjectId;       // Ref: Pharmacy (required)
  medicationName: string;     // Required
  note: string;               // Default: ''
  status: 'pending' | 'confirmed' | 'out_of_stock' | 'resolved';  // Default: 'pending'
  createdAt: Date;
  updatedAt: Date;
}
```

### ChatMessage

```typescript
{
  requestId: ObjectId;        // Ref: PatientRequest (required, indexed)
  patientId: ObjectId;        // Ref: User (required, indexed)
  pharmacyId: ObjectId;       // Ref: Pharmacy (required, indexed)
  senderId: ObjectId;         // Ref: User (required)
  senderRole: 'PATIENT' | 'PHARMACIST' | 'ADMIN';
  senderName: string;         // Required
  text: string;               // Required, trimmed
  readBy: Array<{
    userId: ObjectId;
    role: 'PATIENT' | 'PHARMACIST' | 'ADMIN';
    readAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}
```

### MedicationCategory

```typescript
{
  name: string;               // Required, unique
  description: string;        // Default: ''
  isActive: boolean;          // Default: true
  createdAt: Date;
  updatedAt: Date;
}
```

---

## 10. Real-Time Events (Socket.IO)

### Connection

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000', {
  auth: { token: 'your_jwt_token' }
});
```

### Authentication

Socket.IO middleware validates the JWT token from `socket.handshake.auth.token` or `Authorization` header. Authenticated users are automatically joined to:
- `user:{userId}` — Personal room
- `pharmacy:{pharmacyId}` — Pharmacy room (if applicable)

### Events Summary

| Event | Direction | Payload | Description |
|---|---|---|---|
| `chat:join` | Client → Server | `{ requestId }` | Join a request chat room |
| `chat:leave` | Client → Server | `{ requestId }` | Leave a chat room |
| `chat:send` | Client → Server | `{ requestId, text }` | Send a chat message |
| `chat:read` | Client → Server | `{ requestId }` | Mark messages as read |
| `chat:message` | Server → Client | Message object | New message received |
| `chat:read` | Server → Client | `{ requestId, userId, role, readAt }` | Read receipt |
| `chat:error` | Server → Client | `{ requestId?, message }` | Error notification |
| `med:reminder` | Server → Client | Reminder object | Medication reminder |
| `request:created` | Server → Client | Request object | New request notification |
| `request:updated` | Server → Client | Request object | Request status change |
| `kafka:event` | Server → Client | Kafka event object | Real-time Kafka event feed |

### Medication Reminder Payload

```typescript
{
  type: 'DOSE_NOW' | 'DOSE_UPCOMING' | 'DOSE_MISSED';
  medName: string;
  dosage: string;
  doseTime: string;       // "HH:MM"
  minutesBefore: number;  // 0, 1, 5, 15, or 30
  message: string;        // Human-readable message (French)
  timestamp: string;      // ISO timestamp
}
```

---

## 11. Testing Procedures

### 11.1 Authentication Tests

| # | Test Case | Steps | Expected Result |
|---|---|---|---|
| 1 | Register new patient | POST `/api/auth/register` with `{ name, email, password, role: "PATIENT" }` | 200 OK, returns `{ token, user }` |
| 2 | Register duplicate email | POST `/api/auth/register` with same email | 409 Conflict |
| 3 | Login with valid credentials | POST `/api/auth/login` with `{ email, password }` | 200 OK, returns JWT token |
| 4 | Login with wrong password | POST `/api/auth/login` with wrong password | 401 Unauthorized |
| 5 | Access protected route without token | GET `/api/auth/me` without Authorization header | 401 Unauthorized |
| 6 | Access protected route with valid token | GET `/api/auth/me` with `Authorization: Bearer <token>` | 200 OK, returns user object |
| 7 | Forgot password | POST `/api/auth/forgot-password` with `{ email }` | 200 OK (always, to prevent email enumeration) |
| 8 | Reset password with valid token | POST `/api/auth/reset-password` with `{ token, password }` | 200 OK |
| 9 | Reset password with expired/invalid token | POST `/api/auth/reset-password` with invalid token | 400 Bad Request |
| 10 | Register with short password | POST `/api/auth/register` with 3-char password | 400 Bad Request |

### 11.2 Medication Management Tests

| # | Test Case | Steps | Expected Result |
|---|---|---|---|
| 1 | Create medication | POST `/api/medications` with `{ name: "Doliprane", dosage: "500mg", schedules: ["08:00", "20:00"] }` | 201 Created |
| 2 | List medications | GET `/api/medications` | 200 OK, array of user's medications |
| 3 | Take a dose | PATCH `/api/medications/:id/take` | 200 OK, stockCount decremented, history updated |
| 4 | Update stock | PATCH `/api/medications/:id/stock` with `{ stockCount: 20, threshold: 5 }` | 200 OK |
| 5 | Update medication | PATCH `/api/medications/:id` with `{ dosage: "1000mg" }` | 200 OK |
| 6 | Delete medication | DELETE `/api/medications/:id` | 204 No Content |
| 7 | Upload medication image | POST `/api/medications/:id/image` with FormData (image file) | 200 OK, imageUrl set |
| 8 | Access other user's medication | PATCH `/api/medications/:otherId/take` | 404 Not Found |

### 11.3 Prescription Scanner Tests

| # | Test Case | Steps | Expected Result |
|---|---|---|---|
| 1 | Scan prescription image | POST `/api/prescriptions` with FormData (image + extractedData JSON) | 201 Created with extracted medications |
| 2 | List prescriptions | GET `/api/prescriptions` | 200 OK, array of prescriptions |
| 3 | Get prescription by ID | GET `/api/prescriptions/:id` | 200 OK, prescription object |
| 4 | Scan blurry image | Upload low-quality image | Returns result with low confidence score and warnings |
| 5 | Test AI OCR (client-side) | Call `scanPrescriptionAdvanced(base64Image)` | Returns medications with names, dosages, schedules |

### 11.4 Pharmacy & Inventory Tests

| # | Test Case | Steps | Expected Result |
|---|---|---|---|
| 1 | List pharmacies (public) | GET `/api/pharmacies` | 200 OK, active pharmacies |
| 2 | Search pharmacies | GET `/api/pharmacies?q=tunis` | 200 OK, filtered results |
| 3 | Filter by medication | GET `/api/pharmacies?medication=doliprane` | 200 OK, pharmacies with available stock |
| 4 | Create pharmacy (admin) | POST `/api/pharmacies` with location data | 201 Created |
| 5 | Update inventory | PATCH `/api/pharmacies/:id/inventory` with `{ medicationName, stockStatus }` | 200 OK |
| 6 | Get pharmacy inventory | GET `/api/pharmacies/:id/inventory` | 200 OK, array of inventory items |
| 7 | Non-admin creates pharmacy | POST `/api/pharmacies` as patient | 403 Forbidden |

### 11.5 Request System Tests

| # | Test Case | Steps | Expected Result |
|---|---|---|---|
| 1 | Create request (patient) | POST `/api/requests` with `{ pharmacyId, medicationName }` | 201 Created |
| 2 | List requests (patient) | GET `/api/requests` as patient | 200 OK, only patient's requests |
| 3 | List requests (pharmacist) | GET `/api/requests` as pharmacist | 200 OK, only requests for pharmacist's pharmacy |
| 4 | Update request status | PATCH `/api/requests/:id/status` with `{ status: "confirmed" }` | 200 OK |
| 5 | Send chat message | POST `/api/requests/:id/chat/messages` with `{ text }` | 201 Created |
| 6 | Get chat messages | GET `/api/requests/:id/chat/messages` | 200 OK, array of messages |
| 7 | Mark chat as read | PATCH `/api/requests/:id/chat/read` | 200 OK |

### 11.6 Admin Panel Tests

| # | Test Case | Steps | Expected Result |
|---|---|---|---|
| 1 | Get all users (admin) | GET `/api/admin/users` | 200 OK, array of all users |
| 2 | Create admin user | POST `/api/admin/users` with `{ role: "ADMIN", ... }` | 201 Created |
| 3 | Get platform stats | GET `/api/admin/stats` | 200 OK, statistics object |
| 4 | Get full analytics | GET `/api/analytics/admin` | 200 OK, comprehensive analytics |
| 5 | Toggle pharmacy active | PATCH `/api/admin/pharmacies/:id/toggle` | 200 OK |
| 6 | Non-admin access admin route | GET `/api/admin/users` as patient | 403 Forbidden |

### 11.7 Real-Time (Socket.IO) Tests

| # | Test Case | Steps | Expected Result |
|---|---|---|---|
| 1 | Connect with valid token | `io('url', { auth: { token } })` | Connection successful |
| 2 | Connect without token | `io('url')` | Connection rejected: "Unauthorized" |
| 3 | Send chat message | Emit `chat:send` with `{ requestId, text }` | Receive `chat:message` event |
| 4 | Join chat room | Emit `chat:join` with `{ requestId }` | Messages marked as read |
| 5 | Receive medication reminder | Wait for scheduled dose time | Receive `med:reminder` event |

### 11.8 Kafka Tests

| # | Test Case | Steps | Expected Result |
|---|---|---|---|
| 1 | Kafka events endpoint | GET `/api/kafka/events` as admin | 200 OK, list of events |
| 2 | Kafka stats | GET `/api/kafka/stats` as admin | 200 OK with connected status, topics, stats |
| 3 | Event after medication creation | Create a medication | Event appears in `/api/kafka/events` |
| 4 | Email on request status change | Change request status to "confirmed" | Email sent to patient (check Mailtrap) |

### 11.9 Sample cURL Commands

```bash
# Register
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"John Doe","email":"john@example.com","password":"password123","role":"PATIENT"}'

# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"john@example.com","password":"password123"}'

# Get profile (replace TOKEN)
curl http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer TOKEN"

# Create medication
curl -X POST http://localhost:5000/api/medications \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"name":"Doliprane","dosage":"500mg","frequency":"3 fois par jour","durationInDays":7,"schedules":["08:00","14:00","20:00"],"stockCount":30,"threshold":5}'

# Take dose
curl -X PATCH http://localhost:5000/api/medications/MEDICATION_ID/take \
  -H "Authorization: Bearer TOKEN"

# List pharmacies
curl http://localhost:5000/api/pharmacies

# Search pharmacies with medication filter
curl "http://localhost:5000/api/pharmacies?q=tunis&medication=doliprane"

# Create request
curl -X POST http://localhost:5000/api/requests \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"pharmacyId":"PHARMACY_ID","medicationName":"Augmentin","note":"Urgent"}'

# Upload prescription
curl -X POST http://localhost:5000/api/prescriptions \
  -H "Authorization: Bearer TOKEN" \
  -F "image=@prescription.jpg" \
  -F 'extractedData={"medications":[{"name":"Doliprane","dosage":"500mg","frequency":"3 fois par jour","durationInDays":7}]}'

# Get analytics (admin)
curl http://localhost:5000/api/analytics/admin \
  -H "Authorization: Bearer ADMIN_TOKEN"

# Get Kafka events (admin)
curl "http://localhost:5000/api/kafka/events?limit=50" \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

---

## 12. Kafka Setup (Optional)

Kafka is optional and disabled by default, so the project can run locally without Docker.

Use this for standard local development:

```env
KAFKA_ENABLED=false
```

If you want Kafka-backed event streaming, connect the app to any reachable broker:

```env
KAFKA_ENABLED=true
KAFKA_BROKERS=localhost:9092
```

The existing `docker-compose.kafka.yml` file is now just a legacy example and is no longer required for normal project setup.

---

## 13. Project Structure

```
medcarealert+/
├── .env                        # Environment variables
├── package.json                # Dependencies & scripts
├── tsconfig.json               # TypeScript configuration
├── vite.config.ts              # Vite build configuration
├── docker-compose.kafka.yml    # Optional legacy Kafka example
├── index.html                  # HTML entry point
├── index.tsx                   # React entry point
├── App.tsx                     # Main React application (routing, auth, views)
├── types.ts                    # Shared TypeScript interfaces
├── geminiService.ts            # Gemini AI prescription OCR
├── imagePreprocessing.ts       # Client-side image preprocessing pipeline
│
├── components/                 # React UI Components
│   ├── AdminPanel.tsx          # Admin dashboard (users, pharmacies, categories, stats)
│   ├── Auth.tsx                # Login/register/forgot-password forms
│   ├── Dashboard.tsx           # Main patient dashboard
│   ├── HistoryView.tsx         # Medication history timeline
│   ├── InventoryManager.tsx    # Pharmacy inventory management
│   ├── InventoryModal.tsx      # Inventory edit modal
│   ├── Layout.tsx              # App shell (sidebar, header, navigation)
│   ├── MedicationModal.tsx     # Medication add/edit modal
│   ├── NotificationProvider.tsx# Real-time notification handler
│   ├── PharmacyMap.tsx         # Google Maps pharmacy locator
│   ├── PrescriptionScanner.tsx # Prescription scan & review UI
│   ├── ProfileManager.tsx      # User profile settings
│   ├── RequestsManager.tsx     # Patient-pharmacy request system + chat
│   └── ScheduleView.tsx        # Daily medication schedule
│
├── backend/                    # Express.js Backend
│   ├── server.ts               # Server entry point
│   ├── socket.ts               # Socket.IO real-time server
│   ├── langchain.ts            # RAG integration (placeholder)
│   │
│   ├── config/
│   │   └── db.ts               # MongoDB connection
│   │
│   ├── controllers/            # Route handlers
│   │   ├── adminController.ts  # Admin CRUD operations
│   │   ├── analyticsController.ts # Analytics aggregation
│   │   ├── authController.ts   # Auth (register, login, reset)
│   │   ├── categoryController.ts  # Category management
│   │   ├── chatController.ts   # Chat message endpoints
│   │   ├── inventoryController.ts # Inventory management
│   │   ├── medicationController.ts # Medication CRUD
│   │   ├── pharmacyController.ts   # Pharmacy CRUD
│   │   ├── prescriptionController.ts # Prescription management
│   │   ├── ragController.ts    # RAG endpoints (placeholder)
│   │   └── requestController.ts    # Request management
│   │
│   ├── helpers/
│   │   └── utils.ts            # Utility functions (toId, toClient, toPublicUser)
│   │
│   ├── kafka/                  # Kafka event streaming
│   │   ├── client.ts           # Kafka client, producer, consumer setup
│   │   ├── consumers.ts        # Message consumers & handlers
│   │   ├── eventStore.ts       # In-memory event buffer
│   │   ├── index.ts            # Kafka initialization & exports
│   │   └── producers.ts        # Event publishers
│   │
│   ├── middleware/
│   │   ├── auth.ts             # JWT authenticate & authorize middleware
│   │   └── upload.ts           # Multer file upload (prescriptions, medications)
│   │
│   ├── models/                 # Mongoose schemas
│   │   ├── ChatMessage.ts
│   │   ├── index.ts            # Model exports
│   │   ├── Medication.ts
│   │   ├── MedicationCategory.ts
│   │   ├── PatientRequest.ts
│   │   ├── Pharmacy.ts
│   │   ├── PharmacyInventory.ts
│   │   ├── Prescription.ts
│   │   └── User.ts
│   │
│   ├── routes/                 # Express route definitions
│   │   ├── adminRoutes.ts
│   │   ├── analyticsRoutes.ts
│   │   ├── authRoutes.ts
│   │   ├── categoryRoutes.ts
│   │   ├── index.ts            # Route aggregator
│   │   ├── kafkaRoutes.ts
│   │   ├── medicationRoutes.ts
│   │   ├── pharmacyRoutes.ts
│   │   ├── prescriptionRoutes.ts
│   │   ├── ragRoutes.ts
│   │   └── requestRoutes.ts
│   │
│   └── services/               # Business logic services
│       ├── chatService.ts      # Chat message logic & access control
│       ├── emailService.ts     # Email templates & sending
│       └── scheduler.ts        # Cron jobs (reminders, missed doses, stock alerts)
│
└── uploads/                    # File upload storage
    ├── medications/            # Medication images
    └── prescriptions/          # Prescription scans
```

---

## 14. Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|---|---|---|
| `MONGODB_URI is not defined` | Missing `.env` file or `MONGODB_URI` variable | Create `.env` with your MongoDB connection string |
| `Server running on port 5000` but frontend can't connect | CORS or port mismatch | Ensure backend runs on port 5000, frontend on 3000 |
| `Kafka disabled - running without event streaming` | Kafka is disabled for local development | Leave it disabled, or set `KAFKA_ENABLED=true` to enable Kafka |
| `Kafka unavailable — running without event streaming` | Kafka broker is unreachable | Check `KAFKA_BROKERS`, or disable Kafka with `KAFKA_ENABLED=false` |
| `Email send failed` | SMTP not configured | Set `SMTP_USER` and `SMTP_PASS` in `.env` (emails are best-effort) |
| Prescription scan returns empty medications | Invalid/missing `GEMINI_API_KEY` | Verify your Gemini API key in `.env` |
| `Invalid token` on API calls | JWT expired or malformed | Re-login to get a fresh token |
| `Forbidden` on admin routes | Non-admin role trying to access admin endpoints | Login with an admin account |
| File upload fails | Image > 10MB or unsupported format | Use JPEG, PNG, or WebP under 10MB |
| Missed doses not being detected | Scheduler timing window (30–120 min) | Missed dose detection runs every 15 minutes checking 30–120 min window |
| Socket.IO connection rejected | Missing or invalid auth token | Pass JWT token in `socket.handshake.auth.token` |
| `Cannot find module` errors on backend | Dependencies not installed | Run `npm install` |

### Debugging Tips

1. **Check server logs** — The backend logs Kafka connections, scheduler events, and email status
2. **Mailtrap inbox** — Check your Mailtrap inbox for test emails
3. **Kafka events** — Use `GET /api/kafka/events` to view processed events
4. **MongoDB Compass** — Connect to your Atlas cluster to inspect data directly
5. **Browser DevTools** — Check Console for Gemini OCR errors and Network tab for API responses
6. **Socket.IO debug** — Enable debug logging with `localStorage.debug = 'socket.io-client:*'` in browser console

---

## 15. Contribution Guidelines

### Getting Started

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Test thoroughly (see [Section 11](#11-testing-procedures))
5. Commit with clear messages: `git commit -m "feat: add medication reminder sounds"`
6. Push to your fork: `git push origin feature/my-feature`
7. Open a Pull Request

### Code Standards

- **TypeScript** — All code must be typed; use `npm run lint` to check
- **File naming** — PascalCase for components, camelCase for utilities and services
- **API responses** — Always use `toClient()` helper to strip `_id` and `__v`
- **Error handling** — Return appropriate HTTP status codes and JSON error messages
- **Security** — Never expose passwords, tokens, or sensitive data in responses
- **Kafka events** — All state-changing operations should publish Kafka events

### Commit Convention

```
feat: add new feature
fix: bug fix
docs: documentation changes
style: formatting, missing semicolons
refactor: code restructuring
test: adding tests
chore: maintenance tasks
```

### Branch Naming

```
feature/description
bugfix/description
hotfix/description
docs/description
```

---

## 16. Change Log

### v0.0.0 — Initial Release

**Core Features:**
- JWT authentication with registration, login, and password reset
- Role-based access control (Patient, Pharmacist, Admin)
- Full medication CRUD with stock tracking and dose history
- Gemini AI prescription scanner with NLP post-processing
- Client-side image preprocessing pipeline for OCR optimization
- Multi-tier medication reminders (30/15/5/1/0 min before dose)
- Missed dose auto-detection and tracking
- Google Maps pharmacy locator with search and filtering
- Pharmacy inventory management with stock status tracking
- Patient-pharmacy medication request system
- Real-time chat between patients and pharmacists (Socket.IO)
- Comprehensive email notification system (reminders, stock alerts, password reset, request updates, prescriptions)
- Apache Kafka event streaming with 3 topics and in-memory event store
- Admin panel with user/pharmacy/category management
- Full analytics dashboard with growth trends, adherence rates, and inventory health
- Profile management with geolocation support
- File upload system for prescriptions and medication images
- Docker Compose setup for Kafka (KRaft mode)
- Bilingual support (French/Arabic — Tunisian market focus)

---

## 17. License

This project is private. All rights reserved.

---

<div align="center">

**Built with ❤️ for better healthcare management**

*MedCareAlert+ — Votre santé, notre priorité*

</div>
