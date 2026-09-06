// LINE Bot สำหรับขออนุมัติวิดีโอสินค้าที่สร้างอัตโนมัติ ก่อนโพสต์ลง TikTok
//
// วิธีทำงาน:
// 1. คุณ (หรือสคริปต์อัตโนมัติของคุณ) เรียก POST /send-approval พร้อมลิงก์
//    ตัวอย่างวิดีโอ + ชื่อสินค้า บอทจะพุชข้อความไปที่ LINE ของคุณ พร้อมปุ่ม
//    "ใช่" / "ไม่" ให้ตอบกลับอย่างรวดเร็ว
// 2. เมื่อคุณกดใช่หรือไม่ (หรือพิมพ์เอง) LINE จะส่งข้อความตอบกลับนั้นไปที่
//    POST /webhook บอทจะบันทึกผลการตัดสินใจลงใน pending.json และพิมพ์ผล
//    ออกทาง console เพื่อให้ระบบอัตโนมัติของคุณอ่านค่าไปโพสต์ (หรือข้าม)
//    วิดีโอนั้นได้
//
// คุณต้องนำโค้ดนี้ไปโฮสต์ในที่ที่อินเทอร์เน็ตเข้าถึงได้ (เช่น Render, Railway,
// Fly.io, VPS ฯลฯ ซึ่งมีแพลนฟรี/ราคาถูก) แล้วนำ URL สาธารณะนั้นไปตั้งเป็น
// Webhook URL ใน LINE Developers Console (แท็บ Messaging API)

require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const fs = require('fs');
const path = require('path');
const tiktok = require('./tiktok');

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const YOUR_USER_ID = process.env.LINE_USER_ID; // กรอกหลังจากคุณส่งข้อความแรกหาบอท

// ใช้อัปโหลดรูปที่รับจาก LINE ขึ้น GitHub ทันที กัน Render free tier ล้าง disk
// (ephemeral) ทิ้งก่อนมีคนมาดึงรูปไปทำวิดีโอ — ดูฟังก์ชัน uploadToGitHub ด้านล่าง
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = 'pek0823016633-cpu/line-tiktok-bot';

async function uploadToGitHub(repoPath, buffer, message) {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${repoPath}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'line-tiktok-bot',
    },
    body: JSON.stringify({ message, content: buffer.toString('base64'), branch: 'master' }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`GitHub upload ล้มเหลว: ${data.message || res.status}`);
  }
  return data.content.download_url;
}

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

// ---- 1. ส่งวิดีโอเพื่อขออนุมัติ ----
// เรียกจากระบบอัตโนมัติของคุณ เช่น:
// curl -X POST http://localhost:3000/send-approval \
//   -H "Content-Type: application/json" \
//   -d '{"id":"video1","product":"Car Paper Air Freshener","videoUrl":"https://..."}'
// หมายเหตุ: express.json() ถูกจำกัดขอบเขตไว้เฉพาะ route นี้เท่านั้น เพราะ
// line.middleware() ด้านล่างต้องใช้ raw body ที่ยังไม่ถูกแปลงเพื่อตรวจสอบ
// ลายเซ็นของ LINE — ถ้าไปประกาศแบบ global ผ่าน app.use() webhook จะพัง
app.post('/send-approval', express.json(), async (req, res) => {
  const { id, product, videoUrl, thumbnailUrl } = req.body;
  if (!YOUR_USER_ID) {
    return res.status(400).json({
      error: 'ยังไม่ได้ตั้งค่า LINE_USER_ID — ส่งข้อความอะไรก็ได้หาบอทก่อน แล้วดู userId จาก console log ของเซิร์ฟเวอร์ จากนั้นนำไปใส่ใน .env',
    });
  }
  if (!id || !product || !videoUrl) {
    return res.status(400).json({ error: 'ต้องระบุ id, product และ videoUrl' });
  }

  const pending = loadPending();
  pending[id] = { product, videoUrl, status: 'waiting' };
  savePending(pending);

  // ส่งวิดีโอจริงให้ดูในไลน์ก่อน (ไม่ใช่แค่ลิงก์ข้อความ) แล้วค่อยตามด้วยปุ่มใช่/ไม่
  // วิดีโอต้องมี preview image ประกอบด้วยเสมอ ถ้าไม่ได้ส่ง thumbnailUrl มา ใช้รูปสำรองของบอทเอง
  const fallbackThumbnail = `https://${req.get('host')}/test-assets/video-thumbnail.jpg`;

  await client.pushMessage(YOUR_USER_ID, [
    {
      type: 'video',
      originalContentUrl: videoUrl,
      previewImageUrl: thumbnailUrl || fallbackThumbnail,
    },
    {
      type: 'template',
      altText: `อนุมัติวิดีโอสำหรับ ${product} หรือไม่?`,
      template: {
        type: 'confirm',
        text: `วิดีโอใหม่พร้อมแล้ว: ${product}\n\nโพสต์ลง TikTok เลยไหม?`,
        actions: [
          { type: 'message', label: 'ใช่ โพสต์เลย', text: `ใช่ ${id}` },
          { type: 'message', label: 'ไม่ ข้ามไป', text: `ไม่ ${id}` },
        ],
      },
    },
  ]);

  res.json({ ok: true, sent: true });
});

