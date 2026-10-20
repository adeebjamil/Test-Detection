"""
MallVision AI — Local CCTV Analytics Engine (real inference, no simulated data)

* Pulls camera config from the local API (cameras are added from the dashboard).
* For every enabled camera a grabber thread always keeps only the NEWEST frame
  (no RTSP buffer build-up -> no lag, even when analysis is slower than the stream).
* Detects person / dog / cat (MobileNet-SSD), tracks centroids and reports every
  virtual-line crossing to the API immediately (dashboard updates in real time).
* Gender: fuses a full-body attribute model (works from front, side AND back) with a
  face age/gender model whenever a face is visible. Evidence is averaged over the
  whole time a person is tracked, then the event is refined via /events/update.
* Kids: face age when a face is visible, otherwise a self-calibrating body-height
  model (per camera, learns the normal adult height at each position in the frame).
* Cultural attire is never guessed: there is no classifier, so it is "unclassified".

Run:  python download_models.py --demographics
      python main.py
"""

import json
import math
import os
import queue
import sys
import threading
import time
import traceback
import urllib.error
import urllib.request
from collections import deque
from datetime import datetime, timezone
from pathlib import Path

# RTSP over TCP with single-thread decoding to avoid ffmpeg multithreading async_lock race conditions
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|threads;1|fflags;nobuffer|buffer_size;1024000|max_delay;500000|stimeout;5000000|probesize;10000000|analyzeduration;10000000"

import cv2
import numpy as np

try:
    import openvino as ov
except Exception:  # optional dependency
    ov = None

from emirati_classifier import EmiratiClassifier

VERSION = "4.0.0"
API = os.environ.get("MV_API", "http://127.0.0.1:4000/api").rstrip("/")
CONFIDENCE = float(os.environ.get("MV_CONFIDENCE", "0.38"))
OV_DEVICE = os.environ.get("MV_DEVICE", "CPU")  # CPU | GPU | AUTO
PENDING_SECONDS = 4.0        # keep collecting evidence this long after a crossing, then refine the event
MAX_BODY_SAMPLES = 40        # body-attribute samples per person (spread over the whole track)
MAX_FACE_SAMPLES = 6         # face samples per person
MODELS = Path(__file__).resolve().parent / "models"
TOKEN_FILE = Path(os.environ.get("MV_ENGINE_TOKEN_FILE", Path(__file__).resolve().parent.parent / "backend" / "data" / "engine.token"))


def engine_token():
    """Secret shared with the local backend (re-read so a backend reinstall is picked up)."""
    try:
        return TOKEN_FILE.read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def utc_now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


# >>> TEMP-LIVE-PREVIEW (testing only — delete this block + the marked lines in _process, or set MV_LIVE_PREVIEW=0)
LIVE_PREVIEW = os.environ.get("MV_LIVE_PREVIEW", "1") != "0"
PREVIEW_DIR = TOKEN_FILE.parent / "preview"
PREVIEW_FPS = 15
PREVIEW_COLORS = {"person": (206, 203, 81), "dog": (61, 179, 239), "cat": (219, 112, 147)}


def _write_jpg(cam_id, img):
    try:
        ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 70])
        if not ok:
            return
        PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
        tmp = PREVIEW_DIR / f"cam_{cam_id}.tmp"
        tmp.write_bytes(buf.tobytes())
        os.replace(tmp, PREVIEW_DIR / f"cam_{cam_id}.jpg")
    except Exception:
        pass  # file locked by a reader on Windows — just skip this frame


