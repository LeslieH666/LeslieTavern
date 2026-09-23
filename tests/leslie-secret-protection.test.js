import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { jest } from '@jest/globals';
import { setConfigFilePath } from '../src/util.js';
import { PROTECTED_SECRETS_FORMAT, parseSecretDocument, serializeSecretDocument } from '../src/secret-protection.js';

const testProtector = {
    protect: bytes => Buffer.from(bytes.map(byte => byte ^ 0xa5)),
    unprotect: bytes => Buffer.from(bytes.map(byte => byte ^ 0xa5)),
};

let testRoot;
let directories;
let configRoot;
let SecretManager;
let SECRET_KEYS;

beforeAll(async () => {
    configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'leslie-secret-config-'));
    const configPath = path.join(configRoot, 'config.yaml');
    fs.writeFileSync(configPath, 'allowKeysExposure: false\n');
    setConfigFilePath(configPath);
    ({ SecretManager, SECRET_KEYS } = await import('../src/endpoints/secrets.js'));
});

afterAll(() => {
    if (configRoot && path.dirname(configRoot) === os.tmpdir()) {
        fs.rmSync(configRoot, { recursive: true, force: true });
    }
});

beforeEach(() => {
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'leslie-secret-test-'));
    directories = { root: testRoot, backups: path.join(testRoot, 'backups') };
    fs.mkdirSync(directories.backups);
});

afterEach(() => {
    if (testRoot && path.dirname(testRoot) === os.tmpdir()) {
        fs.rmSync(testRoot, { recursive: true, force: true });
    }
});

test('protects a secret document without changing the provider-key structure', () => {
    const secrets = { [SECRET_KEYS.DEEPSEEK]: [{ id: 'one', value: 'synthetic-deepseek-key', label: '测试', active: true }] };
    const serialized = serializeSecretDocument(secrets, testProtector);
    expect(serialized).toContain(PROTECTED_SECRETS_FORMAT);
    expect(serialized).not.toContain('synthetic-deepseek-key');
    expect(parseSecretDocument(serialized, testProtector)).toEqual({ secrets, protected: true });
    expect(() => parseSecretDocument(serialized, null)).toThrow('cannot be opened');
});

test('migrates saved keys in place and keeps providers separate across manager instances', () => {
    const filePath = path.join(testRoot, 'secrets.json');
    fs.writeFileSync(filePath, JSON.stringify({
        [SECRET_KEYS.OPENAI]: [{ id: 'openai-one', value: 'synthetic-openai-key', label: 'OpenAI', active: true }],
        [SECRET_KEYS.DEEPSEEK]: [{ id: 'deepseek-one', value: 'synthetic-deepseek-key', label: 'DeepSeek', active: true }],
    }));

    const manager = new SecretManager(directories, { protector: testProtector });
    expect(manager.readSecret(SECRET_KEYS.OPENAI)).toBe('synthetic-openai-key');
    expect(fs.readFileSync(filePath, 'utf8')).not.toContain('synthetic-openai-key');
    manager.writeSecret(SECRET_KEYS.OPENROUTER, 'synthetic-router-key', 'OpenRouter');

    const reopened = new SecretManager(directories, { protector: testProtector });
    expect(reopened.readSecret(SECRET_KEYS.OPENAI)).toBe('synthetic-openai-key');
    expect(reopened.readSecret(SECRET_KEYS.DEEPSEEK)).toBe('synthetic-deepseek-key');
    expect(reopened.readSecret(SECRET_KEYS.OPENROUTER)).toBe('synthetic-router-key');
});

test('migrates legacy flat secrets with only protected backup data', () => {
    const filePath = path.join(testRoot, 'secrets.json');
    fs.writeFileSync(filePath, JSON.stringify({ [SECRET_KEYS.CLAUDE]: 'synthetic-claude-key' }));
    const manager = new SecretManager(directories, { protector: testProtector });
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    try {
        manager.migrateFlatSecrets();
    } finally {
        info.mockRestore();
    }

    expect(manager.readSecret(SECRET_KEYS.CLAUDE)).toBe('synthetic-claude-key');
    const backup = fs.readdirSync(directories.backups).find(name => name.startsWith('secrets_migration_'));
    expect(backup).toBeDefined();
    expect(fs.readFileSync(path.join(directories.backups, backup), 'utf8')).not.toContain('synthetic-claude-key');
    expect(fs.readFileSync(filePath, 'utf8')).not.toContain('synthetic-claude-key');
});

test('leaves the original file intact when Windows protection is unavailable', () => {
    const filePath = path.join(testRoot, 'secrets.json');
    const original = JSON.stringify({ [SECRET_KEYS.OPENAI]: [{ id: 'one', value: 'synthetic-old-key', active: true }] });
    fs.writeFileSync(filePath, original);
    const protector = { protect: () => { throw new Error('unavailable'); }, unprotect: testProtector.unprotect };
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
        const manager = new SecretManager(directories, { protector });
        expect(manager.readSecret(SECRET_KEYS.OPENAI)).toBe('synthetic-old-key');
        expect(fs.readFileSync(filePath, 'utf8')).toBe(original);
        expect(() => manager.writeSecret(SECRET_KEYS.DEEPSEEK, 'synthetic-new-key')).toThrow('unavailable');
        expect(fs.readFileSync(filePath, 'utf8')).toBe(original);
    } finally {
        warning.mockRestore();
    }
});

test('does not replace an encrypted file when the current user cannot decrypt it', () => {
    const filePath = path.join(testRoot, 'secrets.json');
    const original = serializeSecretDocument({
        [SECRET_KEYS.OPENAI]: [{ id: 'one', value: 'synthetic-protected-key', active: true }],
    }, testProtector);
    fs.writeFileSync(filePath, original);
    const wrongUser = { protect: testProtector.protect, unprotect: () => { throw new Error('wrong user'); } };
    const manager = new SecretManager(directories, { protector: wrongUser });
    expect(() => manager.readSecret(SECRET_KEYS.OPENAI)).toThrow('wrong user');
    expect(fs.readFileSync(filePath, 'utf8')).toBe(original);
});

test('does not create a plaintext migration backup if protection fails', () => {
    const filePath = path.join(testRoot, 'secrets.json');
    const original = JSON.stringify({ [SECRET_KEYS.CLAUDE]: 'synthetic-legacy-key' });
    fs.writeFileSync(filePath, original);
    const protector = { protect: () => { throw new Error('unavailable'); }, unprotect: testProtector.unprotect };
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
        expect(() => new SecretManager(directories, { protector }).migrateFlatSecrets()).toThrow('left unchanged');
        expect(fs.readFileSync(filePath, 'utf8')).toBe(original);
        expect(fs.readdirSync(directories.backups)).toHaveLength(0);
    } finally {
        warning.mockRestore();
    }
});
