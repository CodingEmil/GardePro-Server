import cv2
import numpy as np
import os
import urllib.request
import logging

try:
    import onnxruntime as ort
    HAS_ORT = True
except ImportError:
    HAS_ORT = False

log = logging.getLogger("gardepro.ai")

_BASE_DIR = os.path.dirname(__file__)
_MODELS_DIR = os.path.join(_BASE_DIR, "models")

# YOLOv8 ONNX Format
# Wenn du ein eigenes Modell trainierst, lege es hier als 'best.onnx' (oder aehnlich) ab
CUSTOM_MODEL_PATH = os.path.join(_MODELS_DIR, "best.onnx")

# Github URL für das unmodifizierte Standard YOLOv8 Nano Modell (Coco Dataset)
FALLBACK_MODEL_URL = "https://github.com/ultralytics/assets/releases/download/v8.2.0/yolov8n.pt"
# Das Default wird jetzt aus pt in ONNX umgewandelt oder wir nehmen direkt ein ONNX, wenn verfuegbar.
# Da direkte ONNX URLs oft offline gehen, nehmen wir eine bekannte ONNX Quelle:
FALLBACK_MODEL_URL = "https://github.com/AndreyGermanov/yolov8_onnx_cplusplus/raw/refs/heads/main/models/yolov8n.onnx"
DEFAULT_MODEL_PATH = os.path.join(_MODELS_DIR, "yolov8n.onnx")

# YOLOv8 base COCO Classes
if os.path.exists(CUSTOM_MODEL_PATH):
    CLASSES = ["eichhörnchen", "filou", "mensch", "vogel"]
    TARGET_CLASSES = {"eichhörnchen", "filou", "mensch", "vogel"}
else:
    CLASSES = [
        "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat", "traffic light",
        "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep", "cow",
        "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee",
        "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket", "bottle",
        "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange",
        "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch", "potted plant", "bed",
        "dining table", "toilet", "tv", "laptop", "mouse", "remote", "keyboard", "cell phone", "microwave", "oven",
        "toaster", "sink", "refrigerator", "book", "clock", "vase", "scissors", "teddy bear", "hair drier", "toothbrush"
    ]
    TARGET_CLASSES = {"bird", "cat", "dog", "horse", "sheep", "cow", "bear", "person"}

_net = None

def _download_model():
    os.makedirs(_MODELS_DIR, exist_ok=True)
    
    # 1. Bevorzuge lokales, selbst trainiertes Modell (best.onnx)
    if os.path.exists(CUSTOM_MODEL_PATH):
        return CUSTOM_MODEL_PATH
        
    # 2. Wenn das nicht existiert, nutze lokales default (yolov8n.onnx)
    if os.path.exists(DEFAULT_MODEL_PATH):
        return DEFAULT_MODEL_PATH
        
    # 3. Sonst downloade das default
    log.info("Lade Standard YOLOv8 Modell herunter (yolov8n.onnx) ...")
    try:
        # Fallback falls die alte GitHub Domain 404 liefert...
        # Um ganz sicher zu gehen nutzen wir einen Mirror, der garantiert da ist.
        urllib.request.urlretrieve("https://github.com/AndreyGermanov/yolov8_onnx_cplusplus/raw/main/models/yolov8n.onnx", DEFAULT_MODEL_PATH)
    except Exception as e:
        log.error(f"Fehler beim Download des Default-Modells: {e}")
    return DEFAULT_MODEL_PATH

def _get_net():
    global _net
    if _net is None:
        model_path = _download_model()
        log.info(f"Lade YOLOv8 ONNX Modell in den Arbeitsspeicher: {model_path} (ORT: {HAS_ORT})")
        if HAS_ORT:
            _net = ort.InferenceSession(model_path)
        else:
            _net = cv2.dnn.readNetFromONNX(model_path)
    return _net

