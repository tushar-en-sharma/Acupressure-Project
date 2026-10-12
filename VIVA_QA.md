# Viva / Defense Q&A

Anticipated questions from evaluators (dataset, methodology, evaluation,
architecture, and limitations), with straight answers grounded in what is
actually implemented in this repository. Cross-references point to
`RESEARCH_RECORD.md` (full methodology/results log) and `MODEL_DIFF.md`
(exact code-change history) for anyone who wants the underlying detail.

---

## 1. Dataset

**Q: What dataset did you use, and why this one?**
The **11k Hands** dataset (M. Afifi, *Multimedia Tools and Applications*,
2019) — 11,076 dorsal/palmar hand photographs with metadata (age, gender,
skin colour, which aspect of the hand is shown). It was chosen because it's
public, large, and already has both palm and back-of-hand images with
consistent framing, which is exactly the two orientations this system needs
to detect (palm-facing vs back-facing points).

**Q: Where does your ground truth (the "correct" point locations) come
from, and how much do you have?**
Two tiers:
1. **Points 0–20** are MediaPipe's own output — not annotated by us at all,
   treated as exact.
2. **Points 21–50** (30 learned finger points) have real human-verified
   ground truth: 50 images, hand-corrected using a custom Tkinter annotator
   (`model/annotate.py`) that pre-seeds every point from the current model
   so a session is correction-only, not labelling from scratch.

**Q: Only 50 images? Isn't that small?**
Yes — and this is the project's most important honestly-stated limitation.
50 images is enough to fit a **geometric** model (2 numbers per point,
expressed relative to a MediaPipe bone — see §2) because that model has
very few parameters and generalises by construction, not by memorising
pixels. It is not enough to trust a high-parameter model blindly, which is
why the ridge-regression model (§2) is validated with exact leave-one-out
cross-validation rather than a simple train/test split, and why a genuinely
held-out evaluation (§3) is reported alongside the same-set number.

**Q: Do the palm points (51–63) have ground truth?**
**No — this is stated explicitly, not hidden.** They come from a fixed
geometric formula (`core/common.py::_palm_formula`) that was only ever
**qualitatively audited** (rendered on 20 unseen images and visually
checked for plausibility — RESEARCH_RECORD.md §9, 2026-08-19 entry), never
measured against real labelled coordinates. Three of the original five
clinical points (GV1, CV8, CV4) live in this unverified range. This is
flagged, not glossed over, in every relevant document.

**Q: How did you avoid a very specific data-integrity bug — a model
predicting its own earlier output and scoring itself as "correct"?**
An actual bug of exactly this shape was found and fixed: `annotate.py` used
to tag *every* point 21–63 as `source=custom` on save, even points a person
never touched — so an untouched model-seeded point could later be trained
on or evaluated against itself (zero error, but meaningless). Fixed by
tracking which points were actually dragged per image
(`human_verified` vs `model_seed`), and restricting training/evaluation to
`core.common.TRUSTED_SOURCES = {"mediapipe", "custom", "human_verified",
"ai_vision"}` — `model_seed` rows are never trusted. See RESEARCH_RECORD.md
§9 ("2026-08-19 — Environment rebuild...") for the full incident.

**Q: What about bias — different skin tones, ages, hand sizes?**
The 11k Hands metadata (`dataset/HandInfo.csv`) tags age, gender, and skin
colour, and the qualitative palm-point audit deliberately sampled across
these plus 4 images flagged "irregular" (skin marks). No formal per-subgroup
accuracy breakdown has been computed yet — that is listed as planned future
work (stratified evaluation by these existing metadata tags), not done.

---

## 2. Point-placement methodology

