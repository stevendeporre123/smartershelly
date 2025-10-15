const { exec } = require('child_process');
const os = require('os');

function runCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, { encoding: 'utf8' }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function parseWindowsSsid(output) {
  const lines = output.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.toLowerCase().startsWith('ssid')) {
      const parts = line.split(':').map((part) => part.trim());
      if (parts.length >= 2 && parts[0].toLowerCase() === 'ssid') {
        // Ignore lines like "SSID name" (BSSID, etc.)
        const value = parts.slice(1).join(':').trim();
        if (value && value.toLowerCase() !== 'name') {
          return value;
        }
      }
    }
  }
  return null;
}

function parseMacSsid(output) {
  const match = output.match(/Current Wi-Fi Network:\s*(.+)$/i);
  if (match && match[1]) {
    return match[1].trim();
  }
  const airportMatch = output.match(/ SSID: (.+)/i);
  if (airportMatch && airportMatch[1]) {
    return airportMatch[1].trim();
  }
  return null;
}

function parseLinuxSsid(output) {
  const lines = output.split('\n');
  for (const line of lines) {
    if (line.startsWith('yes:')) {
      return line.slice(4).trim() || null;
    }
  }
  return output.trim() || null;
}

async function getCurrentWifiSsid() {
  const platform = os.platform();

  if (platform === 'win32') {
    try {
      const output = await runCommand('netsh wlan show interfaces');
      return parseWindowsSsid(output);
    } catch (error) {
      return null;
    }
  }

  if (platform === 'darwin') {
    const commands = [
      '/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -I',
      'networksetup -getairportnetwork en0'
    ];
    for (const command of commands) {
      try {
        const output = await runCommand(command);
        const ssid = parseMacSsid(output);
        if (ssid) {
          return ssid;
        }
      } catch (error) {
        // try next
      }
    }
    return null;
  }

  // Linux / others
  const commands = [
    'nmcli --fields active,ssid dev wifi | grep "^yes"',
    'iwgetid -r'
  ];
  for (const command of commands) {
    try {
      const output = await runCommand(command);
      const ssid = parseLinuxSsid(output.trim());
      if (ssid) {
        return ssid;
      }
    } catch (error) {
      // continue
    }
  }

  return null;
}

module.exports = {
  getCurrentWifiSsid
};
