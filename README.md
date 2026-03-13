# # MeetLite WebRTC App

Professional WebRTC video conferencing with glassmorphism UI.

## How to Run

### 1. Start the Signaling Server
Open a terminal in the `server` directory and run:
```bash
npm install
npm start
```
The server will run on `http://localhost:3000`.

### 2. Start the Frontend
Open another terminal in the project root and run:
```bash
npx serve client -l 5500
```
Then open `http://localhost:5500` in your browser.

## Features
- Zoom-like dark mode UI
- 9-digit Room Codes
- Screen Sharing
- In-call Chat & File Sharing
- Responsive Video Grid

## Deployment

### Backend (Signaling Server)
1. Deploy the `server` directory to a platform like Render or Railway.
2. Set the `CLIENT_URL` environment variable to your frontend URL (e.g., `https://your-app.vercel.app`).
3. Set the `PORT` environment variable (usually handled automatically by hosting providers).

### Frontend
1. Deploy the `client` directory to Vercel.
2. The included `vercel.json` will automatically handle routing for the `/room` path.
3. The app will automatically connect to your Render-hosted signaling server when deployed.