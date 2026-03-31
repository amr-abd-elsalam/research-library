# pipeline/run_all.py
"""
Orchestrator — يشغّل خطوات الـ pipeline بالترتيب:
extract → clean → topic → chunk → embed → index
"""

import argparse
import subprocess
import sys
import time
from pathlib import Path

# ─── Constants ────────────────────────────────────────────────────────────────
PIPELINE_DIR = Path(__file__).parent
STEPS = [
    ("extract", "extract.py"),
    ("clean",   "clean.py"),
    ("topic",   "topic.py"),
    ("chunk",   "chunk.py"),
    ("embed",   "embed.py"),
    ("index",   "index.py"),
]

# ─── Helpers ──────────────────────────────────────────────────────────────────
def log(msg: str) -> None:
    timestamp = time.strftime("%H:%M:%S")
    print(f"[{timestamp}] {msg}", flush=True)

def log_separator() -> None:
    print("─" * 60, flush=True)

def run_step(
    step_name: str,
    script:    str,
    input_dir: str | None,
    incremental: bool,
    collection: str | None = None,
) -> bool:
    """
    يشغّل خطوة واحدة من الـ pipeline.
    يرجع True لو نجحت، False لو فشلت.
    """
    log_separator()
    log(f"▶  بدء خطوة: {step_name}")

    cmd = [sys.executable, str(PIPELINE_DIR / script)]

    if input_dir and step_name == "extract":
        cmd += ["--input", input_dir]

    if incremental:
        cmd += ["--incremental"]

    if collection and step_name == "index":
        cmd += ["--collection", collection]

    start = time.time()
    result = subprocess.run(cmd, cwd=str(PIPELINE_DIR))
    elapsed = time.time() - start

    if result.returncode == 0:
        log(f"✅ {step_name} — اكتملت في {elapsed:.1f}s")
        return True
    else:
        log(f"❌ {step_name} — فشلت (exit code {result.returncode})")
        return False


# ─── Main ─────────────────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Pipeline Orchestrator — extract → clean → topic → chunk → embed → index"
    )
    parser.add_argument(
        "--input",
        type=str,
        default=None,
        help="مسار مجلد الملفات المدخلة (مطلوب للتشغيل الأول)",
    )
    parser.add_argument(
        "--incremental",
        action="store_true",
        help="تشغيل incremental — يتخطى الملفات المعالجة مسبقاً",
    )
    parser.add_argument(
        "--from-step",
        type=str,
        default=None,
        choices=[s[0] for s in STEPS],
        help="ابدأ من خطوة معينة (مفيد عند إعادة التشغيل بعد خطأ)",
    )
    parser.add_argument(
        "--collection",
        type=str,
        default=None,
        help="اسم مجموعة Qdrant (يُمرَّر لـ index.py). مثال: ahmed_kb",
    )
    args = parser.parse_args()

    # ── Validate input ────────────────────────────────────────────────────────
    if not args.incremental and args.input is None:
        parser.error("--input مطلوب عند التشغيل الأول (بدون --incremental)")

    if args.input and not Path(args.input).is_dir():
        parser.error(f"المجلد غير موجود: {args.input}")

    # ── Print header ──────────────────────────────────────────────────────────
    log_separator()
    log("🚀 Pipeline Orchestrator — بدء التشغيل")
    if args.input:
        log(f"   المدخلات : {args.input}")
    log(f"   الوضع     : {'incremental' if args.incremental else 'full'}")
    if args.from_step:
        log(f"   ابتداءً من: {args.from_step}")
    if args.collection:
        log(f"   المجموعة  : {args.collection}")
    log_separator()

    # ── Determine start index ─────────────────────────────────────────────────
    step_names = [s[0] for s in STEPS]
    start_idx  = 0
    if args.from_step:
        start_idx = step_names.index(args.from_step)

    # ── Run steps ─────────────────────────────────────────────────────────────
    total_start = time.time()
    failed_step = None

    for i, (step_name, script) in enumerate(STEPS):
        if i < start_idx:
            log(f"⏭  تخطي: {step_name}")
            continue

        success = run_step(
            step_name   = step_name,
            script      = script,
            input_dir   = args.input,
            incremental = args.incremental,
            collection  = args.collection,
        )

        if not success:
            failed_step = step_name
            break

    # ── Summary ───────────────────────────────────────────────────────────────
    total_elapsed = time.time() - total_start
    log_separator()

    if failed_step:
        log(f"❌ Pipeline توقفت عند خطوة: {failed_step}")
        log(f"   لإعادة التشغيل من نفس الخطوة:")
        flag = "--incremental" if args.incremental else ""
        input_flag = f"--input {args.input}" if args.input else ""
        log(f"   python run_all.py {input_flag} {flag} --from-step {failed_step}".strip())
        sys.exit(1)
    else:
        log(f"🎉 Pipeline اكتملت بنجاح في {total_elapsed:.1f}s")
        log("   الخطوة التالية: تحقق من /api/health → vectors_count")
        sys.exit(0)


if __name__ == "__main__":
    main()
