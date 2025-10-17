# SmartShelly Manager

SmartShelly Manager is a local Electron application for scanning customer networks, discovering Shelly devices, and managing their configuration. It stores data in a SQLite database (via better-sqlite3) inside the Electron user data directory.

## Prerequisites

- Node.js 18+ (Node 20 recommended)
- npm (comes with Node.js)

## Getting Started

Install dependencies:

```bash
npm install
```

Run the Electron app:

```bash
npm start
```

When the application starts it will create its database under:

```
%APPDATA%/smartershelly/smartershelly.db  # Windows
~/Library/Application Support/smartershelly/smartershelly.db  # macOS
~/.config/smartershelly/smartershelly.db  # Linux
```

## Project Structure

- `src/main/` – Electron main process code (IPC, database layer, Shelly integration).
- `src/renderer/` – Front-end (vanilla JS + Tailwind CSS styles).
- `src/main/database.js` – Database initialisation and migrations.
- `src/main/data-store.js` – Data access layer.
- `src/main/scan-service.js` – Network scanning logic.

## App Icon

A vector icon lives in `build/icon-source.svg`. Export platform assets with [`svgexport`](https://github.com/shakiba/svgexport) (downloads automatically when run through `npx`):

```bash
npx svgexport build/icon-source.svg build/icon-512.png 512:512
npx svgexport build/icon-source.svg build/icon-256.png 256:256
npx svgexport build/icon-source.svg build/icon-128.png 128:128
npx svgexport build/icon-source.svg build/icon-64.png 64:64

# Optional: create a multi-size ICO (requires ImageMagick)
convert build/icon-256.png build/icon-128.png build/icon-64.png build/icon-ico.ico
```

Point electron-builder to the generated assets in the `build` section of `package.json` (e.g. `icon: "build/icon-512.png"` for macOS/Linux and `icon: "build/icon-ico.ico"` for Windows).

## Packaging

Electron Builder is included as a dev dependency. After installing dependencies you can add a build script in `package.json` (if desired) and run:

```bash
npm run build
```

## Contributing

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/name`).
3. Commit your changes.
4. Push the branch and open a pull request.

## License

MIT © Steve
