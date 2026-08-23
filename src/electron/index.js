import { app, BrowserWindow, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yargs from 'yargs';
import { serverEvents, EVENT_NAMES } from '../server-events.js';
import { companionSession } from '../leslie-bridge/companion-session.js';

const cliArguments = yargs(process.argv)
    .usage('Usage: <your-start-script> [options]')
    .option('width', {
        type: 'number',
        default: 1280,
        describe: 'The width of the window',
    })
    .option('height', {
        type: 'number',
        default: 800,
        describe: 'The height of the window',
    })
    .option('electronDataRoot', {
        type: 'string',
        default: '',
        describe: 'The Electron cache and window-state directory',
    })
    .parseSync();

if (cliArguments.electronDataRoot) {
    const electronDataRoot = path.resolve(cliArguments.electronDataRoot);
    fs.mkdirSync(electronDataRoot, { recursive: true });
    app.setPath('userData', electronDataRoot);
}

/** @type {string} The URL to load in the window. */
let appUrl;

/** @type {BrowserWindow | undefined} Keep the desktop window alive until it is explicitly closed. */
let mainWindow;
let companionHostSeen = false;

function isMainWindowSender(event) {
    return Boolean(mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents);
}

ipcMain.handle('leslie:companion:poll', async (event, message) => {
    if (!isMainWindowSender(event)) {
        throw new Error('Only the LeslieTavern window can own the companion session.');
    }
    const command = companionSession.pollHost({
        hostId: message?.hostId,
        snapshot: message?.snapshot,
    });
    if (!companionHostSeen) {
        companionHostSeen = true;
        console.info('Leslie companion page host connected.');
    }
    return command;
});

ipcMain.handle('leslie:companion:publish', (event, message) => {
    if (!isMainWindowSender(event)) {
        throw new Error('Only the LeslieTavern window can publish companion events.');
    }
    return companionSession.publishHostEvent({
        hostId: message?.hostId,
        requestId: message?.requestId,
        event: message?.event,
    });
});

function createSillyTavernWindow() {
    if (!appUrl) {
        console.error('The server has not started yet.');
        return;
    }
    mainWindow = new BrowserWindow({
        height: cliArguments.height,
        width: cliArguments.width,
        minHeight: 640,
        minWidth: 960,
        autoHideMenuBar: true,
        title: 'LeslieTavern',
        webPreferences: {
            preload: fileURLToPath(new URL('./preload.cjs', import.meta.url)),
            contextIsolation: true,
            nodeIntegration: false,
            // Character speech is generated after an asynchronous model/API
            // response, so it must not depend on a second user gesture.
            autoplayPolicy: 'no-user-gesture-required',
        },
    });
    mainWindow.once('closed', () => {
        mainWindow = undefined;
    });
    mainWindow.webContents.once('did-finish-load', async () => {
        try {
            const companionHostReady = await mainWindow.webContents.executeJavaScript(
                'typeof window.leslieCompanionHost === \'object\'',
                true,
            );
            console.info(`Leslie companion preload: ${companionHostReady ? 'ready' : 'missing'}.`);
        } catch (error) {
            console.warn('Failed to inspect the Leslie companion preload.', error);
        }
    });
    void mainWindow.loadURL(appUrl);
}

function startServer() {
    return new Promise((_resolve, _reject) => {
        serverEvents.addListener(EVENT_NAMES.SERVER_STARTED, ({ url }) => {
            appUrl = url.toString();
            createSillyTavernWindow();
        });
        const sillyTavernRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
        process.chdir(sillyTavernRoot);

        // Keep Electron on this project's configured data root instead of SillyTavern's global data directory.
        import('../../server.js');
    });
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (!mainWindow) {
            createSillyTavernWindow();
            return;
        }
        if (mainWindow.isMinimized()) {
            mainWindow.restore();
        }
        mainWindow.show();
        mainWindow.focus();
    });

    app.whenReady().then(() => {
        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createSillyTavernWindow();
            }
        });

        startServer();
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });
}
