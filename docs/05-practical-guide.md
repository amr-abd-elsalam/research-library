
# 📋 الدليل العملي — كل ما تحتاجه

**Version:** 3.0
**Date:** 2026-03-12

---

## أولاً: لما تفتح الجهاز

الخطوة الوحيدة:

```bash
~/start-ai8v.sh
```

استنى لحد ما تشوف `✅ chat.ai8v.com جاهز!` — بعدها الموقع شغّال طول ما الجهاز مفتوح.

**مهم:** لو قفلت نافذة WSL/Terminal، كل شيء يفضل شغّال. لكن لو قفلت الجهاز أو عملت restart — تحتاج تشغّل السكربت تاني.

**ماذا يفعل السكربت تلقائياً:**
1. يشغّل Docker
2. يتأكد إن Qdrant شغّال (أو يشغّله)
3. يتحقق إن الـ Collection موجودة (أو يشغّل Pipeline)
4. يشغّل السيرفر عبر PM2
5. يعمل فحص صحة ويعرض النتيجة

---

## ثانياً: الأوامر اليومية

### مراقبة الحالة

```bash
# هل كل شيء شغال؟
pm2 status

# فحص صحة السيرفر (Qdrant + Gemini + Cache + System)
curl -s http://localhost:3000/api/health | python3 -m json.tool

# فحص Qdrant مباشرة
curl -s http://localhost:6333/collections | python3 -m json.tool
```

### قراءة اللوجات (لما تحس فيه مشكلة)

```bash
# لوجات السيرفر مباشر (live) — Ctrl+C للخروج
pm2 logs research-library

# آخر 50 سطر بدون متابعة
pm2 logs research-library --lines 50 --nostream

# لوجات Cloudflare Tunnel
pm2 logs cloudflare-tunnel --lines 20 --nostream
```

### إعادة تشغيل

```bash
# إعادة تشغيل السيرفر فقط (بعد تعديل config.js أو .env)
pm2 restart research-library

# إعادة تشغيل كل شيء (سيرفر + tunnel)
pm2 restart all

# لو السيرفر علّق — أوقفه وشغّله
pm2 stop research-library
pm2 start research-library
```

---

## ثالثاً: أوامر المحتوى (إضافة/حذف ملفات)

### إضافة ملفات جديدة

```bash
# 1. انسخ الملفات الجديدة
cp /mnt/c/Users/amrom/Desktop/new-file.pdf ~/research-library/pipeline/data/input/

# 2. امسح المخرجات القديمة
cd ~/research-library/pipeline
rm -rf data/extracted/* data/cleaned/* data/chunks/* data/embedded/* data/topics/*
rm -f data/*_state.json

# 3. شغّل Pipeline
source venv/bin/activate
python3 run_all.py --input ./data/input --collection ai8v_kb
deactivate

# 4. حدّث عدد الملفات في config.js
nano ~/research-library/config.js
# عدّل LIBRARY.totalFiles

# 5. أعد تشغيل السيرفر (يمسح الكاش القديم تلقائياً)
pm2 restart research-library
```

### حذف ملف

```bash
# 1. احذف الملف
rm ~/research-library/pipeline/data/input/filename.pdf

# 2. امسح الـ collection القديمة
curl -X DELETE http://localhost:6333/collections/ai8v_kb

# 3. امسح المخرجات وأعد Pipeline
cd ~/research-library/pipeline
rm -rf data/extracted/* data/cleaned/* data/chunks/* data/embedded/* data/topics/*
rm -f data/*_state.json
source venv/bin/activate
python3 run_all.py --input ./data/input --collection ai8v_kb
deactivate

# 4. حدّث عدد الملفات وأعد تشغيل السيرفر
nano ~/research-library/config.js
pm2 restart research-library
```

### شوف الملفات الحالية

```bash
ls -la ~/research-library/pipeline/data/input/
```

---

## رابعاً: أوامر التعديل (الهوية والإعدادات)

### تعديل config.js (نصوص، ألوان، تصنيفات، system prompt)

