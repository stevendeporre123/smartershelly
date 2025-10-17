const { getDb } = require('./database');
const { derivePowerStateFromSnapshot } = require('./power-utils');

const DEFAULT_AUTO_SCAN_PREFERENCES = {
  enabled: false,
  intervalMs: 60000
};

function createCustomer({ name, description, subnet, contact, wifiSsid, wifiPassword }) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO customers (name, description, subnet, contact, wifi_ssid, wifi_password)
    VALUES (@name, @description, @subnet, @contact, @wifiSsid, @wifiPassword)
  `);
  const info = stmt.run({
    name,
    description: description || null,
    subnet: subnet || null,
    contact: contact || null,
    wifiSsid: wifiSsid || null,
    wifiPassword: wifiPassword || null
  });
  return getCustomerById(info.lastInsertRowid);
}

function listCustomers() {
  return getDb()
    .prepare(`
      SELECT id, name, description, subnet, contact,
             wifi_ssid AS wifiSsid, wifi_password AS wifiPassword,
             created_at
      FROM customers
      ORDER BY created_at DESC
    `)
    .all();
}

function getCustomerById(id) {
  return getDb()
    .prepare(`
      SELECT id, name, description, subnet, contact,
             wifi_ssid AS wifiSsid, wifi_password AS wifiPassword,
             created_at
      FROM customers
      WHERE id = ?
    `)
    .get(id);
}

function deleteCustomer(id) {
  return getDb()
    .prepare('DELETE FROM customers WHERE id = ?')
    .run(id);
}

function updateCustomer({ id, name, description, subnet, contact, wifiSsid, wifiPassword }) {
  if (!id) {
    throw new Error('Customer id is required to update a customer.');
  }
  const db = getDb();
  db.prepare(
    `
    UPDATE customers
    SET name = @name,
        description = @description,
        subnet = @subnet,
        contact = @contact,
        wifi_ssid = @wifiSsid,
        wifi_password = @wifiPassword
    WHERE id = @id
  `
  ).run({
    id,
    name,
    description: description || null,
    subnet: subnet || null,
    contact: contact || null,
    wifiSsid: wifiSsid || null,
    wifiPassword: wifiPassword || null
  });
  return getCustomerById(id);
}

function createScanRun({ customerId, startedAt, notes }) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO scan_runs (customer_id, started_at, notes)
    VALUES (@customerId, @startedAt, @notes)
  `);
  const info = stmt.run({
    customerId,
    startedAt,
    notes: notes || null
  });
  return getScanRunById(info.lastInsertRowid);
}

function completeScanRun({ scanRunId, completedAt, totalDevices }) {
  const db = getDb();
  db.prepare(`
    UPDATE scan_runs
    SET completed_at = @completedAt,
        total_devices = @totalDevices
    WHERE id = @scanRunId
  `).run({
    scanRunId,
    completedAt,
    totalDevices
  });
  return getScanRunById(scanRunId);
}

function getScanRunById(id) {
  return getDb()
    .prepare(`
      SELECT id, customer_id AS customerId, started_at AS startedAt,
             completed_at AS completedAt, total_devices AS totalDevices,
             notes
      FROM scan_runs
      WHERE id = ?
    `)
    .get(id);
}

function listScanRunsForCustomer(customerId, limit = 10) {
  return getDb()
    .prepare(`
      SELECT id, customer_id AS customerId, started_at AS startedAt,
             completed_at AS completedAt, total_devices AS totalDevices, notes
      FROM scan_runs
      WHERE customer_id = ?
      ORDER BY started_at DESC
      LIMIT ?
    `)
    .all(customerId, limit);
}

function listAllScanRunsForCustomer(customerId) {
  return getDb()
    .prepare(`
      SELECT id, customer_id AS customerId, started_at AS startedAt,
             completed_at AS completedAt, total_devices AS totalDevices, notes
      FROM scan_runs
      WHERE customer_id = ?
      ORDER BY started_at DESC
    `)
    .all(customerId);
}