def detect_animals(image_path: str) -> list[dict]:
    try:
        net = _get_net()
        image = cv2.imread(image_path)
        if image is None:
            log.warning(f"Konnte Bild {image_path} nicht lesen.")
            return []
        
        orig_h, orig_w = image.shape[:2]
        
        # Das meiste YOLOv8-Training nutzt 640x640
        input_w, input_h = 640, 640
        
        if os.path.exists(CUSTOM_MODEL_PATH):
            input_w, input_h = 1280, 1280
        
        # BGR zu RGB (swapRB=True) und Skalierung (1/255.0)
        blob = cv2.dnn.blobFromImage(image, 1/255.0, (input_w, input_h), swapRB=True, crop=False)
        
        if HAS_ORT:
            input_name = net.get_inputs()[0].name
            preds = net.run(None, {input_name: blob})[0]
        else:
            net.setInput(blob)
            preds = net.forward()

        boxes = []
        confidences = []
        class_ids = []

        # ONNX export format can vary
        # For an output shape of like (1, 300, 6) which is [batch, max_det, 6=x1,y1,x2,y2,conf,class]
        if len(preds.shape) == 3 and preds.shape[2] == 6:
            for row in preds[0]:
                x1, y1, x2, y2, conf, class_id = row
                if conf > 0.40:
                    x_min = x1 / input_w
                    y_min = y1 / input_h
                    w_rel = (x2 - x1) / input_w
                    h_rel = (y2 - y1) / input_h
                    boxes.append([x_min, y_min, w_rel, h_rel])
                    confidences.append(float(conf))
                    class_ids.append(int(class_id))
        else:
            preds = np.transpose(preds[0]) # transformiere zu (8400, 84) oder (N, classes+4)
            for row in preds:
                # Klassenscores starten ab Index 4
                classes_scores = row[4:]
                class_id = np.argmax(classes_scores)
                confidence = classes_scores[class_id]

                if confidence > 0.40:
                    # Koordinaten liegen skaliert auf den 640x640 oder 1280x1280 Input vor
                    cx, cy, w, h = row[0:4]
                    
                    # Berechne obere linke Ecke (auf 0.0 - 1.0 normalisiert)
                    x_min = (cx - w / 2) / input_w
                    y_min = (cy - h / 2) / input_h
                    w_rel = w / input_w
                    h_rel = h / input_h

                    boxes.append([x_min, y_min, w_rel, h_rel])
                    confidences.append(float(confidence))
                    class_ids.append(int(class_id))
        
        # Listen reduzieren, falls nichts gefunden wurde
        if not boxes:
            return []
            
        # Non-Maximum Suppression um überlappende Boxen zu filtern
        indices = cv2.dnn.NMSBoxes(boxes, confidences, 0.40, 0.40)
        
        detected_items = []
        
        # Flatten falls nötig
        if len(indices) > 0 and isinstance(indices[0], (tuple, list, np.ndarray)):
            indices = [i[0] for i in indices]

        for i in indices:
            box = boxes[i]
            class_id = class_ids[i]
            conf = confidences[i]
            tag = CLASSES[class_id] if class_id < len(CLASSES) else "unknown"

            # Filter auf Taggings die uns tatsächlich interessieren (Oder alle, wenn du Custom-Klassen hast!)
            if tag in TARGET_CLASSES:
                translation = {
                    "bird": "Vogel", "cat": "Katze", "dog": "Hund", 
                    "horse": "Pferd", "sheep": "Schaf", "cow": "Kuh",
                    "person": "Mensch", "bear": "Bär",
                    "eichhörnchen": "Eichhörnchen", "filou": "Filou", "mensch": "Mensch", "vogel": "Vogel"
                }
                translated_tag = translation.get(tag, tag)
                
                x_min, y_min, w_rel, h_rel = box
                
                startX = max(0.0, min(1.0, x_min))
                startY = max(0.0, min(1.0, y_min))
                endX = max(0.0, min(1.0, x_min + w_rel))
                endY = max(0.0, min(1.0, y_min + h_rel))

                detected_items.append({
                    "label": translated_tag,
                    "confidence": float(conf),
                    "box": [startX, startY, endX, endY]
                })

        return detected_items

    except Exception as e:
        log.error(f"Fehler bei AI Erkennung {image_path}: {e}")
        return []

def draw_boxes_on_image(image_path: str, detections: list[dict], is_thumb: bool = False):
    """Zeichnet Kästen um erkannte Tiere in das übergebene Bild."""
    if not detections or not os.path.exists(image_path):
        return
    try:
        img = cv2.imread(image_path)
        if img is None:
            return
        h, w = img.shape[:2]
        for det in detections:
            box = det.get("box", [])
            if len(box) == 4:
                x1, y1, x2, y2 = [max(0, int(v * w)) if i % 2 == 0 else max(0, int(v * h)) for i, v in enumerate(box)]
                # Ensure coordinates are within bounds
                x1, x2 = min(x1, w), min(x2, w)
                y1, y2 = min(y1, h), min(y2, h)
                
                cv2.rectangle(img, (x1, y1), (x2, y2), (0, 0, 255), max(2, int(w/500))) # roter Kasten
                font_scale = max(0.5, w/1000)
                thickness = max(1, int(w/500))
                cv2.putText(img, f"{det['label']} {int(det['confidence']*100)}%", 
                            (x1, max(20, y1 - 10)), cv2.FONT_HERSHEY_SIMPLEX, 
                            font_scale, (0, 0, 255), thickness)
        if is_thumb:
            cv2.imwrite(image_path, img)
        else:
            dirname = os.path.dirname(image_path)
            basename = os.path.basename(image_path)
            boxed_dir = os.path.join(dirname, "boxed")
            os.makedirs(boxed_dir, exist_ok=True)
            boxed_path = os.path.join(boxed_dir, basename)
            cv2.imwrite(boxed_path, img)
    except Exception as e:
        log.error(f"Fehler beim Zeichnen der AI Kästen auf {image_path}: {e}")
