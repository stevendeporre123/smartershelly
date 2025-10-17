# SmartShelly Manager User Manual

Welcome to **SmartShelly Manager** – a desktop application that helps you manage and monitor Shelly smart devices in customer environments. This guide explains how to install the app, configure customers, run device scans, perform actions, and automate background checks.

## 1. System Requirements

- Windows 10/11, macOS 12+, or a modern Linux distribution
- Network access to the Shelly devices you want to manage
- Credentials (username/password) for devices, if authentication is enabled

## 2. Installation

1. Download the installer from the SmartShelly release page.
2. Run the installer:
   - **Windows**: double-click the .exe setup and follow the prompts.
   - **macOS**: open the .dmg or .pkg bundle, drag the app to Applications.
   - **Linux**: install the .AppImage or package produced by the build.
3. Launch SmartShelly Manager. The app creates its database in your user profile the first time it starts.

## 3. First Launch & Overview

The main window is divided into three areas:

1. **Navigation Bar** (top): shows the current version and provides quick toggles like automatic scan status.
2. **Customer List** (left/top): displays all customers sorted by name; use the search field to filter.
3. **Customer Detail View** (right/bottom): appears when a customer is selected and contains customer info, device table, and scan history.

## 4. Managing Customers

### 4.1 Adding a Customer
1. Click **New customer** in the customer list.
2. Fill in required fields (Name) and optional details (description, contact, subnet, Wi-Fi credentials).
3. Save changes; the customer appears in the list.

### 4.2 Editing or Deleting
- Select a customer and click **Edit** to update information.
- Click the trash icon to delete a customer (devices and history are removed as well).

## 5. Device Scanning

### 5.1 Running a Scan
1. Select a customer.
2. In the detail view, press **Start scan**.
3. SmartShelly expands the stored subnet or IP list, detects devices, and records their details.

### 5.2 Scan Results
- **Device Table** lists discovered devices with columns such as MAC, IP, firmware, Wi-Fi SSID, uptime, power state, and RSSI.
- **Scan History** shows previous scans with timestamps and device counts.

### 5.3 Wi-Fi Signal Strength
Each device row shows a Wi-Fi icon with RSSI in dBm. Colors indicate quality:
- Green: strong signal (>-55 dBm)
- Amber: medium (-55 to -65 dBm)
- Red: weak (<-65 dBm)

## 6. Device Actions

### 6.1 Single Device Actions
Use the buttons in the device row to:
- Open device web UI
- Configure Wi-Fi (primary or secondary networks)
- Trigger firmware updates (provide OTA URL)
- Reboot the device
- Toggle power on/off

### 6.2 Bulk Actions
1. Select multiple devices using the checkboxes.
2. Use the bulk toolbar to:
   - Update firmware for selected devices
   - Push Wi-Fi credentials (Wi-Fi 1 or Wi-Fi 2)
   - Delete devices from the customer
3. Progress indicators show success/failure per device.

## 7. Background Auto-Scans
- Toggle the **Auto checks** switch in the navigation bar to enable periodic background scans every minute.
- Status text indicates whether scans are running, and the next scheduled run.

## 8. Exporting Data
- **Devices**: download an Excel file of all devices for a customer.
- **Scan History**: export scan logs with timestamps and counts.

## 9. Troubleshooting
- Ensure the app has network access to the device subnet.
- Use correct credentials for secured devices; failed authentication prevents accurate status updates.
- If RSSI or power state is “unknown,” run a manual scan to refresh device data.

## 10. Frequently Asked Questions

**Q:** Can I monitor Shelly Gen1 and Gen2 devices?
**A:** Yes. SmartShelly automatically detects the generation and normalizes device details.

**Q:** How do I disable background checks temporarily?
**A:** Use the Auto checks toggle in the nav bar; status updates are displayed immediately.

**Q:** Where is data stored?
**A:** In a local SQLite database located in your OS-specific application data directory.

## 11. Support
For technical support or feature requests, contact the SmartShelly team or visit the project repository.

Enjoy managing your Shelly devices!
