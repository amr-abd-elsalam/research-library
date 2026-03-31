# pipeline/chunk.py
"""
الخطوة الرابعة — Chunking هيكلي داخل الـ sections
المدخل : pipeline/data/topics/*.topic.json
المخرج : pipeline/data/chunks/*.chunks.json
"""

import argparse
import json
import sys
import time
import uuid
from pathlib import Path

# ─── Paths ────────────────────────────────────────────────────────────────────
PIPELINE_DIR = Path(__file__).parent
DATA_DIR     = PIPELINE_DIR / "data"
TOPICS_DIR   = DATA_DIR / "topics"
CHUNKS_DIR   = DATA_DIR / "chunks"
STATE_FILE   = CHUNKS_DIR / "chunk_state.json"

CHUNKS_DIR.mkdir(parents=True, exist_ok=True)

# ─── Config ───────────────────────────────────────────────────────────────────
CHILD_MAX_TOKENS   = 400
PARENT_MAX_TOKENS  = 1200
OVERLAP_TOKENS     = 80
SMALL_SECTION_MAX  = 400
LARGE_SECTION_MIN  = 2500

# ─── Helpers ──────────────────────────────────────────────────────────────────
def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def estimate_tokens(text: str) -> int:
    """تقدير عدد الـ tokens — تقريب محافظ للنصوص العربية."""
    return max(1, int(len(text) / 3.5))


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


# ─── Text splitting ───────────────────────────────────────────────────────────
def split_into_chunks(text: str, max_tokens: int, overlap_tokens: int) -> list[str]:
    """
    يقسّم النص إلى chunks بحد أقصى max_tokens مع overlap.
    يقسّم على مستوى الجمل (. أو \n) قدر الإمكان.
    """
    # تقسيم أولي على الفقرات
    paragraphs = [p.strip() for p in text.split('\n') if p.strip()]

    chunks  = []
    current = []
    current_tokens = 0

    # حساب الـ overlap بالأحرف
    overlap_chars = int(overlap_tokens * 3.5)

    for para in paragraphs:
        para_tokens = estimate_tokens(para)

        # لو الفقرة وحدها أكبر من الحد → قسّمها
        if para_tokens > max_tokens:
            # احفظ الـ current أولاً
            if current:
                chunks.append('\n'.join(current))
                current = []
                current_tokens = 0

            # قسّم الفقرة الكبيرة على مستوى الجمل
            sentences = [s.strip() for s in para.replace('،', '، ').split('.') if s.strip()]
            sent_buf  = []
            sent_tok  = 0
            for sent in sentences:
                st = estimate_tokens(sent)
                if sent_tok + st > max_tokens and sent_buf:
                    chunks.append('. '.join(sent_buf) + '.')
                    # overlap: خذ آخر جملة
                    sent_buf  = sent_buf[-1:]
                    sent_tok  = estimate_tokens(sent_buf[0]) if sent_buf else 0
                sent_buf.append(sent)
                sent_tok += st
            if sent_buf:
                chunks.append('. '.join(sent_buf) + '.')
            continue

        # لو إضافة الفقرة ستتجاوز الحد
        if current_tokens + para_tokens > max_tokens and current:
            chunks.append('\n'.join(current))
            # overlap: خذ آخر فقرة لو ما زالت في الحد
            last = current[-1]
            if estimate_tokens(last) <= overlap_tokens:
                current = [last]
                current_tokens = estimate_tokens(last)
            else:
                current = []
                current_tokens = 0

        current.append(para)
        current_tokens += para_tokens

    if current:
        chunks.append('\n'.join(current))

    return [c for c in chunks if c.strip()]


