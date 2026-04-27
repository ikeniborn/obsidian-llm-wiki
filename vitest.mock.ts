// Mock for obsidian module in tests
export class App {}

export class Plugin {}

export class PluginSettingTab {
  constructor(app: App, plugin: Plugin) {}
}

export class Setting {
  constructor(containerEl: any) {}
  setName() { return this; }
  setDesc() { return this; }
  addText() { return this; }
  addDropdown() { return this; }
  addToggle() { return this; }
}

export const Platform = {
  isMobile: false,
};

export class Notice {}

export class Modal {}

export class ItemView {}
