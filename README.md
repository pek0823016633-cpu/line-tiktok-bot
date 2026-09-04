# LINE Video Approval Bot

Sends you a video preview on LINE with Yes/No buttons before it gets posted to TikTok.

## Setup

1. **Install Node.js** (v18+) if you don't have it.
2. Copy this whole folder to your computer, then open a terminal in it and run:
   ```
   npm install
   ```
3. Rename `.env.example` to `.env` and fill in:
   - `LINE_CHANNEL_ACCESS_TOKEN` — from LINE Developers Console → your channel → Messaging API tab → "Channel access token" → Issue.
   - `LINE_CHANNEL_SECRET` — already filled in from what you gave me (`7cd595b892d93cd43a9624b46bb2ba4f`). Double check it matches the Basic Settings tab.
   - Leave `LINE_USER_ID` blank for now.
4. Start the bot:
   ```
   npm start
   ```
   This runs it on `http://localhost:3000`.

## Get a public URL (required — LINE needs to reach your webhook)

LINE can't send messages to `localhost`. You need a public HTTPS URL. Easiest options:

- **For testing**: install [ngrok](https://ngrok.com), run `ngrok http 3000`, and use the `https://...ngrok-free.app` URL it gives you.
- **For always-on hosting**: deploy this folder to a free tier on [Render](https://render.com) or [Railway](https://railway.app) — both support Node apps directly from a zip or GitHub repo.

Take that public URL and add `/webhook` to the end (e.g. `https://your-app.onrender.com/webhook`), then paste it into:
LINE Developers Console → your channel → Messaging API tab → **Webhook URL** → Update → Verify.

Also make sure **"Use webhook"** is toggled ON in that same tab.

## First-time: get your LINE user ID

1. Open LINE on your phone, find your bot (the one with the QR code from earlier), and send it any message, like "hi".
2. Check your terminal — it will print something like:
   ```
   Message from userId=U1234567890abcdef...: "hi"
   ```
3. Copy that `userId` into `LINE_USER_ID` in your `.env` file, then restart the bot (`npm start`).

## Sending a video for approval

Once running, trigger an approval request like this (from your terminal, or from whatever generates your videos):

```
curl -X POST http://localhost:3000/send-approval \
  -H "Content-Type: application/json" \
  -d '{"id":"video1","product":"Car Paper Air Freshener","videoUrl":"https://example.com/video1.mp4"}'
```

You'll get a message on LINE with Yes/No buttons. Tap one, and:
- The bot replies confirming your choice.
- `pending.json` in this folder gets updated with `approved` or `rejected`.
- The terminal prints the decision, so any script watching that file/log can trigger the actual TikTok post.

## Security notes

- Never share your `.env` file or paste your access token/secret into public chats, repos, or forums.
- If a token ever leaks, go back to the Messaging API tab and re-issue a new one immediately.
