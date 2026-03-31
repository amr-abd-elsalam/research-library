# pipeline/clean.py
"""
الخطوة الثانية — تنظيف النص واستخراج البنية الهيكلية (sections)
يدعم: أنماط عربية تراثية + أنماط أكاديمية حديثة + Gemini Smart Restructure
المدخل : pipeline/data/extracted/*.extract.json
المخرج : pipeline/data/cleaned/*.clean.json
"""

import argparse
import json
import os
import re
import sys
import time
import unicodedata
import urllib.request
import urllib.error
from collections import Counter
from pathlib import Path

# ─── Paths ────────────────────────────────────────────────────────────────────
PIPELINE_DIR  = Path(__file__).parent
DATA_DIR      = PIPELINE_DIR / "data"
EXTRACTED_DIR = DATA_DIR / "extracted"
CLEANED_DIR   = DATA_DIR / "cleaned"
STATE_FILE    = CLEANED_DIR / "clean_state.json"

CLEANED_DIR.mkdir(parents=True, exist_ok=True)

# ─── Gemini Config ────────────────────────────────────────────────────────────
GEMINI_MODEL   = "gemini-2.5-flash-lite"
GEMINI_URL     = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_MODEL}:generateContent"
)
# حد أقصى للنص المرسل لـ Gemini في كل طلب (بالحروف)
GEMINI_CHUNK_CHARS    = 25000
# الحد الأدنى لعدد الـ sections لقبول التقسيم بالأنماط
MIN_PATTERN_SECTIONS  = 3
# تأخير بين طلبات Gemini (ملي ثانية)
GEMINI_DELAY_MS       = 1000
# عدد المحاولات
GEMINI_MAX_RETRIES    = 3
GEMINI_RETRY_DELAY_S  = 10
GEMINI_RATE_LIMIT_S   = 60

# ─── Section heading patterns ─────────────────────────────────────────────────
# المجموعة 1: أنماط عربية تراثية
ARABIC_TRADITIONAL_PATTERNS = [
    (1, re.compile(
        r'^(الكتاب|الجزء|القسم|المجلد)\s+(الأول|الثاني|الثالث|الرابع|الخامس'
        r'|السادس|السابع|الثامن|التاسع|العاشر|[٠-٩0-9]+)',
        re.MULTILINE,
    )),
    (1, re.compile(r'^(باب|الباب)\s+.{2,80}$', re.MULTILINE)),
    (2, re.compile(r'^(فصل|الفصل|فصل\s*[:：])\s+.{2,80}$', re.MULTILINE)),
    (2, re.compile(r'^(مبحث|المبحث)\s+.{2,80}$', re.MULTILINE)),
    (3, re.compile(
        r'^(مسألة|المسألة|مطلب|المطلب|فرع|الفرع|تنبيه|فائدة)\s*[:：]?\s*.{0,80}$',
        re.MULTILINE,
    )),
    (2, re.compile(
        r'^(أولاً|ثانياً|ثالثاً|رابعاً|خامساً|سادساً|سابعاً|ثامناً|تاسعاً|عاشراً)\s*[:：]',
        re.MULTILINE,
    )),
]

