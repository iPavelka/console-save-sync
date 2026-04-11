# 🎮 PS3 Save Sync - AI Developer Guide

Vítej, kolego (AI)! Tento dokument slouží jako tvůj mozkový plug-in pro pochopení architektury a logiky tohoto projektu. Aplikace slouží k synchronizaci uložených pozic (savů) z PlayStation 3 do cloudu (Nextcloud/WebDAV) a zpět.

## 🏗️ Architektura
Projekt je postaven na **Electron + React (Vite)** s TypeScriptem.

- **Main Process (`electron/`)**: Zajišťuje síťovou komunikaci (FTP, WebDAV) a správu konfigurace (`electron-store`).
- **Preload (`electron/preload.ts`)**: Bezpečný most (IPC) mezi systémem a UI.
- **Renderer (`src/`)**: Moderní UI v stylu XMB (XrossMediaBar) s dynamic waves a glassmorphismem.

## ⚙️ Klíčové enginy

### 1. FTP Engine (`electron/ftp.ts`)
Komunikuje s PS3 (přes webMAN MOD / multiMAN).
- **Problém**: PS3 FTP servery často lžou o podpoře MLSD.
- **Řešení**: Vynucujeme standardní `LIST` příkaz pro spolehlivost.
- **SFO Parser**: Čteme `PARAM.SFO` a `ICON0.PNG`, abychom v UI zobrazili názvy her a ikony namísto ID složek.

### 2. Cloud Engine (`electron/webdav.ts`)
Komunikuje s Nextcloudem přes WebDAV.
- **True Mtime**: WebDAV při uploadu přepisuje datum změny souboru na „teď“. Abychom poznali, který save je novější, ukládáme originální PS3 čas do souboru `sync-meta.json` v každé složce v cloudu.

### 3. Sync Service (`electron/syncService.ts`) - MOZEK 🧠
Tady probíhá srovnávání (Delta Engine).
- **Cloud Persona**: Nejdůležitější koncept. Lokální cesta na PS3 je `/dev_hdd0/home/00000001/`. Na jiné konzoli může být stejný uživatel pod ID `00000007`. 
- **Decoupling**: Synchronizace probíhá do `/PS3_Saves/${cloudPersona}/`. Pokud se uživatel na všech konzolích přihlásí jako „Velbloud“, savy se propojí, i když mají jiné lokální ID.

## 🌌 UI/UX (Midnight XMB)
- **Styling**: `src/index.css`. Používáme Vanilla CSS proměnné, mesh gradienty a CSS animace pro „vlny“ na pozadí.
- **Responsivita**: Aplikace se automaticky přizpůsobuje menším oknům (skládání widgetů pod sebe).

## 🚀 Budoucí výzvy (Roadmap)
Pokud jsi byl právě aktivován, podívej se na tyto resty:
1.  **Retry logika**: FTP i WebDAV občas padají na timeouty. Implementuj robustní retry mechanismus.
2.  **Hromadná synchronizace**: Aktuálně se savy synchronizují po jednom. Tlačítko „Synchronizovat vše“ by bylo super.
3.  **Filtrace**: Možnost skrýt savy, které uživatel nechce syncovat (ignore list).

## 🛠️ Příkazy
- `npm run dev`: Spustí vývojové prostředí.
- `npm run build-win`: Vygeneruje produkční `.exe` instalátor pro Windows.

---
**Pamatuj**: Aesthetika je klíčová. Pokud přidáváš UI, musí to být "Premium Glassmorphism" a ladit s barvami Midnight Purple/Blue.

Hodně štěstí při vývoji! 🦾🕹️
