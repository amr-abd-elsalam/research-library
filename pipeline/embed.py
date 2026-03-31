# pipeline/embed.py
"""
الخطوة الخامسة — Embedding باستخدام gemini-embedding-001 (3072 dim)
المدخل : pipeline/data/chunks/*.chunks.json
المخرج : pipeline/data/embedded/*.embedded.jsonl
"""

import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

# ─── Paths ────────────────────────────────────────────────────────────────────
PIPELINE_DIR  = Path(__file__).parent
DATA_DIR      = PIPELINE_DIR / "data"
CHUNKS_DIR    = DATA_DIR / "chunks"
EMBEDDED_DIR  = DATA_DIR / "embedded"
STATE_FILE    = EMBEDDED_DIR / "embed_state.json"

EMBEDDED_DIR.mkdir(parents=True, exist_ok=True)

# ─── Config ───────────────────────────────────────────────────────────────────
EMBED_MODEL        = "gemini-embedding-001"
EMBED_DIM          = 3072
TASK_TYPE          = "RETRIEVAL_DOCUMENT"
BATCH_SIZE         = 10
DELAY_MS           = 1500
MAX_RETRIES        = 5
RETRY_DELAY_S      = 10
RATE_LIMIT_DELAY_S = 120
MAX_RATE_LIMIT_RETRIES = 5

EMBED_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"{EMBED_MODEL}:embedContent"
)

# ─── Helpers ──────────────────────────────────────────────────────────────────
def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def get_api_key() -> str:
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        env_path = PIPELINE_DIR.parent / ".env"
        if env_path.exists():
            for line in env_path.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line.startswith("GEMINI_API_KEY="):
                    key = line[len("GEMINI_API_KEY="):].strip()
                    break
    if not key:
        log("❌ GEMINI_API_KEY غير موجود — export GEMINI_API_KEY=your_key")
        sys.exit(1)
    return key


def load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"processed_files": [], "current_file": None, "last_chunk_id": None}


