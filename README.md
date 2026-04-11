# 🕹️ Console Save Sync

Moderní a bezpečný nástroj pro synchronizaci PS3 herních pozic mezi konzolí a cloudovým úložištěm Nextcloud.

## ✨ Vlastnosti
- **FTP Konektivita**: Přímé spojení s PS3 (přes WebMAN/MultiMAN).
- **WebDAV Integrace**: Automatické zálohování na tvůj vlastní Nextcloud.
- **Inteligentní Delta Engine**: Detekuje změny a nahrává pouze ty savy, které se změnily.
- **SFO Parser**: Zobrazuje skutečné názvy her namísto ID kódů (např. "The Last of Us" místo "BCES01584").
- **Date Preservation**: Zachovává skutečné časy uložení z PS3 i v cloudu pomocí metadat.
- **Moderní UI**: Tmavý glassmorphism vzhled s ikonkami her.

## 🚀 Jak začít
1. Stáhni si nejnovější verzi z GitHub Releases.
2. Nainstaluj aplikaci ve Windows.
3. V nastavení zadej IP adresu tvé PS3 a údaje k Nextcloud WebDAV (včetně App hesla).
4. Klikni na "Skenovat změny" a synchronizuj své savy!

## 🛠️ Vývoj
```bash
npm install
npm run dev
npm run build-win # Pro vytvoření instalátoru
```

---
Vytvořeno s ❤️ pro fanoušky retro hraní.
