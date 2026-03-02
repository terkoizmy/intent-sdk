/**
 * Script to replace @ path aliases with relative imports.
 * Usage: bun run scripts/fix-aliases.ts
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, dirname, resolve } from "node:path";

const SRC_DIR = resolve(import.meta.dirname!, "../src");

// Mapping: alias prefix → directory relative to project root
const ALIAS_MAP: Record<string, string> = {
    "@/": "src/",
    "@parser/": "src/parser/",
    "@solver/": "src/solver/",
    "@services/": "src/services/",
    "@types/": "src/types/",
};

async function getAllTsFiles(dir: string): Promise<string[]> {
    const result: string[] = [];
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            result.push(...(await getAllTsFiles(fullPath)));
        } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
            result.push(fullPath);
        }
    }
    return result;
}

async function fixFile(filePath: string): Promise<number> {
    let content = await readFile(filePath, "utf-8");
    let changeCount = 0;
    const fileDir = dirname(filePath);

    for (const [alias, targetDir] of Object.entries(ALIAS_MAP)) {
        const regex = new RegExp(`from "(${alias.replace("/", "\\/")})([^"]*)"`, "g");
        content = content.replace(regex, (_match, _aliasPrefix, rest) => {
            const absoluteTarget = resolve(SRC_DIR, "..", targetDir, rest);
            let rel = relative(fileDir, absoluteTarget).replace(/\\/g, "/");
            if (!rel.startsWith(".")) rel = "./" + rel;
            changeCount++;
            return `from "${rel}"`;
        });

        // Also handle type imports
        const typeRegex = new RegExp(`from "(${alias.replace("/", "\\/")})([^"]*)"`, "g");
        content = content.replace(typeRegex, (_match, _aliasPrefix, rest) => {
            const absoluteTarget = resolve(SRC_DIR, "..", targetDir, rest);
            let rel = relative(fileDir, absoluteTarget).replace(/\\/g, "/");
            if (!rel.startsWith(".")) rel = "./" + rel;
            return `from "${rel}"`;
        });
    }

    if (changeCount > 0) {
        await writeFile(filePath, content, "utf-8");
    }
    return changeCount;
}

async function main() {
    const files = await getAllTsFiles(SRC_DIR);
    let totalChanges = 0;
    let filesChanged = 0;

    for (const file of files) {
        const changes = await fixFile(file);
        if (changes > 0) {
            const rel = relative(resolve(SRC_DIR, ".."), file).replace(/\\/g, "/");
            console.log(`  ✓ ${rel} (${changes} imports fixed)`);
            totalChanges += changes;
            filesChanged++;
        }
    }

    console.log(`\nDone! Fixed ${totalChanges} imports across ${filesChanged} files.`);
}

main().catch(console.error);
