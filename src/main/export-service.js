const { dialog } = require('electron');
const path = require('path');
const ExcelJS = require('exceljs');

function formatDate(value) {
  if (!value) {
    return '';
  }
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toISOString().split('T')[0];
  } catch (_error) {
    return value;
  }
}

function formatUptime(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) {
    return '';
  }
  const units = [
    { label: 'd', size: 86400 },
    { label: 'h', size: 3600 },
    { label: 'm', size: 60 }
  ];
  let remaining = Math.floor(value);
  const parts = [];
  units.forEach((unit) => {
    if (remaining >= unit.size) {
      const amount = Math.floor(remaining / unit.size);
      remaining -= amount * unit.size;
      parts.push(`${amount}${unit.label}`);
    }
  });
  if (!parts.length) {
    parts.push(`${remaining}s`);
  }
  return parts.slice(0, 2).join(' ');
}

async function exportDevicesToExcel({ browserWindow, customer, devices }) {
  const defaultFilename = `scan-${customer?.name || 'customer'}-${new Date()
    .toISOString()
    .replace(/[:.]/g, '-')}.xlsx`;
  const { canceled, filePath } = await dialog.showSaveDialog(browserWindow, {
    title: 'Export scan results',
    defaultPath: path.join(process.cwd(), defaultFilename),
    filters: [{ name: 'Excel', extensions: ['xlsx'] }]
  });
  if (canceled || !filePath) {
    return { canceled: true };
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Scan results');

  worksheet.columns = [
    { header: 'Name', key: 'name', width: 30 },
    { header: 'Identifier', key: 'identifier', width: 30 },
    { header: 'MAC', key: 'mac', width: 20 },
    { header: 'IP', key: 'ip', width: 18 },
    { header: 'Firmware', key: 'firmware', width: 18 },
    { header: 'Wi-Fi', key: 'wifi', width: 26 },
    { header: 'Install date', key: 'installDate', width: 18 },
    { header: 'Uptime', key: 'uptime', width: 12 },
    { header: 'App', key: 'app', width: 18 },
    { header: 'Generation', key: 'generation', width: 12 },
    { header: 'Last seen', key: 'lastSeen', width: 24 },
    { header: 'Diff status', key: 'diffStatus', width: 15 },
    { header: 'Note', key: 'diffNote', width: 40 }
  ];

  devices.forEach((device, index) => {
    worksheet.addRow({
      name: device.hostname || device.deviceIdentifier || '',
      identifier: device.deviceIdentifier || '',
      mac: device.mac || '',
      ip: device.lastIp || '',
      firmware: device.firmwareVersion || '',
      wifi: device.wifiSsid || '',
      installDate: formatDate(device.installDate),
      uptime: formatUptime(device.uptime),
      app: device.app || '',
      generation: device.generation || '',
      lastSeen: device.lastSeen || '',
      diffStatus: device.diffStatus || '',
      diffNote: device.diffNote || ''
    });
    const row = worksheet.getRow(index + 2);
    row.alignment = { vertical: 'middle', horizontal: 'left' };
  });

  worksheet.getRow(1).font = { bold: true };

  await workbook.xlsx.writeFile(filePath);
  return { success: true, filePath };
}

function toExcelDate(value) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date;
}

function formatDuration(startedAt, completedAt) {
  if (!startedAt || !completedAt) {
    return '';
  }
  const start = new Date(startedAt);
  const end = new Date(completedAt);
  const diffMs = end.getTime() - start.getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) {
    return '';
  }
  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  if (!parts.length || seconds > 0) {
    parts.push(`${seconds}s`);
  }
  return parts.join(' ');
}

async function exportScanHistoryToExcel({ browserWindow, customer, scans }) {
  const defaultFilename = `scans-${customer?.name || 'customer'}-${new Date()
    .toISOString()
    .replace(/[:.]/g, '-')}.xlsx`;
  const { canceled, filePath } = await dialog.showSaveDialog(browserWindow, {
    title: 'Export scan history',
    defaultPath: path.join(process.cwd(), defaultFilename),
    filters: [{ name: 'Excel', extensions: ['xlsx'] }]
  });
  if (canceled || !filePath) {
    return { canceled: true };
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Scan history');
  worksheet.columns = [
    { header: 'Scan ID', key: 'id', width: 10 },
    { header: 'Started at', key: 'startedAt', width: 22, style: { numFmt: 'yyyy-mm-dd hh:mm:ss' } },
    { header: 'Completed at', key: 'completedAt', width: 22, style: { numFmt: 'yyyy-mm-dd hh:mm:ss' } },
    { header: 'Duration', key: 'duration', width: 12 },
    { header: 'Device count', key: 'totalDevices', width: 18 },
    { header: 'Notes', key: 'notes', width: 40 }
  ];

  scans.forEach((scan, index) => {
    worksheet.addRow({
      id: scan.id,
      startedAt: toExcelDate(scan.startedAt),
      completedAt: toExcelDate(scan.completedAt),
      duration: formatDuration(scan.startedAt, scan.completedAt),
      totalDevices: typeof scan.totalDevices === 'number' ? scan.totalDevices : '',
      notes: scan.notes || ''
    });
    const row = worksheet.getRow(index + 2);
    row.alignment = { vertical: 'middle', horizontal: 'left' };
  });

  worksheet.getRow(1).font = { bold: true };

  await workbook.xlsx.writeFile(filePath);
  return { success: true, filePath };
}

module.exports = {
  exportDevicesToExcel,
  exportScanHistoryToExcel
};