# المجموعة 2: أنماط أكاديمية حديثة (عربي + إنجليزي)
ACADEMIC_MODERN_PATTERNS = [
    # Markdown headings
    (1, re.compile(r'^#{1}\s+.{2,120}$', re.MULTILINE)),
    (2, re.compile(r'^#{2}\s+.{2,120}$', re.MULTILINE)),
    (3, re.compile(r'^#{3}\s+.{2,120}$', re.MULTILINE)),
    (4, re.compile(r'^#{4}\s+.{2,120}$', re.MULTILINE)),
    # أنماط عربية أكاديمية
    (1, re.compile(r'^(الفصل|الوحدة)\s+(الأول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر|[٠-٩0-9]+)\s*[:：]?\s*.{0,100}$', re.MULTILINE)),
    (1, re.compile(r'^الفصل\s+[٠-٩0-9]+\s*[:：]\s*.{2,100}$', re.MULTILINE)),
    (2, re.compile(r'^(المبحث|المطلب|المحور)\s+(الأول|الثاني|الثالث|الرابع|الخامس|[٠-٩0-9]+)\s*[:：]?\s*.{0,100}$', re.MULTILINE)),
    (1, re.compile(r'^(المقدمة|مقدمة|الخاتمة|خاتمة|التمهيد|تمهيد)\s*$', re.MULTILINE)),
    (2, re.compile(r'^(الإطار النظري|الدراسات السابقة|منهجية البحث|منهج البحث|نتائج البحث|التوصيات|المراجع|الملاحق)\s*$', re.MULTILINE)),
    # أنماط إنجليزية أكاديمية
    (1, re.compile(r'^(Chapter|CHAPTER)\s+[0-9IVXLC]+\s*[:：.]?\s*.{0,100}$', re.MULTILINE)),
    (1, re.compile(r'^(Introduction|Conclusion|Abstract|Summary)\s*$', re.MULTILINE | re.IGNORECASE)),
    (2, re.compile(r'^(Section|SECTION)\s+[0-9.]+\s*[:：.]?\s*.{0,100}$', re.MULTILINE)),
    (2, re.compile(r'^(Literature Review|Methodology|Methods|Results|Discussion|Findings|Recommendations|References|Appendix|Background)\s*$', re.MULTILINE | re.IGNORECASE)),
    # أنماط مرقمة (1. أو 1.1 أو 1.1.1)
    (1, re.compile(r'^[0-9]+\.\s+[A-Z\u0600-\u06FF].{2,100}$', re.MULTILINE)),
    (2, re.compile(r'^[0-9]+\.[0-9]+\.?\s+.{2,100}$', re.MULTILINE)),
    (3, re.compile(r'^[0-9]+\.[0-9]+\.[0-9]+\.?\s+.{2,100}$', re.MULTILINE)),
]

# كل الأنماط مجتمعة
ALL_PATTERNS = ARABIC_TRADITIONAL_PATTERNS + ACADEMIC_MODERN_PATTERNS

# ─── Helpers ──────────────────────────────────────────────────────────────────
def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"processed_files": []}


