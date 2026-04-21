import onnxruntime as ort
try:
    session = ort.InferenceSession('models/best.onnx')
    inputs = session.get_inputs()
    print("Input shape is:", inputs[0].shape)
except Exception as e:
    print(e)
