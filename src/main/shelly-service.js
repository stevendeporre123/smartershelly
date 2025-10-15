const DEFAULT_TIMEOUT = 3500;

let fetchInstance = null;

async function getFetch() {
  if (!fetchInstance) {
    const fetched = await import('node-fetch');
    fetchInstance = fetched.default || fetched;
  }
  return fetchInstance;
}

function createAbortSignal(timeoutMs = DEFAULT_TIMEOUT) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, cancel: () => clearTimeout(timeout) };
}

async function requestShelly(ip, path, { method = 'GET', body, timeout, authHeaders } = {}) {
  const url = `http://${ip}${path}`;
  const { signal, cancel } = createAbortSignal(timeout);
  try {
    const fetch = await getFetch();
    const res = await fetch(url, {
      method,
      body,
      signal,
      headers: {
        'Content-Type': 'application/json',
        ...(authHeaders || {})
      }
    });
    if (!res.ok) {
      const text = await res.text();
      const error = new Error(`Shelly request failed (${res.status}): ${text}`);
      error.status = res.status;
      throw error;
    }
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return res.json();
    }
    return res.text();
  } finally {
    cancel();
  }
}

function buildAuthHeaders(credentials) {
  if (!credentials || !credentials.username || !credentials.password) {
    return {};
  }
  const token = Buffer.from(
    `${credentials.username}:${credentials.password}`,
    'utf8'
  ).toString('base64');
  return {
    Authorization: `Basic ${token}`
  };
}

async function detectShellyDevice(ip, options = {}) {
  const authHeaders = buildAuthHeaders(options.credentials);
  try {
    const rpcInfo = await requestShelly(ip, '/rpc/Shelly.GetDeviceInfo', {
      timeout: options.timeout,
      authHeaders
    });
    const status = await requestShelly(ip, '/rpc/Shelly.GetStatus', {
      timeout: options.timeout,
      authHeaders
    });
    return normaliseGen2Payload(ip, rpcInfo, status);
  } catch (err) {
    if (err.name === 'AbortError') {
      throw err;
    }
    // try gen1 endpoints
    try {
      const info = await requestShelly(ip, '/shelly', {
        timeout: options.timeout,
        authHeaders
      });
      const status = await requestShelly(ip, '/status', {
        timeout: options.timeout,
        authHeaders
      });
      return normaliseGen1Payload(ip, info, status);
    } catch (fallbackErr) {
      throw fallbackErr;
    }
  }
}

function normaliseGen2Payload(ip, info, status) {
  return {
    ip,
    isOnline: true,
    deviceIdentifier: info?.sys?.device?.id || info?.id || info?.sys?.id || ip,
    mac: info?.sys?.device?.mac || info?.mac,
    model: info?.app || info?.model || info?.sys?.device?.model,
    hostname: info?.name || info?.sys?.device?.hostname || info?.sys?.device?.id,
    firmwareVersion: info?.ver || info?.fw_id,
    wifiSsid: status?.wifi?.ssid || status?.wifi?.sta?.ssid,
    app: info?.app || info?.sys?.device?.type || null,
    generation:
      info?.gen !== undefined && info?.gen !== null
        ? String(info.gen)
        : info?.sys?.device?.gen !== undefined && info?.sys?.device?.gen !== null
        ? String(info.sys.device.gen)
        : '2',
    uptime:
      (typeof status?.sys?.uptime === 'number' && status.sys.uptime >= 0
        ? status.sys.uptime
        : typeof status?.uptime === 'number' && status.uptime >= 0
        ? status.uptime
        : null),
    raw: {
      info,
      status
    }
  };
}

function normaliseGen1Payload(ip, info, status) {
  return {
    ip,
    isOnline: true,
    deviceIdentifier: info?.id || info?.mac || ip,
    mac: info?.mac,
    model: info?.model,
    hostname: info?.hostname || info?.id,
    firmwareVersion: info?.fw || info?.fw_ver,
    wifiSsid: status?.wifi_sta?.ssid,
    app: info?.type || info?.model || null,
    generation: '1',
    uptime:
      (typeof status?.uptime === 'number' && status.uptime >= 0
        ? status.uptime
        : typeof status?.sys?.uptime === 'number' && status.sys.uptime >= 0
        ? status.sys.uptime
        : null),
    raw: {
      info,
      status
    }
  };
}

async function rebootDevice(ip, options = {}) {
  const authHeaders = buildAuthHeaders(options.credentials);
  try {
    await requestShelly(ip, '/rpc/Shelly.Reboot', { method: 'POST', timeout: options.timeout, authHeaders });
    return { success: true, message: 'Reboot triggered via RPC endpoint.' };
  } catch (rpcErr) {
    if (rpcErr.status && rpcErr.status !== 404) {
      throw rpcErr;
    }
    await requestShelly(ip, '/reboot', { method: 'GET', timeout: options.timeout, authHeaders });
    return { success: true, message: 'Reboot triggered via legacy endpoint.' };
  }
}

async function triggerFirmwareUpdate(ip, options = {}) {
  const authHeaders = buildAuthHeaders(options.credentials);
  const { otaUrl } = options;
  if (!otaUrl) {
    throw new Error('OTA URL is vereist voor een firmware update.');
  }
  try {
    const response = await requestShelly(ip, '/rpc/Shelly.Update', {
      method: 'POST',
      timeout: options.timeout,
      authHeaders,
      body: JSON.stringify({ stage: 'flash', url: otaUrl })
    });
    return { success: true, response };
  } catch (rpcErr) {
    if (rpcErr.status && rpcErr.status !== 404) {
      throw rpcErr;
    }
    const response = await requestShelly(ip, `/ota?url=${encodeURIComponent(otaUrl)}`, {
      timeout: options.timeout,
      authHeaders
    });
    return { success: true, response };
  }
}

