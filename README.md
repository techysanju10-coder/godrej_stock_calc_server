# Godrej Stock Calculation System - Server

The backend REST API for the Godrej Stock Calculation System. It is built with **Node.js**, **Express**, and **MongoDB** (with Mongoose), and features a robust local fallback mechanism.

## Features

- **Robust Database Fallback**:
  - Automatically attempts to connect to MongoDB using the configured URI.
  - If MongoDB is unavailable or no URI is provided, it gracefully falls back to a local JSON file database (`db_fallback.json`). Both read and write operations work seamlessly in fallback mode.
- **REST Endpoints**:
  - Post stock entry (with supervisor calculations validation).
  - Get all stock entries (accessible via Admin auth).
  - Admin login & JWT verification.
- **Data Seeding**:
  - Includes a script to seed the database with mock entries spanning from April 24, 2026 to September 24, 2026 for development.
- **Security**:
  - Uses `bcryptjs` to hash and verify passwords.
  - Uses JWT (`jsonwebtoken`) for secure session management on protected endpoints.

## Tech Stack

- **Runtime**: Node.js (ES Modules)
- **Framework**: Express.js
- **Database**: MongoDB / Mongoose (with automated local JSON file fallback)
- **Authentication**: JSON Web Tokens (JWT) & Bcrypt

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+ or v20+ recommended)
- (Optional) [MongoDB](https://www.mongodb.com/) running locally or in the cloud. If not present, the server automatically defaults to `db_fallback.json`.

### Environment Configuration

Create a `.env` file in the `server` directory:

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/godrej_stock
JWT_SECRET=your_jwt_secret_key_here
ADMIN_USERNAME=godrej_secure_gate
ADMIN_PASSWORD=xP9!vK2@mL7#qZ4
```

### Installation

1. Navigate to the server directory:
   ```bash
   cd server
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Running Locally

To run the server in development mode with hot-reloading (via `nodemon`):
```bash
npm run dev
```

To run in standard production mode:
```bash
npm run start
```

### Seeding Mock Data

To populate the database (MongoDB or fallback file database) with development data:
```bash
npm run seed
```
This inserts multiple entries across active location codes for a five-month span (2026-04-24 to 2026-09-24).