```bash
nano ~/research-library/config.js
# عدّل اللي تريده — ثم Ctrl+O للحفظ — Ctrl+X للخروج
pm2 restart research-library
```

**ملاحظة:** إعادة تشغيل السيرفر تمسح الكاش تلقائياً، فالتعديلات تطبّق فوراً.

### تعديل .env (مفاتيح API، بورت، دومين)

```bash
nano ~/research-library/.env
pm2 restart research-library
```

### تغيير اللوجو

```bash
cp /mnt/c/Users/amrom/Desktop/new-logo.png ~/research-library/frontend/assets/img/logo.png
# مفيش restart — المتصفح يحتاج refresh بس (Ctrl+Shift+R)
```

### إخفاء/إظهار شريط التصنيفات

```bash
nano ~/research-library/config.js
# غيّر LIBRARY.showTopics إلى true أو false
pm2 restart research-library
```

---

## خامساً: استكشاف الأخطاء

### الموقع مش بيفتح أصلاً

```bash
# هل السيرفر شغال؟
pm2 status

# لو stopped أو errored:
pm2 restart research-library

# هل الـ Tunnel شغال؟
pm2 logs cloudflare-tunnel --lines 10 --nostream

# لو فيه مشكلة:
pm2 restart cloudflare-tunnel
```

### الموقع بيفتح لكن الأسئلة مش بتتجاوب

```bash
# فحص الصحة
curl -s http://localhost:3000/api/health | python3 -m json.tool

# لو qdrant: false — Qdrant مش شغال
sudo service docker start
docker start qdrant
sleep 5
curl -s http://localhost:6333/healthz

# لو gemini: false — مشكلة في API key
# اختبر مباشرة:
curl -s -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "Content-Type: application/json" \
  -H "x-goog-api-key: $(grep GEMINI_API_KEY ~/research-library/.env | cut -d= -f2)" \
  -d '{"contents":[{"parts":[{"text":"قل مرحبا"}]}]}' | head -5

# لو 429 (quota exceeded) — الحد المجاني خلص:
# غيّر الـ API key من أكاونت جديد على https://aistudio.google.com/apikey
nano ~/research-library/.env
pm2 restart research-library
```

### الـ Port مشغول

```bash
fuser -k 3000/tcp
pm2 restart research-library
```

### Docker/Qdrant مش شغال

```bash
sudo service docker start
docker start qdrant
sleep 5
curl -s http://localhost:6333/healthz
```

### المصادر تظهر بأسماء غريبة أو نسب

```bash
# تأكد إنك على الإصدار الأخير من sources.js
# المصادر المفروض تعرض اسم القسم (section title) بدون ## وبدون نسب
# لو لسه فيه مشكلة — امسح كاش المتصفح: Ctrl+Shift+R
```

---

## سادساً: نسخ ملفات من Windows لـ WSL

```bash
# ملفات من Desktop
cp /mnt/c/Users/amrom/Desktop/filename.pdf ~/research-library/pipeline/data/input/

# ملفات من Downloads
cp /mnt/c/Users/amrom/Downloads/filename.pdf ~/research-library/pipeline/data/input/

# مجلد كامل
cp /mnt/c/Users/amrom/Desktop/course-files/* ~/research-library/pipeline/data/input/
```

---

## ملخص — ورقة مرجعية سريعة

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 🟢 تشغيل            ~/start-ai8v.sh
 📊 حالة              pm2 status
 🔍 صحة               curl -s localhost:3000/api/health | python3 -m json.tool
 📋 لوجات             pm2 logs research-library --lines 30 --nostream
 🔄 إعادة تشغيل       pm2 restart research-library
 ⏹  إيقاف الكل        pm2 stop all
 📁 الملفات           ls ~/research-library/pipeline/data/input/
 ⚙️  الإعدادات         nano ~/research-library/config.js
 🔑 المتغيرات         nano ~/research-library/.env
 🧪 اختبار Gemini     curl -s -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" -H "Content-Type: application/json" -H "x-goog-api-key: $(grep GEMINI_API_KEY ~/research-library/.env | cut -d= -f2)" -d '{"contents":[{"parts":[{"text":"test"}]}'
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
