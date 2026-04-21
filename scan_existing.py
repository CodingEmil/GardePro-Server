import os
import sys
import db
import ai
from sync import ARCHIVE_DIR

def run(force=False):
    print("Starte KI-Scan für bereits vorhandene Bilder...")
    items = db.get_all_media()
    
    count = 0
    updated = 0
    
    for item in items:
        # Überspringe Dateien, die schon Tags haben (wenn nicht erzwungen)
        if not force and item.get("tags") and item["tags"] != '[]':
            continue
            
        fid = item["id"]
        ext = "mp4" if item["type"] == "video" else "jpg"
        path = os.path.join(ARCHIVE_DIR, f"{fid}.{ext}")
        
        tags = []
        try:
            if ext == "jpg" and os.path.exists(path):
                tags = ai.detect_animals(path)
            elif ext == "mp4":
                # Versuche das Thumbnail zu scannen
                thumb_path = os.path.join(ARCHIVE_DIR, "thumbs", f"{fid}.jpg")
                if os.path.exists(thumb_path):
                    tags = ai.detect_animals(thumb_path)
                    
            if tags:
                db.set_tags(fid, tags)
                updated += 1
                print(f"[OK] {fid}.{ext}: {len(tags)} Objekt(e) gefunden -> {tags}")
                
        except Exception as e:
            print(f"[FEHLER] bei {fid}.{ext}: {e}")
            
        count += 1
        if count % 10 == 0:
            print(f"... {count}/{len(items)} geprüft.")

    print(f"Scan beendet! {count} Bilder geprüft, {updated} Bilder mit Tieren aktualisiert.")

if __name__ == "__main__":
    force_scan = "--force" in sys.argv
    run(force=force_scan)