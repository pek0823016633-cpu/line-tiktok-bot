# LINE Bot สำหรับขออนุมัติวิดีโอ

ส่งตัวอย่างวิดีโอไปที่ LINE ของคุณ พร้อมปุ่มใช่/ไม่ ให้กดอนุมัติ ก่อนที่วิดีโอจะถูกโพสต์ลง TikTok

## การติดตั้ง

1. **ติดตั้ง Node.js** (v18 ขึ้นไป) หากยังไม่มี
2. คัดลอกโฟลเดอร์นี้ทั้งหมดไปที่เครื่องของคุณ แล้วเปิด terminal ในโฟลเดอร์นี้ รันคำสั่ง:
   ```
   npm install
   ```
3. เปลี่ยนชื่อไฟล์ `.env.example` เป็น `.env` แล้วกรอกข้อมูล:
   - `LINE_CHANNEL_ACCESS_TOKEN` — ไปที่ LINE Developers Console → เลือกช่องทางของคุณ → แท็บ Messaging API → "Channel access token" → กด Issue
   - `LINE_CHANNEL_SECRET` — กรอกไว้ให้แล้วตามที่คุณให้มา (`7cd595b892d93cd43a9624b46bb2ba4f`) ตรวจสอบอีกครั้งว่าตรงกับแท็บ Basic Settings
   - ปล่อย `LINE_USER_ID` ว่างไว้ก่อน
4. เริ่มบอท:
   ```
   npm start
   ```
   จะรันที่ `http://localhost:3000`

## หา URL สาธารณะ (จำเป็น — LINE ต้องเข้าถึง webhook ของคุณได้)

LINE ไม่สามารถส่งข้อความมาที่ `localhost` ได้ คุณต้องมี URL แบบ HTTPS ที่เข้าถึงได้จากอินเทอร์เน็ต วิธีที่ง่ายที่สุด:

