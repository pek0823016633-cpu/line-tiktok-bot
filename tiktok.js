// ตัวช่วยเชื่อมต่อ TikTok Content Posting API
//
// ต้องมี TikTok Developer app ก่อน (ดูขั้นตอนใน README.md หัวข้อ "เชื่อมต่อ TikTok")
// โฟลว์คร่าวๆ:
// 1. เปิด /tiktok/connect ในเบราว์เซอร์ -> ล็อกอิน TikTok -> กด Allow (ทำครั้งเดียว)
// 2. TikTok จะ redirect กลับมาที่ /tiktok/callback พร้อม code -> เราแลกเป็น
//    access_token + refresh_token แล้วเก็บไว้ใน tiktok-tokens.json
// 3. หลังจากนั้นบอทจะใช้ token นี้เรียก Content Posting API ให้อัตโนมัติ
//    (และ refresh token เองเมื่อหมดอายุ)
//
// หมายเหตุสำคัญ: ถ้าแอปของคุณยังไม่ผ่านการตรวจสอบ (audit) จาก TikTok
// วิดีโอที่โพสต์จะถูกบังคับเป็น "ส่วนตัว" (SELF_ONLY) และโพสต์ได้เฉพาะบัญชีที่
// คุณเพิ่มเป็น "target user" ของแอปในหน้า Developer Portal เท่านั้น

const fs = require('fs');
const path = require('path');

const CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
const CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;
const REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI;

const TOKEN_FILE = path.join(__dirname, 'tiktok-tokens.json');

function loadTokens() {
  if (!fs.existsSync(TOKEN_FILE)) return null;
  return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
}

function saveTokens(tokens) {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify({ ...tokens, obtained_at: Date.now() }, null, 2));
}

function getAuthUrl(state) {
  const params = new URLSearchParams({
    client_key: CLIENT_KEY,
    scope: 'video.publish,video.upload',
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    state,
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
}

async function requestToken(body) {
  const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams(body),
  });
  const data = await res.json();
  if (data.error) {
    throw new Error(`TikTok OAuth error: ${data.error_description || data.error}`);
  }
  saveTokens(data);
  return data;
}

function exchangeCodeForToken(code) {
  return requestToken({
    client_key: CLIENT_KEY,
    client_secret: CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT_URI,
  });
}

function refreshAccessToken(refreshToken) {
  return requestToken({
    client_key: CLIENT_KEY,
    client_secret: CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
}

async function getValidAccessToken() {
  const tokens = loadTokens();
  if (!tokens) {
    throw new Error('ยังไม่ได้เชื่อมต่อ TikTok — เปิด /tiktok/connect ในเบราว์เซอร์ก่อน');
  }
  const ageSeconds = (Date.now() - tokens.obtained_at) / 1000;
  if (ageSeconds > tokens.expires_in - 60) {
    const refreshed = await refreshAccessToken(tokens.refresh_token);
    return refreshed.access_token;
  }
  return tokens.access_token;
}

// TikTok กำหนดให้ต้องเรียก creator_info/query ก่อนทุกครั้งที่จะโพสต์
// เพื่อเช็คว่าบัญชีนี้โพสต์แบบไหนได้บ้าง (privacy options ที่อนุญาตจริง)
async function queryCreatorInfo(accessToken) {
  const res = await fetch('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
  });
  const data = await res.json();
  if (data.error && data.error.code !== 'ok') {
    throw new Error(`TikTok creator_info ล้มเหลว: ${data.error.code} ${data.error.message}`);
  }
  return data.data;
}

async function postVideoFromUrl({ videoUrl, title }) {
  const accessToken = await getValidAccessToken();

  const creatorInfo = await queryCreatorInfo(accessToken);
  const allowedPrivacy = creatorInfo.privacy_level_options || [];
  console.log('TikTok privacy_level_options:', allowedPrivacy);
  // แอปที่ยังไม่ผ่านการตรวจสอบ (unaudited) โพสต์ได้เฉพาะแบบส่วนตัวเท่านั้น
  // ไม่ว่า creator_info จะแนะนำตัวเลือกอื่นมาก็ตาม จึงบังคับใช้ SELF_ONLY เป็นค่าหลักเสมอ
  const privacyLevel = allowedPrivacy.includes('SELF_ONLY') ? 'SELF_ONLY' : allowedPrivacy[0];
  if (!privacyLevel) {
    throw new Error('บัญชี TikTok นี้ไม่มีตัวเลือกความเป็นส่วนตัวที่โพสต์ได้เลย (ตรวจสอบสถานะแอปในหน้า Developer Portal)');
  }

  // ดาวน์โหลดวิดีโอมาก่อน แล้วอัปโหลดแบบ FILE_UPLOAD (ไม่ต้องยืนยันโดเมนแบบ PULL_FROM_URL)
  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) {
    throw new Error(`ดาวน์โหลดวิดีโอจาก ${videoUrl} ไม่สำเร็จ: ${videoRes.status}`);
  }
  const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

  const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({
      post_info: {
        title,
        privacy_level: privacyLevel,
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: videoBuffer.length,
        chunk_size: videoBuffer.length,
        total_chunk_count: 1,
      },
    }),
  });
  const initData = await initRes.json();
  if (initData.error && initData.error.code !== 'ok') {
    throw new Error(`TikTok init ล้มเหลว: ${initData.error.code} ${initData.error.message}`);
  }

  const { upload_url: uploadUrl, publish_id: publishId } = initData.data;

  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Range': `bytes 0-${videoBuffer.length - 1}/${videoBuffer.length}`,
    },
    body: videoBuffer,
  });
  if (!uploadRes.ok) {
    throw new Error(`อัปโหลดวิดีโอขึ้น TikTok ไม่สำเร็จ: ${uploadRes.status}`);
  }

  return { publishId, privacyLevel };
}

// เช็คสถานะจริงของการโพสต์ (publish_id ที่ init คืนมาแค่บอกว่า "รับคำขอแล้ว"
// ไม่ได้แปลว่าโพสต์สำเร็จจริง — ต้องเรียกตัวนี้เพื่อดูผลลัพธ์จริง)
async function checkPublishStatus(publishId) {
  const accessToken = await getValidAccessToken();
  const res = await fetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({ publish_id: publishId }),
  });
  const data = await res.json();
  if (data.error && data.error.code !== 'ok') {
    throw new Error(`TikTok status fetch ล้มเหลว: ${data.error.code} ${data.error.message}`);
  }
  return data.data;
}

module.exports = {
  getAuthUrl,
  exchangeCodeForToken,
  postVideoFromUrl,
  checkPublishStatus,
  loadTokens,
};
