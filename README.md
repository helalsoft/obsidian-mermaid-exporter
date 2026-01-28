# Obsidian Mermaid Exporter

Export your Mermaid diagrams from Obsidian notes to high-quality PNG, SVG, or PDF files with ease.

## Features

- **Bulk Export**: Find and export all Mermaid diagrams within your active note at once.
- **Selective Export**: Choose exactly which diagrams you want to save using a selection modal.
- **Multiple Formats**: Support for **PNG**, **SVG**, and **PDF** output.
- **High Quality**: Adjustable image scale for PNG exports to ensure crisp diagrams even at large sizes.
- **Theme Integration**: Automatically detects and applies your Obsidian theme's font to the exported diagrams for a consistent look.
- **Easy Access**: 
    - Dedicated button in the note header (view actions).
    - Command Palette integration (`Export Mermaid Diagrams`).
- **Workflow Friendly**: 
    - Automatically opens the exported file/folder after saving.
    - Option to overwrite existing files for faster iteration.

## Usage

1. Open a note containing one or more Mermaid diagrams.
2. Click the **Image Down** icon in the note header or open the Command Palette (`Ctrl/Cmd + P`) and search for `Mermaid Exporter: Export Mermaid Diagrams`.
3. In the modal that appears:
    - Select the diagrams you wish to export.
    - Click **Export Selected**.
4. Select the target directory where you want to save the images.

## Settings

Go to `Settings` > `Mermaid Exporter` to customize the plugin behavior:

- **Image Scale**: Set the scale factor for PNG exports (1 to 10). Higher values result in better quality but larger file sizes.
- **Output Format**: Choose between **PNG**, **SVG**, and **PDF**.
- **Auto Open File**: When enabled, the plugin will automatically open the image (or folder for bulk exports) using your system's default viewer after saving.
- **Overwrite Existing Files**: If enabled, files with the same name will be overwritten without confirmation.

## Installation

### From Obsidian (Recommended)
*Coming soon to the Community Plugins gallery.*

### Manual Installation
1. Download the latest release (`main.js`, `manifest.json`).
2. Create a folder named `obsidian-mermaid-exporter` in your vault's `.obsidian/plugins/` directory.
3. Move the downloaded files into that folder.
4. Reload Obsidian and enable the plugin in **Settings** > **Community Plugins**.

## Development

If you want to contribute or build the plugin from source:

1. Clone the repository.
2. Install dependencies: `bun install` (or `npm install`).
3. Build the plugin: `bun run build`.
4. For development with auto-reload: `bun run dev`.

---

Created by [Helalsoft](https://github.com/helalsoft). Licensed under the [MIT License](LICENSE).
