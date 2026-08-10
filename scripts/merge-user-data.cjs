#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function parseArguments(argv) {
    const values = new Map();
    for (let index = 0; index < argv.length; index += 2) {
        const key = argv[index];
        const value = argv[index + 1];
        if (!key?.startsWith('--') || !value) {
            throw new Error('Usage: node scripts/merge-user-data.cjs --development <data> --portable <UserData>');
        }
        values.set(key.slice(2), path.resolve(value));
    }

    const development = values.get('development');
    const portable = values.get('portable');
    if (!development || !portable) {
        throw new Error('Both --development and --portable are required.');
    }
    if (development === portable) {
        throw new Error('Development and portable data roots must be different.');
    }
    return { development, portable };
}

function assertDataRoot(root, label) {
    const required = [
        path.join(root, 'default-user', 'characters'),
        path.join(root, 'default-user', 'chats'),
        path.join(root, 'default-user', 'settings.json'),
        path.join(root, 'default-user', 'secrets.json'),
    ];
    for (const target of required) {
        if (!fs.existsSync(target)) {
            throw new Error(`${label} data root is missing required path: ${target}`);
        }
    }
}

function listFiles(root) {
    const files = [];
    const visit = (directory) => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const absolute = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                visit(absolute);
            } else if (entry.isFile()) {
                files.push(absolute);
            }
        }
    };
    visit(root);
    return files;
}

function copyFilePreservingTimes(source, target) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    const stat = fs.statSync(source);
    fs.utimesSync(target, stat.atime, stat.mtime);
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJsonAtomic(file, value) {
    const temporary = `${file}.merge-${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 4)}\n`, 'utf8');
    fs.renameSync(temporary, file);
}

function mergeRegistry(developmentFile, portableFile) {
    const development = readJson(developmentFile);
    const portable = readJson(portableFile);

    if (development.schemaVersion !== portable.schemaVersion) {
        throw new Error('Identity registry schema versions do not match.');
    }

    const entities = [...development.entities];
    for (const candidate of portable.entities) {
        const sameId = entities.find(entity => entity.id === candidate.id);
        const sameSource = entities.find(entity => entity.type === candidate.type && entity.sourceKey === candidate.sourceKey);
        if (sameSource && sameSource.id !== candidate.id) {
            throw new Error(`Identity source collision requires manual review: ${candidate.type}/${candidate.sourceKey}`);
        }
        if (!sameId && !sameSource) {
            entities.push(candidate);
        }
    }

    const storyScopes = [...development.storyScopes];
    for (const candidate of portable.storyScopes) {
        const exists = storyScopes.some(scope => scope.id === candidate.id || scope.currentChatKey === candidate.currentChatKey);
        if (!exists) {
            storyScopes.push(candidate);
        }
    }

    const entityIds = new Set(entities.map(entity => entity.id));
    for (const scope of storyScopes) {
        if (!entityIds.has(scope.personaId) || !entityIds.has(scope.counterpartId)) {
            throw new Error(`Story scope ${scope.id} refers to an unknown identity.`);
        }
    }

    const merged = {
        ...development,
        revision: Math.max(development.revision ?? 0, portable.revision ?? 0) + 1,
        entities,
        storyScopes,
        createdAt: [development.createdAt, portable.createdAt].filter(Boolean).sort()[0],
        updatedAt: new Date().toISOString(),
    };
    writeJsonAtomic(developmentFile, merged);
    return {
        entities: merged.entities.length,
        storyScopes: merged.storyScopes.length,
    };
}

function mergeSecrets(developmentFile, portableFile) {
    const development = readJson(developmentFile);
    const portable = readJson(portableFile);
    let imported = 0;

    for (const [key, portableEntries] of Object.entries(portable)) {
        if (!Array.isArray(portableEntries)) {
            throw new Error(`Portable secret key ${key} is not an array.`);
        }
        if (!Array.isArray(development[key])) {
            development[key] = [];
        }

        const hadActiveDevelopmentValue = development[key].some(entry => entry.active);
        for (const portableEntry of portableEntries) {
            if (development[key].some(entry => entry.value === portableEntry.value)) {
                continue;
            }
            const idCollision = development[key].some(entry => entry.id === portableEntry.id);
            development[key].push({
                ...portableEntry,
                id: idCollision ? randomUUID() : portableEntry.id,
                label: `便携版迁移 · ${portableEntry.label || '未命名'}`,
                active: false,
            });
            imported += 1;
        }

        if (!hadActiveDevelopmentValue && development[key].length > 0) {
            development[key].forEach((entry, index) => {
                entry.active = index === 0;
            });
        }
    }

    writeJsonAtomic(developmentFile, development);
    return imported;
}

