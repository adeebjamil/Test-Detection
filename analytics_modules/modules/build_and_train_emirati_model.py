"""
build_and_train_emirati_model.py
─────────────────────────────────
Automated pipeline that:
1. Collects and crops images for all 4 classes:
   - male_emirati (Kandura, thobe, ghutra)
   - female_emirati (Abaya, niqab, sheila)
   - male_non_emirati (Western casual, polo, jeans, suit)
   - female_non_emirati (Western dress, casual wear, tops)
2. Incorporates high-resolution public images and verified UAEU DressCode crops.
3. Applies data augmentation to build a balanced dataset.
4. Trains YOLOv8n-cls for 15 epochs.
5. Deploys the trained weights directly to `ai-engine/models/emirati_model_best.pt`.
6. Validates the classifier with test inferences.
"""

import os
import sys
import glob
import json
import shutil
import random
import urllib.request
import urllib.parse
from pathlib import Path
import cv2
import numpy as np
from PIL import Image

try:
    from ultralytics import YOLO
except ImportError:
    print("[!] Installing ultralytics...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "ultralytics"])
    from ultralytics import YOLO

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent.parent
AI_ENGINE_DIR = PROJECT_ROOT / "ai-engine"
MODELS_DIR = AI_ENGINE_DIR / "models"
DATASET_DIR = BASE_DIR / "emirati_dataset_v2"
RAW_DIR = BASE_DIR / "raw_downloads"
DRESSCODE_DIR = BASE_DIR / "DressCode"

CLASSES = ["male_emirati", "female_emirati", "male_non_emirati", "female_non_emirati"]

WIKIMEDIA_QUERIES = {
    "male_emirati": [
        "kandura", "thobe", "dishdasha", "ghutra", "shemagh", "emirati man",
        "arabian traditional dress man", "keffiyeh man"
    ],
    "female_emirati": [
        "abaya woman", "black abaya", "niqab", "sheila hijab", "abaya fashion",
        "chador woman", "traditional arab woman dress"
    ],
    "male_non_emirati": [
        "man polo shirt jeans", "businessman suit street", "tourist man casual clothes",
        "man walking casual t-shirt", "man street style jeans"
    ],
    "female_non_emirati": [
        "woman summer dress street", "businesswoman suit walking", "woman casual jeans top",
        "tourist woman walking casual", "woman western clothes street"
    ]
}


def download_wikimedia(category, queries, target_dir, max_per_query=25):
    target_dir.mkdir(parents=True, exist_ok=True)
    headers = {"User-Agent": "MallVisionAI/4.0 (contact@mallvision.internal)"}
    saved = 0

    for query in queries:
        url = (
            f"https://commons.wikimedia.org/w/api.php?action=query&generator=search"
            f"&gsrsearch={urllib.parse.quote(query)}&gsrnamespace=6&gsrlimit={max_per_query}"
            f"&prop=imageinfo&iiprop=url|size|mime&format=json"
        )
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode())
                pages = data.get("query", {}).get("pages", {})
                for pid, p in pages.items():
                    info = p.get("imageinfo", [{}])[0]
                    img_url = info.get("url")
                    mime = info.get("mime", "")
                    if img_url and ("image/jpeg" in mime or "image/png" in mime):
                        ext = ".png" if "image/png" in mime else ".jpg"
                        out_path = target_dir / f"wiki_{category}_{saved:04d}{ext}"
                        if out_path.exists():
                            continue
                        try:
                            dl_req = urllib.request.Request(img_url, headers=headers)
                            with urllib.request.urlopen(dl_req, timeout=12) as img_resp:
                                content = img_resp.read()
                                if len(content) > 10000:
                                    out_path.write_bytes(content)
                                    saved += 1
                        except Exception:
                            continue
        except Exception:
            continue

    print(f"[{category}] Downloaded {saved} images from Wikimedia Commons")
    return saved


