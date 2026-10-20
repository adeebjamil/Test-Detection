"""
Download the offline models used by the MallVision AI engine.

  python download_models.py                 # person / dog / cat detector (~23 MB)
  python download_models.py --demographics  # + face, gender and age models (~94 MB)

Check each model's licence before using it commercially.
"""
import sys
import urllib.request
from pathlib import Path

MODELS = Path(__file__).parent / "models"

DETECTOR = {
    # MobileNet-SSD (VOC classes incl. person, dog, cat) — github.com/chuanqi305/MobileNet-SSD
    "MobileNetSSD_deploy.prototxt": "https://raw.githubusercontent.com/chuanqi305/MobileNet-SSD/master/deploy.prototxt",
    "MobileNetSSD_deploy.caffemodel": "https://raw.githubusercontent.com/chuanqi305/MobileNet-SSD/master/mobilenet_iter_73000.caffemodel",
}

DEMOGRAPHICS = {
    # OpenCV face detector + Levi & Hassner age/gender CNNs
    "opencv_face_detector.pbtxt": "https://raw.githubusercontent.com/smahesh29/Gender-and-Age-Detection/master/opencv_face_detector.pbtxt",
    "opencv_face_detector_uint8.pb": "https://raw.githubusercontent.com/smahesh29/Gender-and-Age-Detection/master/opencv_face_detector_uint8.pb",
    "age_deploy.prototxt": "https://raw.githubusercontent.com/smahesh29/Gender-and-Age-Detection/master/age_deploy.prototxt",
    "age_net.caffemodel": "https://raw.githubusercontent.com/smahesh29/Gender-and-Age-Detection/master/age_net.caffemodel",
    "gender_deploy.prototxt": "https://raw.githubusercontent.com/smahesh29/Gender-and-Age-Detection/master/gender_deploy.prototxt",
    "gender_net.caffemodel": "https://raw.githubusercontent.com/smahesh29/Gender-and-Age-Detection/master/gender_net.caffemodel",
}

_OMZ = "https://storage.openvinotoolkit.org/repositories/open_model_zoo/2023.0/models_bin/1"
OPENVINO = {
    # Intel Open Model Zoo (Apache-2.0). Body attributes work from front, side and back views.
    "person-attributes-recognition-crossroad-0230.xml": f"{_OMZ}/person-attributes-recognition-crossroad-0230/FP16/person-attributes-recognition-crossroad-0230.xml",
    "person-attributes-recognition-crossroad-0230.bin": f"{_OMZ}/person-attributes-recognition-crossroad-0230/FP16/person-attributes-recognition-crossroad-0230.bin",
    # Face age (regression) + gender, much more accurate than the Levi-Hassner nets
    "age-gender-recognition-retail-0013.xml": f"{_OMZ}/age-gender-recognition-retail-0013/FP16/age-gender-recognition-retail-0013.xml",
    "age-gender-recognition-retail-0013.bin": f"{_OMZ}/age-gender-recognition-retail-0013/FP16/age-gender-recognition-retail-0013.bin",
}


def fetch(name: str, url: str) -> None:
    dest = MODELS / name
    if dest.exists() and dest.stat().st_size > 0:
        print(f"  ✓ {name} (already present)")
        return
    print(f"  ↓ {name} ...", end="", flush=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    urllib.request.urlretrieve(url, tmp)
    tmp.replace(dest)
    print(f" {dest.stat().st_size / 1e6:.1f} MB")


def main() -> None:
    MODELS.mkdir(exist_ok=True)
    print("Detector models:")
    for n, u in DETECTOR.items():
        fetch(n, u)
    if "--demographics" in sys.argv:
        print("Demographic models:")
        for n, u in {**DEMOGRAPHICS, **OPENVINO}.items():
            fetch(n, u)
    print("Done.")


if __name__ == "__main__":
    main()
