#!/bin/bash

echo "Entsperre Funkmodule (Bluetooth & WLAN)..."
sudo rfkill unblock bluetooth
sudo rfkill unblock wifi
sudo nmcli radio wifi on

echo "Starte GardePro Server..."
sudo docker compose up -d

echo "Fertig! Der Server sollte nun unter http://localhost:5000 erreichbar sein."
