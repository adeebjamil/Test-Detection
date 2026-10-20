"""
pet_detector.py
───────────────
Dog aur Cat detection — No training required.
YOLOv8 COCO model use karta hai (Class 15=cat, 16=dog).

USAGE:
    from pet_detector import PetDetector

    detector = PetDetector()
    pets     = detector.detect(frame)

    for pet in pets:
        print(pet["label"])       # "dog" / "cat"
        print(pet["confidence"])  # 0.0 - 1.0
        x1, y1, x2, y2 = pet["box"]

INSTALL:
    pip install ultralytics opencv-python
"""

from ultralytics import YOLO


class PetDetector:

    CAT_ID = 15
    DOG_ID = 16

    def __init__(self, confidence: float = 0.50):
        """
        confidence : minimum score threshold  default 0.50
        """
        self.confidence = confidence
        print("[PetDetector] Loading YOLOv8n...")
        self.model = YOLO("yolov8n.pt")
        print("[PetDetector] ✅ Ready | Detects: dog, cat")

    # ──────────────────────────────────────────────────────
    def detect(self, frame) -> list:
        """
        INPUT : full frame — numpy BGR array

        OUTPUT: list of dicts [
                  {
                    "label"      : "dog" / "cat",
                    "confidence" : float,
                    "box"        : (x1, y1, x2, y2),
                    "size"       : "small" / "medium" / "large"
                  },
                  ...
                ]
                Returns [] if no pets found.
        """
        results = self.model(
            frame,
            classes=[self.CAT_ID, self.DOG_ID],
            conf=self.confidence,
            verbose=False,
            imgsz=640,
        )

        detections = []
        for box in results[0].boxes:
            class_id = int(box.cls[0])
            label    = "dog" if class_id == self.DOG_ID else "cat"
            conf     = round(float(box.conf[0]), 3)
            x1, y1, x2, y2 = map(int, box.xyxy[0])

            if (x2 - x1) < 30 or (y2 - y1) < 30:
                continue

            area = (x2 - x1) * (y2 - y1)
            size = "large" if area > 30000 else ("medium" if area > 10000 else "small")

            detections.append({
                "label"      : label,
                "confidence" : conf,
                "box"        : (x1, y1, x2, y2),
                "size"       : size,
            })

        return detections

    # ──────────────────────────────────────────────────────
    def count(self, frame) -> dict:
        """
        Shortcut — sirf counts chahiye toh.

        OUTPUT: {"dog": int, "cat": int, "total": int}
        """
        pets = self.detect(frame)
        dogs = sum(1 for p in pets if p["label"] == "dog")
        cats = sum(1 for p in pets if p["label"] == "cat")
        return {"dog": dogs, "cat": cats, "total": dogs + cats}