async function updateWifiConfig(ip, options = {}) {
  const authHeaders = buildAuthHeaders(options.credentials);
  const { ssid, password } = options;
  if (!ssid) {
    throw new Error('SSID is verplicht.');
  }
  const payload = {
    config: {
      sta: {
        ssid,
        pass: password || ''
      }
    }
  };
  try {
    const response = await requestShelly(ip, '/rpc/WiFi.SetConfig', {
      method: 'POST',
      timeout: options.timeout,
      authHeaders,
      body: JSON.stringify(payload)
    });
    return { success: true, response };
  } catch (rpcErr) {
    if (rpcErr.status && rpcErr.status !== 404) {
      throw rpcErr;
    }
    const legacyPayload = JSON.stringify({
      wifi_sta: {
        enabled: true,
        ssid,
        pass: password || '',
        reconnect_timeout: 60
      }
    });
    const response = await requestShelly(ip, '/settings/sta', {
      method: 'POST',
      timeout: options.timeout,
      authHeaders,
      body: legacyPayload
    });
    return { success: true, response };
  }
}


async function getDeviceSettings(ip, options = {}) {
  const authHeaders = buildAuthHeaders(options.credentials);
  const timeout = options.timeout;
  const results = await Promise.allSettled([
    requestShelly(ip, '/rpc/Device.GetConfig', {
      method: 'POST',
      timeout,
      authHeaders,
      body: '{}'
    }),
    requestShelly(ip, '/rpc/WiFi.GetConfig', {
      method: 'POST',
      timeout,
      authHeaders,
      body: '{}'
    }),
    requestShelly(ip, '/rpc/Switch.GetConfig', {
      method: 'POST',
      timeout,
      authHeaders,
      body: JSON.stringify({ id: 0 })
    })
  ]);

  const deviceCfg = results[0].status === 'fulfilled' ? results[0].value : null;
  const wifiCfg = results[1].status === 'fulfilled' ? results[1].value : null;
  const switchCfg = results[2].status === 'fulfilled' ? results[2].value : null;

  const deviceName =
    deviceCfg?.config?.device?.name ??
    deviceCfg?.config?.name ??
    null;
  const apEnabled = wifiCfg?.config?.ap?.enabled ?? false;
  const ecoMode =
    switchCfg?.config?.eco_mode ??
    (Array.isArray(switchCfg?.config?.switches) ? switchCfg.config.switches[0]?.eco_mode ?? false : false);

  return {
    name: deviceName || '',
    apEnabled: Boolean(apEnabled),
    ecoMode: Boolean(ecoMode)
  };
}

async function updateDeviceSettings(ip, settings = {}, options = {}) {
  const authHeaders = buildAuthHeaders(options.credentials);
  const timeout = options.timeout;

  if (Object.prototype.hasOwnProperty.call(settings, 'name')) {
    const name = settings.name;
    const attempts = [
      () =>
        requestShelly(ip, '/rpc/Device.SetConfig', {
          method: 'POST',
          timeout,
          authHeaders,
          body: JSON.stringify({ config: { device: { name } } })
        }),
      () =>
        requestShelly(ip, '/rpc/Sys.SetConfig', {
          method: 'POST',
          timeout,
          authHeaders,
          body: JSON.stringify({ config: { device: { name } } })
        }),
      () =>
        requestShelly(ip, '/rpc/Shelly.SetDeviceInfo', {
          method: 'POST',
          timeout,
          authHeaders,
          body: JSON.stringify({ name })
        }),
      () =>
        requestShelly(ip, '/settings', {
          method: 'POST',
          timeout,
          authHeaders,
          body: JSON.stringify({ name })
        })
    ];
    let lastError = null;
    for (const attempt of attempts) {
      try {
        await attempt();
        lastError = null;
        break;
      } catch (error) {
        if (error.name === 'AbortError') {
          throw error;
        }
        if (error.status && error.status !== 404 && error.status !== 400 && error.status !== 501) {
          throw error;
        }
        lastError = error;
      }
    }
    if (lastError && (!lastError.status || ![400, 404, 501].includes(lastError.status))) {
      throw lastError;
    }
  }

  if (Object.prototype.hasOwnProperty.call(settings, 'apEnabled')) {
    await requestShelly(ip, '/rpc/WiFi.SetConfig', {
      method: 'POST',
      timeout,
      authHeaders,
      body: JSON.stringify({ config: { ap: { enabled: Boolean(settings.apEnabled) } } })
    }).catch((error) => {
      if (!error.status || error.status !== 404) {
        throw error;
      }
    });
  }

  if (Object.prototype.hasOwnProperty.call(settings, 'ecoMode')) {
    await requestShelly(ip, '/rpc/Switch.SetConfig', {
      method: 'POST',
      timeout,
      authHeaders,
      body: JSON.stringify({ id: 0, config: { eco_mode: Boolean(settings.ecoMode) } })
    }).catch((error) => {
      if (!error.status || error.status !== 404) {
        throw error;
      }
    });
  }

  return { success: true };
}

module.exports = {
  detectShellyDevice,
  rebootDevice,
  triggerFirmwareUpdate,
  updateWifiConfig,
  getDeviceSettings,
  updateDeviceSettings
};