// วิดีโอตัวอย่างไว้ทดสอบระบบโพสต์ TikTok (ขนาด/สัดส่วนผ่านเกณฑ์ของ TikTok)
// เปิด CORS ให้โฟลเดอร์นี้ เพราะบางครั้งต้องดึงไฟล์ข้ามโดเมนไปใช้ในเครื่องมือสร้างวิดีโอ
app.use('/test-assets', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
}, express.static(path.join(__dirname, 'test-assets')));

// รูปสินค้าที่ผู้ใช้ส่งเข้ามาทาง LINE จะถูกเก็บไว้ที่นี่ (ดูฟังก์ชัน handleEvent)
const INCOMING_DIR = path.join(__dirname, 'test-assets', 'incoming');
fs.mkdirSync(INCOMING_DIR, { recursive: true });

// รายการรูปที่เพิ่งได้รับทาง LINE เรียงจากใหม่ไปเก่า — ใช้เช็คว่ามีรูปใหม่เข้ามาไหม
// อ่านจาก GitHub เป็นหลัก (ทนต่อ Render ล้าง disk ได้) แล้วค่อย fallback มาอ่าน
// จากดิสก์ในเครื่องถ้าเรียก GitHub ไม่ได้ — ชื่อไฟล์ขึ้นต้นด้วย timestamp อยู่แล้ว
// เรียงตามชื่อจึงเท่ากับเรียงตามเวลาที่ได้รับ
app.get('/incoming-images', async (req, res) => {
  if (GITHUB_TOKEN) {
    try {
      const ghRes = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/contents/test-assets/incoming`,
        {
          headers: {
            Authorization: `Bearer ${GITHUB_TOKEN}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'line-tiktok-bot',
          },
        }
      );
      if (ghRes.status === 404) {
        return res.json({ images: [] });
      }
      const items = await ghRes.json();
      if (!ghRes.ok) throw new Error(items.message || `GitHub API error ${ghRes.status}`);
      const images = items
        .filter((item) => item.type === 'file' && /\.(jpe?g|png)$/i.test(item.name))
        .sort((a, b) => (a.name < b.name ? 1 : -1))
        .map((item) => ({ name: item.name, url: item.download_url }));
      return res.json({ images });
    } catch (err) {
      console.error('อ่านรายการรูปจาก GitHub ไม่สำเร็จ, ใช้ดิสก์ในเครื่องแทน:', err.message);
    }
  }

  const files = fs
    .readdirSync(INCOMING_DIR)
    .map((name) => ({ name, mtime: fs.statSync(path.join(INCOMING_DIR, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .map((f) => ({
      name: f.name,
      url: `https://${req.get('host')}/test-assets/incoming/${f.name}`,
      receivedAt: new Date(f.mtime).toISOString(),
    }));
  res.json({ images: files });
});

// ไฟล์ยืนยันโดเมนของ TikTok (สำหรับ URL properties verification)
app.get('/tiktokGCmqv6FaoVnNXWurFe89B6zCVbXPIoJM.txt', (req, res) => {
  res.type('text/plain').send('tiktok-developers-site-verification=GCmqv6FaoVnNXWurFe89B6zCVbXPIoJM');
});

// ---- หน้า Terms of Service / Privacy Policy (TikTok Developer app ต้องการ URL นี้) ----
app.get('/terms', (req, res) => {
  res.type('text/plain').send(
    'Terms of Service\n\n' +
      'This is a personal, single-user automation tool. It sends product video previews ' +
      'to its owner via LINE for approval, and posts approved videos to the owner\'s own ' +
      'TikTok account using the TikTok Content Posting API. It is not offered as a public ' +
      'service to third parties.'
  );
});

app.get('/privacy', (req, res) => {
  res.type('text/plain').send(
    'Privacy Policy\n\n' +
      'This tool only processes data belonging to its single owner/operator: LINE message ' +
      'content (to receive approval replies) and TikTok account access tokens (to post ' +
      'approved videos). No data is collected from or shared with any other party.'
  );
});

// ---- เชื่อมต่อ TikTok (ทำครั้งเดียว) ----
// เปิด http://localhost:3000/tiktok/connect ในเบราว์เซอร์ แล้วล็อกอิน + กด Allow
app.get('/tiktok/connect', (req, res) => {
  if (!process.env.TIKTOK_CLIENT_KEY || !process.env.TIKTOK_REDIRECT_URI) {
    return res.status(400).send('ยังไม่ได้ตั้งค่า TIKTOK_CLIENT_KEY / TIKTOK_REDIRECT_URI ใน .env');
  }
  const state = Math.random().toString(36).slice(2);
  res.redirect(tiktok.getAuthUrl(state));
});

app.get('/tiktok/callback', async (req, res) => {
  const { code, error, error_description: errorDescription } = req.query;
  if (error) {
    return res.status(400).send(`TikTok ปฏิเสธการเชื่อมต่อ: ${errorDescription || error}`);
  }
  try {
    await tiktok.exchangeCodeForToken(code);
    res.send('เชื่อมต่อ TikTok สำเร็จแล้ว! ปิดหน้านี้แล้วกลับไปใช้งานบอทได้เลย');
  } catch (err) {
    console.error(err);
    res.status(500).send(`เชื่อมต่อ TikTok ไม่สำเร็จ: ${err.message}`);
  }
});

app.get('/tiktok/status', (req, res) => {
  res.json({ connected: !!tiktok.loadTokens() });
});

// ตรวจสถานะจริงของ publish_id หนึ่งรายการ (ไว้ debug ว่าโพสต์ไปจริงหรือไม่)
app.get('/tiktok/publish-status/:publishId', async (req, res) => {
  try {
    const status = await tiktok.checkPublishStatus(req.params.publishId);
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// เรียกหลังอนุมัติวิดีโอ: โพสต์จริงขึ้น TikTok แล้วแจ้งผลกลับทาง LINE
// (ไม่ await ตรงจุดที่เรียก เพราะอยากตอบ replyMessage ให้ไวก่อน ค่อยส่งผลทีหลังด้วย pushMessage)
async function postApprovedVideo(id) {
  const pending = loadPending();
  const entry = pending[id];
  if (!entry) return;

  try {
    const { publishId, privacyLevel } = await tiktok.postVideoFromUrl({
      videoUrl: entry.videoUrl,
      title: entry.product,
    });
    entry.tiktokPublishId = publishId;

    // init สำเร็จแค่แปลว่า TikTok "รับคำขอแล้ว" ต้องเช็คผลจริงอีกทีก่อนบอกว่าสำเร็จ
    const result = await tiktok.waitForPublishResult(publishId);
    console.log(`ผลการโพสต์ "${id}" (${entry.product}):`, result);

    if (result && result.status === 'FAILED') {
      entry.status = 'post_failed';
      entry.error = result.fail_reason;
      savePending(pending);
      await client.pushMessage(YOUR_USER_ID, {
        type: 'text',
        text: `โพสต์ "${entry.product}" ขึ้น TikTok ไม่สำเร็จ: ${result.fail_reason}`,
      });
      return;
    }

    entry.status = 'posted';
    savePending(pending);
    console.log(`โพสต์ "${id}" (${entry.product}) ขึ้น TikTok สำเร็จ — publish_id: ${publishId}`);

    const privacyNote =
      privacyLevel === 'SELF_ONLY'
        ? '\n\nหมายเหตุ: แอปยังไม่ผ่านการตรวจสอบจาก TikTok วิดีโอนี้จึงถูกโพสต์แบบ "ส่วนตัว" (มองเห็นได้เฉพาะคุณ) จนกว่าแอปจะผ่านการตรวจสอบ'
        : '';
    await client.pushMessage(YOUR_USER_ID, {
      type: 'text',
      text: `โพสต์ "${entry.product}" ขึ้น TikTok สำเร็จแล้ว!${privacyNote}`,
    });
  } catch (err) {
    console.error(err);
    entry.status = 'post_failed';
    entry.error = err.message;
    savePending(pending);
    await client.pushMessage(YOUR_USER_ID, {
      type: 'text',
      text: `โพสต์ "${entry.product}" ขึ้น TikTok ไม่สำเร็จ: ${err.message}`,
    });
  }
}

// ---- 2. รับคำตอบของคุณ ----
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

async function handleEvent(event) {
  if (event.type !== 'message') {
    return Promise.resolve(null);
  }

  if (event.message.type === 'image') {
    return handleImageMessage(event);
  }

  if (event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const userId = event.source.userId;
  const text = event.message.text.trim();

  // ตัวช่วยตอนตั้งค่าครั้งแรก: พิมพ์ userId ของคุณเพื่อนำไปใส่ใน .env
  console.log(`ข้อความจาก userId=${userId}: "${text}"`);

  const pending = loadPending();

  if (text.startsWith('ใช่ ') || text.startsWith('ไม่ ')) {
    const [decision, id] = text.split(' ');
    if (pending[id]) {
      const isApproved = decision === 'ใช่';
      pending[id].status = isApproved ? 'approved' : 'rejected';
      savePending(pending);
      const statusThai = isApproved ? 'อนุมัติ' : 'ข้าม';
      console.log(`วิดีโอ "${id}" (${pending[id].product}) -> ${statusThai.toUpperCase()}`);

      // โพสต์ TikTok ต้องไม่ขึ้นอยู่กับว่า replyMessage สำเร็จหรือไม่ —
      // ถ้า reply พังไป (token หมดอายุ, เน็ตสะดุด ฯลฯ) ก็ยังต้องโพสต์ต่อ
      const replyPromise = client.replyMessage(event.replyToken, {
        type: 'text',
        text: isApproved
          ? `รับทราบ — อนุมัติ "${pending[id].product}" แล้ว กำลังโพสต์ขึ้น TikTok...`
          : `รับทราบ — ข้าม "${pending[id].product}"`,
      }).catch((err) => console.error('replyMessage error:', err));

      if (!isApproved) {
        return replyPromise;
      }

      // ต้องรอให้ postApprovedVideo ทำงานจบใน request นี้เลย (ไม่ปล่อยไว้เบื้องหลัง)
      // เพราะ Render free tier ไม่รับประกันว่างานเบื้องหลังจะรันจนจบหลังตอบ
      // webhook response ไปแล้ว — ปล่อยไว้แบบเดิมทำให้ข้อความแจ้งผลไม่ส่งถึงบางครั้ง
      await Promise.allSettled([replyPromise, postApprovedVideo(id)]);
      return;
    }
  }

  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: `สวัสดี! LINE user ID ของคุณคือ:\n${userId}\n\n(บันทึกค่านี้ลงใน LINE_USER_ID ในไฟล์ .env เพื่อให้บอทส่งตัวอย่างวิดีโอให้คุณได้)`,
  });
}

// รับรูปสินค้าที่ผู้ใช้ส่งเข้ามาทาง LINE แล้วเก็บไว้ให้ดึงไปทำวิดีโอโฆษณาต่อได้
// (ตัวบอทเองไม่ได้สร้างวิดีโอให้อัตโนมัติ แค่รับรูปแล้วเปิด URL สาธารณะไว้)
async function handleImageMessage(event) {
  const stream = await client.getMessageContent(event.message.id);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);

  const filename = `${Date.now()}-${event.message.id}.jpg`;
  fs.writeFileSync(path.join(INCOMING_DIR, filename), buffer);
  console.log(`ได้รับรูปจาก LINE: ${filename} (${buffer.length} bytes)`);

  // อัปโหลดขึ้น GitHub ทันที (รอให้เสร็จก่อนตอบกลับ เพราะ Render free tier
  // ไม่รับประกันว่างานเบื้องหลังจะรันจนจบหลังตอบ webhook response ไปแล้ว)
  // กัน disk ที่เป็น ephemeral ถูกล้างทิ้งก่อนมีคนมาดึงรูปไปทำวิดีโอทัน
  if (GITHUB_TOKEN) {
    try {
      await uploadToGitHub(
        `test-assets/incoming/${filename}`,
        buffer,
        `Incoming photo from LINE: ${filename}`
      );
      console.log(`อัปโหลดรูป ${filename} ขึ้น GitHub สำเร็จ`);
    } catch (err) {
      console.error(`อัปโหลดรูป ${filename} ขึ้น GitHub ไม่สำเร็จ:`, err.message);
    }
  }

  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: 'ได้รับรูปสินค้าแล้วครับ กำลังนำไปสร้างวิดีโอโฆษณาให้ รอแป๊บนึงนะครับ',
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`LINE bot กำลังทำงานที่พอร์ต ${PORT}`));
