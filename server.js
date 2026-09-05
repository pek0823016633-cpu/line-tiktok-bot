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
  const { id, product, videoUrl } = req.body;
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

  await client.pushMessage(YOUR_USER_ID, {
    type: 'template',
    altText: `อนุมัติวิดีโอสำหรับ ${product} หรือไม่?`,
    template: {
      type: 'confirm',
      text: `วิดีโอใหม่พร้อมแล้ว:\n${product}\n${videoUrl}\n\nโพสต์ลง TikTok เลยไหม?`,
      actions: [
        { type: 'message', label: 'ใช่ โพสต์เลย', text: `ใช่ ${id}` },
        { type: 'message', label: 'ไม่ ข้ามไป', text: `ไม่ ${id}` },
      ],
    },
  });

  res.json({ ok: true, sent: true });
});

// วิดีโอตัวอย่างไว้ทดสอบระบบโพสต์ TikTok (ขนาด/สัดส่วนผ่านเกณฑ์ของ TikTok)
app.use('/test-assets', express.static(path.join(__dirname, 'test-assets')));

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
  if (event.type !== 'message' || event.message.type !== 'text') {
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
      if (isApproved) {
        postApprovedVideo(id).catch((err) => console.error('postApprovedVideo error:', err));
      }

      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: isApproved
          ? `รับทราบ — อนุมัติ "${pending[id].product}" แล้ว กำลังโพสต์ขึ้น TikTok...`
          : `รับทราบ — ข้าม "${pending[id].product}"`,
      }).catch((err) => console.error('replyMessage error:', err));
    }
  }

  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: `สวัสดี! LINE user ID ของคุณคือ:\n${userId}\n\n(บันทึกค่านี้ลงใน LINE_USER_ID ในไฟล์ .env เพื่อให้บอทส่งตัวอย่างวิดีโอให้คุณได้)`,
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`LINE bot กำลังทำงานที่พอร์ต ${PORT}`));