**Q: How does a hand-drawn/learned point actually get placed from just a
MediaPipe skeleton?**
Every custom point is expressed relative to one **bone** — a vector between
two of MediaPipe's 21 raw landmarks (`anchor` and `parent`, with `parent`
chosen via `MP_PARENT`, the fixed hand kinematic-parent table):
```
p[point] = p[anchor] + perp_coef · |bone| · perp_dir + along_coef · |bone| · bone_dir
```
Because the offset is scaled by the bone's own length and rotated with the
bone's own direction, the two numbers `(perp_coef, along_coef)` are
**invariant to hand position, size, and rotation**. Training just averages
these two numbers per point across every annotated image; inference
re-applies them to any new hand. This is *why* 50 images generalise across
11,000+ photos and an arbitrary webcam feed: the model isn't memorising
pixel coordinates, it's learning a fixed anatomical ratio.

**Q: You mentioned two different models — geometry and ridge. What's the
difference, and why have both?**
- **Geometry** (`_geom_point`): one point from *one* local bone, 2 fitted
  parameters. Cheap, robust, but can't capture a point whose position
  depends on more than one part of the hand (e.g. thumb points also depend
  on finger spread, not just the local thumb bone).
- **Ridge** (`_ridge_point`): regresses a point from the *whole hand's*
  shape — all 21 MediaPipe points expressed in a translation/rotation/
  scale-invariant canonical frame, flattened to 42 features, ridge-
  regressed to the target (42×2 + 2 parameters). Captures cross-hand
  dependencies the single-bone model can't.

**Q: How did you decide which model to use for which point — did you just
pick the better-looking one?**
No — **exact leave-one-out cross-validation**, point by point: every one of
the 50 images is refit with that image held out, for *both* model types, and
whichever has the lower LOO error is kept for that specific point index.
Result: 29 of 30 points chose ridge (mean LOO MAE 0.0330 → 0.0110, a real,
held-out-validated 67% error reduction); 1 point (thumb-region point 24)
still uses geometry because ridge was measurably worse there. Both model
files are preserved (`geometry_model_51pt.pkl`, byte-identical to the
original commit; `geometry_model_v2_hybrid.pkl`, the new hybrid) — nothing
was silently overwritten.

**Q: What's the actual difference between "leave-one-out" and "held-out"
evaluation, and why report both?**
LOO refits the model 50 times (once per image held out) and is the more
statistically efficient use of a small dataset, but it only tells you the
model generalises *within this dataset's distribution* (same studio
photography, plain background). A held-out split (35 train / 15 test,
fixed seed) is a single, simpler train/test separation reported alongside
it as a sanity check — both point the same direction (v2 beats v1
substantially), which is why the result is trusted rather than treated as a
fitting artifact. See `model/holdout_compare.py` for the exact apples-to-
apples implementation (same split fed to both models).

