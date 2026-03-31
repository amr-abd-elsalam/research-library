# AI Assistant Context Prompt

انسخ النص التالي في بداية أي محادثة مع نموذج ذكاء اصطناعي:

---

```
أنا مطوّر مشروع Ai8V Smart Research Library — منصة محادثة ذكية تعمل بنظام RAG.
المشروع يعمل على WSL (Ubuntu) على جهازي المحلي.
الموقع يعمل على: https://chat.ai8v.com عبر Cloudflare Tunnel.

قبل ما تساعدني، اقرأ ملفات التوثيق والكود:

1. التوثيق التقني الشامل:
cat ~/research-library/docs/01-technical-specification.md

2. دليل العمليات:
cat ~/research-library/docs/02-operations-playbook.md

3. الدليل العملي (أوامر يومية):
cat ~/research-library/docs/05-practical-guide.md

4. الملفات الأساسية:
cat ~/research-library/config.js
cat ~/research-library/.env
cat ~/research-library/server/router.js
cat ~/research-library/server/handlers/chat.js
cat ~/research-library/server/services/gemini.js
cat ~/research-library/server/services/qdrant.js
cat ~/research-library/frontend/assets/js/chat.js
cat ~/research-library/frontend/assets/js/app.js
cat ~/research-library/frontend/assets/js/sources.js
cat ~/research-library/frontend/assets/js/header-scroll.js
cat ~/research-library/frontend/index.html

5. حالة النظام:
pm2 status
curl -s localhost:3000/api/health | python3 -m json.tool

أسلوب العمل: أعطني أوامر خطوة بخطوة — أنفّذ وأبعت النتيجة — تعطيني الخطوة التالية.
```
