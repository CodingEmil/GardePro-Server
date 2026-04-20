# Lokales KI-Training (Windows PC)

Da der Raspberry Pi zu schwach für das Training ist, kannst du das Modell auf deinem Windows-Rechner trainieren und als est.onnx speichern. Diese Datei legst du danach einfach in den Ordner models/ dieses Projekts auf dem Pi – das Skript erkennt sie dann automatisch!

## Vorbereitung auf Windows

1. Installiere **Python 3.10+** (falls noch nicht geschehen).
2. Öffne die PowerShell oder Eingabeaufforderung.
3. Installiere Ultralytics (das KI-Framework für YOLOv8):

`ash
pip install ultralytics
`

## Datensatz vorbereiten

Um eine spezifische KI zu trainieren, benötigst du Bilder.
1. Melde dich kostenlos bei [Roboflow](https://roboflow.com/) an.
2. Lade Bilder deiner Kamera hoch (z.B. von Tieren aus deinem Garten).
3. "Label" die Bilder – ziehe Rahmenkästchen um die Tiere und benenne sie.
4. Exportiere den Datensatz (Format: **YOLOv8**).
5. Du erhältst eine data.yaml-Datei und Bilder-Ordner auf deinem PC.

## Modell trainieren

Navigiere in der Eingabeaufforderung in den Ordner, in dem die data.yaml von Roboflow liegt. Starte das Training:

`ash
yolo task=detect mode=train model=yolov8n.pt data=data.yaml epochs=50 imgsz=640
`
- yolov8n.pt lädt das Basis-Web-Modell (Nano), was sehr schnell ist.
- epochs=50 durchläuft deine Bilder 50 Mal beim Lernen.

## Modell exportieren (.onnx)

Sobald das Training beendet ist, findest du im Ordner uns/detect/train/weights/ eine Datei namens est.pt.
Diese wandelst du nun in das kompakte ONNX Format um (das wir auf dem Pi ohne fettes PyTorch nutzen können):

`ash
yolo export model=runs/detect/train/weights/best.pt format=onnx imgsz=640
`

> **Ergebnis:** Du hast jetzt eine est.onnx!

## Einsatz auf dem Raspberry Pi

Kopiere die erstellte est.onnx Datei in deinen GardePro-Server im Netzwerk in das Verzeichnis /models/best.onnx (erstell den Ordner falls er nicht existiert).
Wenn du das System (den Docker-Container) neustartest, meldet die Logs: Lade YOLOv8 ONNX Modell in den Arbeitsspeicher: .../models/best.onnx.

Wenn du komplett neue Tags vergeben hast (z.B. "Fuchs", "Marder"), musst du diese in der i.py noch in der Zeile TARGET_CLASSES = {...} hinzufügen!
