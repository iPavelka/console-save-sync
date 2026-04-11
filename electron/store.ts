import Store from 'electron-store';

type StoreType = {
  ps3Ip: string;
  ncUrl: string;
  ncUser: string;
  ncPass: string;
};

const store = new Store<StoreType>({
  defaults: {
    ps3Ip: '192.168.1.100',
    ncUrl: '',
    ncUser: '',
    ncPass: '' // In real-world, this should be encrypted, but we use an app password
  }
});

export default store;
