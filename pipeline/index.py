# pipeline/index.py
"""
الخطوة السادسة — رفع الـ chunks لـ Qdrant
المدخل : pipeline/data/embedded/*.embedded.jsonl
المخرج : Qdrant collection "knowledge"
"""

import argparse
import json
import sys
import time
from pathlib import Path

# ─── Paths ────────────────────────────────────────────────────────────────────
PIPELINE_DIR = Path(__file__).parent
DATA_DIR     = PIPELINE_DIR / "data"
EMBEDDED_DIR = DATA_DIR / "embedded"
STATE_FILE   = EMBEDDED_DIR / "index_state.json"   # مستقل عن embed.py
SUMMARY_FILE = EMBEDDED_DIR / "index_summary.json"

# ─── Config ───────────────────────────────────────────────────────────────────
DEFAULT_COLLECTION = "knowledge"
VECTOR_SIZE        = 3072
UPSERT_BATCH       = 100
UPSERT_RETRIES     = 3
RETRY_BACKOFF      = [3, 6, 9]   # ثواني

# يُحدَّد لاحقاً من argparse أو .env
COLLECTION_NAME    = DEFAULT_COLLECTION

# ─── Helpers ──────────────────────────────────────────────────────────────────
def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


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


def get_qdrant_client():
    """يبني Qdrant client من .env أو environment variables."""
    try:
        from qdrant_client import QdrantClient
    except ImportError:
        log("❌ qdrant-client غير مثبت — شغّل: pip install qdrant-client")
        sys.exit(1)

    # قراءة QDRANT_URL من .env
    qdrant_url = "http://localhost:6333"
    env_path   = PIPELINE_DIR.parent / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("QDRANT_URL="):
                qdrant_url = line[len("QDRANT_URL="):].strip()
                break

    log(f"🔗 Qdrant URL: {qdrant_url}")
    return QdrantClient(url=qdrant_url, timeout=30)


# ─── Collection setup ─────────────────────────────────────────────────────────
def setup_collection(client, incremental: bool) -> None:
    """ينشئ أو يتحقق من الـ collection."""
    from qdrant_client.models import (
        VectorParams, Distance, HnswConfigDiff,
        PayloadSchemaType,
    )

    exists = False
    try:
        client.get_collection(COLLECTION_NAME)
        exists = True
    except Exception:
        exists = False

    if not incremental:
        if exists:
            log(f"🗑️  حذف collection موجودة: {COLLECTION_NAME}")
            client.delete_collection(COLLECTION_NAME)
        log(f"🆕 إنشاء collection: {COLLECTION_NAME}")
        client.create_collection(
            collection_name = COLLECTION_NAME,
            vectors_config  = VectorParams(
                size     = VECTOR_SIZE,
                distance = Distance.COSINE,
                on_disk  = True,
            ),
            hnsw_config = HnswConfigDiff(
                m            = 16,
                ef_construct = 100,
                on_disk      = True,
            ),
        )
        # إنشاء الـ payload indexes
        _create_indexes(client)
        log(f"✅ Collection جاهزة: {COLLECTION_NAME}")

    else:
        if not exists:
            log(f"🆕 Collection غير موجودة — إنشاء جديدة: {COLLECTION_NAME}")
            client.create_collection(
                collection_name = COLLECTION_NAME,
                vectors_config  = VectorParams(
                    size     = VECTOR_SIZE,
                    distance = Distance.COSINE,
                    on_disk  = True,
                ),
                hnsw_config = HnswConfigDiff(
                    m            = 16,
                    ef_construct = 100,
                    on_disk      = True,
                ),
            )
            _create_indexes(client)
        else:
            log(f"✅ Collection موجودة — incremental upsert: {COLLECTION_NAME}")
            # تأكد من الـ indexes (409 = موجود مسبقاً → تجاهل)
            _create_indexes(client, ignore_exists=True)


def _create_indexes(client, ignore_exists: bool = False) -> None:
    from qdrant_client.models import PayloadSchemaType
    for field, schema in [
        ("topic_id",  PayloadSchemaType.INTEGER),
        ("file_name", PayloadSchemaType.KEYWORD),
    ]:
        try:
            client.create_payload_index(
                collection_name = COLLECTION_NAME,
                field_name      = field,
                field_schema    = schema,
            )
            log(f"  📑 Index created: {field}")
        except Exception as e:
            if ignore_exists:
                log(f"  ℹ️  Index موجود: {field}")
            else:
                raise e


# ─── Upsert batch ─────────────────────────────────────────────────────────────
def upsert_batch(client, batch: list[dict]) -> bool:
    from qdrant_client.models import PointStruct

    points = []
    for record in batch:
        vector   = record.get("vector")
        chunk_id = record.get("chunk_id", "")
        payload  = {k: v for k, v in record.items() if k != "vector"}
        points.append(PointStruct(
            id      = chunk_id,
            vector  = vector,
            payload = payload,
        ))

    for attempt in range(1, UPSERT_RETRIES + 1):
        try:
            client.upsert(
                collection_name = COLLECTION_NAME,
                points          = points,
                wait            = True,
            )
            return True
        except Exception as e:
            log(f"    ⚠️  upsert فشل (محاولة {attempt}/{UPSERT_RETRIES}): {e}")
            if attempt < UPSERT_RETRIES:
                delay = RETRY_BACKOFF[attempt - 1]
                log(f"    🔄 إعادة بعد {delay}s...")
                time.sleep(delay)

    log("    ❌ فشل نهائي في هذا الـ batch")
    return False