def write_preview(cam_id, frame, tracks, line, counts):
    h, w = frame.shape[:2]
    img = cv2.resize(frame, (960, int(h * 960 / w))) if w > 960 else frame.copy()
    h, w = img.shape[:2]
    cv2.line(img, (int(line.x1 * w), int(line.y1 * h)), (int(line.x2 * w), int(line.y2 * h)), (0, 215, 255), 3, cv2.LINE_AA)
    for t in tracks:
        c = PREVIEW_COLORS.get(t.cls, (255, 255, 255))
        x1, y1, x2, y2 = int(t.box[0] * w), int(t.box[1] * h), int(t.box[2] * w), int(t.box[3] * h)
        cv2.rectangle(img, (x1, y1), (x2, y2), c, 2, cv2.LINE_AA)
        
        if t.cls in ("dog", "cat"):
            label = f"#{t.id} {t.cls.capitalize()}"
        else:
            g, a = t.demographics()
            gender_str = "Male" if g == "male" else "Female" if g == "female" else ""
            kid_str = " Kid" if a == "child" else ""
            attire_str = ""
            if t.attire in ("male_emirati", "female_emirati"):
                attire_str = "Emirati"
            elif t.attire in ("male_non_emirati", "female_non_emirati"):
                attire_str = "Non-Emirati"

            parts = [f"#{t.id}"]
            if gender_str or kid_str:
                parts.append(f"{gender_str}{kid_str}".strip())
            elif not attire_str:
                parts.append("Person")
            if attire_str:
                parts.append(attire_str)

            label = " ".join(parts)

        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.48, 1)
        pill_y1 = max(0, y1 - th - 8)
        cv2.rectangle(img, (x1, pill_y1), (min(w, x1 + tw + 8), y1), c, -1)
        cv2.putText(img, label, (x1 + 4, y1 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (20, 20, 20), 1, cv2.LINE_AA)
        cv2.circle(img, (int(t.x * w), int(t.y * h)), 4, c, -1)
    cv2.rectangle(img, (10, 10), (200, 42), (30, 30, 30), -1)
    cv2.putText(img, f"IN {counts['IN']}   OUT {counts['OUT']}", (20, 33), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2, cv2.LINE_AA)
    _write_jpg(cam_id, img)


def write_offline_preview(cam_id):
    img = np.full((540, 960, 3), 24, np.uint8)
    cv2.putText(img, "CAMERA OFFLINE", (300, 260), cv2.FONT_HERSHEY_SIMPLEX, 1.4, (87, 129, 239), 3, cv2.LINE_AA)
    cv2.putText(img, f"reconnecting...  {datetime.now().strftime('%H:%M:%S')}", (330, 310), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (200, 200, 200), 1, cv2.LINE_AA)
    _write_jpg(cam_id, img)
# <<< TEMP-LIVE-PREVIEW


DET_PROTO = MODELS / "MobileNetSSD_deploy.prototxt"
DET_MODEL = MODELS / "MobileNetSSD_deploy.caffemodel"
FACE_PROTO = MODELS / "opencv_face_detector.pbtxt"
FACE_MODEL = MODELS / "opencv_face_detector_uint8.pb"
PAR_MODEL = MODELS / "person-attributes-recognition-crossroad-0230.xml"
AGEGEN_MODEL = MODELS / "age-gender-recognition-retail-0013.xml"
VOC_CLASSES = {15: "person", 12: "dog", 8: "cat"}
HAS_FACE_DET = FACE_PROTO.exists() and FACE_MODEL.exists()
HAS_OV = ov is not None and PAR_MODEL.exists() and AGEGEN_MODEL.exists()


def api(method, path, body=None, timeout=5):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{API}{path}", data=data, method=method,
                                 headers={"Content-Type": "application/json", "X-Engine-Token": engine_token()})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
        return json.loads(raw) if raw else None


# ----------------------------------------------------------------------------
# Sender with retry queue (messages are never dropped if the API restarts; order is kept)
# ----------------------------------------------------------------------------
class EventSender(threading.Thread):
    ROUTES = {"event": "/events", "update": "/events/update", "cancel": "/events/cancel"}

    def __init__(self):
        super().__init__(daemon=True)
        self.q = queue.Queue(maxsize=20000)

    def send(self, kind, body):
        try:
            self.q.put_nowait((kind, body))
        except queue.Full:
            log("Event queue full — dropping oldest message")
            self.q.get_nowait()
            self.q.put_nowait((kind, body))

    def run(self):
        while True:
            kind, body = self.q.get()
            while True:
                try:
                    api("POST", self.ROUTES[kind], body)
                    break
                except urllib.error.HTTPError as e:
                    if e.code in (400, 404):  # camera deleted / invalid — do not retry
                        log(f"{kind} rejected: {e.read().decode(errors='ignore')}")
                        break
                    time.sleep(1)
                except Exception:
                    time.sleep(1)


SENDER = EventSender()


# ----------------------------------------------------------------------------
# Demographic models (shared, thread-safe compiled models; one infer request per worker)
# ----------------------------------------------------------------------------
_OV_CORE, _OV_PAR, _OV_AGEGEN = None, None, None
if HAS_OV:
    try:
        _OV_CORE = ov.Core()
        cfg = {"PERFORMANCE_HINT": "LATENCY"}
        _OV_PAR = _OV_CORE.compile_model(str(PAR_MODEL), OV_DEVICE, cfg)
        _OV_AGEGEN = _OV_CORE.compile_model(str(AGEGEN_MODEL), OV_DEVICE, cfg)
    except Exception as e:  # e.g. GPU requested but not available
        log(f"OpenVINO init failed on {OV_DEVICE} ({e}) — falling back to CPU")
        try:
            _OV_PAR = _OV_CORE.compile_model(str(PAR_MODEL), "CPU")
            _OV_AGEGEN = _OV_CORE.compile_model(str(AGEGEN_MODEL), "CPU")
        except Exception as e2:
            log(f"OpenVINO unavailable: {e2}")
            HAS_OV = False


