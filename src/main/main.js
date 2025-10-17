const path = require('path');
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { initDatabase } = require('./database');
const createAutoScanService = require('./auto-scan-service');
const {
  createCustomer,
  updateCustomer,
  listCustomers,
  deleteCustomer,
  getCustomerById,
  listScanRunsForCustomer,
  listAllScanRunsForCustomer,
  listDevicesForCustomer,
  updateDeviceInstallDate,
  logAction,
  deleteDevice,
  deleteScanRun,
  getAutoScanPreferences,
  updateAutoScanPreferences
} = require('./data-store');
const { runScan } = require('./scan-service');
const {
  rebootDevice,
  triggerFirmwareUpdate,
  updateWifiConfig,
  getDeviceSettings,
  updateDeviceSettings,
  toggleDevicePower,
  fetchDevicePowerState
} = require('./shelly-service');
const { getCurrentWifiSsid } = require('./wifi-info');
const { exportDevicesToExcel, exportScanHistoryToExcel } = require('./export-service');

let mainWindow;
let autoScanService = null;

function broadcastAutoScanStatus(status) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('autoScan:status', status);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.ELECTRON_START_URL) {
    mainWindow.loadURL(process.env.ELECTRON_START_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (autoScanService) {
      broadcastAutoScanStatus(autoScanService.getStatus());
    }
  });
}

