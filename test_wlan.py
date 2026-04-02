import sys
import subprocess

def test_connection(ssid, pwd=None, ifname=None):
    print(f"--- Starte WLAN-Verbindungstest ---")
    print(f"SSID: {ssid}")
    
    cmd = ["nmcli", "dev", "wifi", "connect", ssid]
    if pwd:
        cmd.extend(["password", pwd])
    if ifname:
        cmd.extend(["ifname", ifname])
        
    print(f"Befehl der ausgefuehrt wird: {' '.join(cmd)}")
    print("Warte auf Antwort von nmcli (Timeout 30s)...")
    
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        print("\n--- ERGEBNIS ---")
        print(f"Return Code: {res.returncode}")
        
        if res.stdout.strip():
            print(f"Standardausgabe (stdout):\n{res.stdout.strip()}")
        
        if res.stderr.strip():
            print(f"Fehlerausgabe (stderr):\n{res.stderr.strip()}")
            
        if res.returncode == 0:
            print("\n✅ ERFOLG: nmcli meldet eine erfolgreiche Verbindung!")
        else:
            print("\n❌ FEHLER: Verbindung per nmcli fehlgeschlagen.")
            
    except subprocess.TimeoutExpired:
        print("\n❌ FEHLER: Zeitüberschreitung (Timeout nach 30 Sekunden).")
    except FileNotFoundError:
        print("\n❌ FEHLER: Der Befehl 'nmcli' wurde auf diesem System nicht gefunden.")
    except Exception as e:
        print(f"\n❌ UNERWARTETER FEHLER: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Nutzung: python test_wlan.py <SSID> [<Passwort>] [<Interface>]")
        print("Beispiel: python test_wlan.py MeinWLAN MeinPasswort123 wlan0")
        sys.exit(1)
        
    ssid = sys.argv[1]
    pwd = sys.argv[2] if len(sys.argv) > 2 else None
    ifname = sys.argv[3] if len(sys.argv) > 3 else None
    
    test_connection(ssid, pwd, ifname)