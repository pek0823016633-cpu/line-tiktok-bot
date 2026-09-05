# LINE Bot สำหรับขออนุมัติวิดีโอ

ส่งตัวอย่างวิดีโอไปที่ LINE ของคุณ พร้อมปุ่มใช่/ไม่ ให้กดอนุมัติ ก่อนที่วิดีโอจะถูกโพสต์ลง TikTok จริง

**สถานะปัจจุบัน:** บอทนี้ deploy อยู่ที่ `https://line-tiktok-bot.onrender.com` แล้ว (ฟรี, บน Render)
เชื่อมกับ LINE webhook และ TikTok Content Posting API เรียบร้อย — อ่านหัวข้อ "ข้อจำกัดของ Free tier" ด้านล่างก่อนใช้งานจริง

## การติดตั้งบนเครื่องตัวเอง (สำหรับพัฒนา/ทดสอบเพิ่มเติม)

1. **ติดตั้ง Node.js** (v18 ขึ้นไป) หากยังไม่มี
2. เปิด terminal ในโฟลเดอร์นี้ รันคำสั่ง:
   ```
   npm install
   ```
3. คัดลอกไฟล์ `.env` ที่มีอยู่แล้ว (มีค่าจริงของ LINE/TikTok credentials) หรือดูตัวอย่างค่าที่ต้องมีด้านล่าง
4. เริ่มบอท:
   ```
   npm start
   ```
   จะรันที่ `http://localhost:3000`

ค่าที่ต้องมีใน `.env`:
- `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`, `LINE_USER_ID` — จาก LINE Developers Console
- `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` — จาก TikTok for Developers (ดูหัวข้อ "เชื่อมต่อ TikTok")
- `TIKTOK_REDIRECT_URI` — URL สาธารณะของบอท + `/tiktok/callback`

## Deploy ขึ้น Render (ทำไปแล้ว — บันทึกไว้เผื่อต้อง deploy ใหม่)

1. Push โค้ดขึ้น GitHub repo (public)
2. Render → New → Web Service → เลือก "Public Git Repository" → ใส่ URL ของ repo
3. Build command: `npm install`, Start command: `node server.js` (Render ตรวจจับให้อัตโนมัติ)
4. เลือกแพลน **Free**
5. ใส่ Environment Variables ทั้งหมดตามที่ระบุด้านบน (รวม `TIKTOK_REDIRECT_URI` ที่ชี้ไปที่ URL จริงของ Render เช่น `https://line-tiktok-bot.onrender.com/tiktok/callback`)
6. Deploy แล้วนำ URL ที่ได้ไปตั้งเป็น Webhook URL ใน LINE Developers Console (ดูหัวข้อถัดไป)

## ตั้งค่า Webhook URL ใน LINE Developers Console

1. ไปที่ LINE Developers Console → เลือกช่องทางของคุณ → แท็บ **Messaging API**
2. ที่ **Webhook URL** กด Edit → ใส่ `https://line-tiktok-bot.onrender.com/webhook` → Update → **Verify**
3. เปิดสวิตช์ **"Use webhook"**
4. **หมายเหตุ:** ถ้า Verify ขึ้น "A timeout occurred" ให้เปิด `https://line-tiktok-bot.onrender.com/tiktok/status` ในเบราว์เซอร์ก่อน (ปลุกให้ instance ตื่นจาก sleep) แล้วกด Verify อีกครั้งทันที

**ข้อสังเกต:** ถ้าเห็น "Auto-reply messages: Enabled" ในหน้าเดียวกัน — นี่คือฟีเจอร์ตอบกลับอัตโนมัติของ LINE เอง แยกจากบอทนี้ อาจทำให้มีข้อความแทรกซ้อนตอนมีคนทักบอท ปิดได้ผ่านลิงก์ "Edit" ที่ไปหน้า LINE Official Account Manager ถ้าไม่ต้องการ

## ส่งวิดีโอเพื่อขออนุมัติ

```
curl -X POST https://line-tiktok-bot.onrender.com/send-approval \
  -H "Content-Type: application/json" \
  -d '{"id":"video1","product":"Car Paper Air Freshener","videoUrl":"https://example.com/video1.mp4"}'
```

