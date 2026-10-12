"""Drafts the missing lesson scripts for the Video Lesson Creator.

Reads data/training_courses.json and writes an 8-section teleprompter plan for
every lesson that has no draft in lesson_drafts/ yet, using the workshop
Gemini connector. The existing 37 human-authored drafts (intermediate,
advanced, pro) are the format exemplar and are never touched.

Run:  uv run scripts/generate_lesson_drafts.py [--limit N] [--only COURSE_ID]
Resumable: existing files are skipped, so re-running continues where it stopped.
"""
import argparse
import json
import os
import re
import sys
import time

import httpx

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# same engine the app's coach uses: direct Google API, key from the app's
# runtime settings (Setup page) with env fallback — never printed or logged
BASE = "https://generativelanguage.googleapis.com/v1beta"
MODEL = "gemini-flash-lite-latest"


def _load_key() -> str:
    try:
        cfg = json.load(open(os.path.join(ROOT, "runtime_settings.json")))
        if cfg.get("api_key"):
            return cfg["api_key"]
    except Exception:
        pass
    return os.environ.get("GEMINI_API_KEY") or ""


KEY = _load_key()

# course id -> (draft folder, filename prefix)
COURSE_DRAFTS = {
    "beginner-class": ("beginner", "beginner"),
    "shoot-the-moon": ("fun", "moon"),
    "following-the-rainbow": ("fun", "rainbow"),
    "northern-lights": ("fun", "aurora"),
    "free-exposure-triangle": ("legacy", "et"),
    "intro-digital-photography": ("legacy", "idp"),
    "free-motion-and-blur": ("legacy", "mb"),
    "photography-masterclass": ("legacy", "pm"),
    "portrait-course": ("legacy", "portrait"),
    "street-course": ("legacy", "street"),
    "fine-art-course": ("legacy", "fine-art"),
    "night-celestial-course": ("legacy", "night"),
    "commercial-photography": ("business", "commercial"),
    "post-processing-course": ("business", "post"),
    "wedding-event-playbook": ("playbooks", "wedding"),
    "wildlife-playbook": ("playbooks", "wildlife"),
    "food-playbook": ("playbooks", "food"),
    "pet-playbook": ("playbooks", "pet"),
    "sports-playbook": ("playbooks", "sports"),
    "macro-playbook": ("playbooks", "macro"),
    "fashion-playbook": ("playbooks", "fashion"),
    "travel-playbook": ("playbooks", "travel"),
    "underwater-playbook": ("playbooks", "underwater"),
    "conceptual-playbook": ("playbooks", "conceptual"),
    "nikon-school-course": ("hidden", "nikon"),
    "online-workshops-course": ("hidden", "workshops"),
}

SECTIONS = [
    ("1. LEARNING OUTCOME", "outcome"),
    ("2. TIMED LESSON OUTLINE", "outline"),
    ("3. NARRATION SCRIPT", "narration"),
    ("4. VISUAL AND SHOT PLAN", "visual"),
    ("5. AI VIDEO CLIP PROMPTS", "aiprompts"),
    ("6. LEARNER PRACTICE", "practice"),
    ("7. RECAP", "recap"),
    ("8. ACCURACY CHECK", "accuracy"),
]