function mergeSettings(developmentFile, portableFile) {
    const development = readJson(developmentFile);
    const portable = readJson(portableFile);
    const developmentProvider = development?.extension_settings?.tts?.Volcengine;
    const portableProvider = portable?.extension_settings?.tts?.Volcengine;
    if (!developmentProvider || !portableProvider) {
        throw new Error('Both settings files must contain Volcengine TTS settings.');
    }

    developmentProvider.voiceMap ??= {};
    portableProvider.voiceMap ??= {};
    const portableDefault = portableProvider.voiceMap['[Default Voice]'];
    const importedVoiceMappings = [];

    for (const [name, voice] of Object.entries(portableProvider.voiceMap)) {
        if (name === '[Default Voice]' || Object.hasOwn(developmentProvider.voiceMap, name)) {
            continue;
        }
        developmentProvider.voiceMap[name] = voice === '[Default Voice]' && portableDefault ? portableDefault : voice;
        importedVoiceMappings.push(name);
    }

    if (!developmentProvider.resource_id && portableProvider.resource_id) {
        developmentProvider.resource_id = portableProvider.resource_id;
    }

    developmentProvider.customVoices ??= [];
    for (const candidate of portableProvider.customVoices ?? []) {
        const identity = candidate.voice_type ?? candidate.id ?? JSON.stringify(candidate);
        const exists = developmentProvider.customVoices.some(existing => {
            const existingIdentity = existing.voice_type ?? existing.id ?? JSON.stringify(existing);
            return existingIdentity === identity;
        });
        if (!exists) {
            developmentProvider.customVoices.push(candidate);
        }
    }

    writeJsonAtomic(developmentFile, development);
    return importedVoiceMappings;
}

function mergeStats(developmentFile, portableFile) {
    const development = readJson(developmentFile);
    const portable = readJson(portableFile);
    const merged = { ...development };

    for (const [key, value] of Object.entries(portable)) {
        if (key === 'timestamp') {
            continue;
        }
        if (!Object.hasOwn(merged, key) || key === 'default_Seraphina.png') {
            merged[key] = value;
        }
    }
    merged.timestamp = Math.max(development.timestamp ?? 0, portable.timestamp ?? 0, Date.now());
    writeJsonAtomic(developmentFile, merged);
}

function validateJsonLines(root) {
    const relevantRoots = [
        path.join(root, 'default-user', 'chats'),
        path.join(root, 'default-user', 'group chats'),
        path.join(root, 'default-user', 'leslie', 'memory'),
    ].filter(directory => fs.existsSync(directory));

    let files = 0;
    let lines = 0;
    for (const directory of relevantRoots) {
        for (const file of listFiles(directory).filter(item => item.endsWith('.jsonl'))) {
            files += 1;
            for (const [index, line] of fs.readFileSync(file, 'utf8').split(/\r?\n/u).entries()) {
                if (!line.trim()) {
                    continue;
                }
                try {
                    JSON.parse(line);
                    lines += 1;
                } catch (error) {
                    throw new Error(`Invalid JSONL at ${file}:${index + 1}: ${error.message}`);
                }
            }
        }
    }
    return { files, lines };
}

function validateCharacterPngs(root) {
    const directory = path.join(root, 'default-user', 'characters');
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    let files = 0;
    for (const file of listFiles(directory).filter(item => item.toLowerCase().endsWith('.png'))) {
        const header = Buffer.alloc(signature.length);
        const descriptor = fs.openSync(file, 'r');
        try {
            fs.readSync(descriptor, header, 0, header.length, 0);
        } finally {
            fs.closeSync(descriptor);
        }
        if (!header.equals(signature)) {
            throw new Error(`Character card does not have a valid PNG signature: ${file}`);
        }
        files += 1;
    }
    return files;
}

const { development, portable } = parseArguments(process.argv.slice(2));
assertDataRoot(development, 'Development');
assertDataRoot(portable, 'Portable');

const portableFiles = listFiles(portable);
let copiedMissingFiles = 0;
for (const source of portableFiles) {
    const relative = path.relative(portable, source);
    const target = path.join(development, relative);
    if (!fs.existsSync(target)) {
        copyFilePreservingTimes(source, target);
        copiedMissingFiles += 1;
    }
}

const userRelative = 'default-user';
const developmentUser = path.join(development, userRelative);
const portableUser = path.join(portable, userRelative);
const registry = mergeRegistry(
    path.join(developmentUser, 'leslie', 'identity', 'registry.json'),
    path.join(portableUser, 'leslie', 'identity', 'registry.json'),
);
const importedSecrets = mergeSecrets(
    path.join(developmentUser, 'secrets.json'),
    path.join(portableUser, 'secrets.json'),
);
const importedVoiceMappings = mergeSettings(
    path.join(developmentUser, 'settings.json'),
    path.join(portableUser, 'settings.json'),
);
mergeStats(
    path.join(developmentUser, 'stats.json'),
    path.join(portableUser, 'stats.json'),
);

const seraphinaRelative = path.join(
    'default-user',
    'chats',
    'default_Seraphina',
    'Seraphina - 2023-5-12 @21h 32m 29s 224ms.jsonl',
);
copyFilePreservingTimes(
    path.join(portable, seraphinaRelative),
    path.join(development, seraphinaRelative),
);

const jsonLines = validateJsonLines(development);
const characterPngs = validateCharacterPngs(development);

console.log(JSON.stringify({
    copiedMissingFiles,
    importedSecrets,
    importedVoiceMappings,
    registry,
    jsonLines,
    characterPngs,
}, null, 2));
