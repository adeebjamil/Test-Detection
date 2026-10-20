"""
crawl_and_prepare_dataset.py
────────────────────────────
Google Image Crawler se Emirati vs Non-Emirati dataset download karo
aur training ke liye 80% train / 20% val format me prepare karo.

Categories:
  1. male_emirati       (kandura, thobe, ghutra)
  2. female_emirati     (abaya, niqab, hijab)
  3. male_non_emirati   (western clothes, polo, jeans)
  4. female_non_emirati (western dress, casual wear)

Usage:
  python crawl_and_prepare_dataset.py --max_per_query 60
"""

import os
import sys
import shutil
import random
import argparse
from pathlib import Path
from PIL import Image

try:
    from icrawler.builtin import BingImageCrawler
except ImportError:
    print("[!] icrawler install nahi hai. Installing icrawler...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "icrawler", "pillow"])
    from icrawler.builtin import BingImageCrawler

SEARCH_QUERIES = {
    "male_emirati": [
        "emirati man kandura UAE full body",
        "gulf man white thobe ghutra full length",
        "UAE national dress man walking",
        "emirati man kandura walking mall",
    ],
    "female_emirati": [
        "emirati woman abaya UAE full body",
        "gulf woman black abaya walking",
        "UAE woman abaya hijab full length",
        "emirati woman abaya shopping",
    ],
    "male_non_emirati": [
        "man western casual clothes Dubai mall",
        "expat man polo shirt jeans Dubai walking",
        "tourist man casual summer clothes UAE",
        "businessman casual wear Dubai",
    ],
    "female_non_emirati": [
        "woman western casual dress Dubai mall",
        "expat woman summer dress jeans Dubai",
        "tourist woman casual walking mall UAE",
        "woman formal casual wear Dubai",
    ]
}


def clean_and_verify(image_path: Path) -> bool:
    """Check if image is valid and not corrupted."""
    try:
        with Image.open(image_path) as img:
            img.verify()
        with Image.open(image_path) as img:
            w, h = img.size
            if w < 100 or h < 100:
                return False
            # Check aspect ratio isn't extreme banner
            if w / h > 4.0 or h / w > 4.0:
                return False
        return True
    except Exception:
        return False


def main():
    parser = argparse.ArgumentParser(description="Emirati Dataset Crawler & Packager")
    parser.add_argument("--max_per_query", type=int, default=50, help="Images per search query")
    parser.add_argument("--output", type=str, default="dataset", help="Output dataset directory")
    args = parser.parse_args()

    base_dir = Path(__file__).resolve().parent
    raw_dir = base_dir / "raw_downloads"
    dataset_dir = base_dir / args.output

    print("=" * 60)
    print(" MallVision AI — Emirati Dataset Collector")
    print(f" Target output: {dataset_dir}")
    print(f" Images per query: {args.max_per_query}")
    print("=" * 60)

    # Step 1: Crawl images
    for category, queries in SEARCH_QUERIES.items():
        cat_raw = raw_dir / category
        cat_raw.mkdir(parents=True, exist_ok=True)
        print(f"\n[+] Crawling category: {category} ({len(queries)} queries)...")

        for query in queries:
            print(f"    -> Query: '{query}'")
            crawler = BingImageCrawler(
                storage={"root_dir": str(cat_raw)},
                feeder_threads=1,
                parser_threads=2,
                downloader_threads=4
            )
            crawler.crawl(keyword=query, max_num=args.max_per_query, file_idx_offset="auto")

    # Step 2: Validate & Organize into Train/Val 80:20 split
    print("\n[+] Validating images and creating 80% train / 20% val split...")
    for split in ["train", "val"]:
        for cat in SEARCH_QUERIES.keys():
            (dataset_dir / split / cat).mkdir(parents=True, exist_ok=True)

    summary = {}
    for cat in SEARCH_QUERIES.keys():
        cat_raw = raw_dir / cat
        valid_images = []
        if cat_raw.exists():
            for f in cat_raw.iterdir():
                if f.is_file() and clean_and_verify(f):
                    valid_images.append(f)
                elif f.is_file():
                    try:
                        f.unlink()
                    except Exception:
                        pass

        random.seed(42)
        random.shuffle(valid_images)

        val_count = max(1, int(len(valid_images) * 0.20))
        val_imgs = valid_images[:val_count]
        train_imgs = valid_images[val_count:]

        # Copy to train
        for i, img in enumerate(train_imgs):
            dest = dataset_dir / "train" / cat / f"{cat}_tr_{i:04d}{img.suffix}"
            shutil.copy2(img, dest)

        # Copy to val
        for i, img in enumerate(val_imgs):
            dest = dataset_dir / "val" / cat / f"{cat}_val_{i:04d}{img.suffix}"
            shutil.copy2(img, dest)

        summary[cat] = (len(train_imgs), len(val_imgs))
        print(f"    * {cat}: {len(train_imgs)} train | {len(val_imgs)} val (Total: {len(valid_images)})")

    # Step 3: Zip dataset for Colab / Drive
    zip_path = base_dir / "emirati_dataset.zip"
    print(f"\n[+] Creating ready-to-upload archive: {zip_path.name}...")
    shutil.make_archive(str(base_dir / "emirati_dataset"), "zip", root_dir=str(dataset_dir))

    print("=" * 60)
    print(" ✅ Dataset preparation complete!")
    print(f" Archive: {zip_path}")
    print(" Google Colab me 'emirati_dataset.zip' upload karein aur train karein.")
    print("=" * 60)


if __name__ == "__main__":
    main()
