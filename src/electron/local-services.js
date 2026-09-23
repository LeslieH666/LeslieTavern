import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { listLocalModels, resolveLocalModel } from './local-model-catalog.js';

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

function readTrackedModel(filePath) {
    try {
        const state = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return Number.isInteger(state?.pid) && typeof state?.modelId === 'string' ? state : null;
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
    const catalog = listLocalModels(root);
    const airiPid = readAiriPid(path.join(root, 'Run', 'AIRI.state.json'));
    const modelPid = readPidFile(path.join(root, 'Run', 'KoboldCpp.pid'));
    const trackedModel = readTrackedModel(path.join(root, 'Run', 'KoboldCpp.model.json'));
    const statusFor = (name, pid, configured) => ({
        state: busyServices.has(name) ? 'busy' : isTrackedProcessRunning(pid, kill) ? 'running' : 'stopped',
        pid: isTrackedProcessRunning(pid, kill) ? pid : null,
        configured,
    });
    const runtimeInstalled = fs.existsSync(path.join(root, 'tools', 'koboldcpp', 'koboldcpp.exe'));
    const localModel = statusFor('localModel', modelPid, runtimeInstalled && catalog.models.length > 0);
    localModel.runtimeInstalled = runtimeInstalled;
    localModel.modelId = localModel.state === 'running' && trackedModel?.pid === modelPid
        && catalog.models.some(model => model.id === trackedModel.modelId) ? trackedModel.modelId : null;
    return {
        available: process.platform === 'win32' && Boolean(process.versions.electron),
        localModels: catalog,
        services: {
            airi: statusFor('airi', airiPid,
                fs.existsSync(path.join(root, 'airi', 'apps', 'stage-tamagotchi', 'package.json'))),
            localModel,
        },
    };
}

function getCommand(projectRoot, service, action, modelId) {
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
        arguments: action === 'start' && modelId
            ? ['-ModelPath', resolveLocalModel(projectRoot, modelId).path, '-ModelId', modelId]
            : [],
    };
}

export function runLocalServiceAction(projectRoot, service, action, { spawnProcess = spawn, modelId } = {}) {
    const root = path.resolve(projectRoot);
    const command = getCommand(root, service, action, modelId);
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
        // KoboldCpp may inherit the PowerShell pipe handles. In that case the
        // shell has exited successfully while Node's "close" event waits for
        // the long-lived model process. The action follows the shell's exit.
        child.once('exit', (code) => {
            // Give PowerShell's final message a brief chance to reach us, then
            // release pipes held open by its long-lived KoboldCpp child.
            setTimeout(() => {
                child.stdout?.destroy?.();
                child.stderr?.destroy?.();
                if (code === 0) {
                    resolve({ ok: true, output: output.trim() });
                } else {
                    reject(new Error(output.trim() || `Desktop service command failed with exit code ${code}.`));
                }
            }, 50);
        });
    });
}

/** Switch only the project-tracked process after validating the selected file. */
export async function startManagedLocalModel(projectRoot, modelId, { getStatus = getLocalServiceStatus, runAction = runLocalServiceAction } = {}) {
    const root = path.resolve(projectRoot);
    resolveLocalModel(root, modelId);
    const status = getStatus(root).services.localModel;
    if (status.state === 'running') {
        if (status.modelId === modelId) {
            return;
        }
        await runAction(root, 'localModel', 'stop');
    }
    await runAction(root, 'localModel', 'start', { modelId });
}
