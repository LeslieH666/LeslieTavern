#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const [appPathArgument, lockPathArgument] = process.argv.slice(2);
if (!appPathArgument || !lockPathArgument) {
    throw new Error('Usage: node prune-production-node-modules.cjs <AppPath> <package-lock.json>');
}

const appPath = path.resolve(appPathArgument);
const lockPath = path.resolve(lockPathArgument);
const outputModules = path.join(appPath, 'node_modules');
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
if (!lock.packages || typeof lock.packages !== 'object') {
    throw new Error('package-lock.json does not contain a packages map.');
}

const developmentPackages = Object.entries(lock.packages)
    .filter(([name, metadata]) => name.startsWith('node_modules/') && metadata?.dev === true)
    .sort(([left], [right]) => right.length - left.length);

let removed = 0;
for (const [packagePath] of developmentPackages) {
    const target = path.resolve(appPath, packagePath);
    const relative = path.relative(outputModules, target);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Unsafe development dependency path in package-lock.json: ${packagePath}`);
    }
    if (fs.existsSync(target)) {
        fs.rmSync(target, { recursive: true, force: true });
        removed += 1;
    }
}

console.log(JSON.stringify({ listed: developmentPackages.length, removed }));