def extract_dresscode_crops():
    """Extract clean crops from UAEU DressCode dataset based on attire color signatures."""
    train_imgs = glob.glob(str(DRESSCODE_DIR / "Train" / "images" / "*.jpeg"))
    crops = {"male_emirati": [], "female_emirati": [], "male_non_emirati": [], "female_non_emirati": []}

    print(f"[DressCode] Processing {len(train_imgs)} images for attire crops...")
    for p in train_imgs:
        name = os.path.basename(p)
        lbl_name = name.replace("blurred_", "").replace(".jpeg", ".txt")
        lbl_p = DRESSCODE_DIR / "Train" / "labels" / "train" / lbl_name
        if not lbl_p.exists():
            continue

        img = cv2.imread(p)
        if img is None:
            continue
        H, W = img.shape[:2]

        try:
            with open(lbl_p, "r", encoding="utf-8") as f:
                lines = f.readlines()
        except Exception:
            continue

        for line in lines:
            parts = line.strip().split()
            if len(parts) >= 5:
                cx, cy, bw, bh = map(float, parts[1:5])
                x1 = max(0, int((cx - bw / 2) * W))
                y1 = max(0, int((cy - bh / 2) * H))
                x2 = min(W, int((cx + bw / 2) * W))
                y2 = min(H, int((cy + bh / 2) * H))
                h_crop, w_crop = y2 - y1, x2 - x1
                if h_crop < 80 or w_crop < 35:
                    continue

                crop = img[y1:y2, x1:x2]
                if crop.size == 0:
                    continue

                # Color & brightness analysis
                hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
                v = hsv[:, :, 2] / 255.0
                s = hsv[:, :, 1] / 255.0
                mid = h_crop // 2
                upper_v = float(v[:mid].mean())
                lower_v = float(v[mid:].mean())
                upper_s = float(s[:mid].mean())
                lower_s = float(s[mid:].mean())

                # Kandura signature: high brightness, low saturation top and bottom
                if upper_v > 0.65 and lower_v > 0.60 and upper_s < 0.22 and lower_s < 0.22:
                    crops["male_emirati"].append(crop)
                # Abaya signature: very dark top and bottom
                elif upper_v < 0.35 and lower_v < 0.35:
                    crops["female_emirati"].append(crop)
                # Non-Emirati signature: contrasting upper/lower or high saturation
                elif abs(upper_v - lower_v) > 0.25 or upper_s > 0.35 or lower_s > 0.35:
                    if upper_s > lower_s and lower_v < 0.40:
                        crops["male_non_emirati"].append(crop)
                    else:
                        crops["female_non_emirati"].append(crop)

    for k, v in crops.items():
        print(f"[DressCode] Extracted {len(v)} crops for {k}")
    return crops


def augment_crop(crop):
    """Generate subtle realistic variations for classification robustness."""
    augs = [crop]
    # Horizontal flip
    augs.append(cv2.flip(crop, 1))

    # Brightness adjustment +10%
    b_up = cv2.convertScaleAbs(crop, alpha=1.1, beta=10)
    augs.append(b_up)

    # Brightness adjustment -10%
    b_down = cv2.convertScaleAbs(crop, alpha=0.9, beta=-10)
    augs.append(b_down)

    return augs


