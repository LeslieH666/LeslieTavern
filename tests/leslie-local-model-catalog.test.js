import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { listLocalModels, resolveLocalModel } from '../src/electron/local-model-catalog.js';
import { getLocalServiceStatus, runLocalServiceAction, startManagedLocalModel } from '../src/electron/local-services.js';

let root;

function writeSyntheticGguf(relative) {
    const target = path.join(root, 'models', ...relative.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const header = Buffer.alloc(24);
    header.write('GGUF', 0);
    header.writeUInt32LE(3, 4);
    fs.writeFileSync(target, header);
    return target;
}

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'leslie-model-catalog-'));
    fs.mkdirSync(path.join(root, 'models'));
});

afterEach(() => {
    if (root && path.dirname(root) === os.tmpdir()) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('discovers nested GGUF files and excludes invalid files, shards and projector weights', () => {
    writeSyntheticGguf('author/roleplay.Q4_K_M.gguf');
    writeSyntheticGguf('author/roleplay-00001-of-00002.gguf');
    writeSyntheticGguf('author/mmproj.gguf');
    fs.writeFileSync(path.join(root, 'models', 'renamed.gguf'), 'not a model');
    fs.writeFileSync(path.join(root, 'models', 'weights.safetensors'), 'synthetic');

    const catalog = listLocalModels(root);
    expect(catalog.models).toEqual([{
        id: 'author/roleplay.Q4_K_M.gguf',
        name: 'roleplay.Q4_K_M',
        sizeBytes: 24,
        runtimes: ['koboldcpp'],
    }]);
    expect(resolveLocalModel(root, catalog.models[0].id).path).toBe(path.join(root, 'models', 'author', 'roleplay.Q4_K_M.gguf'));
    expect(() => resolveLocalModel(root, '../outside.gguf')).toThrow('no longer available');
});

test('reports the selected managed model only for the matching tracked process', () => {
    writeSyntheticGguf('roleplay.gguf');
    fs.mkdirSync(path.join(root, 'tools', 'koboldcpp'), { recursive: true });
    fs.writeFileSync(path.join(root, 'tools', 'koboldcpp', 'koboldcpp.exe'), 'synthetic');
    fs.mkdirSync(path.join(root, 'Run'));
    fs.writeFileSync(path.join(root, 'Run', 'KoboldCpp.pid'), '4242');
    fs.writeFileSync(path.join(root, 'Run', 'KoboldCpp.model.json'), JSON.stringify({ pid: 4242, modelId: 'roleplay.gguf' }));

    const status = getLocalServiceStatus(root, { kill: () => undefined });
    expect(status.services.localModel).toMatchObject({ state: 'running', configured: true, runtimeInstalled: true, modelId: 'roleplay.gguf' });
    fs.writeFileSync(path.join(root, 'Run', 'KoboldCpp.model.json'), JSON.stringify({ pid: 1234, modelId: 'roleplay.gguf' }));
    expect(getLocalServiceStatus(root, { kill: () => undefined }).services.localModel.modelId).toBeNull();
});

test('passes only a catalog-validated model path to the managed launcher', async () => {
    const modelPath = writeSyntheticGguf('roleplay.gguf');
    const scripts = path.join(root, 'packaging', 'windows-local');
    fs.mkdirSync(scripts, { recursive: true });
    fs.writeFileSync(path.join(scripts, 'Start-LocalModel.ps1'), 'synthetic');
    const spawned = [];
    const spawnProcess = (_command, args) => {
        spawned.push(args);
        const child = new EventEmitter();
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        queueMicrotask(() => child.emit('exit', 0));
        return child;
    };

    await expect(runLocalServiceAction(root, 'localModel', 'start', { modelId: 'roleplay.gguf', spawnProcess })).resolves.toMatchObject({ ok: true });
    expect(spawned[0]).toContain(modelPath);
    expect(spawned[0]).toContain('roleplay.gguf');
    expect(() => runLocalServiceAction(root, 'localModel', 'start', { modelId: '../outside.gguf', spawnProcess })).toThrow('no longer available');
    expect(spawned).toHaveLength(1);
});

test('switches a tracked model in order and leaves it alone when already selected', async () => {
    writeSyntheticGguf('first.gguf');
    writeSyntheticGguf('second.gguf');
    const calls = [];
    const runAction = async (_root, service, action, options) => calls.push({ service, action, modelId: options?.modelId });

    await startManagedLocalModel(root, 'second.gguf', {
        getStatus: () => ({ services: { localModel: { state: 'running', modelId: 'first.gguf' } } }),
        runAction,
    });
    expect(calls).toEqual([
        { service: 'localModel', action: 'stop', modelId: undefined },
        { service: 'localModel', action: 'start', modelId: 'second.gguf' },
    ]);

    calls.length = 0;
    await startManagedLocalModel(root, 'second.gguf', {
        getStatus: () => ({ services: { localModel: { state: 'running', modelId: 'second.gguf' } } }),
        runAction,
    });
    expect(calls).toHaveLength(0);
    await expect(startManagedLocalModel(root, '../outside.gguf', { runAction })).rejects.toThrow('no longer available');
    expect(calls).toHaveLength(0);
});
