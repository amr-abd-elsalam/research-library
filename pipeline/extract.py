# pipeline/extract.py
"""
الخطوة الأولى — استخراج النص من الملفات (PDF / DOCX / TXT / MD)
المخرج: pipeline/data/extracted/*.extract.json
"""

import argparse
import json
import sys
import time
from pathlib import Path

# ─── Paths ────────────────────────────────────────────────────────────────────
PIPELINE_DIR  = Path(__file__).parent
DATA_DIR      = PIPELINE_DIR / "data"
EXTRACTED_DIR = DATA_DIR / "extracted"
STATE_FILE    = EXTRACTED_DIR / "extract_state.json"

EXTRACTED_DIR.mkdir(parents=True, exist_ok=True)

# ─── Config ───────────────────────────────────────────────────────────────────
MIN_CHARS      = 500
SUPPORTED_EXTS = {".pdf", ".docx", ".txt", ".md"}

# ─── Helpers ──────────────────────────────────────────────────────────────────
def log(msg: str) -> None:
    timestamp = time.strftime("%H:%M:%S")
    print(f"[{timestamp}] {msg}", flush=True)


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


# ─── Extractors ───────────────────────────────────────────────────────────────
def extract_txt(path: Path) -> str:
    """TXT / MD — قراءة مباشرة مع fallback encoding."""
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        log(f"  ⚠️  encoding utf-8 فشل — محاولة latin-1: {path.name}")
        try:
            return path.read_text(encoding="latin-1")
        except Exception as e:
            raise ValueError(f"فشل قراءة الملف: {e}") from e


def extract_pdf(path: Path) -> str:
    try:
        import pymupdf
    except ImportError:
        raise ImportError("pymupdf غير مثبت — شغّل: pip install pymupdf")

    BATCH_SIZE = 100
    all_pages = []

    doc = pymupdf.open(str(path))
    try:
        total = len(doc)
        log(f"  📖 {total} صفحة — معالجة على دفعات ({BATCH_SIZE} صفحة/دفعة)")

        for start in range(0, total, BATCH_SIZE):
            end = min(start + BATCH_SIZE, total)
            batch_texts = []
            for i in range(start, end):
                page = doc[i]
                text = page.get_text("text")
                if text and text.strip():
                    batch_texts.append(text.strip())
                else:
                    log(f"  ⚠️  صفحة {i+1} فارغة: {path.name}")
            all_pages.extend(batch_texts)
            log(f"  ✅ دفعة {start+1}-{end}/{total} — {len(batch_texts)} صفحة بنص")
    finally:
        doc.close()

    return "\n\n".join(all_pages)


def extract_docx(path: Path) -> str:
    """DOCX — استخراج النص عبر python-docx."""
    try:
        from docx import Document
    except ImportError:
        raise ImportError("python-docx غير مثبت — شغّل: pip install python-docx")

    doc   = Document(str(path))
    paras = [p.text for p in doc.paragraphs if p.text.strip()]
    return "\n\n".join(paras)


def extract_file(path: Path) -> str:
    """يختار المستخرج المناسب حسب امتداد الملف."""
    ext = path.suffix.lower()
    if ext in {".txt", ".md"}:
        return extract_txt(path)
    elif ext == ".pdf":
        return extract_pdf(path)
    elif ext == ".docx":
        return extract_docx(path)
    else:
        raise ValueError(f"امتداد غير مدعوم: {ext}")


# ─── Process single file ──────────────────────────────────────────────────────
def process_file(path: Path) -> dict | None:
    """
    يستخرج النص من ملف واحد.
    يرجع dict أو None لو الملف يُرفض.
    """
    log(f"  📄 {path.name}")

    try:
        raw_text = extract_file(path)
    except Exception as e:
        log(f"  ❌ فشل الاستخراج: {e}")
        return None

    if not raw_text or not raw_text.strip():
        log(f"  ⚠️  نص فارغ — تم التخطي: {path.name}")
        return None

    char_count = len(raw_text.strip())
    if char_count < MIN_CHARS:
        log(f"  ⚠️  النص قصير جداً ({char_count} حرف < {MIN_CHARS}) — تم التخطي: {path.name}")
        return None

    result = {
        "file_name":  path.name,
        "raw_text":   raw_text.strip(),
        "file_type":  path.suffix.lower().lstrip("."),
        "char_count": char_count,
    }

    # حفظ الملف
    out_path = EXTRACTED_DIR / f"{path.stem}.extract.json"
    out_path.write_text(
        json.dumps(result, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    log(f"  ✅ {path.name} — {char_count:,} حرف")
    return result


# ─── Main ─────────────────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(description="extract.py — استخراج النص من الملفات")
    parser.add_argument("--input",       type=str, required=True, help="مسار مجلد الملفات")
    parser.add_argument("--incremental", action="store_true",     help="تخطي الملفات المعالجة مسبقاً")
    args = parser.parse_args()

    input_dir = Path(args.input)
    if not input_dir.is_dir():
        log(f"❌ المجلد غير موجود: {input_dir}")
        sys.exit(1)

    # جمع الملفات
    all_files = sorted([
        f for f in input_dir.rglob("*")
        if f.is_file() and f.suffix.lower() in SUPPORTED_EXTS
    ])

    if not all_files:
        log(f"❌ لا توجد ملفات مدعومة في: {input_dir}")
        log(f"   الامتدادات المدعومة: {', '.join(SUPPORTED_EXTS)}")
        sys.exit(1)

    log(f"📂 وُجد {len(all_files)} ملف في: {input_dir}")

    # تحميل الـ state
    state = load_state()
    processed = set(state.get("processed_files", []))

    # فلترة الملفات لو incremental
    if args.incremental:
        pending = [f for f in all_files if f.name not in processed]
        log(f"🔄 Incremental — {len(pending)} ملف جديد (تم تخطي {len(all_files) - len(pending)})")
    else:
        pending = all_files
        log(f"🔁 Full run — معالجة {len(pending)} ملف")

    if not pending:
        log("✅ لا توجد ملفات جديدة للمعالجة")
        sys.exit(0)

    # معالجة الملفات
    success_count = 0
    skip_count    = 0

    for path in pending:
        result = process_file(path)
        if result:
            success_count += 1
            processed.add(path.name)
            state["processed_files"] = list(processed)
            save_state(state)
        else:
            skip_count += 1

    # ملخص
    log("─" * 50)
    log(f"✅ اكتمل extract.py")
    log(f"   نجح  : {success_count} ملف")
    log(f"   تخطي : {skip_count} ملف")
    log(f"   المخرجات: {EXTRACTED_DIR}")

    if success_count == 0:
        log("❌ لم يُعالَج أي ملف — تحقق من الملفات المدخلة")
        sys.exit(1)

    sys.exit(0)


if __name__ == "__main__":
    main()