def save_state(state: dict) -> None:
    STATE_FILE.write_text(
        json.dumps(state, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def get_api_key() -> str:
    """يقرأ GEMINI_API_KEY من environment أو .env"""
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        env_path = PIPELINE_DIR.parent / ".env"
        if env_path.exists():
            for line in env_path.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line.startswith("GEMINI_API_KEY="):
                    key = line[len("GEMINI_API_KEY="):].strip()
                    break
    return key


# ─── Cleaning functions ───────────────────────────────────────────────────────
def normalize_chars(text: str) -> str:
    """NFC + توحيد الألفات فقط (آمن — لا يغيّر المعنى)."""
    text = unicodedata.normalize("NFC", text)
    # توحيد الألفات — standard في البحث العربي
    text = re.sub(r'[أإآ]', 'ا', text)
    # لا نوحّد ؤ→و أو ئ→ي (يشوّه الكلمات: مسؤول، بيئة)
    # لا نوحّد ى→ي (الألف المقصورة جزء من الإملاء)
    return text


def remove_diacritics(text: str) -> str:
    """إزالة التشكيل مع الحفاظ على الشدّة."""
    return re.sub(r'[\u064B-\u0650\u0652]', '', text)


def detect_repeated_lines(text: str, threshold: int = 3) -> set:
    lines   = text.split('\n')
    counter = Counter(line.strip() for line in lines if line.strip())
    return {line for line, count in counter.items() if count >= threshold}


def remove_repeated_lines(text: str, repeated: set) -> str:
    lines = text.split('\n')
    return '\n'.join(line for line in lines if line.strip() not in repeated)


def normalize_whitespace(text: str) -> str:
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = re.sub(r'[ \t]+', ' ', text)
    lines = [line.strip() for line in text.split('\n')]
    return '\n'.join(lines).strip()


def normalize_punctuation(text: str) -> str:
    text = text.replace(',', '،')
    text = text.replace(';', '؛')
    text = text.replace('?', '؟')
    text = re.sub(r'\((\s*)\)', '', text)
    return text


def clean_text(raw: str) -> str:
    """تطبيق كل خطوات التنظيف بالترتيب."""
    text = normalize_chars(raw)
    text = remove_diacritics(text)
    repeated = detect_repeated_lines(text)
    if repeated:
        log(f"    🔁 حذف {len(repeated)} سطر متكرر (headers/footers)")
        text = remove_repeated_lines(text, repeated)
    text = normalize_whitespace(text)
    text = normalize_punctuation(text)
    return text


# ─── Pattern-based section extraction ─────────────────────────────────────────
def extract_sections_by_patterns(text: str) -> list[dict]:
    """يستخرج البنية الهيكلية باستخدام الأنماط."""
    lines = text.split('\n')
    headings: list[tuple[int, int, str]] = []

    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            continue
        for level, pattern in ALL_PATTERNS:
            if pattern.match(stripped):
                headings.append((i, level, stripped))
                break

    if not headings:
        return []

    sections = []
    path_stack: list[tuple[int, str]] = []

    for idx, (line_i, level, title) in enumerate(headings):
        start = line_i + 1
        end   = headings[idx + 1][0] if idx + 1 < len(headings) else len(lines)
        content_lines = lines[start:end]
        content = '\n'.join(content_lines).strip()

        if not content:
            continue

        path_stack = [(l, t) for l, t in path_stack if l < level]
        path_stack.append((level, title))
        path = [t for _, t in path_stack]

        sections.append({
            "title":   title,
            "level":   level,
            "content": content,
            "path":    path,
        })

    return sections


# ─── Gemini Smart Restructure ─────────────────────────────────────────────────
def call_gemini(prompt: str, api_key: str) -> str | None:
    """يرسل طلب لـ Gemini ويرجع النص الناتج."""
    url     = f"{GEMINI_URL}?key={api_key}"
    payload = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 8192,
        },
    }).encode("utf-8")

    for attempt in range(1, GEMINI_MAX_RETRIES + 1):
        try:
            req = urllib.request.Request(
                url,
                data    = payload,
                headers = {"Content-Type": "application/json"},
                method  = "POST",
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                body   = json.loads(resp.read().decode("utf-8"))
                text   = body["candidates"][0]["content"]["parts"][0]["text"]
                return text.strip()

        except urllib.error.HTTPError as e:
            if e.code == 429:
                log(f"      ⏳ Rate limit — انتظار {GEMINI_RATE_LIMIT_S}s...")
                time.sleep(GEMINI_RATE_LIMIT_S)
                continue
            else:
                err_body = e.read().decode("utf-8") if e.fp else str(e)
                log(f"      ❌ HTTP {e.code}: {err_body[:200]}")

        except Exception as e:
            log(f"      ❌ خطأ: {e}")

        if attempt < GEMINI_MAX_RETRIES:
            delay = GEMINI_RETRY_DELAY_S * attempt
            log(f"      🔄 محاولة {attempt+1}/{GEMINI_MAX_RETRIES} بعد {delay}s...")
            time.sleep(delay)

    return None


def build_restructure_prompt(text_chunk: str) -> str:
    """يبني الـ prompt اللي هيتبعت لـ Gemini لتحليل البنية."""
    return f"""أنت محلل بنية نصوص متخصص. مهمتك تحليل النص التالي وتقسيمه إلى أقسام منطقية.

## التعليمات:
1. حلل النص واكتشف البنية الهيكلية الطبيعية له (فصول، أقسام، مباحث، مواضيع فرعية)
2. حدد عنوان كل قسم ومستواه (1 = رئيسي، 2 = فرعي، 3 = تفصيلي)
3. أرجع النتيجة بصيغة JSON فقط — بدون أي نص إضافي

## قواعد مهمة:
- لا تغيّر محتوى النص أبداً — فقط حدد أين تبدأ وتنتهي كل section
- لا تخترع عناوين من عندك لو النص فيه عناوين واضحة — استخدمها
- لو النص بدون عناوين واضحة، اقترح عناوين وصفية دقيقة بنفس لغة النص
- كل section لازم يكون فيه محتوى حقيقي (مش عنوان بس)
- الحد الأدنى لحجم section: 200 حرف
- الحد الأقصى لحجم section: 5000 حرف — لو أكبر من كده قسّمه

## صيغة الإخراج (JSON فقط):
```json
[
  {{
    "title": "عنوان القسم",
    "level": 1,
    "start_phrase": "أول 50 حرف من القسم",
    "end_phrase": "آخر 50 حرف من القسم"
  }}
]

## النص المطلوب تحليله:
{text_chunk}

أرجع JSON فقط بدون أي شرح أو تعليق."""


def parse_gemini_sections(gemini_response: str, full_text: str) -> list[dict]:
    """يحوّل رد Gemini إلى sections فعلية بالمحتوى."""
    # استخراج الـ JSON من الرد
    json_match = re.search(r'\[[\s\S]*\]', gemini_response)
    if not json_match:
        log("      ⚠️  لم يُعثر على JSON في رد Gemini")
        return []

    try:
        items = json.loads(json_match.group())
    except json.JSONDecodeError as e:
        log(f"      ⚠️  JSON غير صالح: {e}")
        return []

    if not isinstance(items, list) or not items:
        return []

    sections = []
    text_lower = full_text

    for i, item in enumerate(items):
        title       = item.get("title", f"قسم {i+1}")
        level       = item.get("level", 1)
        start_phrase = item.get("start_phrase", "")
        end_phrase   = item.get("end_phrase", "")

        # البحث عن موقع البداية
        start_idx = 0
        if start_phrase:
            pos = text_lower.find(start_phrase)
            if pos >= 0:
                start_idx = pos
            else:
                # محاولة بأول 30 حرف
                short = start_phrase[:30]
                pos   = text_lower.find(short)
                if pos >= 0:
                    start_idx = pos

        # البحث عن موقع النهاية
        end_idx = len(full_text)
        if end_phrase:
            pos = text_lower.find(end_phrase, start_idx)
            if pos >= 0:
                end_idx = pos + len(end_phrase)
            else:
                short = end_phrase[:30]
                pos   = text_lower.find(short, start_idx)
                if pos >= 0:
                    end_idx = pos + len(short)

        # لو في section بعده، النهاية = بداية التالي
        # (هنعدّل ده بعد ما نلاقي كل البدايات)

        content = full_text[start_idx:end_idx].strip()

        if len(content) < 50:
            continue

        level = max(1, min(4, int(level)))

        sections.append({
            "title":   str(title),
            "level":   level,
            "content": content,
            "path":    [str(title)],
        })

    # بناء الـ paths الصحيحة
    if sections:
        path_stack: list[tuple[int, str]] = []
        for sec in sections:
            level = sec["level"]
            title = sec["title"]
            path_stack = [(l, t) for l, t in path_stack if l < level]
            path_stack.append((level, title))
            sec["path"] = [t for _, t in path_stack]

    return sections


def smart_restructure(text: str, api_key: str) -> list[dict]:
    """
    يستخدم Gemini لتحليل بنية النص وتقسيمه لـ sections.
    يعالج النص على أجزاء لو كان كبير.
    """
    log("    🤖 Gemini Smart Restructure...")

    text_len = len(text)

    # لو النص صغير — طلب واحد
    if text_len <= GEMINI_CHUNK_CHARS:
        prompt   = build_restructure_prompt(text)
        response = call_gemini(prompt, api_key)
        if response:
            sections = parse_gemini_sections(response, text)
            if sections:
                log(f"    ✅ Gemini قسّم النص إلى {len(sections)} section")
                return sections
        log("    ⚠️  Gemini لم يرجع نتيجة صالحة")
        return []

    # لو النص كبير — أجزاء
    log(f"    📏 النص كبير ({text_len:,} حرف) — تقسيم لأجزاء")
    all_sections = []
    chunk_start  = 0
    chunk_num    = 0

    while chunk_start < text_len:
        chunk_end = min(chunk_start + GEMINI_CHUNK_CHARS, text_len)

        # حاول تقطع على نهاية فقرة
        if chunk_end < text_len:
            newline_pos = text.rfind('\n\n', chunk_start, chunk_end)
            if newline_pos > chunk_start + (GEMINI_CHUNK_CHARS // 2):
                chunk_end = newline_pos

        text_chunk = text[chunk_start:chunk_end]
        chunk_num += 1
        log(f"      📦 جزء {chunk_num}: {len(text_chunk):,} حرف")

        prompt   = build_restructure_prompt(text_chunk)
        response = call_gemini(prompt, api_key)

        if response:
            sections = parse_gemini_sections(response, text_chunk)
            if sections:
                # عدّل الـ content ليشير للنص الأصلي
                for sec in sections:
                    # أضف offset للمحتوى
                    actual_start = text.find(sec["content"][:50], chunk_start)
                    if actual_start >= 0:
                        actual_end = text.find(sec["content"][-50:], actual_start)
                        if actual_end >= 0:
                            sec["content"] = text[actual_start:actual_end + 50].strip()

                all_sections.extend(sections)
                log(f"      ✅ {len(sections)} section من الجزء {chunk_num}")

        # تأخير بين الطلبات
        time.sleep(GEMINI_DELAY_MS / 1000)
        chunk_start = chunk_end

    log(f"    🤖 Gemini: إجمالي {len(all_sections)} section")
    return all_sections


# ─── Main section extraction logic ────────────────────────────────────────────
def extract_sections(text: str, api_key: str = "") -> list[dict]:
    """
    يستخرج البنية الهيكلية من النص.
    يحاول الأنماط أولاً، ثم Gemini لو الأنماط لم تكفِ.
    """
    # المحاولة 1: الأنماط
    sections = extract_sections_by_patterns(text)

    if len(sections) >= MIN_PATTERN_SECTIONS:
        log(f"    📑 الأنماط نجحت: {len(sections)} section")
        return sections

    # المحاولة 2: Gemini Smart Restructure
    if api_key:
        log(f"    ⚠️  الأنماط أرجعت {len(sections)} section فقط — تفعيل Gemini")
        gemini_sections = smart_restructure(text, api_key)
        if gemini_sections:
            return gemini_sections
        log("    ⚠️  Gemini لم ينجح — الرجوع للأنماط أو fallback")

    # المحاولة 3: لو الأنماط أرجعت شيء (حتى لو قليل)
    if sections:
        log(f"    📑 استخدام {len(sections)} section من الأنماط")
        return sections

    # Fallback: section واحدة بكل النص
    log("    ⚠️  fallback: section واحدة بكل النص")
    return [{
        "title":   "المحتوى الكامل",
        "level":   1,
        "content": text.strip(),
        "path":    ["المحتوى الكامل"],
    }]


# ─── Process single file ──────────────────────────────────────────────────────
def process_file(extract_path: Path, api_key: str = "") -> bool:
    data      = json.loads(extract_path.read_text(encoding="utf-8"))
    file_name = data["file_name"]
    log(f"  📄 {file_name}")

    cleaned  = clean_text(data["raw_text"])
    sections = extract_sections(cleaned, api_key)

    result = {
        "file_name":     file_name,
        "clean_text":    cleaned,
        "sections":      sections,
        "section_count": len(sections),
    }

    stem     = extract_path.stem.replace(".extract", "")
    out_path = CLEANED_DIR / f"{stem}.clean.json"
    out_path.write_text(
        json.dumps(result, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    log(f"  ✅ {file_name} — {len(sections)} section")
    return True


# ─── Main ─────────────────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(
        description="clean.py — تنظيف النص واستخراج البنية (أنماط + Gemini)"
    )
    parser.add_argument("--incremental", action="store_true",
                        help="تخطي الملفات المعالجة مسبقاً")
    parser.add_argument("--no-gemini", action="store_true",
                        help="تعطيل Gemini — استخدام الأنماط فقط")
    args = parser.parse_args()

    extract_files = sorted(EXTRACTED_DIR.glob("*.extract.json"))

    if not extract_files:
        log("❌ لا توجد ملفات في extracted/ — شغّل extract.py أولاً")
        sys.exit(1)

    # تحميل API key لو Gemini مطلوب
    api_key = ""
    if not args.no_gemini:
        api_key = get_api_key()
        if api_key:
            log("🔑 Gemini API key موجود — Smart Restructure مُفعّل")
        else:
            log("⚠️  GEMINI_API_KEY غير موجود — الأنماط فقط")

    state     = load_state()
    processed = set(state.get("processed_files", []))

    if args.incremental:
        pending = [f for f in extract_files
                   if f.stem.replace(".extract", "") not in processed]
        log(f"🔄 Incremental — {len(pending)} ملف جديد (تخطي {len(extract_files)-len(pending)})")
    else:
        pending = extract_files
        log(f"🔁 Full run — {len(pending)} ملف")

    if not pending:
        log("✅ لا توجد ملفات جديدة")
        sys.exit(0)

    success = skip = 0
    for f in pending:
        try:
            process_file(f, api_key)
            success += 1
            stem = f.stem.replace(".extract", "")
            processed.add(stem)
            state["processed_files"] = list(processed)
            save_state(state)
        except Exception as e:
            log(f"  ❌ فشل: {f.name} — {e}")
            skip += 1

    log("─" * 50)
    log(f"✅ اكتمل clean.py — نجح: {success} | تخطي: {skip}")

    if success == 0:
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