COURSE_HINTS = {
    "shoot-the-moon": "Moon photography: teach the Looney 11 rule (f/11 at ISO 100, shutter = 1/ISO), ISO 800-3200 working range, spot metering on the moon, tripod + manual focus. Family-friendly, wonder-driven tone.",
    "northern-lights": "Aurora photography: the working card is ISO 800-3200, 2.5-6s, f/1.4-4, WB ~3500K, flash OFF, IS OFF, sturdy tripod, manual focus to infinity, finish in Lightroom. Set expectations: auroras are hunted, not scheduled.",
    "following-the-rainbow": "Rainbow/chasing-light course: sun-behind-you geometry, 42-degree bow, double bows and supernumeraries, polarizer tricks (darken sky, NOT the rainbow), landscape framing with the bow as a supporting element.",
    "free-exposure-triangle": "Free beginner course, priority-first teaching arc: the student chooses ONE priority (freeze motion, blur background, or low light) and the other two legs adapt. This arc was authored deliberately - keep it.",
    "beginner-class": "The flagship beginner class: absolute-beginner friendly, warm and encouraging, no jargon without an instant plain-language definition, always end sections with one small win the student can try today.",
    "commercial-photography": "Business-of-photography lessons for working pros: pricing, licensing, client management. Concrete numbers and example clauses over theory.",
    "nikon-school-course": "Placeholder partner-style course (currently hidden in the app): generic brand-workshop framing, keep content brand-neutral.",
    "online-workshops-course": "Placeholder partner-style course (currently hidden in the app): generic online-workshop framing, keep content brand-neutral.",
}

SYSTEM = """You are the curriculum writer for the "AI Photography Instructor", a photography
school app by MuskegMan Photography (Alaska). You write teleprompter-ready video lesson
plans that a presenter will read on camera while showing live camera-simulator demos.

Voice rules:
- Warm, practical photographer-to-photographer. Never shame the student; frame every
  mistake as normal and fixable.
- Plain language. Every piece of jargon gets a one-line definition the moment it appears.
- Concrete numbers everywhere: real ISO values, shutter speeds, apertures. Settings must
  be plausible for the camera context given.
- Short spoken sentences that read naturally out loud (contractions, direct address,
  "you" not "the user").
- Family-friendly content only.

Structure rules - the output is ONE markdown document with EXACTLY these eight H2
sections, in this order:
## 1. LEARNING OUTCOME
## 2. TIMED LESSON OUTLINE
## 3. NARRATION SCRIPT
## 4. VISUAL AND SHOT PLAN
## 5. AI VIDEO CLIP PROMPTS
## 6. LEARNER PRACTICE
## 7. RECAP
## 8. ACCURACY CHECK

Section content rules:
- LEARNING OUTCOME: 1-3 sentences. "By the end, the student can <observable skill>."
- TIMED LESSON OUTLINE: timestamped beats (0:00 hook, ...) matching the target duration.
- NARRATION SCRIPT: the actual words the presenter speaks, reaching the target word count
  (about 140 spoken words per minute of target duration). Written as flowing paragraphs.
- VISUAL AND SHOT PLAN: bullet list of what appears on screen for each beat - presenter
  shots, simulator demos, example photos, b-roll. The presenter decides exact placement
  later; you suggest.
- AI VIDEO CLIP PROMPTS: 2-4 short text-to-video prompts for optional AI-generated b-roll
  clips (subject, motion, lighting, mood - no text in frame).
- LEARNER PRACTICE: one concrete drill referencing the practice brief given (if any).
- RECAP: 3-5 bullet takeaways.
- ACCURACY CHECK: 3 quick self-check questions with answers, verifying technical accuracy.

Output ONLY the markdown document. First line: "# <Course Title> Lesson <N> - <Lesson Title>"
"""

EXCERPT_EXEMPLAR = """
## 1. LEARNING OUTCOME
By the end, the student can shoot a full manual session...

## 3. NARRATION SCRIPT (excerpt of the voice)
"Welcome back. Today we put M mode to work — and I promise, by the end of this
lesson you'll stop fearing that dial..." (short spoken sentences, concrete numbers,
direct address, one small win per section)
"""


def slug(s: str) -> str:
    s = s.lower().replace("’", "").replace("'", "")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:48] or "lesson"


def build_prompt(course: dict, lesson: dict, index: int) -> str:
    target_words = int(lesson.get("duration_min", 5) * 140)
    brief = lesson.get("practice_brief") or "(no practice preset for this lesson)"
    hint = COURSE_HINTS.get(course["id"], "")
    return f"""Write the complete 8-section lesson plan as ONE markdown document.

Course: {course['title']} ({course['id']})
Lesson number: {index + 1} of {len(course['lessons'])}
Lesson title: {lesson['title']}
Target duration: {lesson.get('duration_min', 5)} minutes (narration script should reach about {target_words} spoken words)
Existing lesson summary (use as the backbone, expand it): {lesson.get('summary', '')}
Practice brief to build section 6 around: {brief}
Course-specific guidance: {hint or "standard photography lesson"}

Remember: only the 8 H2 sections in order, first line is the H1 title, narration hits the
word target, settings are concrete, voice is warm and spoken-style.

{EXCERPT_EXEMPLAR}"""