# ─── Process single file ──────────────────────────────────────────────────────
def process_file(
    jsonl_path:   Path,
    client,
    state:        dict,
    resume_chunk: str | None,
) -> tuple[int, int]:
    """
    يقرأ JSONL ويرفع لـ Qdrant.
    يرجع (success_count, skip_count).
    """
    stem      = jsonl_path.stem.replace(".embedded", "")
    log(f"  📄 {stem}")

    skip_until = resume_chunk
    batch      = []
    success    = 0
    skip       = 0
    skipped_r  = 0

    with open(jsonl_path, encoding="utf-8") as fin:
        for line in fin:
            line = line.strip()
            if not line:
                continue

            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                skip += 1
                continue

            chunk_id = record.get("chunk_id", "")
            vector   = record.get("vector",   [])

            # استئناف
            if skip_until:
                if chunk_id == skip_until:
                    skip_until = None
                skipped_r += 1
                continue

            if not vector or len(vector) != VECTOR_SIZE:
                log(f"    ⚠️  vector خاطئ للـ chunk: {chunk_id[:8]}")
                skip += 1
                continue

            batch.append(record)

            if len(batch) >= UPSERT_BATCH:
                ok = upsert_batch(client, batch)
                if ok:
                    success += len(batch)
                    # تحديث state
                    state["current_file"]  = stem
                    state["last_chunk_id"] = chunk_id
                    save_state(state)
                else:
                    skip += len(batch)
                batch = []

    # الـ batch الأخير
    if batch:
        last_id = batch[-1].get("chunk_id", "")
        ok = upsert_batch(client, batch)
        if ok:
            success += len(batch)
            state["current_file"]  = stem
            state["last_chunk_id"] = last_id
            save_state(state)
        else:
            skip += len(batch)

    if skipped_r > 0:
        log(f"    ⏭  تخطي {skipped_r} chunk (resume)")

    log(f"  ✅ {stem} — upserted: {success} | تخطي: {skip}")
    return success, skip


# ─── Post-index verification ──────────────────────────────────────────────────
def verify_collection(client, expected_count: int) -> None:
    """يتحقق من points_count بعد الـ indexing."""
    try:
        info   = client.get_collection(COLLECTION_NAME)
        actual = info.points_count or 0
        status = info.status

        log(f"🔍 التحقق من الـ collection:")
        log(f"   status        : {status}")
        log(f"   points_count : {actual:,}")
        log(f"   متوقع         : {expected_count:,}")

        if actual < expected_count:
            log(f"   ⚠️  points_count أقل من المتوقع — قد يكون بعض الـ chunks فشل")
        else:
            log(f"   ✅ points_count صحيح")

        # حفظ الـ summary
        summary = {
            "collection": COLLECTION_NAME,
            "status":     str(status),
            "points_count": actual,
            "expected_count": expected_count,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }
        SUMMARY_FILE.write_text(
            json.dumps(summary, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        log(f"   📄 summary: {SUMMARY_FILE}")

    except Exception as e:
        log(f"   ⚠️  فشل التحقق: {e}")


# ─── Main ─────────────────────────────────────────────────────────────────────
def main() -> None:
    global COLLECTION_NAME

    parser = argparse.ArgumentParser(description="index.py — رفع الـ chunks لـ Qdrant")
    parser.add_argument("--incremental", action="store_true",
                        help="upsert فقط — لا recreate للـ collection")
    parser.add_argument("--collection", type=str, default=None,
                        help="اسم مجموعة Qdrant (مثال: ahmed_kb). الافتراضي: من .env أو 'knowledge'")
    args = parser.parse_args()

    # ── تحديد اسم المجموعة: argument → .env → default ─────────
    if args.collection:
        COLLECTION_NAME = args.collection
    else:
        # محاولة قراءة من .env
        env_path = PIPELINE_DIR.parent / ".env"
        if env_path.exists():
            for line in env_path.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line.startswith("QDRANT_COLLECTION="):
                    COLLECTION_NAME = line[len("QDRANT_COLLECTION="):].strip()
                    break
    log(f"📦 Collection: {COLLECTION_NAME}")

    jsonl_files = sorted(EMBEDDED_DIR.glob("*.embedded.jsonl"))
    if not jsonl_files:
        log("❌ لا توجد ملفات في embedded/ — شغّل embed.py أولاً")
        sys.exit(1)

    # Qdrant client
    client = get_qdrant_client()

    # إعداد الـ collection
    setup_collection(client, args.incremental)

    # تحميل الـ state
    state     = load_state()
    processed = set(state.get("processed_files", []))

    total_success = 0
    total_skip    = 0

    for jsonl_path in jsonl_files:
        stem = jsonl_path.stem.replace(".embedded", "")

        # تخطي الملفات المكتملة
        if args.incremental and stem in processed:
            log(f"  ⏭  تخطي (مكتمل): {stem}")
            continue

        # resume point
        resume_chunk = None
        if args.incremental and state.get("current_file") == stem:
            resume_chunk = state.get("last_chunk_id")
            if resume_chunk:
                log(f"  🔄 استئناف من chunk: {resume_chunk[:8]}...")

        try:
            s, sk = process_file(jsonl_path, client, state, resume_chunk)
            total_success += s
            total_skip    += sk

            # وضع علامة اكتمال
            processed.add(stem)
            state["processed_files"] = list(processed)
            state["current_file"]    = None
            state["last_chunk_id"]   = None
            save_state(state)

        except Exception as e:
            log(f"  ❌ خطأ في {stem}: {e}")
            total_skip += 1
            continue

    # ── التحقق النهائي ─────────────────────────────────────────────────────────
    verify_collection(client, total_success)

    # ── ملخص ──────────────────────────────────────────────────────────────────
    log("─" * 50)
    log(f"✅ اكتمل index.py")
    log(f"   upserted : {total_success:,} chunk")
    log(f"   تخطي     : {total_skip:,} chunk")

    if total_success == 0:
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
