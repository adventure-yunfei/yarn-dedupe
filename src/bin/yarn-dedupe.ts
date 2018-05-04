#!/usr/bin/env node

import * as fs from 'fs';
import * as process from 'process';
import * as path from 'path';
import * as yarnlock from '@yarnpkg/lockfile';
import { parsePackageMap, isDuplicate, findDedupeVersion, serializePackageMap } from '../scripts/utils';

function dedupe(lockData: yarnlock.LockFile.Content): { lockData: yarnlock.LockFile.Content; resolved: string[]; unresolved: string[]; } {
    const packageMap = parsePackageMap(lockData);
    const dedupeResults = {
        resolved: [] as string[],
        unresolved: [] as string[]
    };

    packageMap.forEach((pkgSemverMap, packageName) => {
        if (isDuplicate(pkgSemverMap)) {
            const dedupeTarget = findDedupeVersion(pkgSemverMap);
            if (dedupeTarget) {
                for (let semverStr of Array.from(pkgSemverMap.keys())) {
                    pkgSemverMap.set(semverStr, dedupeTarget);
                }
                dedupeResults.resolved.push(packageName);
            } else {
                dedupeResults.unresolved.push(packageName);
            }
        }
    });

    return {
        lockData: serializePackageMap(packageMap),
        resolved: dedupeResults.resolved,
        unresolved: dedupeResults.unresolved
    };
}

var lockfilePath = process.argv.slice(2)[0];
var cwd = process.cwd();

if (!lockfilePath) {
    console.error(`yarn.lock file is not provided.\nUsage: yarn-dedupe yarn.lock`);
    process.exit(1);
}

lockfilePath = path.resolve(cwd, lockfilePath);

console.log('# read yarn.lock...');
var lockfile = yarnlock.parse(fs.readFileSync(lockfilePath, 'utf8').replace(/\r\n/g, '\n'));

if (lockfile.type === 'success') {
    const result = dedupe(lockfile);
    if (result.resolved.length || result.unresolved.length) {
        console.log('# Dedupe result:')
        if (result.resolved.length) {
            console.log(` - Resolved: ${result.resolved.join(', ')}`);
        }
        if (result.unresolved.length) {
            console.warn(` - Unresolved: ${result.unresolved.join(', ')}`);
        }
        fs.writeFileSync(lockfilePath, yarnlock.stringify(result.lockData.object), 'utf8');
    } else {
        console.log('# No duplicate.');
    }
} else {
    console.error(`yarn.lock parse failed, type: ${lockfile && lockfile.type}`);
    process.exit(1);
}