REQUIRED = [heading for heading, _ in SECTIONS]


def validate(md: str) -> list[str]:
    upper = md.upper()
    return [kw for kw in REQUIRED if kw.upper() not in upper]


def generate(course: dict, lesson: dict, index: int) -> str:
    prompt = build_prompt(course, lesson, index)
    contents = [{"role": "user", "parts": [{"text": prompt}]}]
    text = ""
    for attempt in range(2):
        resp = httpx.post(
            f"{BASE}/models/{MODEL}:generateContent",
            headers={"x-goog-api-key": KEY},
            json={
                "system_instruction": {"parts": [{"text": SYSTEM}]},
                "contents": contents,
                "generationConfig": {"temperature": 0.6, "maxOutputTokens": 8192},
            },
            timeout=120,
        )
        resp.raise_for_status()
        data = resp.json()
        candidates = data.get("candidates") or []
        parts = (candidates[0].get("content", {}).get("parts") if candidates else []) or []
        text = "".join(p.get("text", "") for p in parts).strip()
        missing = validate(text)
        if not missing:
            return text
        print(f"    retry (missing: {missing})", flush=True)
        contents = contents + [
            {"role": "model", "parts": [{"text": text[:4000]}]},
            {"role": "user", "parts": [{"text": "Your output was missing sections: " + ", ".join(missing) + ". Rewrite the COMPLETE document with all 8 sections."}]},
        ]
    return text  # best effort after retry


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="max lessons to generate this run")
    ap.add_argument("--only", default="", help="only this course id")
    args = ap.parse_args()

    data = json.loads(open(os.path.join(ROOT, "data", "training_courses.json")).read())
    out_root = os.path.join(ROOT, "lesson_drafts")

    todo = []
    for course in data["courses"]:
        if course["id"] not in COURSE_DRAFTS:
            continue  # human-authored drafts already exist
        if args.only and course["id"] != args.only:
            continue
        folder, prefix = COURSE_DRAFTS[course["id"]]
        for i, lesson in enumerate(course["lessons"]):
            path = os.path.join(out_root, folder, f"{prefix}-{i + 1:02d}-{slug(lesson['title'])}.md")
            if os.path.exists(path):
                continue
            todo.append((course, lesson, i, path))

    print(f"{len(todo)} lessons to draft", flush=True)
    if not KEY:
        print("no API key found (runtime_settings.json / GEMINI_API_KEY) — aborting", flush=True)
        sys.exit(1)
    if args.limit:
        todo = todo[: args.limit]
        print(f"limited to {len(todo)}", flush=True)

    done = 0
    for course, lesson, i, path in todo:
        folder, _ = COURSE_DRAFTS[course["id"]]
        title = f"{course['title']} Lesson {i + 1} — {lesson['title']}"
        print(f"[{done + 1}/{len(todo)}] {course['id']} #{i + 1}: {lesson['title']}", flush=True)
        try:
            md = generate(course, lesson, i)
        except Exception as exc:
            print(f"    ERROR: {exc}", flush=True)
            time.sleep(6)
            continue
        if not md.startswith("#"):
            md = f"# {title}\n\n" + md
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            f.write("<!-- ai-drafted — review before recording -->\n\n" + md.rstrip() + "\n")
        missing = validate(md)
        print(f"    saved ({'complete' if not missing else 'INCOMPLETE: ' + ', '.join(missing)})", flush=True)
        done += 1
        time.sleep(4)  # stay friendly to free-tier rate limits

    print(f"done: {done} drafted", flush=True)


if __name__ == "__main__":
    main()
