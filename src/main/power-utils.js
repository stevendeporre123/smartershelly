function normalizeBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (Number.isNaN(value)) {
      return null;
    }
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['on', 'true', '1', 'yes', 'enabled'].includes(normalized)) {
      return true;
    }
    if (['off', 'false', '0', 'no', 'disabled'].includes(normalized)) {
      return false;
    }
  }
  return null;
}

function toPowerState(value) {
  const bool = normalizeBoolean(value);
  if (bool === null) {
    return null;
  }
  return bool ? 'on' : 'off';
}

function extractFromEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const candidateKeys = [
    'output',
    'ison',
    'isOn',
    'is_on',
    'state',
    'value',
    'switch',
    'power',
    'enabled',
    'relay',
    'mode'
  ];
  for (const key of candidateKeys) {
    if (Object.prototype.hasOwnProperty.call(entry, key)) {
      const state = toPowerState(entry[key]);
      if (state !== null) {
        return state;
      }
    }
  }
  return null;
}

function derivePowerStateFromStatus(status) {
  if (!status || typeof status !== 'object') {
    return null;
  }

  const direct = extractFromEntry(status);
  if (direct) {
    return direct;
  }

  const inspectArray = (items) => {
    if (!Array.isArray(items)) {
      return null;
    }
    for (const item of items) {
      const state = extractFromEntry(item);
      if (state !== null) {
        return state;
      }
    }
    return null;
  };

  const arrays = ['relays', 'lights', 'switches', 'outputs', 'devices'];
  for (const key of arrays) {
    const state = inspectArray(status[key]);
    if (state !== null) {
      return state;
    }
  }

  for (const [key, value] of Object.entries(status)) {
    if (typeof value === 'object' && value !== null) {
      if (key.startsWith('switch') || key.startsWith('relay') || key.includes(':')) {
        const state = extractFromEntry(value);
        if (state !== null) {
          return state;
        }
      }
    } else {
      const state = toPowerState(value);
      if (state !== null) {
        return state;
      }
    }
  }

  return null;
}

function derivePowerStateFromSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return null;
  }

  if (Object.prototype.hasOwnProperty.call(snapshot, 'status')) {
    const state = derivePowerStateFromStatus(snapshot.status);
    if (state !== null) {
      return state;
    }
  }

  const state = extractFromEntry(snapshot);
  if (state !== null) {
    return state;
  }

  return null;
}

module.exports = {
  normalizeBoolean,
  derivePowerStateFromStatus,
  derivePowerStateFromSnapshot
};

