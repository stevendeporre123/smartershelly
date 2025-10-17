const asyncPool = require('./async-pool');
const { expandTargets } = require('./network-utils');
const {
  createScanRun,
  completeScanRun,
  upsertDevice,
  createDeviceSnapshot,
  listDevicesForCustomer,
  getPreviousSnapshotForDevice,
  setDeviceLastSnapshot
} = require('./data-store');
const { detectShellyDevice } = require('./shelly-service');

const DEFAULT_CONCURRENCY = 20;

function computeDiffStatus(previousSnapshot, currentData) {
  if (!previousSnapshot) {
    return 'new';
  }
  const relevantFields = ['firmwareVersion', 'ip', 'wifiSsid', 'hostname', 'app', 'generation'];
  const hasChanges = relevantFields.some((field) => {
    const prevValue = previousSnapshot[field];
    return prevValue !== currentData[field];
  });
  return hasChanges ? 'changed' : 'unchanged';
}

function computeDiffDetails(diffStatus, previousSnapshot, currentData) {
  if (diffStatus === 'new') {
    return 'New device detected';
  }
  if (diffStatus === 'unchanged') {
    return 'No changes detected';
  }
  if (diffStatus === 'offline') {
    return 'Device not found during scan';
  }
  if (diffStatus !== 'changed') {
    return null;
  }
  const fields = [
    { key: 'firmwareVersion', label: 'Firmware' },
    { key: 'ip', label: 'IP' },
    { key: 'wifiSsid', label: 'Wi-Fi' },
    { key: 'hostname', label: 'Hostname' },
    { key: 'app', label: 'App' },
    { key: 'generation', label: 'Generation' }
  ];
  const messages = [];
  fields.forEach(({ key, label }) => {
    const previous = previousSnapshot ? previousSnapshot[key] : null;
    const current = currentData[key];
    if (previous !== current) {
      messages.push(`${label}: ${previous || '-'} -> ${current || '-'}`);
    }
  });
  return messages.length ? messages.join('; ') : 'Change detected';
}

