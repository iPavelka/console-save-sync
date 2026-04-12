# 🕹️ Console Save Sync

Modern and secure tool for synchronizing game saves between consoles (PS3/PS2) and Nextcloud cloud storage.

## ✨ Features

### 🎮 PlayStation 3
- **FTP Connectivity**: Direct connection to PS3 via WebMAN/MultiMAN.
- **Intelligent Delta Engine**: Detects changes and uploads/downloads only modified saves.
- **SFO Parser**: Displays real game titles instead of IDs (e.g., "The Last of Us" instead of "BCES01584").
- **Date Preservation**: Maintains original save timestamps using cloud metadata.

### 📼 PlayStation 2 (PS2 Hub)
- **Virtual Memory Card (.VM2) Support**: Parse and browse saves inside PS3 virtual memory cards.
- **Automatic Game Identification**: Automatically identifies thousands of PS2 games using an integrated online database (`niemasd/GameDB-PS2`).
- **Export to .PSV**: Generate PS3-compatible `.PSV` files for importing saves via XMB.
- **Export to .PSU**: Generate `.PSU` containers compatible with physical PS2 hardware and `uLaunchELF`.
- **Advanced MCFS Parser**: Full support for raw MCFS filesystems, including 528-byte ECC block aligned images.

### ☁️ Cloud & UI
- **WebDAV Integration**: Native support for Nextcloud backup.
- **Modern UI**: Dark glassmorphism design with responsive game icons and progress tracking.

## 🚀 Getting Started
1. Download the latest version from GitHub Releases.
2. Install the application on Windows.
3. Configure your **PS3 IP Address** and **Nextcloud WebDAV** credentials in Settings.
4. Scan for changes and start syncing!

## 🛠️ Development
```bash
npm install
npm run dev      # Start development mode
npm run build-win # Build the Windows installer
```

---
Created with ❤️ for retro gaming fans.
