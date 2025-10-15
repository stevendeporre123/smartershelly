const { contextBridge, ipcRenderer } = require('electron');

function invoke(channel, payload) {
  return ipcRenderer.invoke(channel, payload);
}

contextBridge.exposeInMainWorld('shellyManager', {
  customers: {
    list: () => invoke('customers:list'),
    create: (data) => invoke('customers:create', data),
    update: (data) => invoke('customers:update', data),
    delete: (id) => invoke('customers:delete', id)
  },
  scans: {
    list: (customerId) => invoke('scans:list', customerId),
    run: (payload) => invoke('scans:run', payload),
    export: (customerId) => invoke('scans:export', customerId),
    delete: (scanRunId) => invoke('scans:delete', scanRunId)
  },
  devices: {
    list: (customerId) => invoke('devices:list', customerId),
    delete: (deviceId) => invoke('devices:delete', deviceId),
    updateMetadata: (payload) => invoke('devices:updateMetadata', payload),
    fetchSettings: (payload) => invoke('devices:getSettings', payload),
    export: (customerId) => invoke('devices:export', customerId)
  },
  actions: {
    reboot: (payload) => invoke('device:reboot', payload),
    firmware: (payload) => invoke('device:firmware', payload),
    wifi: (payload) => invoke('device:wifi', payload),
    openWeb: (ip) => invoke('device:openWeb', ip),
    deviceSettings: (payload) => invoke('devices:updateSettings', payload)
  },
  system: {
    currentWifiSsid: () => invoke('system:currentWifiSsid')
  }
});

