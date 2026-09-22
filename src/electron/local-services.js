import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const SERVICE_NAMES = new Set(['airi', 'localModel']);
const ACTION_NAMES = new Set(['start', 'stop']);

function readPidFile(filePath) {
    try {
        const pid = Number.parseInt(fs.readFileSync(filePath, 'utf8').trim(), 10);
        return Number.isInteger(pid) && pid > 0 ? pid : null;
    } catch {
        return null;
    }
}
function readAiriPid(filePath) {
    try {
        const state = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const pid = Number.parseInt(state?.pid, 10);
        return Number.isInteger(pid) && pid > 0 ? pid : null;
    } catch {
        return null;
    }
}

export function isTrackedProcessRunning(pid, kill = process.kill) {
    if (!Number.isInteger(pid) || pid <= 0) {
        return false;
    }
    try {
        kill(pid, 0);
        return true;
    } catch (error) {
        return error?.code === 'EPERM';
    }
}

export function getLocalServiceStatus(projectRoot, { kill = process.kill, busyServices = new Set() } = {}) {
    const root = path.resolve(projectRoot);
    const airiPid = readAiriPid(path.join(root, 'Run', 'AIRI.state.json'));
    const modelPid = readPidFile(path.join(root, 'Run', 'KoboldCpp.pid'));
    const statusFor = (name, pid, configured) => ({
        state: busyServices.has(name) ? 'busy' : isTrackedProcessRunning(pid, kill) ? 'running' : 'stopped',
        pid: isTrackedProcessRunning(pid, kill) ? pid : null,
        configured,
    });
    return {
        available: process.platform === 'win32' && Boolean(process.versions.electron),
        services: {
            airi: statusFor('airi', airiPid,
                fs.existsSync(path.join(root, 'airi', 'apps', 'stage-tamagotchi', 'package.json'))),
            localModel: statusFor('localModel', modelPid,
                fs.existsSync(path.join(root, 'tools', 'koboldcpp', 'koboldcpp.exe'))
                && fs.existsSync(path.join(root, 'models', 'Peach-2.0-9B-8k-Roleplay', 'Peach-2.0-9B-8k-Roleplay.Q4_K_M.gguf'))),
        },
    };
}

function getCommand(projectRoot, service, action) {
    if (!SERVICE_NAMES.has(service) || !ACTION_NAMES.has(action)) {
        throw new TypeError('Unsupported Leslie desktop service action.');
    }
    const scriptsRoot = path.join(projectRoot, 'packaging', 'windows-local');
    if (service === 'airi') {
        return {
            script: path.join(scriptsRoot, 'Leslie-AIRI-Launcher.ps1'),
            arguments: ['-Mode', action === 'start' ? 'Airi' : 'AiriStop'],
        };
    }
    return {
        script: path.join(scriptsRoot, action === 'start' ? 'Start-LocalModel.ps1' : 'Stop-LocalModel.ps1'),
        arguments: [],
    };
}

export function runLocalServiceAction(projectRoot, service, action, { spawnProcess = spawn } = {}) {
    const root = path.resolve(projectRoot);
    const command = getCommand(root, service, action);
    if (!fs.existsSync(command.script)) {
        throw new Error(`Desktop service script is missing: ${path.basename(command.script)}`);
    }
    return new Promise((resolve, reject) => {
        const child = spawnProcess('powershell.exe', [
            '-NoProfile',
            '-ExecutionPolicy', 'Bypass',
            '-File', command.script,
            ...command.arguments,
        ], {
            cwd: root,
            env: process.env,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let output = '';
        const append = chunk => {
            output = `${output}${String(chunk ?? '')}`.slice(-4000);
        };
        child.stdout?.on('data', append);
        child.stderr?.on('data', append);
        child.once('error', reject);
        child.once('close', (code) => {
            if (code === 0) {
                resolve({ ok: true, output: output.trim() });
            } else {
                reject(new Error(output.trim() || `Desktop service command failed with exit code ${code}.`));
            }
        });
    });
}