class Demographics:
    """Per-worker helper: body gender (any angle) + face gender/age when a face is visible."""

    def __init__(self):
        self.par = _OV_PAR.create_infer_request() if HAS_OV else None
        self.agegen = _OV_AGEGEN.create_infer_request() if HAS_OV else None
        self.face = cv2.dnn.readNet(str(FACE_MODEL), str(FACE_PROTO)) if HAS_FACE_DET and HAS_OV else None
        model_file = MODELS / "emirati_model_best.pt"
        self.emirati = None
        if EmiratiClassifier is not None and model_file.exists():
            try:
                self.emirati = EmiratiClassifier(str(model_file))
            except Exception as e:
                log(f"EmiratiClassifier disabled ({e}) — run: pip install ultralytics")
                self.emirati = None

    @property
    def enabled(self):
        return self.par is not None or self.emirati is not None

    @staticmethod
    def _blob(img, w, h):
        return cv2.resize(img, (w, h)).transpose(2, 0, 1)[None].astype(np.float32)

    def body_male_prob(self, frame, box):
        if self.par is None:
            return None
        try:
            H, W = frame.shape[:2]
            x1, y1, x2, y2 = int(box[0] * W), int(box[1] * H), int(box[2] * W), int(box[3] * H)
            if y2 - y1 < 48 or x2 - x1 < 20:
                return None
            crop = frame[y1:y2, x1:x2]
            if crop.size == 0:
                return None
            self.par.infer({0: self._blob(crop, 80, 160)})
            return float(self.par.get_output_tensor(0).data.reshape(-1)[0])  # is_male, already sigmoid
        except Exception:
            return None

    def face_probs(self, frame, box):
        """-> (male_prob, age_years) or None when no usable face is visible."""
        if self.face is None or self.agegen is None:
            return None
        try:
            H, W = frame.shape[:2]
            x1, y1, x2, y2 = int(box[0] * W), int(box[1] * H), int(box[2] * W), int(box[3] * H)
            bw, bh = x2 - x1, y2 - y1
            if bh < 38 or bw < 16:
                return None
            pad = int(bw * 0.20)
            roi = frame[max(0, y1 - pad):min(H, y1 + int(bh * 0.48)), max(0, x1 - pad):min(W, x2 + pad)]
            if roi.size == 0:
                return None
            rh, rw = roi.shape[:2]
            self.face.setInput(cv2.dnn.blobFromImage(roi, 1.0, (300, 300), (104, 117, 123), swapRB=False))
            d = self.face.forward()
            i = int(d[0, 0, :, 2].argmax())
            if float(d[0, 0, i, 2]) < 0.45:
                return None
            fx1, fy1, fx2, fy2 = (np.clip(d[0, 0, i, 3:7], 0, 1) * np.array([rw, rh, rw, rh])).astype(int)
            fw, fh = fx2 - fx1, fy2 - fy1
            if min(fw, fh) < 14:
                return None
            p = int(max(fw, fh) * 0.15)
            face = roi[max(0, fy1 - p):min(rh, fy2 + p), max(0, fx1 - p):min(rw, fx2 + p)]
            if face.size == 0:
                return None
            self.agegen.infer({"data": self._blob(face, 62, 62)})
            prob = self.agegen.get_tensor("prob").data.reshape(-1)          # [female, male]
            age = float(self.agegen.get_tensor("age_conv3").data.reshape(-1)[0]) * 100
            return float(prob[1]), age
        except Exception:
            return None


class HeightModel:
    """Learns the typical (adult-dominated) person height at each vertical position of
    one camera, so a much shorter full-body person can be flagged as a child."""

    def __init__(self):
        self.samples = deque(maxlen=3000)
        self.coef = None
        self.added = 0

    def add(self, foot_y, height):
        self.samples.append((foot_y, height))
        self.added += 1
        if self.added % 40 == 0 and len(self.samples) >= 60:
            ys, hs = np.array(self.samples).T
            bins = np.linspace(ys.min(), ys.max() + 1e-6, 9)
            pts = []
            for lo, hi in zip(bins[:-1], bins[1:]):
                m = (ys >= lo) & (ys < hi)
                if m.sum() >= 6:
                    pts.append(((lo + hi) / 2, np.percentile(hs[m], 60)))  # adults outnumber kids
            if len(pts) >= 3:
                px, ph = np.array(pts).T
                self.coef = np.polyfit(px, ph, 1)

    def ratio(self, foot_y, height):
        if self.coef is None:
            return None
        expected = float(np.polyval(self.coef, foot_y))
        return height / expected if expected > 0.02 else None