**Q: The new points (LI4, HT7, the fingertip points, palm-centre point,
etc.) — where did those come from, and were they manually annotated?**
No new manual annotation was done for these (explicitly avoided per
project direction — hand-annotation doesn't scale and is time-consuming).
Two placement strategies were used instead:
1. **Reused existing, already-computed landmarks.** Seven of the eight new
   points (LU11, LI1, PC9, TE1, SI1, HT9, PC8, HT8, SI3) are real classical
   acupoints whose anatomical location happens to coincide with a landmark
   the pipeline already computes — the five fingertips (raw MediaPipe
   points 4/8/12/16/20, for the classical "Jing-well" points) and two of
   the existing palm-formula points (51 = palm centre = Laogong PC8; 55 =
   hypothenar region = Shaofu HT8; 57 = ulnar palm border = Houxi SI3). No
   new geometry was written for these at all — they piggyback on math
   already validated for other purposes.
2. **New analytical formulas for two points** (LI4 Hegu, HT7 Shenmen) that
   aren't part of the existing 64-point set — computed on demand with the
   *same* bone-relative invariant-frame math as `_geom_point`, just with
   hand-specified (not fitted) coefficients derived from each point's
   standard anatomical description (e.g. LI4 = midpoint of the bone between
   the thumb MCP and index MCP, on the dorsal side). See
   `core.common._formula_point` and the `ACU_POINTS` dict's `"formula"`-kind
   entries.

**Q: How do you know those two new formulas are actually correctly
placed, without any ground truth to check them against?**
Honestly: **they aren't verified yet** — they are explicitly documented in
code comments and `RESEARCH_RECORD.md`/this file as a **draft pending
review by a licensed practitioner**, the same status the original palm
formula had before its qualitative audit. What *was* done: each formula was
numerically sanity-checked against 6 real (non-synthetic) hand images
pulled from the cached MediaPipe output
(`tests/fixtures/mediapipe_21_samples.json`) to confirm the output lands
inside the image bounds `[0,1]×[0,1]` in every case, and — for HT7
specifically — a self-correcting mechanism (`perp_pick_toward`) was added
so the point consistently lands on the anatomically correct (ulnar) side of
the wrist regardless of which raw hand/mirroring MediaPipe reports, rather
than guessing a fixed sign that would be right for only one hand orientation.
That is a plausibility check, not a placement validation — the next real
step is the same practitioner-audit loop already used for the palm points.

**Q: What's this "hand acupoint" vs "hand reflex" distinction I see
throughout the code and docs?**
A deliberate, disclosed split of two different paradigms that were
otherwise silently mixed in the original 5-point design:
- **`hand_acupoint`** — the point's real classical location genuinely *is*
  on the hand (e.g. LI4 Hegu, the Jing-well fingertip points). Anatomically
  correct as drawn.
- **`hand_reflex`** — the original 5 points (Lu5, BL60, GV1, CV8, CV4).
  Their real classical locations are actually elsewhere on the body — Lu5
  at the elbow crease, BL60 at the ankle, GV1 at the tailbone, CV8 at the
  navel, CV4 on the lower abdomen. The project borrows these points' names
  and real clinical indications and maps them onto hand *reflex zones*, a
  legitimate but different paradigm (hand reflexology / microsystem
  correspondence, akin to auriculotherapy or foot reflexology) — not a
  claim that e.g. "BL60" is anatomically on the hand. Every point and every
  API response carries this `system` tag explicitly so nobody — especially
  a licensed practitioner reviewing it — is misled about which kind of
  point they're looking at.

---

## 3. The problem → point mapping (single- and multi-point)

**Q: How does the system decide a "problem" is solved?**
Each problem (`core.common.PROBLEMS`) defines one or more **protocols** —
alternative ways to solve it — where each protocol is a list of required
point labels. `resolve_problems()` checks, per protocol, whether *every*
listed point is currently detected (correct point, correct hand face
showing, in frame); a problem is "complete" the moment any one of its
protocols is fully satisfied. This directly supports:
- **Single-point solutions** (e.g. Chronic Bronchitis needs only Lu5).
- **Multi-point / AND-logic solutions** (e.g. Sore Throat needs *both*
  LU11 and LI1 simultaneously — finding just one does not count; see
  `tests/test_common_unit.py::test_multi_point_problem_incomplete_
  without_all_points`, which asserts exactly this).
- **Alternative single-point routes to the same problem** (e.g. Headache
  is solved by CV4 *or* by LI4 alone — either is sufficient, demonstrated
  live in `tests/test_common_unit.py::test_alternative_protocols_
  either_solves_it`).

**Q: Can one point serve more than one problem?**
Yes, by design — e.g. PC8 (Laogong) is used both for "Mouth Ulcers" and as
one option for "Anxiety / Palpitations". The data model is genuinely
many-to-many, replacing the original rigid one-index-to-one-condition
dictionary (`ACUPRESSURE`).

**Q: What happens if a multi-point protocol needs points that require
different hand orientations (one palm, one back) — can a user ever
complete it?**
This was caught and fixed during implementation: "Stiff Neck" originally
paired SI3 (assigned "palm") with TE1 ("back") — physically impossible to
satisfy with one hand shown once, since a hand can only present one face to
the camera at a time. SI3 was reassigned to "back" so both required points
share one face and the protocol is completable with a single hand shown
once. (A mixed-face multi-point protocol is *not* inherently impossible in
this system — both hands can be shown simultaneously in different
orientations, since the resolver aggregates points across every detected
hand — but that should be an intentional two-handed design choice, not an
accident, so single-hand completability was fixed here as the default
expectation.)

**Q: How does "select a problem" actually change what I see on the
video?**
The frontend calls `POST /api/focus/` with the chosen problem name, which
the backend's `CameraManager` stores (`self.focus_problem`) and passes into
`draw_overlay()` every frame — the live video overlay then draws *only*
that problem's candidate point(s), and `/api/state/`'s `problems` array
gives the sidebar the live found/required progress for the "Solved" badge.
The CLI simulation (`simulation/detect.py --problem "Sore Throat"`) offers
the identical mechanic for offline/webcam testing without the web app.

---

## 4. Evaluation metrics

**Q: What do MAE, RMSE, and PCK actually mean here, in plain terms?**
- **MAE / RMSE (normalised)**: average (and root-mean-square) distance
  between a predicted point and its ground-truth position, as a fraction of
  the hand's own size (bounding-box diagonal) — resolution-independent.
- **PCK@k%**: "Percentage of Correct Keypoints" — the fraction of all
  predicted points that land within `k%` of hand size from their true
  position. PCK@10 = 97.5% means: for essentially every point, the
  prediction is within 10% of the hand's size of where it should be —
  visually indistinguishable from correct for guidance purposes. PCK@1 is
  the strict end (39.5–68.9% depending on model) and is dominated by a
  handful of hard points (wrist, thumb region).
- **FPS**: end-to-end inference speed (MediaPipe detection + point
  placement) per frame — confirms real-time usability (~54–55 FPS
  measured), which matters because this is meant to run live against a
  webcam, not offline on static images.

**Q: What's your headline accuracy number?**
For the geometry model (v1), same-set: MAE 0.0208 (normalised), PCK@10
97.5%. Held-out (honest, unseen-image) evaluation: MAE 0.0213, PCK@10
95.7% — close to the same-set number, meaning the model isn't badly
overfit despite the small dataset. The hybrid model (v2) held-out: MAE
0.0120, PCK@10 97.9%, PCK@5 95.0% — a real, held-out-validated improvement,
not just a same-set artifact (see §2's LOO/held-out answer for why both
numbers are reported).

**Q: Is 97.5% "real" accuracy, or is that a misleading number?**
It measures agreement with the 30 finger points that actually have human
ground truth (indices 21–50) — it does **not** cover the 13 palm points
(51–63, including 3 of the 5 original clinical points), which have no
pixel-level ground truth to score against at all (see §1). Quoting one
blanket "accuracy" number for the whole system would overstate what's
actually verified — this is why the documentation always specifies *which*
points a given metric covers.

---

## 5. Software engineering / testing

**Q: What testing exists, and why that scope?**
Unit tests + regression tests (chosen deliberately over a full CI/coverage
setup, to keep effort proportional to a research-repo, not a production
service):
- **Regression tests** lock `predict_64`'s output for both shipped models
  against real (not synthetic) MediaPipe landmark samples pulled from the
  existing 11k-image cache, plus a SHA-256 hash check on the v1 model file
  — so any future refactor that accidentally changes point placement is
  caught immediately, and the "never overwrite v1" guarantee is
  machine-checked, not just a promise in a doc.
- **Unit tests** cover the pure geometry math (`_geom_point`/`decompose`
  round-trip, canonical-frame round-trip, `hand_facing` sign flips), the
  new atlas/problem resolver (`resolve_points`, `resolve_problems` —
  face-gating, single-point, multi-point-requires-all, alternative-
  protocols-either-solves-it), and a backend API test suite exercising the
  real Django views (`/api/info/`, `/api/state/`, `/api/focus/`) via the
  Django test client.
- 29 tests total, all passing; run with `pytest` from the repo root
  (`pytest.ini` sets `testpaths = tests`).

**Q: Why pytest and not unittest / something else?**
Standard, minimal-boilerplate choice for a Python research repo; fixtures
(`tests/conftest.py`) cleanly share the real hand-landmark samples and
golden values across test files without any custom test-runner code.

---

## 6. System architecture

**Q: Walk through the architecture end to end.**
```
Webcam frame (Django backend, OpenCV VideoCapture)
  -> MediaPipe Hands -> 21 raw keypoints + handedness
  -> core.common.predict_64() -> 64-point hand (21 raw + 30 learned + 13 palm-formula)
  -> core.common.hand_facing() -> palm/back orientation
  -> core.common.resolve_points() -> which named acupoints are visible this frame
  -> core.common.resolve_problems() -> which problems are solved / in progress
  -> JSON state (/api/state/) polled every 400ms by the React frontend
  -> MJPEG video stream (/video_feed/) with the same points drawn server-side
```
`simulation/detect.py` runs the identical pipeline standalone (CLI/webcam,
no Django/React) for offline testing — both consumers share every piece of
this logic from `core/common.py`, so there's exactly one implementation of
the point/problem resolution, not two independently maintained copies.

**Q: Why Django + DRF for the backend? The project history shows an
earlier Flask app.**
The original prototype was a small Flask app; it was replaced with a
proper Django project (`backend/`) with DRF-based JSON endpoints for the
polling API and a plain Django view for the MJPEG stream (DRF's renderer
model doesn't fit multipart streaming, so that one endpoint intentionally
bypasses DRF). No database is used for the acupoint/problem data — it's
computed in-memory from `core/common.py`'s Python data structures at
process start, which is why `backend/detector/models.py` is an empty stub;
`sqlite3` exists only because Django's `contenttypes`/auth machinery
expects a database to exist, not because this app stores anything in one.

**Q: Why MJPEG streaming instead of WebRTC or a websocket?**
Simplicity: a single long-lived HTTP response with
`multipart/x-mixed-replace` is trivial to implement and consume (a plain
`<img>` tag), needs no signalling/negotiation, and easily meets this
project's real-time bar (~30 FPS observed live, well above what's needed
for a self-guided acupressure aid). WebRTC would add substantial complexity
for no benefit at this scale.

