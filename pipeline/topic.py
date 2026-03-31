# pipeline/topic.py
"""
الخطوة الثالثة — Topic Modeling باستخدام BERTopic + CAMeL Arabic BERT
المدخل : pipeline/data/cleaned/*.clean.json
المخرج : pipeline/data/topics/*.topic.json + topics_map.json
"""

import argparse
import json
import sys
import time
from pathlib import Path

# ─── Paths ────────────────────────────────────────────────────────────────────
PIPELINE_DIR = Path(__file__).parent
DATA_DIR     = PIPELINE_DIR / "data"
CLEANED_DIR  = DATA_DIR / "cleaned"
TOPICS_DIR   = DATA_DIR / "topics"
MODEL_DIR    = TOPICS_DIR / "bertopic_model"
STATE_FILE   = TOPICS_DIR / "topic_state.json"
MAP_FILE     = TOPICS_DIR / "topics_map.json"

TOPICS_DIR.mkdir(parents=True, exist_ok=True)
MODEL_DIR.mkdir(parents=True, exist_ok=True)

# ─── Arabic stop words ────────────────────────────────────────────────────────
ARABIC_STOP_WORDS = [
    "في","من","إلى","على","عن","مع","هذا","هذه","ذلك","تلك",
    "التي","الذي","الذين","اللاتي","وهو","وهي","وهم","أن","إن",
    "كان","كانت","يكون","تكون","قد","لا","لم","لن","ما","هو",
    "هي","هم","نحن","أنت","أنا","كل","بعض","غير","حتى","إذا",
    "لكن","بل","أو","ثم","حين","عند","بعد","قبل","مثل","أي",
    "له","لها","لهم","به","بها","بهم","منه","منها","منهم",
    "عليه","عليها","عليهم","فيه","فيها","فيهم","وقد","وكان",
    "وإن","فإن","إذ","إذا","لو","لولا","كما","أما","أيضا",
    "فقط","حيث","بين","خلال","ضمن","وفق","نحو","دون","رغم",
]

# ─── Helpers ──────────────────────────────────────────────────────────────────
def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"processed_files": [], "model_trained": False}


