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
    subtitle?: string;
    detail?: string;
    action: 'upload' | 'download' | 'synced';
    ps3Date: Date | null;
    ncDate: Date | null;
    size?: number;
    ps3Detail?: string;
    ncDetail?: string;
    profileId: string;
    iconBase64?: string;
    _loading?: boolean;
};

type PS2VMCInfo = {
    fileName: string;
    size: number;
    mtime: Date;
    games: {serial: string, title: string, icon: string}[];
    action: 'upload' | 'download' | 'synced';
    type: 'vmc' | 'classic';
    profileId?: string;
    _loading?: boolean;
};

function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [settings, setSettings] = useState({ ps3Ip: '', ncUrl: '', ncUser: '', ncPass: '', ps3ProfileId: '', cloudPersona: '' });
  const [loading, setLoading] = useState(false);
  const [availableProfiles, setAvailableProfiles] = useState<{id: string, name: string}[]>([]);
  const [fetchingProfiles, setFetchingProfiles] = useState(false);
  const [scanResults, setScanResults] = useState<SyncItem[]>([]);
  const [ps2Inventory, setPs2Inventory] = useState<PS2VMCInfo[]>([]);
  const [fetchingPS2, setFetchingPS2] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Load settings on mount
  useEffect(() => {
    window.electronAPI.getSettings().then((res: any) => {
      const loaded = {
        ps3Ip: res.ps3Ip || '',
        ncUrl: res.ncUrl || '',
        ncUser: res.ncUser || '',
        ncPass: res.ncPass || '',
        ps3ProfileId: res.ps3ProfileId || '',
        cloudPersona: res.cloudPersona || ''
      };
      setSettings(loaded);
      
      if (loaded.ps3Ip && loaded.ncUrl && loaded.ncUser) {
        handleScanWithSettings(loaded);
        fetchPS2Inventory();
      }
    });
  }, []);

  const fetchPS2Inventory = async () => {
    if (!settings.ps3Ip) return;
    setFetchingPS2(true);
    try {
      const result = await window.electronAPI.getPS2Inventory();
      if (result.success) {
        setPs2Inventory(result.data);
      }
    } catch (e) {
      console.error('Failed to fetch PS2 inventory', e);
    }
    setFetchingPS2(false);
  };

  const fetchProfiles = async () => {
    if (!settings.ps3Ip) {
      setErrorMsg('Nejdříve zadejte IP adresu konzole.');
      return;
    }
    setFetchingProfiles(true);
    setErrorMsg('');
    try {
      const result = await window.electronAPI.getPS3Profiles();
      if (result.success) {
        setAvailableProfiles(result.data);
        if (result.data.length > 0) {
          const updates: any = {};
          if (!settings.ps3ProfileId) updates.ps3ProfileId = result.data[0].id;
          if (!settings.cloudPersona && result.data[0].name) updates.cloudPersona = result.data[0].name;
          if (Object.keys(updates).length > 0) setSettings({...settings, ...updates});
        }
      } else {
        setErrorMsg('Nepodařilo se načíst profily: ' + result.error);
      }
    } catch (e: any) {
      setErrorMsg('Chyba: ' + e.message);
    }
    setFetchingProfiles(false);
  };

  const saveSettings = () => {
    window.electronAPI.saveSettings(settings);
    setActiveTab('dashboard');
  }

  const handleScanWithSettings = async (currentSettings: any) => {
    if (!currentSettings.ps3Ip || !currentSettings.ncUrl) {
      setErrorMsg('Nastavte prosím IP adresu a Nextcloud v sekci Settings.');
      return;
    }
    
    setLoading(true);
    setErrorMsg('');
    try {
      const result = await window.electronAPI.scanDeltas();
      if (result.success) {
        const sorted = (result.data as SyncItem[]).sort((a, b) => {
          const timeA = Math.max(a.ps3Date ? new Date(a.ps3Date).getTime() : 0, a.ncDate ? new Date(a.ncDate).getTime() : 0);
          const timeB = Math.max(b.ps3Date ? new Date(b.ps3Date).getTime() : 0, b.ncDate ? new Date(b.ncDate).getTime() : 0);
          return timeB - timeA;
        });
        setScanResults(sorted);
      } else {
        setErrorMsg('Chyba spojení: ' + result.error);
      }
    } catch (err: any) {
      setErrorMsg('Kritická chyba: ' + err.message);
    }
    setLoading(false);
  };

  const handleScan = () => handleScanWithSettings(settings);

  const handleSyncItem = async (item: SyncItem) => {
    setScanResults(prev => prev.map(r => r.folderName === item.folderName ? { ...r, _loading: true } : r));
    try {
      const result = await window.electronAPI.performSync(item.action, item.profileId, item.folderName);
      if (result.success) {
        setScanResults(prev => prev.map(r => r.folderName === item.folderName ? { ...r, action: 'synced', _loading: false, ps3Date: item.action === 'download' ? item.ncDate : item.ps3Date, ncDate: item.action === 'upload' ? item.ps3Date : item.ncDate } : r));
      } else {
        setErrorMsg('Chyba při přenosu: ' + result.error);
        setScanResults(prev => prev.map(r => r.folderName === item.folderName ? { ...r, _loading: false } : r));
      }
    } catch (e: any) {
       setErrorMsg('Chyba: ' + e.message);
    }
  };

  const handleDecompose = async (vmcFileName: string, gameSerial: string, folderName: string) => {
    try {
      setPs2Inventory(prev => prev.map(v => v.fileName === vmcFileName ? { ...v, _loading: true } : v));
      const result = await window.electronAPI.decomposeVMCtoPSV(vmcFileName, gameSerial, folderName);
      if (result.success) {
        console.log('PSV export success');
      } else {
        setErrorMsg('Chyba při exportu PSV: ' + result.error);
      }
      setPs2Inventory(prev => prev.map(v => v.fileName === vmcFileName ? { ...v, _loading: false } : v));
    } catch (e: any) {
      setErrorMsg('Chyba: ' + e.message);
    }
  };

  const handleDecomposePSU = async (vmcFileName: string, gameSerial: string, folderName: string) => {
    try {
      setPs2Inventory(prev => prev.map(v => v.fileName === vmcFileName ? { ...v, _loading: true } : v));
      const result = await window.electronAPI.decomposeVMCtoPSU(vmcFileName, gameSerial, folderName);
      if (result.success) {
        console.log('PSU export success');
      } else {
        setErrorMsg('Chyba při exportu PSU: ' + result.error);
      }
      setPs2Inventory(prev => prev.map(v => v.fileName === vmcFileName ? { ...v, _loading: false } : v));
    } catch (e: any) {
      setErrorMsg('Chyba: ' + e.message);
    }
  };

  const handleVMCSync = async (vmc: PS2VMCInfo) => {
    setPs2Inventory(prev => prev.map(v => v.fileName === vmc.fileName ? { ...v, _loading: true } : v));
    try {
      let result;
      if (vmc.type === 'vmc') {
        result = await window.electronAPI.performVMCSync(vmc.action, vmc.fileName);
      } else {
        result = await window.electronAPI.performPS2ClassicSync(vmc.action, vmc.profileId || '00000001', vmc.fileName);
      }

      if (result.success) {
        setPs2Inventory(prev => prev.map(v => v.fileName === vmc.fileName ? { ...v, action: 'synced', _loading: false } : v));
      } else {
        setErrorMsg('Chyba při přenosu: ' + result.error);
        setPs2Inventory(prev => prev.map(v => v.fileName === vmc.fileName ? { ...v, _loading: false } : v));
      }
    } catch (e: any) {
      setErrorMsg('Chyba: ' + e.message);
    }
  };

  const uploadCount = scanResults.filter(r => r.action === 'upload').length;
  const downloadCount = scanResults.filter(r => r.action === 'download').length;

  return (
    <div className="app-container">
      {/* --- BACKGROUND WAVE ENGINE --- */}
      <div className="background-container">
        <svg className="waves" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id="glowGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--accent-blue)" stopOpacity="0.8" />
              <stop offset="100%" stopColor="var(--accent-purple)" stopOpacity="0.8" />
            </linearGradient>
          </defs>
          <path className="wave-path" d="M0,50 Q25,30 50,50 T100,50 T150,50 T200,50" />
          <path className="wave-path" d="M0,60 Q25,40 50,60 T100,60 T150,60" />
        </svg>
      </div>

      <header className="top-bar">
        <div className="ps3-logo">
           <img src="/ps3.png" alt="PS3" style={{width: 36, height: 36, objectFit: 'contain', filter: 'invert(1) brightness(2)'}} />
           <span style={{
             background: 'linear-gradient(180deg, #fff 0%, #aaa 100%)',
             WebkitBackgroundClip: 'text',
             WebkitTextFillColor: 'transparent',
             fontWeight: 800,
             fontSize: '1.6rem',
             marginLeft: 10
           }}>PLAYSTATION 3</span>
           <span style={{fontWeight: 300, fontSize: '1rem', opacity: 0.6, marginLeft: 10, letterSpacing: '1px'}}>| Sync Engine</span>
        </div>
        <div className="status-bar">
           <div className="status-item">
             <span className={`dot ${settings.ps3Ip ? 'online' : ''}`}></span>
             PS3: {settings.ps3Ip || 'Offline'}
           </div>
           <div className="status-item" style={{marginLeft: 20}}>
             <span className={`dot ${settings.ncUrl ? 'online' : ''}`}></span>
             Cloud: {settings.ncUser || 'Disconnected'}
           </div>
        </div>
      </header>

      <nav className="xmb-nav">
        <div className={`category ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
          <div className="category-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></svg>
          </div>
          <span className="category-label">Přehled</span>
        </div>
        <div className={`category ${activeTab === 'sync' ? 'active' : ''}`} onClick={() => setActiveTab('sync')}>
          <div className="category-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
          </div>
          <span className="category-label">Synchronizace</span>
        </div>
        <div className={`category ${activeTab === 'ps2' ? 'active' : ''}`} onClick={() => setActiveTab('ps2')}>
          <div className="category-icon" style={{borderColor: activeTab === 'ps2' ? '#3366ff' : 'var(--glass-border)', boxShadow: activeTab === 'ps2' ? '0 0 20px rgba(51, 102, 255, 0.4)' : 'none'}}>
            <span style={{fontSize: '1.4rem', fontWeight: 900, color: '#3366ff'}}>2</span>
          </div>
          <span className="category-label">PS2 Hub</span>
        </div>
        <div className={`category ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
          <div className="category-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </div>
          <span className="category-label">Nastavení</span>
        </div>
      </nav>

      <main className="xmb-content">
        {activeTab === 'dashboard' && (
          <div className="tab-content" style={{animation: 'slideIn 0.4s ease'}}>
            <h1 className="section-title">Vítej zpět</h1>
            <div className="widget-row">
              <div className="widget">
                <h3>K nahrání (PS3)</h3>
                <h1>{uploadCount}</h1>
              </div>
              <div className="widget">
                <h3>Ke stažení (Cloud)</h3>
                <h1>{downloadCount}</h1>
              </div>
            </div>
            <button onClick={handleScan} disabled={loading} style={{padding: '16px 32px', fontSize: '1rem', background: 'var(--accent-blue)', color: '#000', borderRadius: '12px', border: 'none', fontWeight: 700, cursor: 'pointer'}}>
              {loading ? 'Skenuji...' : 'Skenovat změny'}
            </button>
            {errorMsg && <p style={{color: '#ff3366', marginTop: 20}}>{errorMsg}</p>}
          </div>
        )}

        {activeTab === 'ps2' && (
          <div className="tab-content" style={{animation: 'slideIn 0.4s ease', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0}}>
            <h1 className="section-title">PS2 Hub</h1>
            <div className="widget-row">
              <div className="widget" style={{background: 'rgba(51, 102, 255, 0.05)', borderColor: 'rgba(51, 102, 255, 0.2)'}}>
                <h3>Nalezené karty (.VM2)</h3>
                <h1>{ps2Inventory.length}</h1>
              </div>
              <div className="widget">
                 <h3>Hry na kartách</h3>
                 <h1>{ps2Inventory.reduce((acc, v) => acc + v.games.length, 0)}</h1>
              </div>
            </div>
            
            <button onClick={fetchPS2Inventory} disabled={fetchingPS2} style={{alignSelf: 'flex-start', padding: '12px 24px', background: 'var(--glass)', border: '1px solid var(--glass-border)', color: '#fff', borderRadius: '8px', cursor: 'pointer', marginBottom: 20}}>
               {fetchingPS2 ? 'Skenuji karty...' : 'Obnovit seznam karet'}
            </button>

            <div className="sync-list">
              {ps2Inventory.length === 0 && !fetchingPS2 && (
                <div style={{padding: 40, textAlign: 'center', opacity: 0.5}}>Nebyly nalezeny žádné virtuální paměťové karty.</div>
              )}
              
              {ps2Inventory.map(vmc => (
                <div key={vmc.fileName} style={{
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: '16px',
                  padding: '24px',
                  marginBottom: '20px',
                  border: '1px solid var(--glass-border)'
                }}>
                  <div style={{display: 'flex', alignItems: 'center', gap: '20px', marginBottom: vmc.games.length > 0 ? '20px' : '0'}}>
                    <div style={{
                       width: '60px', height: '80px', background: '#222', borderRadius: '4px',
                       display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                       border: '2px solid #555', position: 'relative'
                    }}>
                       <div style={{fontSize: '0.6rem', color: '#888', marginBottom: 2}}>MEMORY</div>
                       <div style={{fontSize: '0.6rem', color: '#888'}}>CARD</div>
                       <div style={{fontSize: '0.8rem', color: '#ccc', fontWeight: 800, marginTop: 4}}>{vmc.size > 1024*1024*8 ? '64MB' : '8MB'}</div>
                       <div style={{position: 'absolute', bottom: 4, width: '80%', height: '2px', background: '#333'}}></div>
                    </div>
                    <div style={{flex: 1}}>
                      <h4 style={{fontSize: '1.4rem', marginBottom: 4}}>{vmc.fileName}</h4>
                      <p style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>
                        Velikost: {(vmc.size / 1024 / 1024).toFixed(1)} MB | {vmc.games.length === 0 ? 'Parser nenašel hry (možno zálohovat pouze vcelku)' : `${vmc.games.length} her nalezeno`}
                      </p>
                    </div>
                    <div className="sync-actions">
                      <button onClick={() => handleVMCSync(vmc)} disabled={vmc._loading} style={{
                        background: vmc.action === 'synced' ? 'rgba(0, 230, 118, 0.2)' : 'var(--glass)',
                        borderColor: vmc.action === 'synced' ? '#00e676' : 'var(--glass-border)'
                      }}>
                        {vmc._loading ? 'Přenáším...' : vmc.action === 'synced' ? 'Zálohováno' : 'Zálohovat kartu'}
                      </button>
                    </div>
                  </div>

                  {vmc.games.length > 0 && (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                      gap: '20px',
                      padding: '20px',
                      background: 'rgba(0,0,0,0.2)',
                      borderRadius: '12px'
                    }}>
                      {vmc.games.map(game => (
                        <div key={game.serial} style={{
                          textAlign: 'center', 
                          padding: '12px',
                          background: 'rgba(255,255,255,0.02)',
                          borderRadius: '8px',
                          transition: 'transform 0.2s',
                          position: 'relative'
                        }} className="ps2-game-card">
                           <img src={game.icon} alt={game.title} style={{
                             width: '100px', height: '140px', objectFit: 'cover', borderRadius: '4px',
                             boxShadow: '0 4px 10px rgba(0,0,0,0.4)', marginBottom: '12px'
                           }} />
                           <div style={{fontSize: '0.75rem', fontWeight: 600, marginBottom: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{game.title}</div>
                           <div style={{display: 'flex', flexDirection: 'column', gap: '6px'}}>
                             <button 
                               onClick={() => handleDecompose(vmc.fileName, game.serial, game.serial)} 
                               className="btn-psv-export"
                               disabled={vmc._loading}
                             >
                               📤 EXPORT .PSV
                             </button>
                             <button 
                               onClick={() => handleDecomposePSU(vmc.fileName, game.serial, game.serial)} 
                               className="btn-psu-export"
                               disabled={vmc._loading}
                             >
                               💾 EXPORT .PSU
                             </button>
                           </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'sync' && (
          <div className="tab-content" style={{animation: 'slideIn 0.4s ease', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0}}>
            <h1 className="section-title">Správce Savů</h1>
            <div className="sync-list">
              {scanResults.length === 0 && !loading && (
                <div style={{padding: 40, textAlign: 'center', opacity: 0.5}}>Vše je synchronizováno nebo neproběhl sken.</div>
              )}
              {scanResults.map(res => (
                <div className="sync-item" key={res.folderName} style={{
                  background: res.action === 'synced' ? 'rgba(0, 230, 118, 0.05)' : 'rgba(255, 255, 255, 0.03)'
                }}>
                  <div className="sync-header">
                    {res.iconBase64 ? (
                      <img src={res.iconBase64} alt="icon" className="game-icon" />
                    ) : (
                      <div className="game-icon" style={{background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>🎮</div>
                    )}
                    <div className="sync-info">
                      <h4 style={{display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px'}}>
                        {res.gameTitle || res.folderName} 
                        {res.action === 'upload' && <span className="badge upload">K ZÁLOZE</span>}
                        {res.action === 'download' && <span className="badge download">KE STAŽENÍ</span>}
                        {res.action === 'synced' && <span className="badge synced">SYNCHRONIZOVÁNO</span>}
                      </h4>
                      {res.subtitle && <div style={{fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)', fontStyle: 'italic'}}>{res.subtitle}</div>}
                    </div>
                  </div>

                  <div className="sync-meta">
                    <div className="sync-meta-grid">
                      {/* LOCAL COLUMN */}
                      <div className={`sync-column ps3 ${res.action === 'upload' ? 'active-source' : ''} ${res.ps3Date && res.ncDate && new Date(res.ps3Date) > new Date(res.ncDate) ? 'newer' : ''}`}>
                        <div className="col-header">
                          <div className="col-icon" style={{ background: '#fff' }}>
                            <img src="/ps3.png" alt="PS3" style={{width: 20, height: 20, objectFit: 'contain'}} />
                          </div>
                          <div className="col-data">
                            <span className="col-label">Konzole PS3</span>
                            <span className="col-time">
                              {res.ps3Date ? new Date(res.ps3Date).toLocaleDateString() + ' ' + new Date(res.ps3Date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Žádná data'}
                            </span>
                          </div>
                        </div>
                        {res.ps3Detail && (
                          <div className="col-detail">
                            {res.ps3Detail}
                          </div>
                        )}
                        {res.ps3Date && res.ncDate && new Date(res.ps3Date) > new Date(res.ncDate) && (
                          <div className="status-indicator is-newer">Novější</div>
                        )}
                        {res.ps3Date && res.ncDate && new Date(res.ps3Date) < new Date(res.ncDate) && (
                          <div className="status-indicator is-older">Starší</div>
                        )}
                      </div>

                      {/* CLOUD COLUMN */}
                      <div className={`sync-column cloud ${res.action === 'download' ? 'active-source' : ''} ${res.ps3Date && res.ncDate && new Date(res.ncDate) > new Date(res.ps3Date) ? 'newer' : ''}`}>
                        <div className="col-header">
                          <div className="col-icon" style={{ background: 'rgba(112, 0, 255, 0.2)', border: '1px solid rgba(112, 0, 255, 0.2)' }}>
                            ☁️
                          </div>
                          <div className="col-data">
                            <span className="col-label">Cloudové úložiště</span>
                            <span className="col-time">
                              {res.ncDate ? new Date(res.ncDate).toLocaleDateString() + ' ' + new Date(res.ncDate).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Žádná data'}
                            </span>
                          </div>
                        </div>
                        {res.ncDetail && (
                          <div className="col-detail">
                            {res.ncDetail}
                          </div>
                        )}
                        {res.ps3Date && res.ncDate && new Date(res.ncDate) > new Date(res.ps3Date) && (
                          <div className="status-indicator is-newer">Novější</div>
                        )}
                        {res.ps3Date && res.ncDate && new Date(res.ncDate) < new Date(res.ps3Date) && (
                          <div className="status-indicator is-older">Starší</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="sync-footer">
                    <div className="folder-label">Složka: {res.folderName}</div>
                    <div className="sync-actions">
                      {res.action === 'upload' && <button onClick={() => handleSyncItem(res)} disabled={res._loading}>{res._loading ? 'Přenáším...' : 'Nahrát do Cloudu'}</button>}
                      {res.action === 'download' && <button onClick={() => handleSyncItem(res)} disabled={res._loading}>{res._loading ? 'Přenáším...' : 'Stáhnout do PS3'}</button>}
                      {res.action === 'synced' && <button disabled style={{ opacity: 0.3, background: 'rgba(255,255,255,0.1)', color: '#fff', boxShadow: 'none' }}>Synchronizováno</button>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="tab-content" style={{animation: 'slideIn 0.4s ease', maxWidth: '800px', width: '100%'}}>
            <h1 className="section-title">Konfigurace služeb</h1>
            
            <div className="settings-grid" style={{
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', 
              gap: '24px'
            }}>
              <div className="settings-section widget" style={{display: 'flex', flexDirection: 'column', gap: '20px'}}>
                <h3 style={{display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--accent-blue)'}}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line></svg>
                  Konzole PS3
                </h3>
                <div className="input-field">
                  <label>Místní IP Adresa</label>
                  <input type="text" value={settings.ps3Ip} onChange={e => setSettings({...settings, ps3Ip: e.target.value})} placeholder="Např. 192.168.1.15"/>
                </div>

                <div className="input-field">
                  <label>Aktivní Profil na PS3</label>
                  <div style={{display: 'flex', gap: '10px'}}>
                    <select 
                      value={settings.ps3ProfileId} 
                      onChange={e => setSettings({...settings, ps3ProfileId: e.target.value})}
                      style={{
                        flex: 1,
                        background: 'rgba(0,0,0,0.4)',
                        border: '1px solid var(--glass-border)',
                        padding: '14px',
                        borderRadius: '12px',
                        color: '#fff',
                        fontFamily: 'inherit',
                        outline: 'none'
                      }}
                    >
                      {!settings.ps3ProfileId && <option value="">Nevybráno</option>}
                      {availableProfiles.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.id})</option>
                      ))}
                    </select>
                    <button onClick={fetchProfiles} disabled={fetchingProfiles} style={{
                      padding: '0 20px',
                      background: 'var(--glass)',
                      border: '1px solid var(--glass-border)',
                      color: '#fff',
                      borderRadius: '12px',
                      cursor: 'pointer'
                    }}>
                      {fetchingProfiles ? '...' : 'Skenovat'}
                    </button>
                  </div>
                  <small style={{color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: '4px'}}>
                    Musíš nejdřív proskenovat konzoli a zvolit správný profil.
                  </small>
                </div>

                <div className="input-field">
                  <label>Cloudové Jméno (Persona)</label>
                  <input 
                    type="text" 
                    value={settings.cloudPersona} 
                    onChange={e => setSettings({...settings, cloudPersona: e.target.value})} 
                    placeholder="Např. Velbloud"
                  />
                  <small style={{color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: '4px'}}>
                    Toto jméno propojuje tvoji konzoli s cloudem. Použij stejné jméno na všech svých PS3!
                  </small>
                </div>
              </div>

              <div className="settings-section widget" style={{display: 'flex', flexDirection: 'column', gap: '20px'}}>
                <h3 style={{display: 'flex', alignItems: 'center', gap: '10px', color: '#c499ff'}}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                  Nextcloud Cloud
                </h3>
                <div className="input-field">
                  <label>WebDAV URL</label>
                  <input type="text" value={settings.ncUrl} onChange={e => setSettings({...settings, ncUrl: e.target.value})} placeholder="https://tvuj-cloud.cz"/>
                </div>
                <div className="input-field">
                  <label>Uživatelské jméno</label>
                  <input type="text" value={settings.ncUser} onChange={e => setSettings({...settings, ncUser: e.target.value})} placeholder="admin"/>
                </div>
                <div className="input-field">
                  <label>Aplikační heslo</label>
                  <input type="password" value={settings.ncPass} onChange={e => setSettings({...settings, ncPass: e.target.value})} placeholder="xxxx-xxxx-xxxx-xxxx"/>
                  <small style={{color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: '4px'}}>Doporučuje se použít "App password" z nastavení zabezpečení Nextcloudu.</small>
                </div>
              </div>
            </div>

            <div style={{marginTop: '32px', display: 'flex', justifyContent: 'flex-end'}}>
              <button onClick={saveSettings} style={{
                background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))',
                color: '#fff',
                padding: '16px 48px',
                border: 'none',
                borderRadius: '12px',
                fontWeight: 700,
                fontSize: '1rem',
                cursor: 'pointer',
                boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
                transition: 'transform 0.2s ease'
              }}
              onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
              >
                Uložit a synchronizovat
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
