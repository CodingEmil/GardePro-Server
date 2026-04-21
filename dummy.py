import numpy as np
import onnxruntime as ort

session = ort.InferenceSession("models/best.onnx")
input_name = session.get_inputs()[0].name
for shape in [(1, 3, 640, 640), (1, 3, 1280, 1280)]:
    try:
        blob = np.zeros(shape, dtype=np.float32)
        preds = session.run(None, {input_name: blob})
        print(f"Shape {shape} succeeded:", preds[0].shape)
    except Exception as e:
        print(f"Shape {shape} failed:", e)