คุณจะได้รับข้อความบน LINE พร้อมปุ่มใช่/ไม่ กดปุ่มใดปุ่มหนึ่ง แล้ว:
- บอทจะตอบกลับยืนยันตัวเลือกของคุณทันที
- ถ้ากด "ใช่" บอทจะรอจนกว่า TikTok จะโพสต์เสร็จจริง (ไม่ใช่แค่รับคำขอ) แล้วส่งข้อความ LINE อีกครั้งแจ้งผลว่าสำเร็จหรือไม่ — ขั้นตอนนี้ใช้เวลาราว 5-20 วินาที
- ไฟล์ `pending.json` จะถูกอัปเดตสถานะเป็น `approved`/`rejected`/`posted`/`post_failed`

## เชื่อมต่อ TikTok (ทำครั้งเดียว — แต่อาจต้องทำซ้ำ ดูข้อจำกัดด้านล่าง)

ส่วนนี้ต้องทำเองเพราะเป็นการสมัครบัญชี/ยินยอมสิทธิ์ ซึ่งเป็นสิ่งที่ผมทำแทนคุณไม่ได้

1. สมัคร/ล็อกอิน **TikTok for Developers** ที่ https://developers.tiktok.com (เป็นบัญชีแยกจากบัญชี TikTok ปกติ ต้องสมัครด้วยอีเมล)
2. สร้างแอปใหม่ → **Add products** → เพิ่ม **Login Kit** และ **Content Posting API** → เปิด **Direct Post**
3. ตั้ง **Redirect URI** = `https://line-tiktok-bot.onrender.com/tiktok/callback`
   (ต้องยืนยันความเป็นเจ้าของโดเมนก่อนด้วย "URL properties" → "URL prefix" — ระบบจะให้ไฟล์ signature มาวาง ซึ่งเราได้ทำ route `/tiktokXXXX.txt` รองรับไว้แล้วในโค้ด ถ้า deploy โดเมนใหม่ต้องทำขั้นตอนนี้ซ้ำ)
4. เพิ่มบัญชี TikTok ที่จะใช้โพสต์เป็น **Target User** (Sandbox → Sandbox settings → Target Users → Add account)
5. **สำคัญ: ตั้งค่าบัญชี TikTok นั้นเป็นบัญชีส่วนตัว (Private account)** — แอปที่ยังไม่ผ่านการตรวจสอบจาก TikTok จะโพสต์ได้เฉพาะบัญชีส่วนตัวเท่านั้น (error ที่เจอถ้าลืมทำ: `unaudited_client_can_only_post_to_private_accounts`)
6. คัดลอก **Client Key**/**Client Secret** ใส่ใน environment variables ของ Render
7. เปิด `https://line-tiktok-bot.onrender.com/tiktok/connect` ในเบราว์เซอร์ → ล็อกอิน TikTok → กด Allow

ตรวจสอบสถานะการเชื่อมต่อได้ที่ `https://line-tiktok-bot.onrender.com/tiktok/status`

## ข้อจำกัดของ Render Free tier (สำคัญ)

- **Instance หลับเมื่อไม่มีการใช้งาน** และ **ไฟล์ที่เขียนไว้ (`tiktok-tokens.json`, `pending.json`) จะหายทุกครั้งที่ instance ตื่นขึ้นมาใหม่** เพราะดิสก์เป็นแบบชั่วคราว (ephemeral) — ไม่ใช่แค่ตอน deploy ใหม่เท่านั้น
- **ผลที่ตามมา:** ถ้าไม่มีใครเรียกบอทมาสักพัก (เช่นเกิน ~15 นาที) แล้วมีคนกด "ใช่" อนุมัติวิดีโอ บอทจะโพสต์ TikTok ไม่สำเร็จเพราะ "ยังไม่ได้เชื่อมต่อ TikTok" (token หาย) — วิธีแก้คือเปิด `/tiktok/connect` อีกครั้ง (ปกติจะเชื่อมต่อสำเร็จทันทีโดยไม่ต้อง login ใหม่ เพราะเบราว์เซอร์ยังจำ session ของ TikTok ไว้)
- ถ้าต้องการให้เสถียรแบบไม่ต้องกังวลเรื่องนี้ ต้องอัปเกรดเป็นแพลนเสียเงินของ Render (มี persistent disk + ไม่ sleep)

## ข้อควรระวังด้านความปลอดภัย

- ห้ามแชร์ไฟล์ `.env` หรือ `tiktok-tokens.json` ของคุณ หรือวาง access token/secret ในแชทสาธารณะ, repo, หรือฟอรัมใดๆ
- หาก token รั่วไหลออกไป ให้กลับไปที่แท็บ Messaging API (LINE) หรือหน้าแอป (TikTok) แล้วออก token ใหม่ทันที