# ─── Chunk builders ───────────────────────────────────────────────────────────
def build_chunks_for_section(section: dict, file_name: str) -> list[dict]:
    """
    يبني chunks لـ section واحدة حسب منطق الـ chunking.
    يرجع list من chunk dicts.
    """
    content      = section.get("content", "").strip()
    section_tok  = estimate_tokens(content)
    title        = section.get("title",   "")
    path         = section.get("path",    [title])
    topic_id     = section.get("topic_id",       -1)
    topic_label  = section.get("topic_label",    "عام")
    topic_kw     = section.get("topic_keywords", [])

    base_meta = {
        "file_name":        file_name,
        "section_title":    title,
        "section_path":     path,
        "topic_id":         topic_id,
        "topic_label":      topic_label,
        "topic_keywords":   topic_kw,
        "language":         "ar",
    }

    # ── حالة 1: section صغيرة ─────────────────────────────────────────────────
    if section_tok < SMALL_SECTION_MAX:
        return [{
            **base_meta,
            "chunk_id":                str(uuid.uuid4()),
            "content":                 content,
            "parent_content":          content,
            "chunk_index":             0,
            "total_chunks_in_section": 1,
            "token_count":             section_tok,
        }]

    # ── حالة 2: section متوسطة (400–2500 token) ───────────────────────────────
    if section_tok <= LARGE_SECTION_MIN:
        child_texts = split_into_chunks(content, CHILD_MAX_TOKENS, OVERLAP_TOKENS)
        total       = len(child_texts)
        chunks      = []
        for i, child_text in enumerate(child_texts):
            chunks.append({
                **base_meta,
                "chunk_id":                str(uuid.uuid4()),
                "content":                 child_text,
                "parent_content":          content,      # parent = section كاملة
                "chunk_index":             i,
                "total_chunks_in_section": total,
                "token_count":             estimate_tokens(child_text),
            })
        return chunks

    # ── حالة 3: section كبيرة (> 2500 token) ─────────────────────────────────
    parent_texts = split_into_chunks(content, PARENT_MAX_TOKENS, OVERLAP_TOKENS)
    chunks       = []
    global_idx   = 0

    # حساب إجمالي الـ child chunks أولاً
    all_children = []
    for parent_text in parent_texts:
        children = split_into_chunks(parent_text, CHILD_MAX_TOKENS, OVERLAP_TOKENS)
        all_children.append((parent_text, children))

    total = sum(len(ch) for _, ch in all_children)

    for parent_text, children in all_children:
        for child_text in children:
            chunks.append({
                **base_meta,
                "chunk_id":                str(uuid.uuid4()),
                "content":                 child_text,
                "parent_content":          parent_text,  # parent = parent chunk
                "chunk_index":             global_idx,
                "total_chunks_in_section": total,
                "token_count":             estimate_tokens(child_text),
            })
            global_idx += 1

    return chunks


# ─── Validate chunk ───────────────────────────────────────────────────────────
REQUIRED_KEYS = {
    "chunk_id", "content", "parent_content", "file_name",
    "section_title", "section_path", "topic_id", "topic_label",
    "topic_keywords", "chunk_index", "total_chunks_in_section",
    "token_count", "language",
}

def validate_chunk(chunk: dict) -> bool:
    """يتحقق من اكتمال الـ chunk schema."""
    missing = REQUIRED_KEYS - set(chunk.keys())
    if missing:
        log(f"    ⚠️  chunk ناقص المفاتيح: {missing}")
        return False
    if not chunk.get("content", "").strip():
        log("    ⚠️  chunk فارغ المحتوى")
        return False
    return True


# ─── Process single file ──────────────────────────────────────────────────────
def process_file(topic_path: Path) -> bool:
    data      = json.loads(topic_path.read_text(encoding="utf-8"))
    file_name = data["file_name"]
    sections  = data.get("sections", [])
    log(f"  📄 {file_name} — {len(sections)} section")

    all_chunks    = []
    skipped       = 0

    for sec in sections:
        if not sec.get("content", "").strip():
            continue
        raw_chunks = build_chunks_for_section(sec, file_name)
        for ch in raw_chunks:
            if validate_chunk(ch):
                all_chunks.append(ch)
            else:
                skipped += 1

    if not all_chunks:
        log(f"  ⚠️  لا توجد chunks صالحة: {file_name}")
        return False

    result = {
        "file_name":   file_name,
        "chunk_count": len(all_chunks),
        "chunks":      all_chunks,
    }

    stem     = topic_path.stem.replace(".topic", "")
    out_path = CHUNKS_DIR / f"{stem}.chunks.json"
    out_path.write_text(
        json.dumps(result, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    log(f"  ✅ {file_name} — {len(all_chunks)} chunk (تخطي: {skipped})")
    return True


# ─── Main ─────────────────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(description="chunk.py — Chunking هيكلي")
    parser.add_argument("--incremental", action="store_true",
                        help="تخطي الملفات المعالجة مسبقاً")
    args = parser.parse_args()

    topic_files = sorted(TOPICS_DIR.glob("*.topic.json"))
    if not topic_files:
        log("❌ لا توجد ملفات في topics/ — شغّل topic.py أولاً")
        sys.exit(1)

    state     = load_state()
    processed = set(state.get("processed_files", []))

    if args.incremental:
        pending = [f for f in topic_files
                   if f.stem.replace(".topic", "") not in processed]
        log(f"🔄 Incremental — {len(pending)} ملف جديد (تخطي {len(topic_files)-len(pending)})")
    else:
        pending = topic_files
        log(f"🔁 Full run — {len(pending)} ملف")

    if not pending:
        log("✅ لا توجد ملفات جديدة")
        sys.exit(0)

    success = skip = 0
    for f in pending:
        try:
            ok = process_file(f)
            if ok:
                success += 1
                stem = f.stem.replace(".topic", "")
                processed.add(stem)
                state["processed_files"] = list(processed)
                save_state(state)
            else:
                skip += 1
        except Exception as e:
            log(f"  ❌ فشل: {f.name} — {e}")
            skip += 1

    log("─" * 50)
    log(f"✅ اكتمل chunk.py — نجح: {success} | تخطي: {skip}")

    if success == 0:
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