function upsertDevice(customerId, device) {
  const db = getDb();
  let existing = null;
  if (device.mac) {
    const byMacStmt = db.prepare(`
      SELECT *
      FROM devices
      WHERE customer_id = ? AND mac = ?
    `);
    existing = byMacStmt.get(customerId, device.mac);
  }
  if (!existing) {
    const byIdentifierStmt = db.prepare(`
      SELECT *
      FROM devices
      WHERE customer_id = ? AND device_identifier = ?
    `);
    existing = byIdentifierStmt.get(customerId, device.deviceIdentifier);
  }

  if (existing) {
    db.prepare(`
      UPDATE devices
      SET model = @model,
          hostname = @hostname,
          mac = @mac,
          device_identifier = @deviceIdentifier,
          last_ip = @lastIp,
          firmware_version = @firmwareVersion,
          wifi_ssid = @wifiSsid,
          rssi = @rssi,
          install_date = @installDate,
          uptime = @uptime,
          status = @status,
          last_seen = @lastSeen,
          last_snapshot_id = @lastSnapshotId,
          app = @app,
          generation = @generation
      WHERE id = @id
    `).run({
      id: existing.id,
      model: device.model || null,
      hostname: device.hostname || null,
      mac: device.mac || existing.mac || null,
      deviceIdentifier: device.deviceIdentifier || existing.device_identifier,
      lastIp: device.lastIp || null,
      firmwareVersion: device.firmwareVersion || null,
      wifiSsid: device.wifiSsid || null,
      rssi: device.rssi ?? null,
      installDate: Object.prototype.hasOwnProperty.call(device, 'installDate')
        ? device.installDate || null
        : existing.install_date || null,
      uptime: device.uptime ?? null,
      status: device.status || null,
      lastSeen: device.lastSeen || null,
      lastSnapshotId: device.lastSnapshotId || null,
      app: device.app || null,
      generation: device.generation || null
    });
    return {
      ...existing,
      ...device,
      id: existing.id,
      device_identifier: device.deviceIdentifier || existing.device_identifier,
      mac: device.mac || existing.mac || null
    };
  }

  const insertStmt = db.prepare(`
    INSERT INTO devices (
      customer_id, device_identifier, model, hostname, mac, last_ip,
      firmware_version, wifi_ssid, rssi, install_date, uptime, status, last_seen,
      last_snapshot_id, app, generation
    )
    VALUES (
      @customerId, @deviceIdentifier, @model, @hostname, @mac, @lastIp,
      @firmwareVersion, @wifiSsid, @rssi, @installDate, @uptime, @status, @lastSeen,
      @lastSnapshotId, @app, @generation
    )
  `);
  const info = insertStmt.run({
    customerId,
    deviceIdentifier: device.deviceIdentifier,
    model: device.model || null,
    hostname: device.hostname || null,
    mac: device.mac || null,
    lastIp: device.lastIp || null,
    firmwareVersion: device.firmwareVersion || null,
    wifiSsid: device.wifiSsid || null,
    rssi: device.rssi ?? null,
    installDate: device.installDate || null,
    uptime: device.uptime ?? null,
    status: device.status || null,
    lastSeen: device.lastSeen || null,
    lastSnapshotId: device.lastSnapshotId || null,
    app: device.app || null,
    generation: device.generation || null
  });
  return {
    id: info.lastInsertRowid,
    customer_id: customerId,
    device_identifier: device.deviceIdentifier,
    ...device
  };
}