async function runScan({
  customerId,
  subnet,
  ipList,
  credentials,
  concurrency = DEFAULT_CONCURRENCY,
  timeout = 3500
}) {
  if (!customerId) {
    throw new Error('customerId is vereist voor een scan.');
  }

  const targets = expandTargets({ subnet, ipList });
  if (!targets.length) {
    throw new Error('No IP addresses found to scan. Provide a subnet or IP list.');
  }

  const scanRun = createScanRun({
    customerId,
    startedAt: new Date().toISOString()
  });

  const existingDevices = listDevicesForCustomer(customerId);
  const existingByIdentifier = new Map();
  const existingByMac = new Map();
  existingDevices.forEach((device) => {
    if (device.deviceIdentifier) {
      existingByIdentifier.set(device.deviceIdentifier, device);
    }
    if (device.mac) {
      existingByMac.set(device.mac.toLowerCase(), device);
    }
  });
  const seenDeviceIds = new Set();
  const snapshotResults = [];

  const poolResults = await asyncPool(concurrency, targets, async (ip) => {
    try {
      const deviceData = await detectShellyDevice(ip, {
        credentials,
        timeout
      });
      return {
        status: 'online',
        ip,
        data: deviceData
      };
    } catch (err) {
      return {
        status: 'offline',
        ip,
        error: err.message || 'Onbekende fout'
      };
    }
  });

  for (const result of poolResults) {
    if (result.status !== 'online') {
      continue;
    }
    const payload = result.data;
    if (!payload.firmwareVersion) {
      // likely not a Shelly device; skip so it does not appear in the scan results
      continue;
    }
    const identifier = payload.deviceIdentifier;
    const normalizedMac = payload.mac ? payload.mac.toLowerCase() : null;
    const existingDevice =
      (normalizedMac && existingByMac.get(normalizedMac)) || existingByIdentifier.get(identifier);
    const previousIdentifier = existingDevice ? existingDevice.deviceIdentifier : null;
    const previousMacKey = existingDevice && existingDevice.mac ? existingDevice.mac.toLowerCase() : null;
    const previousSnapshot = getPreviousSnapshotForDevice(customerId, identifier, payload.mac);
    const diffStatus = computeDiffStatus(previousSnapshot, {
      firmwareVersion: payload.firmwareVersion,
      ip: payload.ip,
      wifiSsid: payload.wifiSsid,
      hostname: payload.hostname,
      app: payload.app,
      generation: payload.generation,
      rssi: payload.rssi ?? null
    });
    const diffNote = computeDiffDetails(diffStatus, previousSnapshot, {
      firmwareVersion: payload.firmwareVersion,
      ip: payload.ip,
      wifiSsid: payload.wifiSsid,
      hostname: payload.hostname,
      app: payload.app,
      generation: payload.generation
    });

    const installDate =
      existingDevice?.installDate || previousSnapshot?.installDate || null;

    const deviceRecord = upsertDevice(customerId, {
      deviceIdentifier: identifier,
      model: payload.model,
      hostname: payload.hostname,
      mac: payload.mac,
      lastIp: payload.ip,
      firmwareVersion: payload.firmwareVersion,
      wifiSsid: payload.wifiSsid,
      rssi: payload.rssi ?? null,
      installDate,
      uptime: payload.uptime ?? null,
      status: 'online',
      lastSeen: new Date().toISOString(),
      app: payload.app,
      generation: payload.generation
    });
    seenDeviceIds.add(deviceRecord.id);

    const resolvedDeviceIdentifier =
      deviceRecord.device_identifier || deviceRecord.deviceIdentifier || identifier;
    const resolvedMac = deviceRecord.mac || payload.mac || null;

    let targetDevice = existingDevice;
    if (!targetDevice) {
      targetDevice = {
        id: deviceRecord.id,
        deviceIdentifier: resolvedDeviceIdentifier,
        mac: resolvedMac,
        hostname: payload.hostname,
        model: payload.model,
        firmwareVersion: payload.firmwareVersion,
        wifiSsid: payload.wifiSsid,
        rssi: payload.rssi ?? null,
        installDate,
        app: payload.app,
        generation: payload.generation,
        lastIp: payload.ip,
        status: 'online',
        lastSeen: deviceRecord.lastSeen || deviceRecord.last_seen || new Date().toISOString()
      };
      existingDevices.push(targetDevice);
    } else {
      targetDevice.deviceIdentifier = resolvedDeviceIdentifier;
      targetDevice.mac = resolvedMac;
      targetDevice.installDate = installDate;
      targetDevice.hostname = payload.hostname;
      targetDevice.model = payload.model;
      targetDevice.firmwareVersion = payload.firmwareVersion;
      targetDevice.wifiSsid = payload.wifiSsid;
      targetDevice.rssi = payload.rssi ?? null;
      targetDevice.app = payload.app;
      targetDevice.generation = payload.generation;
      targetDevice.status = 'online';
      targetDevice.lastSeen =
        deviceRecord.lastSeen || deviceRecord.last_seen || new Date().toISOString();
      targetDevice.lastIp = payload.ip;
    }

    if (previousIdentifier && previousIdentifier !== resolvedDeviceIdentifier) {
      existingByIdentifier.delete(previousIdentifier);
    }
    existingByIdentifier.set(resolvedDeviceIdentifier, targetDevice);
    if (previousMacKey && previousMacKey !== normalizedMac) {
      existingByMac.delete(previousMacKey);
    }
    if (normalizedMac) {
      existingByMac.set(normalizedMac, targetDevice);
    }

    const snapshotId = createDeviceSnapshot({
      scanRunId: scanRun.id,
      deviceId: deviceRecord.id,
      deviceIdentifier: identifier,
      ip: payload.ip,
      mac: payload.mac,
      hostname: payload.hostname,
      model: payload.model,
      firmwareVersion: payload.firmwareVersion,
      wifiSsid: payload.wifiSsid,
      rssi: payload.rssi ?? null,
      installDate,
      uptime: payload.uptime ?? null,
      app: payload.app,
      generation: payload.generation,
      isOnline: true,
      diffStatus,
      rawPayload: {
        ...payload.raw,
        diffNote
      }
    });
    setDeviceLastSnapshot({
      deviceId: deviceRecord.id,
      snapshotId,
      status: 'online',
      rssi: payload.rssi ?? null
    });

    snapshotResults.push({
      deviceIdentifier: identifier,
      diffStatus,
      isOnline: true,
      ip: payload.ip,
      firmwareVersion: payload.firmwareVersion,
      installDate,
      snapshotId,
      diffNote,
      app: payload.app,
      generation: payload.generation,
      rssi: payload.rssi ?? null
    });
  }

  for (const device of existingDevices) {
    if (!seenDeviceIds.has(device.id)) {
      const diffStatus = 'offline';
      const diffNote = computeDiffDetails(diffStatus, null, {});
      const snapshotId = createDeviceSnapshot({
        scanRunId: scanRun.id,
        deviceId: device.id,
        deviceIdentifier: device.deviceIdentifier,
        ip: device.lastIp,
        mac: device.mac,
        hostname: device.hostname,
        model: device.model,
        firmwareVersion: device.firmwareVersion,
        wifiSsid: device.wifiSsid,
        rssi: device.rssi ?? null,
        installDate: device.installDate || null,
        app: device.app,
        generation: device.generation,
        isOnline: false,
        diffStatus,
        rawPayload: {
          note: 'Device not found during scan',
          diffNote
        }
      });
      setDeviceLastSnapshot({
        deviceId: device.id,
        snapshotId,
        status: 'offline',
        rssi: device.rssi ?? null
      });
      snapshotResults.push({
        deviceIdentifier: device.deviceIdentifier,
        diffStatus,
        isOnline: false,
        ip: device.lastIp,
        firmwareVersion: device.firmwareVersion,
        installDate: device.installDate || null,
        snapshotId,
        diffNote,
        app: device.app,
        generation: device.generation,
        rssi: device.rssi ?? null
      });
    }
  }

  const completed = completeScanRun({
    scanRunId: scanRun.id,
    completedAt: new Date().toISOString(),
    totalDevices: snapshotResults.length
  });

  return {
    scanRun: completed,
    results: snapshotResults,
    targetCount: targets.length
  };
}

module.exports = {
  runScan
};

