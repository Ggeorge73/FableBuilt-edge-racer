# FableBuilt Edge Racer

A Vite + React canvas racing game with Firebase-backed authentication, progress saving, and leaderboard support.

## Security note

Do not commit real API keys or secrets. Local secrets belong in `.env.local`, which is ignored by Git. Use `.env.example` as the template.

If GitHub secret scanning reported an exposed key, rotate or restrict the exposed key in the provider console even after removing it from this repository. Removing a key from the latest code does not remove it from Git history.

## Run locally

**Prerequisite:** Node.js

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a local environment file:

   ```bash
   cp .env.example .env.local
   ```

3. Fill in the Firebase values in `.env.local`:

   ```bash
   VITE_FIREBASE_API_KEY="your-rotated-firebase-web-api-key"
   VITE_FIREBASE_AUTH_DOMAIN="your-project.firebaseapp.com"
   VITE_FIREBASE_PROJECT_ID="your-project-id"
   VITE_FIREBASE_STORAGE_BUCKET="your-project.firebasestorage.app"
   VITE_FIREBASE_MESSAGING_SENDER_ID="your-messaging-sender-id"
   VITE_FIREBASE_APP_ID="your-firebase-app-id"
   VITE_FIREBASE_MEASUREMENT_ID="your-measurement-id"
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

## Build

```bash
npm run build
```
