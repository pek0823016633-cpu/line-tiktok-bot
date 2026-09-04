// LINE bot for approving auto-generated product videos before posting to TikTok.
//
// How it works:
// 1. You (or your automation script) call POST /send-approval with a video
//    preview link + product name. The bot pushes it to your LINE as a message
//    with "Yes" / "No" quick-reply buttons.
// 2. When you tap Yes or No (or just type it), LINE sends that reply to
//    POST /webhook. The bot records the decision in pending.json and prints
//    it to the console so your automation can pick it up and post (or skip)
//    the video.
//
// You need to host this somewhere reachable by the internet (Render, Railway,
// Fly.io, a VPS, etc. all have free/cheap tiers) and set that public URL as
// your Webhook URL in the LINE Developers Console (Messaging API tab).

require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const fs = require('fs');
const path = require('path');

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const YOUR_USER_ID = process.env.LINE_USER_ID; // filled in after your first message to the bot

const app = express();
const client = new line.Client(config);

const DB_FILE = path.join(__dirname, 'pending.json');

function loadPending() {
  if (!fs.existsSync(DB_FILE)) return {};
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function savePending(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ---- 1. Send a video for approval ----
// Call this from your automation, e.g.:
// curl -X POST http://localhost:3000/send-approval \
//   -H "Content-Type: application/json" \
//   -d '{"id":"video1","product":"Car Paper Air Freshener","videoUrl":"https://..."}'
// NOTE: express.json() is scoped to this route only — line.middleware() below
// needs the raw, unparsed request body to verify LINE's signature, so it
// can't be registered globally with app.use() or the webhook breaks.
app.post('/send-approval', express.json(), async (req, res) => {
  const { id, product, videoUrl } = req.body;
  if (!YOUR_USER_ID) {
    return res.status(400).json({
      error: 'LINE_USER_ID not set yet. Send any message to your bot first, check the server console log for your userId, then add it to .env.',
    });
  }
  if (!id || !product || !videoUrl) {
    return res.status(400).json({ error: 'id, product, and videoUrl are required' });
  }

  const pending = loadPending();
  pending[id] = { product, videoUrl, status: 'waiting' };
  savePending(pending);

  await client.pushMessage(YOUR_USER_ID, {
    type: 'template',
    altText: `Approve video for ${product}?`,
    template: {
      type: 'confirm',
      text: `New video ready:\n${product}\n${videoUrl}\n\nPost this to TikTok?`,
      actions: [
        { type: 'message', label: 'Yes, post it', text: `yes ${id}` },
        { type: 'message', label: 'No, skip', text: `no ${id}` },
      ],
    },
  });

  res.json({ ok: true, sent: true });
});

// ---- 2. Receive your reply ----
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const userId = event.source.userId;
  const text = event.message.text.trim().toLowerCase();

  // First-time setup helper: prints your userId so you can put it in .env
  console.log(`Message from userId=${userId}: "${text}"`);

  const pending = loadPending();

  if (text.startsWith('yes ') || text.startsWith('no ')) {
    const [decision, id] = text.split(' ');
    if (pending[id]) {
      pending[id].status = decision === 'yes' ? 'approved' : 'rejected';
      savePending(pending);
      console.log(`Video "${id}" (${pending[id].product}) -> ${pending[id].status.toUpperCase()}`);

      return client.replyMessage(event.replyToken, {
        type: 'text',
        text:
          decision === 'yes'
            ? `Got it — approved "${pending[id].product}". Posting now.`
            : `Got it — skipping "${pending[id].product}".`,
      });
    }
  }

  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: `Hey! Your LINE user ID is:\n${userId}\n\n(Save this into LINE_USER_ID in .env so I can send you video previews.)`,
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`LINE bot listening on port ${PORT}`));
