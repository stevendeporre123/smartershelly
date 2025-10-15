# SmartShelly Desktop - Architectuur Overzicht

## Doel
Een lokale Electron-app waarmee technici Shelly-apparaten per klant kunnen inventariseren, beheren en vergelijken met eerdere scans. Persistentie gebeurt via SQLite zodat historische data offline beschikbaar blijft.

## Hoofdcomponenten
1. **Electron Main Process**
   - Verantwoordelijk voor het initialiseren van de app.
   - Beheert de SQLite-verbinding (via `better-sqlite3`).
   - Stelt IPC-handlers bloot voor CRUD-acties rond klanten, scans en Shelly-acties.
   - Verzamelnaam: `src/main`.
2. **Preload Script**
   - Publiceert een veilige API (`window.shellyManager`) naar de renderer via `contextBridge`.
   - Functies: klanten ophalen/toevoegen, scans starten, laatste diffs ophalen, Shelly-commando's (reboot, firmware upgrade, wifi-configuratie).
3. **Renderer (UI)**
   - Gebouwd met plain HTML/JS voor eenvoud (`src/renderer`).
   - Gelaagd rondom eenvoudige state stores zodat UI renderings eenduidig blijven.
   - Schermen:
     - Klantenlijst + detail.
     - Laatste scans met status (nieuw, gewijzigd, offline).
     - Acties per apparaat (firmware check + instructies, reboot, wifi-config).
4. **SQLite Database**
    - Tabellen:
      - `customers`: klantnaam, contactinfo (opties), netwerkbereik.
      - `scan_runs`: datum/tijd, klant, meta-info (bijv. gebruiker, opgegeven subnet).
      - `devices`: actuele snapshot per apparaat (Shelly `id`/`mac`, firmware, wifi, app, generatie).
      - `device_snapshots`: ruwe data per scan_run (JSON payload, firmware, wifi, app, generatie, status).
    - Views/queries bepalen diffs door volgende velden te vergelijken: firmwareversie, IP, wifi SSID, app, generatie, online/offline.
5. **Shelly Service**
   - Standaardiseert netwerkcalls naar Shelly REST/RPC endpoints.
   - Endpoints (v1/v2):
     - Info: `/shelly` of `/rpc/Shelly.GetDeviceInfo`.
     - Status: `/status` of `/rpc/Shelly.GetStatus`.
     - Firmware update: `/ota?url=...` of `/rpc/Shelly.Update`.
     - Reboot: `/reboot` of `/rpc/Shelly.Reboot`.
     - Wifi configuratie: `/settings/sta` of `/rpc/WiFi.SetConfig`.
   - Met timeouts en foutafhandeling zodat offline apparaten netjes worden gelogd.

## Datastromen
1. **Scan starten**
    - Renderer vraagt via IPC om scan voor klant X (met subnet of lijst IP's).
   - Main process scant IP-bereik parallel (config: max 20 gelijktijdig, timeout 3s).
   - Voor elke respons normalizeert `ShellyService` data, slaat resultaat op in `device_snapshots` en update/voegt `devices` bij.
   - Diff-service vergelijkt huidige scan met vorige `scan_run` voor dezelfde klant en markeert status (`new`, `changed`, `offline`, `unchanged`).
2. **Historie bekijken**
   - Renderer vraagt lijst `scan_runs` / `device_snapshots`.
   - Main levert dataset + diff metadata om in UI te tonen.
3. **Acties uitvoeren op apparaat**
   - Renderer triggert IPC-call. Main roept Shelly endpoint aan en registreert resultaat (bijv. `actions` logtabel optioneel).

## Uitbreidbaarheid
- Mogelijke features: gebruikersaccounts, pluggable exporters (CSV/JSON), notificaties voor oude firmware.
- Schema kan worden gemigreerd via eenvoudige migratie-scripts (versies in tabel `migrations`).

## Technische Stack
- Node.js + Electron (nieuwste stabiele LTS).
- `better-sqlite3` voor synchrone DB-acties.
- `node-fetch` (of native fetch) voor HTTP.
- Minimalistische UI met `lit-html` of pure DOM-manipulatie.
- Styling via CSS Modules/Utility-classes (eenvoudig start met vanilla CSS).

## MVP Omvang
1. Klantenbeheer CRUD.
2. Handmatige subnetconfiguratie per klant.
3. Netwerkscan met basic diffweergave (nieuw/gewijzigd/offline).
4. Acties: ping, reboot, firmware check (download-url invoer), wifi SSID/wachtwoord wijzigen.
5. Basisauthenticatie opslag per apparaat (optioneel, versleuteld opslaan in database).

Dit document dient als leidraad voor de implementatie van het MVP binnen deze repository.
