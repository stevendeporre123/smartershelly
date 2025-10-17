const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

let dbInstance;

function ensureDirectory(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function initDatabase(dbFilePath) {
  if (dbInstance) {
    return dbInstance;
  }

  ensureDirectory(dbFilePath);
  dbInstance = new Database(dbFilePath);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');

  runMigrations(dbInstance);
  return dbInstance;
}

function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const migrations = [
    {
      name: '001_create_customers',
      sql: `
        CREATE TABLE IF NOT EXISTS customers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          subnet TEXT,
          contact TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `
    },
    {
      name: '002_create_scan_runs',
      sql: `
        CREATE TABLE IF NOT EXISTS scan_runs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          customer_id INTEGER NOT NULL,
          started_at TEXT NOT NULL,
          completed_at TEXT,
          total_devices INTEGER DEFAULT 0,
          notes TEXT,
          FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
        );
      `
    },
    {
      name: '003_create_devices',
      sql: `
        CREATE TABLE IF NOT EXISTS devices (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          customer_id INTEGER NOT NULL,
          device_identifier TEXT NOT NULL,
          model TEXT,
          hostname TEXT,
          mac TEXT,
          last_ip TEXT,
          firmware_version TEXT,
          wifi_ssid TEXT,
          install_date TEXT,
          status TEXT,
          uptime INTEGER,
          last_seen TEXT,
          last_snapshot_id INTEGER,
          app TEXT,
          generation TEXT,
          UNIQUE (customer_id, device_identifier),
          FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
        );
      `
    },
    {
      name: '004_create_device_snapshots',
      sql: `
        CREATE TABLE IF NOT EXISTS device_snapshots (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          scan_run_id INTEGER NOT NULL,
          device_id INTEGER,
          device_identifier TEXT NOT NULL,
          ip TEXT,
          mac TEXT,
          hostname TEXT,
          model TEXT,
          firmware_version TEXT,
          wifi_ssid TEXT,
          install_date TEXT,
          uptime INTEGER,
          app TEXT,
          generation TEXT,
          is_online INTEGER NOT NULL DEFAULT 0,
          diff_status TEXT NOT NULL,
          raw_payload TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (scan_run_id) REFERENCES scan_runs(id) ON DELETE CASCADE,
          FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL
        );
      `
    },
    {
      name: '005_create_action_logs',
      sql: `
        CREATE TABLE IF NOT EXISTS action_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          device_id INTEGER,
          action TEXT NOT NULL,
          payload TEXT,
          result TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL
        );
      `
    },
    {
      name: '006_add_device_app_generation_columns',
      run: (database) => {
        const columns = database
          .prepare('PRAGMA table_info(devices)')
          .all()
          .map((column) => column.name);
        if (!columns.includes('app')) {
          database.exec('ALTER TABLE devices ADD COLUMN app TEXT');
        }
        if (!columns.includes('generation')) {
          database.exec('ALTER TABLE devices ADD COLUMN generation TEXT');
        }
      }
    },
    {
      name: '007_add_snapshot_app_generation_columns',
      run: (database) => {
        const columns = database
          .prepare('PRAGMA table_info(device_snapshots)')
          .all()
          .map((column) => column.name);
        if (!columns.includes('app')) {
          database.exec('ALTER TABLE device_snapshots ADD COLUMN app TEXT');
        }
        if (!columns.includes('generation')) {
          database.exec('ALTER TABLE device_snapshots ADD COLUMN generation TEXT');
        }
      }
    },
    {
      name: '008_add_customer_wifi_columns',
      run: (database) => {
        const columns = database
          .prepare('PRAGMA table_info(customers)')
          .all()
          .map((column) => column.name);
        if (!columns.includes('wifi_ssid')) {
          database.exec('ALTER TABLE customers ADD COLUMN wifi_ssid TEXT');
        }
        if (!columns.includes('wifi_password')) {
          database.exec('ALTER TABLE customers ADD COLUMN wifi_password TEXT');
        }
      }
    },
    {
      name: '009_add_uptime_columns',
      run: (database) => {
        const deviceColumns = database
          .prepare('PRAGMA table_info(devices)')
          .all()
          .map((column) => column.name);
        if (!deviceColumns.includes('uptime')) {
          database.exec('ALTER TABLE devices ADD COLUMN uptime INTEGER');
        }
        if (!deviceColumns.includes('install_date')) {
          database.exec('ALTER TABLE devices ADD COLUMN install_date TEXT');
        }
        const snapshotColumns = database
          .prepare('PRAGMA table_info(device_snapshots)')
          .all()
          .map((column) => column.name);
        if (!snapshotColumns.includes('uptime')) {
          database.exec('ALTER TABLE device_snapshots ADD COLUMN uptime INTEGER');
        }
        if (!snapshotColumns.includes('install_date')) {
          database.exec('ALTER TABLE device_snapshots ADD COLUMN install_date TEXT');
        }
      }
    },
    {
      name: '010_ensure_install_date_columns',
      run: (database) => {
        const deviceColumns = database
          .prepare('PRAGMA table_info(devices)')
          .all()
          .map((column) => column.name);
        if (!deviceColumns.includes('install_date')) {
          database.exec('ALTER TABLE devices ADD COLUMN install_date TEXT');
        }
        const snapshotColumns = database
          .prepare('PRAGMA table_info(device_snapshots)')
          .all()
          .map((column) => column.name);
        if (!snapshotColumns.includes('install_date')) {
          database.exec('ALTER TABLE device_snapshots ADD COLUMN install_date TEXT');
        }
      }
    },
    {
      name: '011_create_app_settings',
      sql: `
        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value TEXT,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `
    },
    {
      name: '012_add_rssi_columns',
      run: (database) => {
        const deviceColumns = database
          .prepare('PRAGMA table_info(devices)')
          .all()
          .map((column) => column.name);
        if (!deviceColumns.includes('rssi')) {
          database.exec('ALTER TABLE devices ADD COLUMN rssi INTEGER');
        }
        const snapshotColumns = database
          .prepare('PRAGMA table_info(device_snapshots)')
          .all()
          .map((column) => column.name);
        if (!snapshotColumns.includes('rssi')) {
          database.exec('ALTER TABLE device_snapshots ADD COLUMN rssi INTEGER');
        }
      }
    }
  ];

  const selectStmt = db.prepare('SELECT 1 FROM migrations WHERE name = ?');
  const insertStmt = db.prepare('INSERT INTO migrations (name) VALUES (?)');

  db.transaction(() => {
    migrations.forEach(({ name, sql, run }) => {
      const alreadyApplied = selectStmt.get(name);
      if (!alreadyApplied) {
        if (typeof run === 'function') {
          run(db);
        } else if (sql) {
          db.exec(sql);
        }
        insertStmt.run(name);
      }
    });
  })();
}

function getDb() {
  if (!dbInstance) {
    throw new Error('Database has not been initialised. Call initDatabase first.');
  }
  return dbInstance;
}

module.exports = {
  initDatabase,
  getDb
};