def full_body(box):
    """Box is a whole, un-cropped standing person (not cut by the frame edge)."""
    x1, y1, x2, y2 = box
    return y1 > 0.01 and y2 < 0.99 and x1 > 0.005 and x2 < 0.995 and (y2 - y1) / max(1e-6, x2 - x1) >= 1.7


# ----------------------------------------------------------------------------
# Tracking + virtual line
# ----------------------------------------------------------------------------
class Track:
    __slots__ = ("id", "cls", "x", "y", "prev_x", "prev_y", "box", "conf", "age", "missed", "side", "last_cross",
                 "g_logit", "g_w", "body_n", "face_n", "face_ages", "kid_votes", "adult_votes", "body_ps", "vx", "vy", "attire")

    def __init__(self, tid, cls, x, y, box, conf):
        self.id, self.cls, self.x, self.y, self.box, self.conf = tid, cls, x, y, box, conf
        self.prev_x, self.prev_y = x, y
        self.vx, self.vy = 0.0, 0.0
        self.age, self.missed, self.side, self.last_cross = 1, 0, 0, 0.0
        self.g_logit, self.g_w, self.body_n, self.face_n = 0.0, 0.0, 0, 0
        self.face_ages, self.kid_votes, self.adult_votes, self.body_ps = [], 0, 0, []
        self.attire = "unclassified"

    @staticmethod
    def _logit(p):
        p = min(0.97, max(0.03, p))
        return float(np.log(p / (1 - p)))

    def add_body(self, p_male, weight=1.0):
        # log-odds averaging: a confident frame (0.9) outweighs an unsure one (0.55)
        self.g_logit += weight * self._logit(p_male)
        self.g_w += weight
        self.body_n += 1
        self.body_ps.append(round(p_male, 2))

    def add_face(self, p_male, age):
        self.g_logit += 3.5 * self._logit(p_male)   # clear face is 3.5x stronger evidence than body
        self.g_w += 3.5
        self.face_n += 1
        self.face_ages.append(age)

    def p_male(self):
        return float(1 / (1 + np.exp(-self.g_logit / self.g_w))) if self.g_w else None

    def demographics(self):
        gender = "unknown"
        p = self.p_male()
        if p is not None and (self.face_n >= 1 or self.body_n >= 2):
            gender = "male" if p >= 0.54 else "female" if p <= 0.46 else "unknown"
        age = "unknown"
        if self.face_ages:
            a = float(np.median(self.face_ages))
            age = "child" if a < 14 else "senior" if a >= 60 else "adult"
        elif self.kid_votes + self.adult_votes >= 3:
            age = "child" if self.kid_votes > self.adult_votes else "adult"
        return gender, age


class CentroidTracker:
    def __init__(self, max_dist=0.20, max_missed=25):
        self.max_dist, self.max_missed = max_dist, max_missed
        self.tracks = {}
        self.next_id = 1

    def _match(self, track_ids, detection_indices, detections):
        pairs = []
        for ti in track_ids:
            t = self.tracks[ti]
            pred_x = t.x + t.vx
            pred_y = t.y + t.vy
            for di in detection_indices:
                d = detections[di]
                if d[0] != t.cls:
                    continue
                dist = math.hypot(pred_x - d[1], pred_y - d[2])
                if dist <= self.max_dist:
                    pairs.append((dist, ti, di))
        pairs.sort(key=lambda p: p[0])
        used_t, used_d = set(), set()
        matches = []
        for _, ti, di in pairs:
            if ti in used_t or di in used_d:
                continue
            used_t.add(ti)
            used_d.add(di)
            matches.append((ti, di))
        return matches, used_t, used_d

    def update(self, detections):
        """detections: list of (cls, cx, cy, box, conf) in normalised coords."""
        high_dets = [i for i, d in enumerate(detections) if d[4] >= 0.35]
        low_dets = [i for i, d in enumerate(detections) if d[4] < 0.35]

        # Tier 1: Match active tracks with high-confidence detections
        matches_1, used_t1, used_d1 = self._match(list(self.tracks.keys()), high_dets, detections)

        # Tier 2: Match remaining unmatched tracks with low-confidence detections
        remaining_t = [ti for ti in self.tracks if ti not in used_t1]
        matches_2, used_t2, used_d2 = self._match(remaining_t, low_dets, detections)

        all_matches = matches_1 + matches_2
        used_t = used_t1 | used_t2
        used_d = used_d1 | used_d2

        for ti, di in all_matches:
            t = self.tracks[ti]
            d = detections[di]
            dx = d[1] - t.x
            dy = d[2] - t.y
            t.vx = dx * 0.7 + t.vx * 0.3
            t.vy = dy * 0.7 + t.vy * 0.3
            t.prev_x, t.prev_y = t.x, t.y
            _, t.x, t.y, nb, t.conf = d
            # EMA smoothing on box to stop jitter and flickering
            if t.box:
                t.box = (
                    0.75 * nb[0] + 0.25 * t.box[0],
                    0.75 * nb[1] + 0.25 * t.box[1],
                    0.75 * nb[2] + 0.25 * t.box[2],
                    0.75 * nb[3] + 0.25 * t.box[3],
                )
            else:
                t.box = nb
            t.age += 1
            t.missed = 0

        # Unmatched tracks: extrapolate position forward smoothly
        for ti in list(self.tracks):
            if ti not in used_t:
                t = self.tracks[ti]
                t.missed += 1
                if t.missed <= 5:
                    t.prev_x, t.prev_y = t.x, t.y
                    step_x = t.vx * 0.6
                    step_y = t.vy * 0.6
                    t.x += step_x
                    t.y += step_y
                    b = t.box
                    t.box = (
                        max(0.0, min(1.0, b[0] + step_x)),
                        max(0.0, min(1.0, b[1] + step_y)),
                        max(0.0, min(1.0, b[2] + step_x)),
                        max(0.0, min(1.0, b[3] + step_y)),
                    )
                if t.missed > self.max_missed:
                    del self.tracks[ti]

        # Unmatched detections: spawn new tracks only if confidence is high (>= 0.42)
        for di in high_dets:
            if di not in used_d:
                d = detections[di]
                if d[4] >= 0.42:
                    self.tracks[self.next_id] = Track(self.next_id, *d)
                    self.next_id += 1

        # Return live tracks: actively detected (missed == 0) OR briefly missed confirmed tracks (missed <= 4 and age >= 2)
        return [t for t in self.tracks.values() if t.missed == 0 or (t.missed <= 4 and t.age >= 2)]


