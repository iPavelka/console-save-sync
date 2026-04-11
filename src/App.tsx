import { useState, useEffect } from 'react'

// Define the global window type for electronAPI
declare global {
  interface Window {
    electronAPI: any;
  }
}

type SyncItem = {
    folderName: string;
    gameTitle: string | null;
    action: 'upload' | 'download' | 'synced';
    ps3Date: Date | null;
    ncDate: Date | null;
    profileId: string;
    iconBase64?: string;
};

function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [settings, setSettings] = useState({ ps3Ip: '', ncUrl: '', ncUser: '', ncPass: '' });
  const [loading, setLoading] = useState(false);
  const [scanResults, setScanResults] = useState<SyncItem[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  // Load setttings on mount
  useEffect(() => {
    window.electronAPI.getSettings().then((res: any) => {
      const loaded = {
        ps3Ip: res.ps3Ip || '',
        ncUrl: res.ncUrl || '',
        ncUser: res.ncUser || '',
        ncPass: res.ncPass || ''
      };
      setSettings(loaded);
      
      if (loaded.ps3Ip && loaded.ncUrl && loaded.ncUser) {
        handleScanWithSettings(loaded);
      }
    });
  }, []);

  const saveSettings = () => {
    window.electronAPI.saveSettings(settings);
    setActiveTab('dashboard'); // return to dash
  }

  const handleScanWithSettings = async (currentSettings: any) => {
    if (!currentSettings.ps3Ip || !currentSettings.ncUrl) {
      setErrorMsg('Nastavte prosím IP adresu a Nextcloud URL v Nastavení.');
      return;
    }
    
    setLoading(true);
    setErrorMsg('');
    try {
      const result = await window.electronAPI.scanDeltas();
      if (result.success) {
        setScanResults(result.data);
      } else {
        setErrorMsg('Chyba komunikace s PS3 nebo Nextcloudem: ' + result.error);
      }
    } catch (err: any) {
      setErrorMsg('Kritická chyba: ' + err.message);
    }
    setLoading(false);
  };

  const handleScan = () => handleScanWithSettings(settings);

    const uploadCount = scanResults.filter(r => r.action === 'upload').length;
    const downloadCount = scanResults.filter(r => r.action === 'download').length;
  
    const handleSyncItem = async (item: SyncItem) => {
      // Mark as loading visually
      setScanResults(prev => prev.map(r => r.folderName === item.folderName ? { ...r, action: 'synced', _loading: true } as any : r));
      try {
        const result = await window.electronAPI.performSync(item.action, item.profileId, item.folderName);
        if (result.success) {
          // Success
          setScanResults(prev => prev.map(r => r.folderName === item.folderName ? { ...r, action: 'synced', _loading: false } as any : r));
        } else {
          setErrorMsg('Chyba při přenosu dat: ' + result.error);
          // Revert on error
          setScanResults(prev => prev.map(r => r.folderName === item.folderName ? { ...r, action: item.action, _loading: false } as any : r));
        }
      } catch (e: any) {
         setErrorMsg('Kritická chyba: ' + e.message);
      }
    };
  
    return (
      <div className="app-container">
        <aside className="sidebar glass-panel">
          <div className="brand">
            Console Save Sync
          </div>
          
          <div className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9"></rect><rect x="14" y="3" width="7" height="5"></rect><rect x="14" y="12" width="7" height="9"></rect><rect x="3" y="16" width="7" height="5"></rect></svg>
            Dashboard
          </div>
          <div className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
            Nastavení
          </div>
          
          <div style={{marginTop: 'auto'}}>
            <div className="status">
              <div className={`status-dot ${settings.ps3Ip ? 'online' : ''}`}></div>
              PS3: {settings.ps3Ip || 'Nenastaveno'}
            </div>
            <div className="status" style={{marginTop: 8}}>
              <div className={`status-dot ${settings.ncUrl ? 'online' : ''}`}></div>
              Cloud: {settings.ncUser ? settings.ncUser : 'Nenastaveno'}
            </div>
          </div>
        </aside>
  
        <main className="main-content">
          {activeTab === 'dashboard' ? (
            <>
              <div className="header">
                <div>
                  <h1>Přehled Synchronizace</h1>
                  <p>Spravuj své PS3 savy a zálohuj je do bezpečí</p>
                </div>
                <button onClick={handleScan} disabled={loading}>
                  {loading ? 'Pracuji...' : (
                    <>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.59-9.21l-5.69-1.56"/></svg>
                      Skenovat změny
                    </>
                  )}
                </button>
              </div>
  
              {errorMsg && (
                <div className="glass-panel" style={{borderLeft: '4px solid var(--danger-color)', color: 'var(--danger-color)'}}>
                  {errorMsg}
                </div>
              )}
  
              <div className="widget-grid">
                 <div className="widget glass-panel">
                   <h3>Nové na PS3</h3>
                   <h1 style={{fontSize: '3rem', color: 'var(--accent-color)'}}>{uploadCount}</h1>
                   <p style={{color: 'var(--text-secondary)'}}>Savy připravené k záloze do Nexcloudu.</p>
                 </div>
                 
                 <div className="widget glass-panel">
                   <h3>Nové v Cloudu</h3>
                   <h1 style={{fontSize: '3rem', color: 'var(--success-color)'}}>{downloadCount}</h1>
                   <p style={{color: 'var(--text-secondary)'}}>Savy z jiné konzole k vložení do PS3.</p>
                 </div>
              </div>
  
              <div className="widget glass-panel" style={{flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0}}>
                <h3>Nalezené diference (Deltas)</h3>
                
                <div className="sync-list" style={{overflowY: 'auto', flex: 1, paddingRight: 8}}>
                   {scanResults.length === 0 && !loading && (
                     <p style={{color: 'var(--text-secondary)'}}>Zatím nebyly provedeny žádné skeny, nebo jsou všechny savy synchronizované.</p>
                   )}
                   {scanResults.map(res => (
                     <div className="sync-item" key={res.folderName} style={{display: 'flex', alignItems: 'center'}}>
                       {res.iconBase64 && (
                         <img src={res.iconBase64} alt="icon" style={{width: 64, height: 64, borderRadius: 8, marginRight: 16, objectFit: 'cover'}} />
                       )}
                       <div className="sync-info" style={{flex: 1}}>
                         <h4>{res.gameTitle} 
                           {res.action === 'upload' && <span className="badge upload" style={{marginLeft: 8}}>Upload do Cloudu</span>}
                           {res.action === 'download' && <span className="badge download" style={{marginLeft: 8}}>Download do PS3</span>}
                           {res.action === 'synced' && <span className="badge" style={{marginLeft: 8, background: 'rgba(255,255,255,0.1)'}}>Zálohováno</span>}
                         </h4>
                         <div className="sync-meta" style={{display: 'flex', gap: '24px', marginTop: '8px', alignItems: 'center'}}>
                           <span style={{background: 'rgba(0,0,0,0.3)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)'}}>
                             📁 {res.folderName}
                           </span>
                           
                           <div style={{display: 'flex', gap: '24px', borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '24px'}}>
                             <span style={{
                               color: res.action === 'upload' ? 'var(--accent-color)' : 'var(--text-secondary)',
                               fontWeight: res.action === 'upload' ? 600 : 400
                             }}>
                               🕹️ PS3: {res.ps3Date ? new Date(res.ps3Date).toLocaleString() : <span style={{opacity: 0.5}}>- Chybí -</span>}
                             </span>
                             <span style={{
                               color: res.action === 'download' ? 'var(--success-color)' : 'var(--text-secondary)',
                               fontWeight: res.action === 'download' ? 600 : 400
                             }}>
                               ☁️ Cloud: {res.ncDate ? new Date(res.ncDate).toLocaleString() : <span style={{opacity: 0.5}}>- Chybí -</span>}
                             </span>
                           </div>
                         </div>
                       </div>
                       <div className="sync-actions">
                         {res.action === 'upload' && <button onClick={() => handleSyncItem(res)}>Nahrát Zálohu</button>}
                         {res.action === 'download' && <button className="secondary" onClick={() => handleSyncItem(res)}>Stáhnout do PS3</button>}
                         {res as any && (res as any)._loading && <span style={{marginLeft: 10}}>Přenáším data...</span>}
                       </div>
                     </div>
                   ))}
                   
                </div>
              </div>
          </>
        ) : (
          <div className="widget glass-panel" style={{maxWidth: 600, margin: 'auto'}}>
            <h2 style={{marginBottom: '24px'}}>Nastavení Spojení</h2>
            
            <div className="input-group">
              <label>IP Adresa PS3 (např. 192.168.1.100)</label>
              <input type="text" value={settings.ps3Ip} onChange={e => setSettings({...settings, ps3Ip: e.target.value})} placeholder="Host IP"/>
            </div>

            <div className="input-group" style={{marginTop: '24px'}}>
              <label>Nextcloud WebDAV URL</label>
              <input type="text" value={settings.ncUrl} onChange={e => setSettings({...settings, ncUrl: e.target.value})} placeholder="https://tvuj-cloud.cz/"/>
            </div>

            <div className="input-group">
              <label>Nextcloud Uživatelské jméno</label>
              <input type="text" value={settings.ncUser} onChange={e => setSettings({...settings, ncUser: e.target.value})} placeholder="admin"/>
            </div>

            <div className="input-group">
              <label>Nextcloud Aplikační heslo (App Password)</label>
              <input type="password" value={settings.ncPass} onChange={e => setSettings({...settings, ncPass: e.target.value})} placeholder="xxxx-xxxx-xxxx-xxxx"/>
            </div>
            
            <button onClick={saveSettings} style={{marginTop: '24px', width: '100%'}}>Uložit a pokračovat</button>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