function createDeviceSnapshot(snapshot) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO device_snapshots (
      scan_run_id,
      device_id,
      device_identifier,
      ip,
      mac,
      hostname,
      model,
      firmware_version,
      wifi_ssid,
      rssi,
      install_date,
      uptime,
      app,
      generation,
      is_online,
      diff_status,
      raw_payload
    )
    VALUES (
      @scanRunId,
      @deviceId,
      @deviceIdentifier,
      @ip,
      @mac,
      @hostname,
      @model,
      @firmwareVersion,
      @wifiSsid,
      @rssi,
      @installDate,
      @uptime,
      @app,
      @generation,
      @isOnline,
      @diffStatus,
      @rawPayload
    )
  `);
  const info = stmt.run({
    scanRunId: snapshot.scanRunId,
    deviceId: snapshot.deviceId || null,
    deviceIdentifier: snapshot.deviceIdentifier,
    ip: snapshot.ip || null,
    mac: snapshot.mac || null,
    hostname: snapshot.hostname || null,
    model: snapshot.model || null,
    firmwareVersion: snapshot.firmwareVersion || null,
    wifiSsid: snapshot.wifiSsid || null,
    rssi: snapshot.rssi ?? null,
    installDate: snapshot.installDate || null,
    uptime: snapshot.uptime ?? null,
    app: snapshot.app || null,
    generation: snapshot.generation || null,
    isOnline: snapshot.isOnline ? 1 : 0,
    diffStatus: snapshot.diffStatus,
    rawPayload: snapshot.rawPayload ? JSON.stringify(snapshot.rawPayload) : null
  });
  return info.lastInsertRowid;
}

function listSnapshotsForScan(scanRunId) {
  return getDb()
    .prepare(`
      SELECT
        id,
        scan_run_id AS scanRunId,
        device_id AS deviceId,
        device_identifier AS deviceIdentifier,
        ip,
        mac,
        hostname,
        model,
        firmware_version AS firmwareVersion,
        wifi_ssid AS wifiSsid,
        rssi,
        uptime,
        app,
        generation,
        is_online AS isOnline,
        diff_status AS diffStatus,
        raw_payload AS rawPayload,
        created_at AS createdAt
      FROM device_snapshots
      WHERE scan_run_id = ?
      ORDER BY created_at DESC
    `)
    .all(scanRunId)
    .map((row) => ({
      ...row,
      isOnline: Boolean(row.isOnline),
      rawPayload: row.rawPayload ? JSON.parse(row.rawPayload) : null,
      uptime: row.uptime ?? null,
      app: row.app,
      generation: row.generation,
      rssi: row.rssi ?? null
    }));
}

function getLatestSnapshotForDevice(deviceId) {
  return getDb()
    .prepare(`
      SELECT
        id,
        scan_run_id AS scanRunId,
        device_id AS deviceId,
        device_identifier AS deviceIdentifier,
        ip,
        mac,
        hostname,
        model,
        firmware_version AS firmwareVersion,
        wifi_ssid AS wifiSsid,
        rssi,
        uptime,
        app,
        generation,
        is_online AS isOnline,
        diff_status AS diffStatus,
        raw_payload AS rawPayload,
        created_at AS createdAt
      FROM device_snapshots
      WHERE device_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `)
    .get(deviceId);
}

function getPreviousSnapshotForDevice(customerId, deviceIdentifier, mac) {
  const db = getDb();
  let row = null;
  if (mac) {
    row = db
      .prepare(`
        SELECT ds.*
        FROM device_snapshots ds
        INNER JOIN scan_runs sr ON sr.id = ds.scan_run_id
        WHERE sr.customer_id = ?
          AND ds.mac = ?
        ORDER BY ds.created_at DESC
        LIMIT 1
      `)
      .get(customerId, mac);
  }
  if (!row) {
    row = db
      .prepare(`
        SELECT ds.*
        FROM device_snapshots ds
        INNER JOIN scan_runs sr ON sr.id = ds.scan_run_id
        WHERE sr.customer_id = ?
          AND ds.device_identifier = ?
        ORDER BY ds.created_at DESC
        LIMIT 1
      `)
      .get(customerId, deviceIdentifier);
  }
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    scanRunId: row.scan_run_id,
    deviceId: row.device_id,
    deviceIdentifier: row.device_identifier,
    ip: row.ip,
    mac: row.mac,
    hostname: row.hostname,
    model: row.model,
    firmwareVersion: row.firmware_version,
    wifiSsid: row.wifi_ssid,
    rssi: row.rssi ?? null,
    installDate: row.install_date || null,
    uptime: row.uptime ?? null,
    app: row.app,
    generation: row.generation,
    isOnline: Boolean(row.is_online),
    diffStatus: row.diff_status,
    rawPayload: row.raw_payload ? JSON.parse(row.raw_payload) : null,
    createdAt: row.created_at
  };
}

function listDevicesForCustomer(customerId) {
  const rows = getDb()
    .prepare(`
      SELECT
        d.id,
        d.device_identifier AS deviceIdentifier,
        d.model,
        d.hostname,
        d.mac,
        d.last_ip AS lastIp,
        d.firmware_version AS firmwareVersion,
        d.wifi_ssid AS wifiSsid,
        d.rssi,
        d.install_date AS installDate,
        d.uptime,
        d.status,
        d.last_seen AS lastSeen,
        d.last_snapshot_id AS lastSnapshotId,
        d.app,
        d.generation,
        ds.diff_status AS diffStatus,
        ds.raw_payload AS rawPayload,
        ds.install_date AS snapshotInstallDate,
        ds.created_at AS snapshotCreatedAt
      FROM devices d
      LEFT JOIN device_snapshots ds ON ds.id = d.last_snapshot_id
      WHERE d.customer_id = ?
      ORDER BY COALESCE(d.hostname, d.device_identifier) ASC
    `)
    .all(customerId);
  return rows.map((row) => {
    let diffNote = null;
    let rawSnapshot = null;
    if (row.rawPayload) {
      try {
        rawSnapshot = JSON.parse(row.rawPayload);
        diffNote =
          typeof rawSnapshot === 'object' && rawSnapshot !== null
            ? rawSnapshot.diffNote || rawSnapshot.note || null
            : null;
      } catch (error) {
        rawSnapshot = null;
        diffNote = null;
      }
    }
    const computedPowerState = derivePowerStateFromSnapshot(rawSnapshot);
    const isOnline = row.diffStatus !== 'offline';
    return {
      id: row.id,
      deviceIdentifier: row.deviceIdentifier,
      model: row.model,
      hostname: row.hostname,
      mac: row.mac,
      lastIp: row.lastIp,
      firmwareVersion: row.firmwareVersion,
      wifiSsid: row.wifiSsid,
      installDate: row.installDate || row.snapshotInstallDate || null,
      uptime: row.uptime ?? null,
      status: row.status,
      lastSeen: row.lastSeen,
      lastSnapshotId: row.lastSnapshotId,
      app: row.app || null,
      generation: row.generation || null,
      diffStatus: row.diffStatus,
      isOnline,
      powerState: isOnline ? computedPowerState : null,
      rssi: typeof row.rssi === 'number' ? row.rssi : null,
      diffNote,
      snapshotCreatedAt: row.snapshotCreatedAt
    };
  });
}

function updateDeviceInstallDate({ deviceId, installDate }) {
  if (!deviceId) {
    throw new Error('deviceId is vereist om installatiedatum bij te werken.');
  }
  const db = getDb();
  db.prepare(
    `
    UPDATE devices
    SET install_date = @installDate
    WHERE id = @deviceId
    `
  ).run({
    deviceId,
    installDate: installDate || null
  });
  db.prepare(
    `
    UPDATE device_snapshots
    SET install_date = @installDate
    WHERE id = (
      SELECT last_snapshot_id FROM devices WHERE id = @deviceId
    )
    `
  ).run({
    deviceId,
    installDate: installDate || null
  });
}
function logAction({ deviceId, action, payload, result }) {
  const db = getDb();
  db.prepare(`
    INSERT INTO action_logs (device_id, action, payload, result)
    VALUES (@deviceId, @action, @payload, @result)
  `).run({
    deviceId: deviceId || null,
    action,
    payload: payload ? JSON.stringify(payload) : null,
    result: result ? JSON.stringify(result) : null
  });
}

function setDeviceLastSnapshot({ deviceId, snapshotId, status, rssi }) {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE devices
    SET last_snapshot_id = @snapshotId,
        status = CASE WHEN @status IS NULL THEN status ELSE @status END,
        rssi = @rssi
    WHERE id = @deviceId
  `);
  stmt.run({
    deviceId,
    snapshotId,
    status: status || null,
    rssi: typeof rssi === 'undefined' ? null : rssi
  });
}