- **สำหรับทดสอบ**: ติดตั้ง [ngrok](https://ngrok.com) แล้วรัน `ngrok http 3000` จากนั้นใช้ URL แบบ `https://...ngrok-free.app` ที่ได้มา
- **สำหรับโฮสต์แบบทำงานตลอดเวลา**: นำโฟลเดอร์นี้ไปดีพลอยที่แพลนฟรีของ [Render](https://render.com) หรือ [Railway](https://railway.app) ทั้งสองรองรับแอป Node โดยตรงจากไฟล์ zip หรือ GitHub repo

นำ URL สาธารณะนั้นมาต่อท้ายด้วย `/webhook` (เช่น `https://your-app.onrender.com/webhook`) แล้วนำไปวางที่:
LINE Developers Console → เลือกช่องทางของคุณ → แท็บ Messaging API → **Webhook URL** → Update → Verify

และอย่าลืมเปิดสวิตช์ **"Use webhook"** ในแท็บเดียวกันด้วย

## ครั้งแรก: หา LINE user ID ของคุณ

1. เปิด LINE บนมือถือ หาบอทของคุณ (อันที่มี QR code จากก่อนหน้านี้) แล้วส่งข้อความอะไรก็ได้ เช่น "hi"
2. ดูที่ terminal ของคุณ — จะมีข้อความประมาณนี้:
   ```
   ข้อความจาก userId=U1234567890abcdef...: "hi"
   ```
3. คัดลอกค่า `userId` นั้นไปใส่ใน `LINE_USER_ID` ในไฟล์ `.env` แล้วรีสตาร์ทบอท (`npm start`)

## ส่งวิดีโอเพื่อขออนุมัติ

เมื่อบอทกำลังทำงานอยู่ ให้ทดสอบส่งคำขออนุมัติแบบนี้ (จาก terminal หรือจากอะไรก็ตามที่สร้างวิดีโอของคุณ):

```
curl -X POST http://localhost:3000/send-approval \
  -H "Content-Type: application/json" \
  -d '{"id":"video1","product":"Car Paper Air Freshener","videoUrl":"https://example.com/video1.mp4"}'
```

คุณจะได้รับข้อความบน LINE พร้อมปุ่มใช่/ไม่ กดปุ่มใดปุ่มหนึ่ง แล้ว:
- บอทจะตอบกลับยืนยันตัวเลือกของคุณ
- ไฟล์ `pending.json` ในโฟลเดอร์นี้จะถูกอัปเดตเป็น `approved` หรือ `rejected`
- ถ้ากด "ใช่" บอทจะ**โพสต์วิดีโอขึ้น TikTok จริงให้อัตโนมัติ** (ต้องเชื่อมต่อ TikTok ก่อน ดูหัวข้อถัดไป) แล้วส่งข้อความ LINE อีกครั้งแจ้งผลว่าโพสต์สำเร็จหรือไม่

## เชื่อมต่อ TikTok (ทำครั้งเดียว)

ส่วนนี้ต้องทำเองเพราะเป็นการสมัครบัญชี/ยินยอมสิทธิ์ ซึ่งเป็นสิ่งที่ผมทำแทนคุณไม่ได้

1. สมัคร/ล็อกอิน **TikTok for Developers** ที่ https://developers.tiktok.com
2. ไปที่ **Manage apps** → **Create an app** ตั้งชื่ออะไรก็ได้
3. ในหน้าแอป กด **Add products** แล้วเพิ่ม:
   - **Login Kit**
   - **Content Posting API**
4. ตั้งค่า **Redirect URI** เป็น `http://localhost:3000/tiktok/callback`
   (ใช้ได้เพราะ TikTok จะ redirect ผ่านเบราว์เซอร์ของคุณเอง ไม่ใช่เซิร์ฟเวอร์ของ TikTok เรียกเข้ามาโดยตรง — ต่างจาก LINE webhook ที่ต้องมี URL สาธารณะ)
5. ขอ **Scopes**: `video.publish` และ `video.upload`
6. ไปที่หน้า **Target Users** (หรือ Sandbox) ของแอป แล้วเพิ่มบัญชี TikTok ของคุณเองเป็น target user/tester
   — จำเป็นเพราะแอปที่ยังไม่ผ่านการตรวจสอบ (audit) จาก TikTok จะโพสต์ได้เฉพาะบัญชีที่อยู่ในรายชื่อนี้ และวิดีโอจะถูกบังคับเป็น**ส่วนตัว (SELF_ONLY)** เท่านั้น — ถ้าต้องการโพสต์แบบสาธารณะ ต้องกด "Submit for review" ในหน้าแอปหลังทดสอบผ่านแล้ว
7. คัดลอก **Client Key** และ **Client Secret** จากหน้าแอป มาใส่ในไฟล์ `.env`:
   ```
   TIKTOK_CLIENT_KEY=...
   TIKTOK_CLIENT_SECRET=...
   ```
8. รีสตาร์ทบอท (`npm start`) แล้วเปิด **http://localhost:3000/tiktok/connect** ในเบราว์เซอร์
9. ล็อกอิน TikTok แล้วกด **Allow** — เมื่อเห็นข้อความ "เชื่อมต่อ TikTok สำเร็จแล้ว!" แปลว่าเรียบร้อย ระบบจะเก็บ token ไว้ที่ `tiktok-tokens.json` อัตโนมัติ (ไฟล์นี้มีข้อมูลอ่อนไหว ห้าม commit หรือแชร์ — อยู่ใน `.gitignore` ให้แล้ว)

ตรวจสอบสถานะการเชื่อมต่อได้ที่ `http://localhost:3000/tiktok/status`

## ข้อควรระวังด้านความปลอดภัย

- ห้ามแชร์ไฟล์ `.env` หรือ `tiktok-tokens.json` ของคุณ หรือวาง access token/secret ในแชทสาธารณะ, repo, หรือฟอรัมใดๆ
- หาก token รั่วไหลออกไป ให้กลับไปที่แท็บ Messaging API (LINE) หรือหน้าแอป (TikTok) แล้วออก token ใหม่ทันที
