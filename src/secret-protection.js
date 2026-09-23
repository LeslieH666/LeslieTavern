import { spawnSync } from 'node:child_process';

export const PROTECTED_SECRETS_FORMAT = 'leslie-dpapi-v1';

const PROTECT_SCRIPT = `
$ErrorActionPreference = 'Stop'
try {
    Add-Type -AssemblyName System.Security
    $plain = [Convert]::FromBase64String([Console]::In.ReadToEnd().Trim())
    $encrypted = [Security.Cryptography.ProtectedData]::Protect($plain, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    [Console]::Out.Write([Convert]::ToBase64String($encrypted))
} catch {
    [Console]::Error.Write('DPAPI protection failed')
    exit 1
}`;

const UNPROTECT_SCRIPT = `
$ErrorActionPreference = 'Stop'
try {
    Add-Type -AssemblyName System.Security
    $encrypted = [Convert]::FromBase64String([Console]::In.ReadToEnd().Trim())
    $plain = [Security.Cryptography.ProtectedData]::Unprotect($encrypted, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    [Console]::Out.Write([Convert]::ToBase64String($plain))
} catch {
    [Console]::Error.Write('DPAPI unprotection failed')
    exit 1
}`;

function runDpapi(script, bytes) {
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        input: bytes.toString('base64'),
        encoding: 'utf8',
        windowsHide: true,
        timeout: 15000,
        maxBuffer: 16 * 1024 * 1024,
    });
    const output = result.stdout?.trim();
    if (result.error || result.status !== 0 || !output || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(output)) {
        throw new Error(`Windows user-level secret protection is unavailable (${result.error?.code || result.status}).`);
    }
    return Buffer.from(output, 'base64');
}

export function getDefaultSecretProtector() {
    if (process.platform !== 'win32') {
        return null;
    }
    return {
        protect: bytes => runDpapi(PROTECT_SCRIPT, bytes),
        unprotect: bytes => runDpapi(UNPROTECT_SCRIPT, bytes),
    };
}

function validateSecretsObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('The local secrets file has an invalid structure.');
    }
    return value;
}

export function parseSecretDocument(contents, protector) {
    const document = validateSecretsObject(JSON.parse(contents));
    if (document.format !== PROTECTED_SECRETS_FORMAT) {
        return { secrets: document, protected: false };
    }
    if (typeof document.data !== 'string' || !protector) {
        throw new Error('The protected local secrets cannot be opened under this Windows user.');
    }
    const plaintext = protector.unprotect(Buffer.from(document.data, 'base64'));
    return { secrets: validateSecretsObject(JSON.parse(plaintext.toString('utf8'))), protected: true };
}

export function serializeSecretDocument(secrets, protector) {
    validateSecretsObject(secrets);
    if (!protector) {
        return JSON.stringify(secrets, null, 4);
    }
    const data = protector.protect(Buffer.from(JSON.stringify(secrets), 'utf8')).toString('base64');
    return JSON.stringify({ format: PROTECTED_SECRETS_FORMAT, data }, null, 4);
}
