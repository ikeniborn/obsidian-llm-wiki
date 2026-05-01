export class VaultTools {
    adapter;
    basePath;
    constructor(adapter, basePath) {
        this.adapter = adapter;
        this.basePath = basePath;
    }
    async read(vaultPath) {
        return this.adapter.read(vaultPath);
    }
    async write(vaultPath, content) {
        const dir = vaultPath.split("/").slice(0, -1).join("/");
        if (dir) {
            const dirExists = await this.adapter.exists(dir);
            if (!dirExists)
                await this.adapter.mkdir(dir);
        }
        await this.adapter.write(vaultPath, content);
    }
    async listFiles(vaultDir) {
        const exists = await this.adapter.exists(vaultDir);
        if (!exists)
            return [];
        return this._listRecursive(vaultDir);
    }
    async _listRecursive(vaultDir) {
        const result = await this.adapter.list(vaultDir);
        const deeper = await Promise.all(result.folders.map((f) => this._listRecursive(f)));
        return [...result.files, ...deeper.flat()];
    }
    async readAll(paths) {
        const entries = await Promise.all(paths.map(async (p) => {
            try {
                return [p, await this.read(p)];
            }
            catch {
                return null;
            }
        }));
        return new Map(entries.filter((e) => e !== null));
    }
    async exists(vaultPath) {
        return this.adapter.exists(vaultPath);
    }
    toVaultPath(absolutePath) {
        const base = this.basePath.endsWith("/") ? this.basePath : this.basePath + "/";
        if (!absolutePath.startsWith(base))
            return null;
        return absolutePath.slice(base.length);
    }
}