def save_state(state: dict) -> None:
    STATE_FILE.write_text(
        json.dumps(state, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


# ─── Embed single text ────────────────────────────────────────────────────────
def embed_text(text: str, api_key: str) -> list[float] | None:
    """
    يُرسل طلب embedding لـ Gemini API.
    يرجع vector أو None لو فشل نهائياً.
    """
    payload = json.dumps({
        "model":    f"models/{EMBED_MODEL}",
        "content":  {"parts": [{"text": text}]},
        "taskType": TASK_TYPE,
    }).encode("utf-8")

    rate_limit_retries = 0

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            req = urllib.request.Request(
                EMBED_URL,          # ← بدون ?key= في URL
                data    = payload,
                headers = {
                    "Content-Type":   "application/json",
                    "x-goog-api-key": api_key,   # ← المفتاح في header
                },
                method  = "POST",
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                body   = resp.read().decode("utf-8")
                parsed = json.loads(body)
                vector = parsed.get("embedding", {}).get("values", [])
                if len(vector) == EMBED_DIM:
                    return vector
                else:
                    log(f"    ⚠️  dimension خاطئ: {len(vector)} بدلاً من {EMBED_DIM}")
                    return None

        except urllib.error.HTTPError as e:
            if e.code == 429:
                rate_limit_retries += 1
                if rate_limit_retries > MAX_RATE_LIMIT_RETRIES:
                    log("    ❌ Rate limit متكرر — توقف")
                    return None
                log(f"    ⏳ Rate limit (429) — انتظار {RATE_LIMIT_DELAY_S}s... ({rate_limit_retries}/{MAX_RATE_LIMIT_RETRIES})")
                time.sleep(RATE_LIMIT_DELAY_S)
                continue
            else:
                body = e.read().decode("utf-8") if e.fp else str(e)
                log(f"    ❌ HTTP {e.code}: {body[:200]}")
                if attempt < MAX_RETRIES:
                    delay = RETRY_DELAY_S * attempt
                    log(f"    🔄 محاولة {attempt + 1}/{MAX_RETRIES} بعد {delay}s...")
                    time.sleep(delay)

        except Exception as e:
            log(f"    ❌ خطأ: {e}")
            if attempt < MAX_RETRIES:
                delay = RETRY_DELAY_S * attempt
                log(f"    🔄 محاولة {attempt + 1}/{MAX_RETRIES} بعد {delay}s...")
                time.sleep(delay)

    log("    ⚠️  فشل نهائي — تخطي هذا الـ chunk")
    return None


# ─── Process single file ──────────────────────────────────────────────────────
def process_file(
    chunks_path:   Path,
    api_key:       str,
    state:         dict,
    resume_chunk:  str | None,
) -> tuple[int, int]:
    data      = json.loads(chunks_path.read_text(encoding="utf-8"))
    file_name = data["file_name"]
    chunks    = data.get("chunks", [])
    stem      = chunks_path.stem.replace(".chunks", "")
    out_path  = EMBEDDED_DIR / f"{stem}.embedded.jsonl"

    log(f"  📄 {file_name} — {len(chunks)} chunk")

    write_mode = "a" if resume_chunk else "w"
    skip_until = resume_chunk
    skipped_resume = 0
    success = skip = 0

    with open(out_path, write_mode, encoding="utf-8") as fout:
        for i, chunk in enumerate(chunks):
            chunk_id = chunk.get("chunk_id", "")

            if skip_until:
                if chunk_id == skip_until:
                    skip_until = None
                skipped_resume += 1
                continue

            content = chunk.get("content", "").strip()
            if not content:
                skip += 1
                continue

            vector = embed_text(content, api_key)

            if vector is None:
                skip += 1
                continue

            record = {**chunk, "vector": vector}
            fout.write(json.dumps(record, ensure_ascii=False) + "\n")
            fout.flush()

            success += 1

            state["current_file"]  = stem
            state["last_chunk_id"] = chunk_id
            save_state(state)

            if success % BATCH_SIZE == 0:
                log(f"    📦 batch {success // BATCH_SIZE} — {success} chunk مكتمل")
                time.sleep(DELAY_MS / 1000)

    if skipped_resume > 0:
        log(f"    ⏭  تم تخطي {skipped_resume} chunk (resume)")

    log(f"  ✅ {file_name} — embedded: {success} | تخطي: {skip}")
    return success, skip


# ─── Main ─────────────────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(description="embed.py — Embedding بـ Gemini")
    parser.add_argument("--incremental", action="store_true",
                        help="تخطي الملفات المكتملة + استئناف الملف الجاري")
    args = parser.parse_args()

    api_key = get_api_key()
    log("🔑 API key موجود ✅")

    chunks_files = sorted(CHUNKS_DIR.glob("*.chunks.json"))
    if not chunks_files:
        log("❌ لا توجد ملفات في chunks/ — شغّل chunk.py أولاً")
        sys.exit(1)

    state     = load_state()
    processed = set(state.get("processed_files", []))

    total_success = 0
    total_skip    = 0

    for chunks_path in chunks_files:
        stem = chunks_path.stem.replace(".chunks", "")

        if args.incremental and stem in processed:
            log(f"  ⏭  تخطي (مكتمل): {stem}")
            continue

        resume_chunk = None
        if args.incremental and state.get("current_file") == stem:
            resume_chunk = state.get("last_chunk_id")
            if resume_chunk:
                log(f"  🔄 استئناف من chunk: {resume_chunk[:8]}...")

        try:
            s, sk = process_file(chunks_path, api_key, state, resume_chunk)
            total_success += s
            total_skip    += sk

            processed.add(stem)
            state["processed_files"] = list(processed)
            state["current_file"]    = None
            state["last_chunk_id"]   = None
            save_state(state)

        except Exception as e:
            log(f"  ❌ خطأ في {stem}: {e}")
            total_skip += 1
            continue

    log("─" * 50)
    log(f"✅ اكتمل embed.py")
    log(f"   embedded : {total_success} chunk")
    log(f"   تخطي     : {total_skip} chunk")
    log(f"   المخرجات : {EMBEDDED_DIR}")

    cost = (total_success * 400 / 1_000_000) * 0.00004
    log(f"   💰 تكلفة تقريبية: ${cost:.4f}")

    if total_success == 0:
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