def _ccw(ax, ay, bx, by, cx, cy):
    return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)


def _segments_intersect(p1x, p1y, p2x, p2y, p3x, p3y, p4x, p4y):
    """Check if trajectory segment p1->p2 intersects virtual line p3->p4."""
    d1 = _ccw(p3x, p3y, p4x, p4y, p1x, p1y)
    d2 = _ccw(p3x, p3y, p4x, p4y, p2x, p2y)
    d3 = _ccw(p1x, p1y, p2x, p2y, p3x, p3y)
    d4 = _ccw(p1x, p1y, p2x, p2y, p4x, p4y)
    if ((d1 > 0 and d2 < 0) or (d1 < 0 and d2 > 0)) and \
       ((d3 > 0 and d4 < 0) or (d3 < 0 and d4 > 0)):
        return True, d1, d2
    return False, 0, 0


class VirtualLine:
    EPS = 0.012  # hysteresis band (normalised distance from line)

    def __init__(self, cfg):
        x1, y1, x2, y2 = cfg["line_x1"], cfg["line_y1"], cfg["line_x2"], cfg["line_y2"]
        if x1 > x2:
            x1, y1, x2, y2 = x2, y2, x1, y1
        self.x1, self.y1, self.x2, self.y2 = x1, y1, x2, y2
        self.len = max(1e-6, math.hypot(x2 - x1, y2 - y1))
        self.in_dir = cfg.get("in_direction", "top_to_bottom")

    def side(self, x, y):
        d = ((self.x2 - self.x1) * (y - self.y1) - (self.y2 - self.y1) * (x - self.x1)) / self.len
        if abs(d) < self.EPS:
            return 0
        return 1 if d > 0 else -1

    def within_segment(self, x, y):
        t = ((x - self.x1) * (self.x2 - self.x1) + (y - self.y1) * (self.y2 - self.y1)) / (self.len ** 2)
        return -0.08 <= t <= 1.08

    def check(self, track, now):
        if track.age < 2 or track.missed > 1 or now - track.last_cross < 1.0:
            return None

        # 1. Vector intersection: Did movement from prev position to current position cross the line?
        hit, d1, d2 = _segments_intersect(track.prev_x, track.prev_y, track.x, track.y, self.x1, self.y1, self.x2, self.y2)
        if hit:
            track.last_cross = now
            track.side = 1 if d2 > 0 else -1
            moved_down = d1 < 0 < d2
            if self.in_dir == "top_to_bottom":
                return "IN" if moved_down else "OUT"
            return "OUT" if moved_down else "IN"

        # 2. Side transition fallback with hysteresis
        s = self.side(track.x, track.y)
        if s == 0:
            return None
        prev, track.side = track.side, s
        if prev == 0 or prev == s:
            return None
        if not self.within_segment(track.x, track.y):
            return None
        track.last_cross = now
        moved_down = prev < 0 < s
        if self.in_dir == "top_to_bottom":
            return "IN" if moved_down else "OUT"
        return "OUT" if moved_down else "IN"


