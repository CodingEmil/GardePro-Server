#!/bin/bash

echo "Entsperre Funkmodule (Bluetooth & WLAN)..."
sudo rfkill unblock bluetooth
sudo rfkill unblock wifi
sudo nmcli radio wifi on

echo "Starte GardePro Server..."
sudo docker compose up -d

IP=$(hostname -I | awk '{print $1}')
echo "Fertig! Der Server sollte nun unter http://${IP}:5000 erreichbar sein."