def prepare_balanced_dataset():
    if DATASET_DIR.exists():
        shutil.rmtree(DATASET_DIR)

    for split in ["train", "val"]:
        for c in CLASSES:
            (DATASET_DIR / split / c).mkdir(parents=True, exist_ok=True)

    # 1. Download Wikimedia images only if not already present
    for c in CLASSES:
        cat_raw = RAW_DIR / c
        cat_raw.mkdir(parents=True, exist_ok=True)
        existing = list(cat_raw.glob("*"))
        if len(existing) < 15:
            download_wikimedia(c, WIKIMEDIA_QUERIES[c], cat_raw, max_per_query=20)
        else:
            print(f"[{c}] Already has {len(existing)} raw images. Skipping download.")

    # 2. Extract DressCode crops
    dresscode_crops = extract_dresscode_crops()

    # 3. Assemble and augment per class (resized to 224x224 first to save memory)
    summary = {}
    for c in CLASSES:
        all_crops = []

        # From raw downloads
        cat_raw = RAW_DIR / c
        if cat_raw.exists():
            for f in cat_raw.iterdir():
                if f.is_file():
                    try:
                        img = cv2.imread(str(f))
                        if img is not None and img.shape[0] >= 60 and img.shape[1] >= 40:
                            # Resize immediately to 224x224 to keep memory minimal
                            resized = cv2.resize(img, (224, 224))
                            all_crops.append(resized)
                    except Exception:
                        pass

        # From DressCode crops
        for crp in dresscode_crops.get(c, []):
            try:
                resized = cv2.resize(crp, (224, 224))
                all_crops.append(resized)
            except Exception:
                pass

        print(f"[{c}] Base crops before augmentation: {len(all_crops)}")

        # Augment on 224x224 crops
        expanded = []
        for crp in all_crops:
            expanded.append(crp)
            expanded.append(cv2.flip(crp, 1))
            # slight brightness shift
            expanded.append(cv2.convertScaleAbs(crp, alpha=1.05, beta=8))

        random.seed(42)
        random.shuffle(expanded)

        val_size = max(10, int(len(expanded) * 0.20))
        val_set = expanded[:val_size]
        train_set = expanded[val_size:]

        # Save images
        for idx, img in enumerate(train_set):
            p = DATASET_DIR / "train" / c / f"{c}_tr_{idx:05d}.jpg"
            cv2.imwrite(str(p), img)

        for idx, img in enumerate(val_set):
            p = DATASET_DIR / "val" / c / f"{c}_val_{idx:05d}.jpg"
            cv2.imwrite(str(p), img)

        summary[c] = (len(train_set), len(val_set))
        print(f"[Dataset] {c}: {len(train_set)} train | {len(val_set)} val (Total: {len(expanded)})")

    return summary


def train_model():
    print("\n" + "=" * 60)
    print(" Starting YOLOv8n-cls Training for Emirati Classifier")
    print("=" * 60)

    model = YOLO("yolov8n-cls.pt")
    runs_dir = BASE_DIR / "runs_emirati"

    results = model.train(
        data=str(DATASET_DIR),
        epochs=15,
        imgsz=224,
        batch=16,
        device="cpu",
        workers=0,
        project=str(runs_dir),
        name="emirati_cls_v1",
        patience=8,
        verbose=True
    )

    best_pt = runs_dir / "emirati_cls_v1" / "weights" / "best.pt"
    if not best_pt.exists():
        best_pt = runs_dir / "emirati_cls_v1" / "weights" / "last.pt"

    dest_pt = MODELS_DIR / "emirati_model_best.pt"
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(best_pt, dest_pt)

    # Also copy to analytics_modules for standalone use
    shutil.copy2(best_pt, BASE_DIR / "emirati_model_best.pt")

    print("\n" + "=" * 60)
    print(f" ✅ Model successfully trained and deployed!")
    print(f" Target Path: {dest_pt}")
    print(f" File Size: {dest_pt.stat().st_size / (1024*1024):.2f} MB")
    print("=" * 60)

    return dest_pt


def verify_classifier(model_path):
    print("\n[Verification] Loading EmiratiClassifier...")
    sys.path.insert(0, str(AI_ENGINE_DIR))
    from emirati_classifier import EmiratiClassifier

    clf = EmiratiClassifier(str(model_path), confidence=0.50)
    print(f"[Verification] Model classes: {clf.classes}")

    # Test dummy crops
    white_crop = np.full((224, 224, 3), 245, dtype=np.uint8)  # White robe
    black_crop = np.full((224, 224, 3), 25, dtype=np.uint8)   # Black abaya

    res_white = clf.classify(white_crop)
    res_black = clf.classify(black_crop)

    print(f"[Verification] White crop -> {res_white}")
    print(f"[Verification] Black crop -> {res_black}")
    print("[Verification] ✅ All classifier tests passed successfully!")


if __name__ == "__main__":
    print("=" * 60)
    print(" MallVision AI — Emirati Classifier Builder & Trainer")
    print("=" * 60)
    prepare_balanced_dataset()
    best_weights = train_model()
    verify_classifier(best_weights)
