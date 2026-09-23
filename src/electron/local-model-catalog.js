import fs from 'node:fs';
import path from 'node:path';

const MAX_DIRECTORY_DEPTH = 3;
const MAX_ENTRIES = 512;
const GGUF_MAGIC = Buffer.from('GGUF');

function isInside(parent, child) {
    const relative = path.relative(parent, child);
    return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function isGgufFile(filePath) {
    let descriptor;
    try {
        descriptor = fs.openSync(filePath, 'r');
        const header = Buffer.alloc(24);
        return fs.readSync(descriptor, header, 0, 24, 0) === 24
            && header.subarray(0, 4).equals(GGUF_MAGIC)
            && header.readUInt32LE(4) >= 1
            && header.readUInt32LE(4) <= 3;
    } catch {
        return false;
    } finally {
        if (descriptor !== undefined) {
            fs.closeSync(descriptor);
        }
    }
}

/**
 * Discover individual text-model GGUF files in the single project model
 * directory. Symlinks and split GGUF parts are excluded from one-click use.
 * @param {string} projectRoot Project root.
 * @returns {{directory: string, models: Array<{id: string, name: string, sizeBytes: number, runtimes: string[]}>}}
 */
export function listLocalModels(projectRoot) {
    const directory = path.join(path.resolve(projectRoot), 'models');
    const models = [];
    let realRoot;
    try {
        if (fs.lstatSync(directory).isSymbolicLink()) {
            return { directory, models };
        }
        realRoot = fs.realpathSync.native(directory);
    } catch {
        return { directory, models };
    }
    let inspected = 0;
    const visit = (folder, depth) => {
        if (depth > MAX_DIRECTORY_DEPTH || inspected >= MAX_ENTRIES) {
            return;
        }
        let entries;
        try {
            entries = fs.readdirSync(folder, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            inspected++;
            if (inspected > MAX_ENTRIES) {
                break;
            }
            if (entry.isSymbolicLink()) {
                continue;
            }
            const filePath = path.join(folder, entry.name);
            if (entry.isDirectory()) {
                visit(filePath, depth + 1);
                continue;
            }
            if (!entry.isFile() || !/\.gguf$/i.test(entry.name) || /-\d{5}-of-\d{5}\.gguf$/i.test(entry.name) || /(?:^|[-_.])mmproj(?:[-_.]|$)/i.test(entry.name)) {
                continue;
            }
            let realFile;
            try {
                realFile = fs.realpathSync.native(filePath);
            } catch {
                continue;
            }
            if (!isInside(realRoot, realFile) || !isGgufFile(realFile)) {
                continue;
            }
            try {
                const relative = path.relative(directory, filePath).split(path.sep).join('/');
                models.push({
                    id: relative,
                    name: path.basename(entry.name, path.extname(entry.name)),
                    sizeBytes: fs.statSync(realFile).size,
                    runtimes: ['koboldcpp'],
                });
            } catch {
                // A removed file should not prevent the rest of the catalog from loading.
            }
        }
    };
    visit(directory, 0);
    models.sort((a, b) => a.name.localeCompare(b.name));
    return { directory, models };
}

/** Resolve only IDs discovered inside the managed model directory. */
export function resolveLocalModel(projectRoot, modelId) {
    const model = listLocalModels(projectRoot).models.find(item => item.id === modelId);
    if (!model) {
        throw new Error('The selected local model is no longer available in the models directory.');
    }
    return { ...model, path: path.join(path.resolve(projectRoot), 'models', ...model.id.split('/')) };
}