# ----------------------------------------------------------------------------
# Frame grabber — always holds only the newest frame (prevents RTSP lag build-up)
# ----------------------------------------------------------------------------
class FrameGrabber(threading.Thread):
    def __init__(self, cap):
        super().__init__(daemon=True)
        self.cap = cap
        self.lock = threading.Lock()
        self.frame, self.seq, self.ts = None, 0, 0.0
        self.alive = True
        self.new = threading.Event()

    def run(self):
        fails = 0
        while self.alive:
            try:
                ok, f = self.cap.read()
            except (cv2.error, Exception):
                ok, f = False, None
            if not ok or f is None:
                fails += 1
                if fails > 500:
                    break
                time.sleep(0.01)
                continue
            fails = 0
            with self.lock:
                self.frame, self.ts = f, time.time()
                self.seq += 1
            self.new.set()
        self.alive = False
        self.new.set()

    def latest(self, last_seq, timeout=6.0):
        """Newest frame newer than last_seq (or None if the stream stalled / died)."""
        deadline = time.time() + timeout
        while self.alive and time.time() < deadline:
            with self.lock:
                if self.seq != last_seq and self.frame is not None:
                    return self.frame, self.seq, self.ts
            self.new.wait(0.2)
            self.new.clear()
        return None, last_seq, 0.0

    def stop(self):
        self.alive = False


