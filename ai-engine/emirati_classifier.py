"""
emirati_classifier.py
─────────────────────
Trained YOLOv8 model se Emirati / Non-Emirati classify karo.

USAGE:
    from emirati_classifier import EmiratiClassifier

    clf    = EmiratiClassifier(model_path="emirati_model_best.pt")
    result = clf.classify(person_crop)

    # result = {
    #   "label"      : "male_emirati",
    #   "type"       : "emirati",
    #   "gender"     : "male",
    #   "confidence" : 0.87
    # }

NOTE:
    Model banana hai toh README.md dekho → Training Guide section.

INSTALL:
    pip install ultralytics opencv-python numpy
"""

try:
    from ultralytics import YOLO
except Exception:
    YOLO = None


class EmiratiClassifier:

    LABELS = ["male_emirati", "female_emirati", "male_non_emirati", "female_non_emirati"]

    def __init__(self, model_path: str, confidence: float = 0.60):
        """
        model_path : path to trained .pt file  e.g. "emirati_model_best.pt"
        confidence : minimum score threshold    default 0.60
        """
        if YOLO is None:
            raise ImportError("ultralytics is not installed. Run: pip install ultralytics")
        self.confidence = confidence
        print(f"[EmiratiClassifier] Loading model: {model_path}")
        self.model   = YOLO(model_path)
        self.classes = self.model.names
        print(f"[EmiratiClassifier] ✅ Ready | Classes: {list(self.classes.values())}")

    # ──────────────────────────────────────────────────────
    def classify(self, crop) -> dict:
        """
        INPUT : person_crop — numpy BGR array (from bounding box)

        OUTPUT: {
                  "label"      : "male_emirati" / "female_emirati" /
                                 "male_non_emirati" / "female_non_emirati",
                  "type"       : "emirati" / "non_emirati",
                  "gender"     : "male" / "female",
                  "confidence" : float
                }
        """
        if crop is None or crop.size == 0 or YOLO is None:
            return self._unknown()

        try:
            results = self.model(crop, imgsz=224, verbose=False)
            probs   = results[0].probs
            label   = self.classes[probs.top1]
            conf    = round(float(probs.top1conf), 3)

            if conf < self.confidence:
                return self._unknown()

            return {
                "label"      : label,
                "type"       : "emirati"     if "emirati"  in label else "non_emirati",
                "gender"     : "male"        if "male"     in label else "female",
                "confidence" : conf,
            }

        except Exception as e:
            print(f"[EmiratiClassifier] Error: {e}")
            return self._unknown()

    # ──────────────────────────────────────────────────────
    def _unknown(self) -> dict:
        return {"label": "unknown", "type": "unknown", "gender": "unknown", "confidence": 0.0}
