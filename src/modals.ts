import { App, Modal, Setting } from "obsidian";
import type { AddDomainInput, DomainEntry } from "./domain-map";
import { i18n } from "./i18n";

export class ConfirmModal extends Modal {
  constructor(
    app: App,
    private title: string,
    private lines: string[],
    private onConfirm: () => void,
  ) {
    super(app);
  }
  onOpen(): void {
    const T = i18n().modal;
    const { contentEl } = this;
    contentEl.createEl("h3", { text: this.title });
    for (const line of this.lines) {
      contentEl.createEl("p", { text: line });
    }
    new Setting(contentEl)
      .addButton((b) => b.setButtonText(T.cancel).onClick(() => this.close()))
      .addButton((b) => b.setButtonText(`▶ ${T.run}`).setCta().onClick(() => {
        this.close();
        this.onConfirm();
      }));
  }
  onClose(): void { this.contentEl.empty(); }
}

export class QueryModal extends Modal {
  private question = "";
  constructor(app: App, private save: boolean, private onSubmit: (q: string) => void) {
    super(app);
  }
  onOpen(): void {
    const T = i18n().modal;
    const { contentEl } = this;
    contentEl.createEl("h3", { text: this.save ? T.queryAndSave : T.query });
    const ta = contentEl.createEl("textarea", {
      attr: { rows: "5", style: "width:100%;" },
      placeholder: T.queryPlaceholder,
    });
    ta.addEventListener("input", () => { this.question = ta.value; });
    new Setting(contentEl).addButton((b) =>
      b.setButtonText(`▶ ${T.run}`).setCta().onClick(() => {
        const q = this.question.trim();
        if (!q) return;
        this.close();
        this.onSubmit(q);
      }),
    );
    setTimeout(() => ta.focus(), 0);
  }
  onClose(): void { this.contentEl.empty(); }
}

export class DomainModal extends Modal {
  constructor(
    app: App,
    private title: string,
    private allowAll: boolean,
    private extra: { dryRun?: boolean } | null,
    private domains: DomainEntry[],
    private onSubmit: (domain: string | "all", flags: { dryRun?: boolean }) => void,
  ) {
    super(app);
  }
  onOpen(): void {
    const T = i18n().modal;
    const { contentEl } = this;
    contentEl.createEl("h3", { text: this.title });
    let domain: string | "all" = this.allowAll ? "all" : (this.domains[0]?.id ?? "");
    let dryRun = false;

    if (this.domains.length === 0) {
      new Setting(contentEl)
        .setName(T.domain_name)
        .setDesc(T.noDomains_desc)
        .addText((t) => t.setPlaceholder(T.domainIdPlaceholder).onChange((v) => { domain = v.trim(); }));
    } else {
      new Setting(contentEl)
        .setName(T.domain_name)
        .addDropdown((d) => {
          if (this.allowAll) d.addOption("all", T.allWiki);
          for (const entry of this.domains) {
            d.addOption(entry.id, entry.name || entry.id);
          }
          d.setValue(domain);
          d.onChange((v) => { domain = v; });
        });
    }

    if (this.extra && "dryRun" in this.extra) {
      new Setting(contentEl)
        .setName(T.dryRun_name)
        .addToggle((t) => t.onChange((v) => { dryRun = v; }));
    }
    new Setting(contentEl).addButton((b) =>
      b.setButtonText(`▶ ${T.run}`).setCta().onClick(() => {
        this.close();
        this.onSubmit(domain, { dryRun });
      }),
    );
  }
  onClose(): void { this.contentEl.empty(); }
}

/** Дефолтный source_paths для нового домена — папка wiki_folder. */
export function defaultSourcePaths(wikiFolder: string): string[] {
  return wikiFolder ? [wikiFolder] : [];
}

export class AddDomainModal extends Modal {
  private input: AddDomainInput = { id: "", name: "", wikiFolder: "", sourcePaths: [] };
  private wikiFolderInput: { setValue: (v: string) => void } | null = null;
  private sourcePathsInput: { setValue: (v: string) => void } | null = null;
  private sourcePathsTouched = false;

  constructor(
    app: App,
    private wikiRoot: string,
    private onSubmit: (input: AddDomainInput) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const T = i18n().modal;
    const { contentEl } = this;
    contentEl.createEl("h3", { text: T.addDomain });

    new Setting(contentEl)
      .setName(T.id_name)
      .setDesc(T.id_desc)
      .addText((t) =>
        t.setPlaceholder(T.idPlaceholder).onChange((v) => {
          this.input.id = v.trim();
          if (this.wikiFolderInput && !this.input.wikiFolder) {
            const auto = `${this.wikiRoot}/${this.input.id}`;
            this.wikiFolderInput.setValue(auto);
            if (!this.sourcePathsTouched && this.sourcePathsInput) {
              this.sourcePathsInput.setValue(auto);
              this.input.sourcePaths = defaultSourcePaths(auto);
            }
          }
        }),
      );

    new Setting(contentEl)
      .setName(T.displayName_name)
      .addText((t) => t.setPlaceholder(T.idPlaceholder).onChange((v) => { this.input.name = v.trim(); }));

    new Setting(contentEl)
      .setName(T.wikiFolder_name)
      .setDesc(T.wikiFolder_desc(this.wikiRoot))
      .addText((t) => {
        t.setPlaceholder(T.wikiFolder_placeholder(this.wikiRoot)).onChange((v) => {
          this.input.wikiFolder = v.trim();
          if (!this.sourcePathsTouched && this.sourcePathsInput) {
            this.sourcePathsInput.setValue(v.trim());
            this.input.sourcePaths = defaultSourcePaths(v.trim());
          }
        });
        this.wikiFolderInput = t;
      });

    new Setting(contentEl)
      .setName(T.sourcePaths_name)
      .setDesc(T.sourcePaths_desc)
      .addText((t) => {
        t.setPlaceholder(T.sourcePaths_placeholder).onChange((v) => {
          this.sourcePathsTouched = true;
          this.input.sourcePaths = v.split(",").map((s) => s.trim()).filter(Boolean);
        });
        this.sourcePathsInput = t;
      });

    contentEl.createEl("p", { text: T.addDomainNote, cls: "muted" });

    new Setting(contentEl).addButton((b) =>
      b.setButtonText(T.add).setCta().onClick(() => {
        if (!this.input.id) return;
        this.close();
        this.onSubmit(this.input);
      }),
    );
  }

  onClose(): void { this.contentEl.empty(); }
}