def save_state(state: dict) -> None:
    STATE_FILE.write_text(
        json.dumps(state, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def load_topics_map() -> dict:
    if MAP_FILE.exists():
        try:
            return json.loads(MAP_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def save_topics_map(topics_map: dict) -> None:
    MAP_FILE.write_text(
        json.dumps(topics_map, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


# ─── Build BERTopic model ─────────────────────────────────────────────────────
def build_model():
    """يبني BERTopic model بالإعدادات المحددة."""
    log("  🔧 تهيئة BERTopic model...")

    from bertopic import BERTopic
    from sentence_transformers import SentenceTransformer
    from umap import UMAP
    from hdbscan import HDBSCAN
    from sklearn.feature_extraction.text import CountVectorizer

    # Embedding model
    log("  📥 تحميل CAMeL Arabic BERT...")
    embedding_model = SentenceTransformer("CAMeL-Lab/bert-base-arabic-camelbert-mix")

    umap_model = UMAP(
        n_neighbors  = 15,
        n_components = 5,
        metric       = "cosine",
        random_state = 42,
    )

    hdbscan_model = HDBSCAN(
        min_cluster_size = 5,
        min_samples      = 3,
        prediction_data  = True,
    )

    vectorizer_model = CountVectorizer(
        stop_words  = ARABIC_STOP_WORDS,
        ngram_range = (1, 2),
    )

    topic_model = BERTopic(
        embedding_model  = embedding_model,
        umap_model       = umap_model,
        hdbscan_model    = hdbscan_model,
        vectorizer_model = vectorizer_model,
        nr_topics        = "auto",
        top_n_words      = 10,
        verbose          = True,
    )

    return topic_model


# ─── Build topics map ─────────────────────────────────────────────────────────
def build_topics_map(topic_model, topics: list[int], docs: list[str]) -> dict:
    """يبني topics_map.json من نتائج الـ model."""
    from collections import Counter

    topic_info = topic_model.get_topic_info()
    count_map  = Counter(topics)

    topics_map = {}
    for _, row in topic_info.iterrows():
        tid = int(row["Topic"])

        if tid == -1:
            label    = "عام"
            keywords = []
        else:
            raw_words = topic_model.get_topic(tid)
            keywords  = [w for w, _ in raw_words] if raw_words else []
            # Label = أول كلمة مفتاحية ذات معنى
            label = keywords[0] if keywords else f"موضوع {tid}"

        topics_map[str(tid)] = {
            "label":    label,
            "keywords": keywords[:10],
            "count":    count_map.get(tid, 0),
        }

    return topics_map


# ─── Process sections ─────────────────────────────────────────────────────────
def collect_all_sections(clean_files: list[Path]) -> tuple[list[str], list[dict]]:
    """يجمع كل الـ sections من كل الملفات."""
    docs  = []
    meta  = []

    for f in clean_files:
        data = json.loads(f.read_text(encoding="utf-8"))
        for sec in data.get("sections", []):
            content = sec.get("content", "").strip()
            if content:
                docs.append(content)
                meta.append({
                    "file_name": data["file_name"],
                    "section":   sec,
                    "stem":      f.stem.replace(".clean", ""),
                })

    return docs, meta


# ─── Main ─────────────────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(description="topic.py — Topic Modeling")
    parser.add_argument("--incremental", action="store_true",
                        help="transform فقط لو الـ model موجود — لا إعادة تدريب")
    args = parser.parse_args()

    clean_files = sorted(CLEANED_DIR.glob("*.clean.json"))
    if not clean_files:
        log("❌ لا توجد ملفات في cleaned/ — شغّل clean.py أولاً")
        sys.exit(1)

    state     = load_state()
    processed = set(state.get("processed_files", []))

    # ── Incremental: تحديد الملفات الجديدة ────────────────────────────────────
    if args.incremental:
        new_files = [f for f in clean_files
                     if f.stem.replace(".clean", "") not in processed]
        log(f"🔄 Incremental — {len(new_files)} ملف جديد")
        if not new_files:
            log("✅ لا توجد ملفات جديدة")
            sys.exit(0)
        files_to_process = new_files
    else:
        files_to_process = clean_files
        log(f"🔁 Full run — {len(files_to_process)} ملف")

    # ── تحميل الـ libraries ────────────────────────────────────────────────────
    log("📦 تحميل المكتبات...")
    try:
        from bertopic import BERTopic
    except ImportError:
        log("❌ bertopic غير مثبت — شغّل: pip install bertopic")
        sys.exit(1)

    # ── جمع الـ docs ───────────────────────────────────────────────────────────
    log("📂 جمع الـ sections...")
    docs, meta = collect_all_sections(files_to_process)
    log(f"   {len(docs)} section جاهزة للتحليل")

    if len(docs) < 30:
        log(f"⚠️  عدد الـ sections قليل ({len(docs)} < 30) — تعيين موضوع لكل ملف مباشرة")
        
        # بناء topics_map من أسماء الملفات
        topics_map = {}
        topic_id_counter = 0
        file_topic_map = {}  # filename → topic_id
        
        for f in files_to_process:
            stem = f.stem.replace(".clean", "")
            # استخراج اسم وصفي من اسم الملف
            label = stem.replace("-", " ").replace("_", " ")
            # إزالة الأرقام البادئة مثل "01 "
            import re
            label = re.sub(r"^\d+\s*", "", label).strip() or stem
            
            file_topic_map[str(f)] = topic_id_counter
            topics_map[str(topic_id_counter)] = {
                "label":    label,
                "keywords": [],
                "count":    0,
            }
            topic_id_counter += 1
        
        save_topics_map(topics_map)
        log(f"   {len(topics_map)} موضوع — تم الحفظ")

        # كتابة ملفات الـ topic لكل ملف
        for f in files_to_process:
            stem = f.stem.replace(".clean", "")
            tid  = file_topic_map[str(f)]
            tlbl = topics_map[str(tid)]["label"]
            
            if not f.exists():
                continue
            with open(f, encoding="utf-8") as fh:
                clean_data = json.load(fh)

            sec_count = 0
            for sec in clean_data.get("sections", []):
                sec["topic_id"]       = tid
                sec["topic_label"]    = tlbl
                sec["topic_keywords"] = []
                sec_count += 1
            
            topics_map[str(tid)]["count"] = sec_count

            out_path = TOPICS_DIR / f"{stem}.topic.json"
            with open(out_path, "w", encoding="utf-8") as fh:
                json.dump(clean_data, fh, ensure_ascii=False, indent=2)

            state["processed_files"].append(str(f))
            save_state(state)
            log(f"   ✅ {f.name} → موضوع: {tlbl} ({sec_count} sections)")

        # تحديث topics_map بالأعداد النهائية
        save_topics_map(topics_map)
        log("✅ اكتمل topic.py (file-based fallback mode)")
        sys.exit(0)

    # ── Fit أو Transform ───────────────────────────────────────────────────────
    model_exists = (MODEL_DIR / "topic_model").exists() or \
                   any(MODEL_DIR.iterdir()) if MODEL_DIR.exists() else False

    if args.incremental and model_exists:
        log("🔄 Incremental mode — تحميل الـ model الموجود...")
        topic_model = BERTopic.load(str(MODEL_DIR))
        log("🔍 Transform الـ sections الجديدة...")
        topics, _   = topic_model.transform(docs)
    else:
        log("🏋️  Full fit — تدريب الـ model (قد يستغرق بضع دقائق)...")
        # جمع كل الملفات للـ fit
        all_docs, all_meta = collect_all_sections(clean_files)
        topic_model = build_model()
        topics, _   = topic_model.fit_transform(all_docs)
        docs        = all_docs
        meta        = all_meta
        log("💾 حفظ الـ model...")
        topic_model.save(str(MODEL_DIR), serialization="safetensors",
                         save_ctfidf=True, save_embedding_model=True)

    # ── بناء topics_map ────────────────────────────────────────────────────────
    log("🗺️  بناء topics_map.json...")
    topics_map = build_topics_map(topic_model, topics, docs)
    save_topics_map(topics_map)
    log(f"   {len(topics_map)} موضوع مكتشف")

    # ── تجميع النتائج لكل ملف ─────────────────────────────────────────────────
    # نبني dict: stem → list of (section_index, topic_id)
    file_topics: dict[str, list] = {}
    for i, m in enumerate(meta):
        stem = m["stem"]
        if stem not in file_topics:
            file_topics[stem] = []
        file_topics[stem].append((m["section"], topics[i]))

    # ── كتابة ملفات .topic.json ────────────────────────────────────────────────
    success = 0
    for stem, sec_topics in file_topics.items():
        clean_path = CLEANED_DIR / f"{stem}.clean.json"
        if not clean_path.exists():
            continue

        clean_data = json.loads(clean_path.read_text(encoding="utf-8"))

        # أضف topic info لكل section
        enriched_sections = []
        sec_topic_iter = iter(sec_topics)
        for sec in clean_data.get("sections", []):
            content = sec.get("content", "").strip()
            if not content:
                enriched_sections.append(sec)
                continue
            try:
                _, tid = next(sec_topic_iter)
            except StopIteration:
                tid = -1

            tid_str    = str(tid)
            topic_info = topics_map.get(tid_str, {"label": "عام", "keywords": []})

            enriched_sections.append({
                **sec,
                "topic_id":       int(tid),
                "topic_label":    topic_info["label"],
                "topic_keywords": topic_info.get("keywords", []),
            })

        result = {
            "file_name":     clean_data["file_name"],
            "clean_text":    clean_data["clean_text"],
            "sections":      enriched_sections,
            "section_count": len(enriched_sections),
        }

        out_path = TOPICS_DIR / f"{stem}.topic.json"
        out_path.write_text(
            json.dumps(result, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        processed.add(stem)
        state["processed_files"] = list(processed)
        state["model_trained"]   = True
        save_state(state)
        success += 1
        log(f"  ✅ {stem}")

    # ── ملخص ──────────────────────────────────────────────────────────────────
    log("─" * 50)
    log(f"✅ اكتمل topic.py — {success} ملف")
    log(f"   topics_map: {MAP_FILE}")
    log(f"   ⚠️  راجع topics_map.json يدوياً وعدّل الـ labels لو احتجت")

    if success == 0:
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
