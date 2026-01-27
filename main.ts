import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, MarkdownRenderer, normalizePath, MarkdownView } from 'obsidian';

interface MermaidExporterSettings {
	imageScale: number;
	format: 'png' | 'svg';
    autoOpen: boolean;
    overwrite: boolean;
}

interface MermaidBlock {
    code: string;
    heading: string;
}

const DEFAULT_SETTINGS: MermaidExporterSettings = {
	imageScale: 2,
	format: 'png',
    autoOpen: true,
    overwrite: true
}

export default class MermaidExporter extends Plugin {
	settings: MermaidExporterSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'export-mermaid-diagrams',
			name: 'Export Mermaid Diagrams',
			callback: () => {
				this.exportMermaidDiagrams();
			}
		});

		this.addSettingTab(new MermaidExporterSettingTab(this.app, this));

		this.app.workspace.onLayoutReady(() => {
			this.addHeaderButtons();
		});

		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				this.addHeaderButtons();
			})
		);
	}

	onunload() {
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view instanceof MarkdownView) {
				const headerEl = (leaf.view as any).headerEl;
				if (headerEl) {
					const buttons = headerEl.querySelectorAll('.mermaid-exporter-action');
					buttons.forEach((button: HTMLElement) => button.remove());
				}
			}
		});
	}

	addHeaderButtons() {
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view instanceof MarkdownView) {
				const headerEl = (leaf.view as any).headerEl;
				if (headerEl && !headerEl.querySelector('.mermaid-exporter-action')) {
					const action = leaf.view.addAction('image-down', 'Export Mermaid Diagrams', () => {
						this.exportMermaidDiagrams();
					});
					action.addClass('mermaid-exporter-action');
				}
			}
		});
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async exportMermaidDiagrams() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice('No active file.');
			return;
		}

		const content = await this.app.vault.read(activeFile);
		const mermaidBlocks = this.extractMermaidBlocks(content, activeFile);

		if (mermaidBlocks.length === 0) {
			new Notice('No mermaid blocks found in this note.');
			return;
		}

		new MermaidSelectionModal(this.app, mermaidBlocks, this, activeFile).open();
	}

	extractMermaidBlocks(content: string, file: TFile): MermaidBlock[] {
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache || !cache.sections) return [];

		const mermaidBlocks: MermaidBlock[] = [];
		const headings = cache.headings || [];

		for (const section of cache.sections) {
			if (section.type === 'code') {
                const blockContent = content.substring(section.position.start.offset, section.position.end.offset);
                if (blockContent.startsWith('```mermaid')) {
                    const code = blockContent.replace(/^```mermaid\n?/, '').replace(/\n?```$/, '').trim();
                    
                    // Find the nearest heading above this section
                    let nearestHeading = "direct content";
                    for (let i = headings.length - 1; i >= 0; i--) {
                        if (headings[i].position.start.line < section.position.start.line) {
                            nearestHeading = headings[i].heading;
                            break;
                        }
                    }
                    
                    mermaidBlocks.push({ code, heading: nearestHeading });
                }
			}
		}
		return mermaidBlocks;
	}

    // Helper to render mermaid to SVG
    async renderMermaidToSvg(code: string): Promise<SVGSVGElement | null> {
        const tempContainer = document.body.createDiv();
        tempContainer.style.position = 'absolute';
        tempContainer.style.visibility = 'hidden';
        tempContainer.style.top = '0';
        tempContainer.style.left = '0';
        // Increase container size for large diagrams
        tempContainer.style.width = '1600px'; 
        
        // Inject directive to disable HTML labels to prevent "Tainted Canvas" error on PNG export
        // This forces Mermaid to use pure SVG text instead of foreignObject
        // Also inject the current Obsidian font settings
        const style = getComputedStyle(document.body);
        let rawFont = style.getPropertyValue('--font-text') || style.fontFamily || 'sans-serif';
        
        console.log(`Mermaid Exporter: Detected font '${rawFont}'`);

        // Prepare font strings
        // For JSON: Escape double quotes
        const jsonFont = rawFont.replace(/"/g, '\\"');
        
        // For CSS: Use raw font string. DO NOT wrap in quotes in the CSS or escape them, 
        // because it might be a list (e.g. "Inter", sans-serif).
        const cssFont = rawFont;

        // Inject into multiple places to ensure it sticks
        const safeCode = `%%{init: { "fontFamily": "${jsonFont}", "flowchart": {"htmlLabels": false}, "sequence": {"actorFontFamily": "${jsonFont}", "noteFontFamily": "${jsonFont}", "messageFontFamily": "${jsonFont}"}, "themeVariables": { "fontFamily": "${jsonFont}", "fontSize": "16px"} } }%%\n${code}`;
        
        // Render
        await MarkdownRenderer.render(this.app, "```mermaid\n" + safeCode + "\n```", tempContainer, '/', this);
        
        // Wait for mermaid to render
        const maxRetries = 200; // 200 * 50ms = 10 seconds
        let targetSvg: SVGSVGElement | null = null;
        
        for(let i=0; i<maxRetries; i++) {
            // Select any SVG that is NOT a copy code button
            const candidate = tempContainer.querySelector('svg:not(.copy-code-button)');
            
            // Double check it's not inside a copy button container if structure is complex
            if (candidate && !candidate.closest('.copy-code-button')) {
                 targetSvg = candidate as SVGSVGElement;
                 break;
            }
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        if (!targetSvg) {
            console.error("Mermaid Exporter: Failed to find SVG after 10s wait.", tempContainer.innerHTML);
        }

        if (targetSvg) {
            // Force inject font styles directly into the SVG to override Mermaid defaults
            const styleEl = document.createElement('style');
            styleEl.textContent = `
                text, tspan, .node, .label, .messageText, .noteText, .loopText, .actor, .cluster-label, .cluster text, .title, g.cluster text {
                    font-family: ${cssFont} !important;
                }
            `;
            targetSvg.prepend(styleEl);
        }

        const result = targetSvg ? targetSvg.cloneNode(true) as SVGSVGElement : null;
        document.body.removeChild(tempContainer);
        return result;
    }

    async saveSvgAsImage(svg: SVGSVGElement, file: TFile, index: number, heading: string, targetDirectory?: string, skipOpen: boolean = false) {
        try {
            const scale = this.settings.imageScale;
            
            // Get dimensions
            let width = svg.viewBox.baseVal.width;
            let height = svg.viewBox.baseVal.height;

            if (!width || !height) {
                 width = parseFloat(svg.getAttribute('width') || '800');
                 height = parseFloat(svg.getAttribute('height') || '600');
            }
            
            svg.setAttribute('width', (width * scale).toString());
            svg.setAttribute('height', (height * scale).toString());
            
            const svgData = new XMLSerializer().serializeToString(svg);
            const baseName = file.basename;
            const sanitizedHeading = heading.replace(/[\\/:*?"<>|]/g, '-');
            const defaultFileName = `${baseName}-${sanitizedHeading}-${index + 1}.${this.settings.format}`;
            
            let buffer: Buffer | null = null;

            if (this.settings.format === 'svg') {
                buffer = Buffer.from(svgData);
            } else {
                // Convert to PNG
                const canvas = document.createElement('canvas');
                canvas.width = width * scale;
                canvas.height = height * scale;
                const ctx = canvas.getContext('2d');
                
                if (ctx) {
                    ctx.fillStyle = 'white';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);

                    const img = new Image();
                    img.crossOrigin = 'Anonymous';
                    
                    // Use Data URI to avoid tainting
                    const base64Svg = btoa(unescape(encodeURIComponent(svgData)));
                    const dataUri = `data:image/svg+xml;base64,${base64Svg}`;

                    await new Promise((resolve, reject) => {
                        img.onload = () => {
                            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                            resolve(null);
                        };
                        img.onerror = reject;
                        img.src = dataUri;
                    });

                    const dataUrl = canvas.toDataURL('image/png');
                    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
                    buffer = Buffer.from(base64Data, 'base64');
                }
            }

            if (!buffer) {
                new Notice('Failed to create image buffer.');
                return;
            }

            const electron = require('electron');
            const remote = electron.remote || electron; 
            const path = require('path');
            const fs = require('fs');

            let finalPath: string | null = null;

            if (targetDirectory) {
                finalPath = path.join(targetDirectory, defaultFileName);
                
                if (fs.existsSync(finalPath) && !this.settings.overwrite) {
                    if (!skipOpen) new Notice(`File already exists, skipping: ${defaultFileName}`);
                    return;
                }
            } else {
                const dialog = remote.dialog;
                if (!dialog) {
                    new Notice('Electron dialog not available.');
                    return;
                }

                const result = await dialog.showSaveDialog({
                    defaultPath: defaultFileName,
                    filters: [
                        { name: 'Images', extensions: [this.settings.format] }
                    ]
                });

                if (!result.canceled && result.filePath) {
                    finalPath = result.filePath;
                }
            }

            if (finalPath) {
                fs.writeFileSync(finalPath, buffer);

                if (this.settings.autoOpen && !skipOpen) {
                    try {
                        await remote.shell.openPath(finalPath);
                    } catch (err) {
                        console.error("Failed to auto-open file:", err);
                    }
                }
            }

        } catch (e) {
            new Notice(`Save failed: ${e.message}`);
            console.error(e);
        }
    }
}

class MermaidSelectionModal extends Modal {
	mermaidBlocks: MermaidBlock[];
	plugin: MermaidExporter;
	activeFile: TFile;
	selected: boolean[];

	constructor(app: App, mermaidBlocks: MermaidBlock[], plugin: MermaidExporter, activeFile: TFile) {
		super(app);
		this.mermaidBlocks = mermaidBlocks;
		this.plugin = plugin;
		this.activeFile = activeFile;
		this.selected = new Array(mermaidBlocks.length).fill(false);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: `Found ${this.mermaidBlocks.length} Mermaid Diagrams` });

        // Select All Control
        const controlsDiv = contentEl.createDiv({ cls: 'mermaid-exporter-controls' });
        controlsDiv.style.marginBottom = '10px';
        
        const selectAllBtn = controlsDiv.createEl('button', { text: 'Select All' });
        selectAllBtn.onclick = () => {
            this.selected.fill(true);
            this.refreshList();
        };
        
        const deselectAllBtn = controlsDiv.createEl('button', { text: 'Deselect All' });
        deselectAllBtn.style.marginLeft = '10px';
        deselectAllBtn.onclick = () => {
            this.selected.fill(false);
            this.refreshList();
        };

        const listContainer = contentEl.createDiv({ cls: 'mermaid-block-list' });
        listContainer.style.maxHeight = '300px';
        listContainer.style.overflowY = 'auto';
        listContainer.style.marginTop = '10px';
        listContainer.style.marginBottom = '20px';
        listContainer.style.border = '1px solid var(--background-modifier-border)';
        listContainer.style.padding = '10px';

        this.renderList(listContainer);

		const exportBtn = contentEl.createEl('button', { text: 'Export Selected', cls: 'mod-cta' });
        exportBtn.style.float = 'right';
		exportBtn.onclick = async () => {
            const selectedIndices = this.selected.map((val, idx) => val ? idx : -1).filter(idx => idx !== -1);
            
            if(selectedIndices.length === 0) {
                new Notice("No blocks selected");
                return;
            }

            const electron = require('electron');
            const remote = electron.remote || electron;
            const dialog = remote.dialog;

            if (!dialog) {
                new Notice('Electron dialog not available.');
                return;
            }

            const result = await dialog.showOpenDialog({
                properties: ['openDirectory'],
                title: 'Select Export Directory'
            });

            if (result.canceled || result.filePaths.length === 0) {
                return;
            }

            const targetDirectory = result.filePaths[0];
            const isBulk = selectedIndices.length > 1;
            
            this.close();
            
            const count = selectedIndices.length;
            const progressNotice = new Notice(`Exporting ${count} diagram${count !== 1 ? 's' : ''}...`, 0);
            
            try {
                for (const index of selectedIndices) {
                    const block = this.mermaidBlocks[index];
                    const svg = await this.plugin.renderMermaidToSvg(block.code);
                    if (svg) {
                        await this.plugin.saveSvgAsImage(svg, this.activeFile, index, block.heading, targetDirectory, isBulk);
                    } else {
                        new Notice(`Failed to render diagram #${index+1} (Timeout or not found)`);
                    }
                }
                progressNotice.setMessage(`Export finished.`);
                setTimeout(() => (progressNotice as any).hide(), 2000);
            } catch (e) {
                (progressNotice as any).hide();
                new Notice(`Export failed: ${e.message}`);
            }

            if (isBulk && this.plugin.settings.autoOpen) {
                // For bulk export, just open the folder once
                remote.shell.openPath(targetDirectory);
            }
		};
	}

    renderList(container: HTMLElement) {
        container.empty();
		this.mermaidBlocks.forEach((block, index) => {
			const label = container.createEl('label', { cls: 'mermaid-block-item' });
            label.style.display = 'flex';
            label.style.flexDirection = 'column';
            label.style.padding = '10px 5px';
            label.style.cursor = 'pointer';
            label.style.borderRadius = '4px';

            // Add hover effect
            label.onmouseenter = () => label.style.backgroundColor = 'var(--background-modifier-hover)';
            label.onmouseleave = () => label.style.backgroundColor = 'transparent';
            
            const topRow = label.createDiv();
            topRow.style.display = 'flex';
            topRow.style.alignItems = 'center';
            topRow.style.width = '100%';

            const checkbox = topRow.createEl('input', { type: 'checkbox' });
            checkbox.checked = this.selected[index];
            checkbox.style.marginRight = '10px';
            checkbox.onchange = (e) => {
                this.selected[index] = checkbox.checked;
            };
            
            topRow.createEl('strong', { text: block.heading });

            // Simple preview
            const lines = block.code.split('\n').filter(l => l.trim() !== '');
            const previewText = lines.slice(0, 2).join(' ') + (lines.length > 2 ? '...' : '');
            
            const previewEl = label.createEl('small', { text: previewText || 'Empty block' });
            previewEl.style.color = 'var(--text-muted)';
            previewEl.style.marginLeft = '30px';
            previewEl.style.marginTop = '4px';
		});
    }
    
    refreshList() {
        const listContainer = this.contentEl.querySelector('.mermaid-block-list') as HTMLElement;
        if (listContainer) this.renderList(listContainer);
    }

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class MermaidExporterSettingTab extends PluginSettingTab {
	plugin: MermaidExporter;

	constructor(app: App, plugin: MermaidExporter) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Mermaid Exporter Settings' });

		new Setting(containerEl)
			.setName('Image Scale')
			.setDesc('Scale factor for the exported PNG (higher = better quality but larger size)')
			.addSlider(slider => slider
				.setLimits(1, 10, 1)
				.setValue(this.plugin.settings.imageScale)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.imageScale = value;
					await this.plugin.saveSettings();
				}));

        new Setting(containerEl)
            .setName('Output Format')
            .setDesc('Choose the output format for the exported diagrams.')
            .addDropdown(dropdown => dropdown
                .addOption('png', 'PNG')
                .addOption('svg', 'SVG')
                .setValue(this.plugin.settings.format)
                .onChange(async (value) => {
                    this.plugin.settings.format = value as 'png' | 'svg';
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Auto Open File')
            .setDesc('Automatically open the exported image after saving.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoOpen)
                .onChange(async (value) => {
                    this.plugin.settings.autoOpen = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Overwrite Existing Files')
            .setDesc('If a file with the same name exists, overwrite it without asking.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.overwrite)
                .onChange(async (value) => {
                    this.plugin.settings.overwrite = value;
                    await this.plugin.saveSettings();
                }));
	}
}
