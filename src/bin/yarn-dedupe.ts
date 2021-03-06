#!/usr/bin/env node

import * as fs from 'fs';
import * as process from 'process';
import * as path from 'path';
import * as yarnlock from '@yarnpkg/lockfile';
import { dedupe } from '..';
import * as yargs from 'yargs';

function readLockFile(filepath: string) {
    console.log('# read yarn.lock...');
    return yarnlock.parse(fs.readFileSync(filepath, 'utf8').replace(/\r\n/g, '\n'));
}

function writeLockFile(filepath: string, content: yarnlock.LockFile.Content) {
    console.log('# write yarn.lock...');
    fs.writeFileSync(filepath, yarnlock.stringify(content.object), 'utf8');
}

const argv = yargs
    .usage('[options] [yarn.lock-file]')
    .example('$0 yarn.lock', 'Dedupe all packages')
    .example('$0 yarn.lock --packages react react-dom', 'Dedupe only "react" and "react-dom" packages')
    .option('packages', { alias: 'p', desc: 'RegExpsfor target package names to dedupe', type: 'array' })
    .option('check-only', { alias: 'c', desc: 'Only check duplicates (exit with 1 if has duplicates)', type: 'boolean' })
    .argv;

if (argv._.length > 1) {
    yargs.showHelp();
} else {
    const yarnlockFile = path.resolve(process.cwd(), argv._[0] || 'yarn.lock');
    const lockfileContent = readLockFile(yarnlockFile);

    if (lockfileContent.type === 'success') {
        const argPackages = argv.packages as string[];
        const filterPackages = argPackages && argPackages.length ? argPackages : undefined;

        const dedupeResult = dedupe(lockfileContent, {
            targetPackages: filterPackages && filterPackages.map(regExpStr => new RegExp(regExpStr) && new RegExp(`^${regExpStr}$`))
        });

        if (dedupeResult.resolved.length || dedupeResult.partialResolved.length || dedupeResult.unresolved.length) {
            if (argv['check-only']) {
                console.log('# Has duplicates.');
                dedupeResult.resolved.length && console.log(` - Resolvable: ${dedupeResult.resolved.join(', ')}`);
                dedupeResult.partialResolved.length && console.log(` - Partial Resolvable: ${dedupeResult.partialResolved.join(', ')}`);
                dedupeResult.unresolved.length && console.log(` - Unresolvable: ${dedupeResult.unresolved.join(', ')}`);
                process.exit(1);
            } else {
                console.log('# Dedupe result:');
                dedupeResult.resolved.length && console.log(` - Resolved: ${dedupeResult.resolved.join(', ')}`);
                dedupeResult.partialResolved.length && console.log(` - Partial Resolved: ${dedupeResult.partialResolved.join(', ')}`);
                dedupeResult.unresolved.length && console.log(` - Unresolved: ${dedupeResult.unresolved.join(', ')}`);
                writeLockFile(yarnlockFile, dedupeResult.lockData);
            }
        } else {
            console.log('# No duplicate.');
        }
    } else {
        console.error(`yarn.lock parse failed, type: ${lockfileContent && lockfileContent.type}`);
        process.exit(1);
    }
}