function deleteDevice(deviceId) {
  return getDb()
    .prepare('DELETE FROM devices WHERE id = ?')
    .run(deviceId);
}

function deleteScanRun(scanRunId) {
  if (!scanRunId) {
    throw new Error('scanRunId is vereist om een scan te verwijderen.');
  }
  const db = getDb();
  const deviceIdsNeedingUpdate = new Set();
  const snapshotRows = db
    .prepare(
      `
      SELECT ds.id, ds.device_id AS deviceId
      FROM device_snapshots ds
      WHERE ds.scan_run_id = ?
        AND ds.device_id IS NOT NULL
    `
    )
    .all(scanRunId);
  snapshotRows.forEach((row) => {
    if (!row.deviceId) {
      return;
    }
    const deviceRow = db
      .prepare('SELECT last_snapshot_id FROM devices WHERE id = ?')
      .get(row.deviceId);
    if (deviceRow && deviceRow.last_snapshot_id === row.id) {
      deviceIdsNeedingUpdate.add(row.deviceId);
    }
  });

  const deleteResult = db.prepare('DELETE FROM scan_runs WHERE id = ?').run(scanRunId);
  if (!deleteResult.changes) {
    throw new Error('Scan not found or already removed.');
  }

  deviceIdsNeedingUpdate.forEach((deviceId) => {
    const latest = db
      .prepare(
        `
        SELECT id, is_online AS isOnline, rssi FROM device_snapshots
        WHERE device_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `
      )
      .get(deviceId);
    if (latest) {
      setDeviceLastSnapshot({
        deviceId,
        snapshotId: latest.id,
        status: latest.isOnline ? 'online' : 'offline',
        rssi: typeof latest.rssi === 'number' ? latest.rssi : null
      });
    } else {
      db.prepare(
        `
        UPDATE devices
        SET last_snapshot_id = NULL,
            status = NULL,
            rssi = NULL
        WHERE id = ?
      `
      ).run(deviceId);
    }
  });
}