app.on('ready', () => {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'smartershelly', 'smartershelly.db');
  initDatabase(dbPath);

  autoScanService = createAutoScanService({
    getPreferences: () => getAutoScanPreferences(),
    savePreferences: (preferences) => updateAutoScanPreferences(preferences),
    listCustomers: () => listCustomers(),
    runScan: (options) => runScan(options)
  });

  autoScanService.on('status', (status) => {
    broadcastAutoScanStatus(status);
  });

  autoScanService
    .init()
    .catch((error) => {
      console.error('Failed to initialise auto scan service', error);
    });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle('customers:list', async () => {
  return listCustomers();
});

ipcMain.handle('autoScan:getStatus', async () => {
  if (!autoScanService) {
    return {
      enabled: false,
      intervalMs: 60000,
      isRunning: false,
      lastRunAt: null,
      nextRunAt: null
    };
  }
  return autoScanService.getStatus();
});

ipcMain.handle('autoScan:setEnabled', async (_event, enabled) => {
  if (!autoScanService) {
    throw new Error('Auto scan service is not initialised.');
  }
  try {
    return await autoScanService.setEnabled(enabled);
  } catch (error) {
    console.error('Failed to change auto scan state', error);
    throw error;
  }
});

ipcMain.handle('customers:create', async (_event, payload) => {
  if (!payload || !payload.name) {
    throw new Error('Name is required to create a customer.');
  }
  return createCustomer(payload);
});

ipcMain.handle('customers:update', async (_event, payload) => {
  if (!payload || !payload.id || !payload.name) {
    throw new Error('Id and name are required to update a customer.');
  }
  return updateCustomer(payload);
});

ipcMain.handle('customers:delete', async (_event, customerId) => {
  if (!customerId) {
    throw new Error('customerId is missing.');
  }
  deleteCustomer(customerId);
  return { success: true };
});

ipcMain.handle('scans:list', async (_event, customerId) => {
  if (!customerId) {
    throw new Error('customerId is missing.');
  }
  return listScanRunsForCustomer(customerId);
});

ipcMain.handle('scans:delete', async (_event, scanRunId) => {
  if (!scanRunId) {
    throw new Error('scanRunId is missing.');
  }
  deleteScanRun(scanRunId);
  return { success: true };
});

ipcMain.handle('devices:list', async (_event, customerId) => {
  if (!customerId) {
    throw new Error('customerId is missing.');
  }
  return listDevicesForCustomer(customerId);
});

ipcMain.handle('devices:getPowerStates', async (_event, payload) => {
  if (!Array.isArray(payload) || !payload.length) {
    return [];
  }
  const requests = payload
    .map((item) => ({
      id: item?.id,
      ip: item?.ip,
      credentials: item?.credentials,
      channel: item?.channel
    }))
    .filter((item) => item.id && item.ip);
  if (!requests.length) {
    return [];
  }
  const results = await Promise.allSettled(
    requests.map((item) =>
      fetchDevicePowerState(item.ip, {
        credentials: item.credentials,
        channel: item.channel
      })
    )
  );
  return results.map((result, index) => {
    const request = requests[index];
    if (result.status === 'fulfilled') {
      return {
        id: request.id,
        state: result.value?.state ?? null,
        error: result.value?.error || null,
        status: result.value?.status || null
      };
    }
    const reason = result.reason;
    return {
      id: request.id,
      state: null,
      error: reason?.message || null,
      status: reason?.status || null
    };
  });
});

ipcMain.handle('devices:delete', async (_event, deviceId) => {
  if (!deviceId) {
    throw new Error('deviceId is missing.');
  }
  deleteDevice(deviceId);
  return { success: true };
});

ipcMain.handle('devices:updateMetadata', async (_event, payload) => {
  const { deviceId, customerId, installDate } = payload || {};
  if (!deviceId || !customerId) {
    throw new Error('deviceId en customerId zijn verplicht voor het bijwerken van metadata.');
  }
  updateDeviceInstallDate({
    deviceId,
    installDate: installDate || null
  });
  return { success: true };
});

ipcMain.handle('devices:getSettings', async (_event, payload) => {
  const { ip, credentials } = payload || {};
  if (!ip) {
    throw new Error('IP address is required to fetch settings.');
  }
  return getDeviceSettings(ip, { credentials });
});

ipcMain.handle('devices:export', async (_event, customerId) => {
  if (!customerId) {
    throw new Error('customerId is required for export.');
  }
  const customer = getCustomerById(customerId);
  if (!customer) {
    throw new Error('Customer not found for export.');
  }
  const devices = listDevicesForCustomer(customerId);
  return exportDevicesToExcel({
    browserWindow: mainWindow,
    customer,
    devices
  });
});

ipcMain.handle('scans:export', async (_event, customerId) => {
  if (!customerId) {
    throw new Error('customerId is required for export.');
  }
  const customer = getCustomerById(customerId);
  if (!customer) {
    throw new Error('Customer not found for export.');
  }
  const scans = listAllScanRunsForCustomer(customerId);
  return exportScanHistoryToExcel({
    browserWindow: mainWindow,
    customer,
    scans
  });
});

ipcMain.handle('scans:run', async (_event, payload) => {
  const { customerId } = payload || {};
  if (!customerId) {
    throw new Error('customerId is required for this scan.');
  }
  const customer = getCustomerById(customerId);
  if (!customer) {
    throw new Error('Customer not found.');
  }

  const subnet = payload?.subnet || customer.subnet;
  return runScan({
    customerId,
    subnet,
    ipList: payload?.ipList,
    credentials: payload?.credentials,
    concurrency: payload?.concurrency,
    timeout: payload?.timeout
  });
});

ipcMain.handle('device:reboot', async (_event, payload) => {
  const { ip, credentials, metadata } = payload || {};
  if (!ip) {
    throw new Error('IP-adres is verplicht voor reboot.');
  }
  const result = await rebootDevice(ip, { credentials });
  if (metadata?.deviceId) {
    logAction({
      deviceId: metadata.deviceId,
      action: 'reboot',
      payload: { ip },
      result
    });
  }
  return result;
});

ipcMain.handle('device:firmware', async (_event, payload) => {
  const { ip, otaUrl, credentials, metadata } = payload || {};
  if (!ip || !otaUrl) {
    throw new Error('Zowel IP als OTA URL zijn verplicht voor firmware update.');
  }
  const result = await triggerFirmwareUpdate(ip, { otaUrl, credentials });
  if (metadata?.deviceId) {
    logAction({
      deviceId: metadata.deviceId,
      action: 'firmware',
      payload: { ip, otaUrl },
      result
    });
  }
  return result;
});

ipcMain.handle('device:wifi', async (_event, payload) => {
  const { ip, ssid, password, credentials, metadata, network } = payload || {};
  if (!ip || !ssid) {
    throw new Error('IP en SSID zijn verplicht voor wifi-configuratie.');
  }
  const result = await updateWifiConfig(ip, { ssid, password, credentials, network });
  if (metadata?.deviceId) {
    logAction({
      deviceId: metadata.deviceId,
      action: 'wifi',
      payload: { ip, ssid, network: network || 'wifi1' },
      result
    });
  }
  return result;
});

ipcMain.handle('device:togglePower', async (_event, payload) => {
  const { ip, credentials, metadata, channel } = payload || {};
  if (!ip) {
    throw new Error('IP is vereist om het vermogen te schakelen.');
  }
  const result = await toggleDevicePower(ip, { credentials, channel });
  if (metadata?.deviceId) {
    logAction({
      deviceId: metadata.deviceId,
      action: 'power-toggle',
      payload: { ip, channel },
      result
    });
  }
  return result;
});



ipcMain.handle('devices:updateSettings', async (_event, payload) => {
  const { ip, credentials, settings } = payload || {};
  if (!ip) {
    throw new Error('IP address is required to update settings.');
  }
  await updateDeviceSettings(ip, settings || {}, { credentials });
  return { success: true };
});

ipcMain.handle('device:openWeb', async (_event, ipAddress) => {
  if (!ipAddress || typeof ipAddress !== 'string') {
    throw new Error('Geen geldig IP-adres ontvangen.');
  }
  const url = /^https?:\/\//i.test(ipAddress) ? ipAddress : `http://${ipAddress}`;
  await shell.openExternal(url);
  return { success: true };
});

ipcMain.handle('system:currentWifiSsid', async () => {
  try {
    const ssid = await getCurrentWifiSsid();
    return ssid || null;
  } catch (error) {
    return null;
  }
});