# ----------------------------------------------------------------------------
# Camera worker
# ----------------------------------------------------------------------------
class CameraWorker(threading.Thread):
    def __init__(self, cfg):
        super().__init__(daemon=True)
        self.cfg = cfg
        self.id = cfg["id"]
        self.stop_flag = threading.Event()
        self.line = VirtualLine(cfg)
        self.target_fps = max(1, int(cfg.get("target_fps") or 8))
        self.heights = HeightModel()

    def update_config(self, cfg):
        self.cfg = cfg
        self.line = VirtualLine(cfg)
        self.target_fps = max(1, int(cfg.get("target_fps") or 8))

    def stop(self):
        self.stop_flag.set()

    def heartbeat(self, status, error=None, fps=None, w=None, h=None):
        try:
            api("POST", f"/cameras/{self.id}/heartbeat", {
                "stream_status": status, "error": error, "processing_fps": fps,
                "frame_width": w, "frame_height": h})
        except Exception:
            pass

    def _open(self):
        src = self.cfg["source_url"].strip()
        is_file = not src.isdigit() and "://" not in src
        if src.isdigit():
            return cv2.VideoCapture(int(src)), False

        if src.startswith("rtsp://"):
            os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;udp|fflags;nobuffer|buffer_size;1024000|max_delay;500000"
        try:
            cap = cv2.VideoCapture(src, cv2.CAP_FFMPEG)
        except Exception:
            cap = None

        if cap is None or not cap.isOpened():
            if src.startswith("rtsp://"):
                os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|fflags;nobuffer|buffer_size;1024000|max_delay;500000"
            try:
                cap = cv2.VideoCapture(src, cv2.CAP_FFMPEG)
            except Exception:
                cap = cv2.VideoCapture()

        try:
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        except Exception:
            pass
        return cap, is_file

    def run(self):
        det = cv2.dnn.readNetFromCaffe(str(DET_PROTO), str(DET_MODEL))
        demo = Demographics()
        backoff = 2
        while not self.stop_flag.is_set():
            self.heartbeat("connecting")
            cap, is_file = self._open()
            if not cap.isOpened():
                self.heartbeat("error", "Could not open video source")
                log(f"Camera {self.id}: cannot open source, retrying in {backoff}s")
                if LIVE_PREVIEW:  # TEMP-LIVE-PREVIEW
                    write_offline_preview(self.id)
                self.stop_flag.wait(backoff)
                backoff = min(15, backoff * 2)
                continue
            backoff = 2
            w0, h0 = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            log(f"Camera {self.id} ({self.cfg['name']}): stream opened {w0}x{h0}")
            try:
                ended = self._process(cap, is_file, det, demo)
            except Exception as e:
                log(f"Camera {self.id}: processing error {e}")
                ended = False
            if ended:
                self.heartbeat("ended", "End of video file")
                log(f"Camera {self.id}: video file finished")
                self.stop_flag.wait()  # do not loop files (prevents double counting)
                return
            if not self.stop_flag.is_set():
                self.heartbeat("error", "Stream interrupted — reconnecting")
                log(f"Camera {self.id}: stream interrupted, reconnecting")
                if LIVE_PREVIEW:  # TEMP-LIVE-PREVIEW
                    write_offline_preview(self.id)
                self.stop_flag.wait(backoff)

    # ------------------------------------------------------------------ analysis
    def _detect(self, det, frame):
        det.setInput(cv2.dnn.blobFromImage(cv2.resize(frame, (300, 300)), 0.007843, (300, 300), 127.5))
        out = det.forward()
        detections = []
        for i in range(out.shape[2]):
            conf = float(out[0, 0, i, 2])
            cls = VOC_CLASSES.get(int(out[0, 0, i, 1]))
            if cls is None or conf < 0.22:
                continue
            x1, y1, x2, y2 = [float(min(1, max(0, v))) for v in out[0, 0, i, 3:7]]
            # Mid-torso / center-of-mass (y1 + 0.60 * height) — smooth straight line trajectory without foot oscillation
            cx = (x1 + x2) / 2.0
            cy = y1 + (y2 - y1) * 0.60
            detections.append((cls, cx, cy, (x1, y1, x2, y2), conf))
        return detections

    def _evidence(self, frame, t, demo, frame_no):
        if t.cls != "person":
            return
        b = t.box
        if full_body(b):
            self.heights.add(b[3], b[3] - b[1])
            r = self.heights.ratio(b[3], b[3] - b[1])
            if r is not None and not t.face_ages:
                if r < 0.72:
                    t.kid_votes += 1
                elif r > 0.85:
                    t.adult_votes += 1
        if not demo.enabled:
            return
        try:
            if t.body_n < MAX_BODY_SAMPLES:
                p = demo.body_male_prob(frame, b)
                if p is not None:
                    px_h = (b[3] - b[1]) * frame.shape[0]
                    w = min(1.5, max(0.3, px_h / 220.0))   # bigger / closer person = clearer evidence
                    if not full_body(b):
                        w *= 0.6                            # cut-off boxes are less reliable
                    t.add_body(p, w)
            if t.face_n < MAX_FACE_SAMPLES:
                r = demo.face_probs(frame, b)
                if r is not None:
                    t.add_face(*r)
            if demo.emirati is not None and t.attire == "unclassified":
                H, W = frame.shape[:2]
                x1 = max(0, int(t.box[0] * W))
                y1 = max(0, int(t.box[1] * H))
                x2 = min(W, int(t.box[2] * W))
                y2 = min(H, int(t.box[3] * H))
                if (y2 - y1) >= 48 and (x2 - x1) >= 20:
                    crop = frame[y1:y2, x1:x2]
                    if crop.size > 0:
                        r = demo.emirati.classify(crop)
                        if r["confidence"] >= 0.50:
                            t.attire = r["label"]
        except Exception as e:
            log(f"Camera {self.id}: demographics error {e}")

    def _process(self, cap, is_file, det, demo):
        tracker = CentroidTracker()
        session = int(time.time())
        crossing_no = 0
        src_fps = cap.get(cv2.CAP_PROP_FPS) or 25
        stride = max(1, round(src_fps / self.target_fps)) if is_file else 1
        grabber = None if is_file else FrameGrabber(cap)
        if grabber:
            grabber.start()
        frame_idx, processed, seq = 0, 0, 0
        last_proc, last_hb, win_start = 0.0, 0.0, time.time()
        fps = None
        w = h = None
        live_tracks, live_counts, last_prev = [], {"IN": 0, "OUT": 0}, 0.0  # TEMP-LIVE-PREVIEW
        pending = []  # [track, direction, crossed_ts, event_key, sent_demographics]

        def emit(t, direction, iso, key):
            gender, age = t.demographics() if t.cls == "person" else (None, None)
            SENDER.send("event", {
                "camera_id": self.id, "track_id": key, "object_type": t.cls, "direction": direction,
                "gender_estimate": gender, "age_group_estimate": age,
                "cultural_attire_estimate": t.attire if t.cls == "person" else None,
                "confidence": round(t.conf, 3), "occurred_at": iso})
            return (gender, age)

        def refine(force=False):
            keep = []
            for p in pending:
                t, direction, ts, key, sent = p
                if not (force or t.id not in tracker.tracks or time.time() - ts >= PENDING_SECONDS):
                    keep.append(p)
                    continue
                if t.cls == "person":
                    final = t.demographics()
                    if final != sent:
                        SENDER.send("update", {"camera_id": self.id, "track_id": key,
                                               "gender_estimate": final[0], "age_group_estimate": final[1]})
                    pm = t.p_male() or -1
                    log(f"Camera {self.id}: person {direction} -> {final[0]}/{final[1]} "
                        f"(p_male {pm:.2f}, body {t.body_n}, faces {t.face_n}, track {t.id}) {t.body_ps[-12:]}")
            pending[:] = keep

        try:
            while not self.stop_flag.is_set():
                if grabber:
                    frame, seq, _ = grabber.latest(seq)
                    if frame is None:
                        refine(True)
                        return False
                    now = time.time()
                    if now - last_proc < 1.0 / self.target_fps:
                        time.sleep(max(0.0, 1.0 / self.target_fps - (now - last_proc)) * 0.9)
                        continue
                else:
                    try:
                        ok, frame = cap.read()
                    except (cv2.error, Exception):
                        ok, frame = False, None
                    if not ok or frame is None:
                        refine(True)
                        return True
                    frame_idx += 1
                    if frame_idx % stride:
                        continue
                    now = time.time()
                last_proc = now
                h, w = frame.shape[:2]

                live_tracks = tracker.update(self._detect(det, frame))  # TEMP-LIVE-PREVIEW (was inline)
                for t in live_tracks:
                    if t.missed == 0:
                        self._evidence(frame, t, demo, processed)
                    direction = self.line.check(t, now)
                    if not direction:
                        continue
                    opposite = next((p for p in pending if p[0] is t and p[1] != direction and now - p[2] < 2.0), None)
                    if opposite:  # stepped back over the line within 2s -> not a real entry/exit
                        pending.remove(opposite)
                        SENDER.send("cancel", {"camera_id": self.id, "track_id": opposite[3]})
                        live_counts[opposite[1]] -= 1  # TEMP-LIVE-PREVIEW
                        log(f"Camera {self.id}: cancelled back-and-forth crossing (track {t.id})")
                        continue
                    crossing_no += 1
                    key = f"C{self.id}-{session}-T{t.id}-{crossing_no}"
                    sent = emit(t, direction, utc_now(), key)   # counted on the dashboard immediately
                    pending.append([t, direction, now, key, sent])
                    live_counts[direction] += 1  # TEMP-LIVE-PREVIEW
                refine()

                if LIVE_PREVIEW and now - last_prev >= 1.0 / PREVIEW_FPS:  # TEMP-LIVE-PREVIEW
                    last_prev = now
                    write_preview(self.id, frame, live_tracks, self.line, live_counts)

                processed += 1
                if now - win_start >= 5:
                    fps = round(processed / (now - win_start), 1)
                    processed, win_start = 0, now
                if now - last_hb >= 5:
                    self.heartbeat("streaming", None, fps, w, h)
                    last_hb = now
            refine(True)
            return False
        finally:
            if grabber:
                grabber.stop()
                grabber.join(timeout=2.0)
            try:
                cap.release()
            except Exception:
                pass