---

## 7. Limitations and honesty about scope

**Q: What's the single biggest limitation right now?**
No point in this system has been reviewed by a licensed acupuncture/TCM
practitioner yet. Every point added in this pass is sourced from standard
published references (WHO Standard Acupuncture Point Locations, classical
TCM point descriptions) and is internally consistent, but "sourced from a
textbook description" and "verified correct on real, diverse hands by an
expert" are different claims, and the documentation is careful never to
conflate them. A practitioner-audit workflow (extending the existing
human-in-the-loop annotator into a review/correction mode) is the planned
next step, not yet executed.

**Q: Could this mislead a patient?**
That's exactly why the `hand_acupoint` vs `hand_reflex` tagging (§2) exists
— so a practitioner or informed user always knows whether a given point is
"really there" anatomically or is a reflex-correspondence borrowing a name
from elsewhere on the body. The system also never claims to diagnose
anything; it only helps locate points for known, named conditions a user
or practitioner has already identified.

**Q: What would you do with more time/resources?**
In priority order: (1) get the new points and the problem/protocol
groupings reviewed by a practitioner; (2) run the stratified-by-metadata
accuracy breakdown (age/skin-tone/gender) that the dataset already
supports but hasn't been computed; (3) extend real pixel-level ground truth
to the palm range (51–63) via the same annotator tool; (4) a small clinical
field pilot with logged (de-identified) usage data if the system is
actually deployed in a practitioner's clinic.

---

## 8. Novelty (if asked "what's new here")

Prior work is either (a) generic hand-pose tracking with no clinical
semantics (MediaPipe Hands itself), or (b) static acupuncture reference
charts with no camera-based real-time localisation. This project's
combination is: a scale/rotation-invariant geometric point-placement model
that needs only a few dozen annotated images to generalise (not thousands),
a transparent split between real hand acupoints and hand-reflex
correspondence points (rather than silently mixing the two, which is the
norm in consumer acupressure apps), and a many-to-many symptom→protocol
graph supporting both single- and multi-point solutions with live
completion tracking — evaluated with held-out and leave-one-out
methodology rather than a single optimistic same-set number.