function getAppSetting(key) {
  if (!key) {
    throw new Error('Setting key is required.');
  }
  const row = getDb()
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .get(key);
  return row ? row.value : null;
}

function setAppSetting(key, value) {
  if (!key) {
    throw new Error('Setting key is required.');
  }
  getDb()
    .prepare(
      `
      INSERT INTO app_settings (key, value)
      VALUES (@key, @value)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `
    )
    .run({ key, value });
}

function getAutoScanPreferences() {
  const raw = getAppSetting('autoScanPreferences');
  if (!raw) {
    return { ...DEFAULT_AUTO_SCAN_PREFERENCES };
  }
  try {
    const parsed = JSON.parse(raw);
    const enabled = Boolean(parsed.enabled);
    const intervalMs =
      typeof parsed.intervalMs === 'number' && parsed.intervalMs > 0
        ? parsed.intervalMs
        : DEFAULT_AUTO_SCAN_PREFERENCES.intervalMs;
    return { enabled, intervalMs };
  } catch (error) {
    return { ...DEFAULT_AUTO_SCAN_PREFERENCES };
  }
}

function updateAutoScanPreferences(preferences = {}) {
  const current = getAutoScanPreferences();
  const merged = {
    ...current,
    ...preferences
  };
  if (typeof merged.intervalMs !== 'number' || merged.intervalMs <= 0) {
    merged.intervalMs = DEFAULT_AUTO_SCAN_PREFERENCES.intervalMs;
  }
  merged.enabled = Boolean(merged.enabled);
  setAppSetting('autoScanPreferences', JSON.stringify(merged));
  return merged;
}

module.exports = {
  createCustomer,
  updateCustomer,
  listCustomers,
  getCustomerById,
  deleteCustomer,
  createScanRun,
  completeScanRun,
  getScanRunById,
  listScanRunsForCustomer,
  listAllScanRunsForCustomer,
  upsertDevice,
  createDeviceSnapshot,
  listSnapshotsForScan,
  getLatestSnapshotForDevice,
  getPreviousSnapshotForDevice,
  listDevicesForCustomer,
  logAction,
  setDeviceLastSnapshot,
  updateDeviceInstallDate,
  deleteDevice,
  deleteScanRun,
  getAutoScanPreferences,
  updateAutoScanPreferences
};