# ----------------------------------------------------------------------------
# Supervisor
# ----------------------------------------------------------------------------
def main():
    print("=" * 60)
    print(f" MallVision AI — Local CCTV Analytics Engine v{VERSION}")
    print(f" API: {API}")
    print(f" Gender (body + face): {'on, ' + OV_DEVICE if HAS_OV else 'off — run: python download_models.py --demographics'}")
    print("=" * 60, flush=True)

    if not (DET_PROTO.exists() and DET_MODEL.exists()):
        print("Detector model missing. Run:  python download_models.py --demographics")
        sys.exit(1)

    SENDER.start()
    workers = {}
    last_sync = 0.0
    caps = {"detector": "MobileNet-SSD", "demographics": HAS_OV, "attire": (MODELS / "emirati_model_best.pt").exists()}

    while True:
        try:
            try:
                api("POST", "/engine/heartbeat", {"capabilities": caps, "version": VERSION})
            except urllib.error.HTTPError as e:
                log(f"API rejected the engine (HTTP {e.code}) — check {TOKEN_FILE}")
            except Exception:
                log("API not reachable — is the backend running?")

            if time.time() - last_sync >= 10:
                last_sync = time.time()
                try:
                    cams = {c["id"]: c for c in api("GET", "/engine/cameras")}
                except Exception:
                    cams = None
                if cams is not None:
                    for cid in list(workers):
                        wk = workers[cid]
                        if cid not in cams or cams[cid]["source_url"] != wk.cfg["source_url"] or not wk.is_alive():
                            try:
                                wk.stop()
                            except Exception:
                                pass
                            del workers[cid]
                            if cid not in cams:
                                log(f"Camera {cid}: removed / disabled")
                    for cid, cfg in cams.items():
                        if cid in workers:
                            try:
                                workers[cid].update_config(cfg)
                            except Exception:
                                pass
                        else:
                            log(f"Camera {cid} ({cfg['name']}): starting worker")
                            workers[cid] = CameraWorker(cfg)
                            workers[cid].start()
            time.sleep(5)
        except KeyboardInterrupt:
            log("Shutting down")
            for wk in workers.values():
                try:
                    wk.stop()
                except Exception:
                    pass
            break
        except Exception as e:
            log(f"Supervisor error: {e}")
            traceback.print_exc()
            time.sleep(5)


if __name__ == "__main__":
    main()
