# Mermaid Studio

<div align="center">

![Mermaid Studio](https://raw.githubusercontent.com/Woody-sudo/Mermaid-Studio/main/src-tauri/icons/128x128.png)

A beautiful, native macOS-style Mermaid diagram editor built with Tauri and Vite.

<!-- [![License](https://img.shields.io/github/license/Woody-sudo/Mermaid-Studio?style=flat-square)](https://github.com/Woody-sudo/Mermaid-Studio/blob/main/LICENSE) -->
[![Tauri](https://img.shields.io/badge/built%20with-Tauri-24C8DB?style=flat-square&logo=tauri&logoColor=black)](https://tauri.app)
[![Vite](https://img.shields.io/badge/bundled%20with-Vite-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev)
[![Mermaid](https://img.shields.io/badge/diagrams%20by-Mermaid-ff3670?style=flat-square&logo=mermaid&logoColor=white)](https://mermaid.js.org)
[![Platform](https://img.shields.io/badge/platform-macOS-000000?style=flat-square&logo=apple&logoColor=white)](https://www.apple.com/macos)

[Features](#features) • [Installation](#installation) • [Usage](#usage) • [Tech Stack](#tech-stack)

</div>

## ✨ Features

- **Beautiful Diagrams**: Powered by **[beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid)** for stunning, customizable visualizations.
- **Smart Fallback**: Automatically falls back to standard Mermaid rendering for diagram types not yet supported by `beautiful-mermaid`.
- **Extensive Theming**: Support for a wide variety of themes to match any aesthetic.
- **High-Quality Export**: Export your diagrams as high-definition **PNG** or vectorized **SVG/PDF** for professional use.
- **Real-time Preview**: Type your Mermaid code and see the diagram update instantly.
- **Rich Editor**: Integrated Monaco Editor for a premium coding experience with syntax highlighting.
- **macOS Native Aesthetic**: Designed with a focus on macOS design guidelines.
- **Theme Support**: Fully supports Light, Dark, and Auto (System) appearance modes.
- **Examples Library**: Includes a collection of varied Mermaid diagram examples to get you started.

## 🛠 Tech Stack

- **[Tauri](https://github.com/tauri-apps/tauri)**: For a lightweight, secure, and fast desktop application runtime.
- **[Vite](https://github.com/vitejs/vite)**: For lightning-fast frontend tooling.
- **[Mermaid.js](github.com/mermaid-js/mermaid)**: The core diagramming engine.
- **[beautiful-mermaid](https://github.com/Starttoaster/beautiful-mermaid)**: For enhanced diagram styling and aesthetics.
- **[Monaco Editor](https://microsoft.github.io/monaco-editor/)**: The code editor that powers VS Code.
- **Vanilla JS/CSS**: For maximum performance and control over the UI without framework overhead.

## 🚀 Installation

### Prerequisites



## 💻 Usage

### Development

To run the application in development mode with hot reloading:

```bash
npm run tauri dev
```

### Build

To build the application for production:

```bash
npm run tauri build
```

The build artifacts will be located in `src-tauri/target/release/`.

## 🔁 GitHub Auto Build & Release

This repository includes a GitHub Actions workflow at:

- `.github/workflows/release.yml`

It will automatically build macOS / Windows / Linux binaries and attach them to a GitHub Release when you push a tag like:

```bash
git tag v0.6.1
git push origin v0.6.1
```

### Notes

<!-- - Trigger: `push tags (v*)` and manual `workflow_dispatch`.
- Release assets are uploaded directly to the corresponding GitHub Release.
- `latest.json` (updater metadata) is generated via `includeUpdaterJson: true`. -->
- Target matrix:
  - macOS Intel (`x86_64-apple-darwin`): `.dmg`, `.app.tar.gz`
  - macOS Apple Silicon (`aarch64-apple-darwin`): `.dmg`, `.app.tar.gz`
  - Windows x64 (`x86_64-pc-windows-msvc`): `*-setup.exe`
  - Windows ARM64 (`aarch64-pc-windows-msvc`): `*-setup.exe`
  - Linux x64 (`x86_64-unknown-linux-gnu`): `.deb`, `.rpm`

### Optional secrets for signing/notarization

For production distribution (especially macOS notarization / updater signing), configure the relevant `TAURI_*` and Apple signing secrets in:

- `GitHub Repo Settings -> Secrets and variables -> Actions`

## 👤 Author

**Woody-sudo**

- GitHub: [@Woody-sudo](https://github.com/Woody-sudo)

## 📄 License

This project is open source and available under the MIT License.
