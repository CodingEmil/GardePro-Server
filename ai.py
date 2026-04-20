import cv2
import numpy as np
import os
import urllib.request
import logging

log = logging.getLogger("gardepro.ai")

_BASE_DIR = os.path.dirname(__file__)
_MODELS_DIR = os.path.join(_BASE_DIR, "models")

# We use MobileNet SSD (COCO dataset) which is very fast and lightweight for Raspberry Pi
MODEL_URL = "https://github.com/chuanqi305/MobileNet-SSD/raw/master/mobilenet_iter_73000.caffemodel"
CONFIG_URL = "https://raw.githubusercontent.com/chuanqi305/MobileNet-SSD/master/deploy.prototxt"

CAFFEMODEL_PATH = os.path.join(_MODELS_DIR, "mobilenet_iter_73000.caffemodel")
PROTOTXT_PATH = os.path.join(_MODELS_DIR, "deploy.prototxt")

# Filter out classes we usually care about in front of a trail cam (cats, dogs, birds, sheep, cow, horse, bear, person)
CLASSES = ["background", "aeroplane", "bicycle", "bird", "boat",
           "bottle", "bus", "car", "cat", "chair", "cow", "diningtable",
           "dog", "horse", "motorbike", "person", "pottedplant", "sheep",
           "sofa", "train", "tvmonitor"]

TARGET_CLASSES = {"bird", "cat", "dog", "horse", "sheep", "cow", "bear", "person"}

_net = None

def _download_model():
    os.makedirs(_MODELS_DIR, exist_ok=True)
    if not os.path.exists(PROTOTXT_PATH):
        log.info("Downloading AI config (deploy.prototxt) ...")
        urllib.request.urlretrieve(CONFIG_URL, PROTOTXT_PATH)
    if not os.path.exists(CAFFEMODEL_PATH):
        log.info("Downloading AI model (mobilenet_iter_73000.caffemodel) ...")
        urllib.request.urlretrieve(MODEL_URL, CAFFEMODEL_PATH)

def _get_net():
    global _net
    if _net is None:
        _download_model()
        log.info("Loading MobileNet SSD AI Model into memory...")
        _net = cv2.dnn.readNetFromCaffe(PROTOTXT_PATH, CAFFEMODEL_PATH)
    return _net

def detect_animals(image_path: str) -> list[dict]:
    """
    Run object detection on an image file.
    Returns a list of detected objects: [{"label": "Katze", "confidence": 0.8, "box": [x1, y1, x2, y2]}]
    """
    try:
        net = _get_net()
        image = cv2.imread(image_path)
        if image is None:
            log.warning(f"Could not read image {image_path} for AI detection")
            return []

        (h, w) = image.shape[:2]
        blob = cv2.dnn.blobFromImage(cv2.resize(image, (300, 300)), 0.007843, (300, 300), 127.5)

        net.setInput(blob)
        detections = net.forward()

        detected_items = []

        for i in np.arange(0, detections.shape[2]):
            confidence = detections[0, 0, i, 2]
            
            # Filter out weak detections (confidence > 40%)
            if confidence > 0.40:
                idx = int(detections[0, 0, i, 1])
                tag = CLASSES[idx]
                
                # We only want to keep tags we care about
                if tag in TARGET_CLASSES:
                    # Translate to German for nicer frontend display
                    translation = {
                        "bird": "Vogel",
                        "cat": "Katze",
                        "dog": "Hund",
                        "horse": "Pferd",
                        "sheep": "Schaf",
                        "cow": "Kuh",
                        "person": "Mensch",
                        "bear": "Bär"
                    }
                    translated_tag = translation.get(tag, tag)
                    
                    # Extract bounding box (normalized 0.0 to 1.0)
                    box = detections[0, 0, i, 3:7].tolist() # [startX, startY, endX, endY]
                    
                    # Ensure coordinates are within image boundaries
                    startX = max(0.0, min(1.0, box[0]))
                    startY = max(0.0, min(1.0, box[1]))
                    endX = max(0.0, min(1.0, box[2]))
                    endY = max(0.0, min(1.0, box[3]))
                    
                    detected_items.append({
                        "label": translated_tag,
                        "confidence": float(confidence),
                        "box": [startX, startY, endX, endY]
                    })

        return detected_items

    except Exception as e:
        log.error(f"AI Detection failed on {image_path}: {e}")
        return []
