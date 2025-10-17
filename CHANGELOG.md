# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0] - 2025-10-17
### Added
- Automatic background device checks with user-configurable toggle and persisted preferences.
- Bulk device actions covering firmware updates, Wi-Fi (primary and secondary) reconfiguration, and device deletion.
- Device power toggle button with live status updates and visual feedback in the device table.
- Wi-Fi signal strength (RSSI) display alongside network status indicators for each device.

### Changed
- Persisted additional device telemetry (RSSI, power state) across scans and snapshots to drive the new UI features.
- Extended Shelly service request handling to normalise RSSI readings across device generations.

## [0.1.0] - 2025-10-15
### Added
- Initial release providing customer management, device scans, and basic Shelly device controls.

