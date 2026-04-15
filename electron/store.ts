import Store from 'electron-store';

export type ConsoleConfig = {
  id: string;
  name: string;
  ip: string;
};

type StoreType = {
  ps3Ip: string; // Legacy/Fallback
  consoles: ConsoleConfig[];
  activeConsoleId: string;
  ncUrl: string;
  ncUser: string;
  ncPass: string;
};

const store = new Store<StoreType>({
  defaults: {
    ps3Ip: '192.168.1.100',
    consoles: [
      { id: 'default', name: 'Main Console', ip: '192.168.1.100' }
    ],
    activeConsoleId: 'default',
    ncUrl: '',
    ncUser: '',
    ncPass: '' 
  }
});

export default store;
