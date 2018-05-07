import { LockFile } from "@yarnpkg/lockfile";
import * as semver from 'semver';

type PackageSemverMap = Map<string/*expected semvers*/, LockFile.LockTarget>;

type PackageMap = Map<string/*package name*/, PackageSemverMap>;

function isAllSame<T>(array: T[]) {
    if (array.length <= 1) {
        return true;
    }
    const first = array[0];
    for (let i = 1, len = array.length; i < len; i++) {
        if (first !== array[i]) {
            return false;
        }
    }
    return true;
}


const re_dependency = /^(@?[^@]+)@(.*)$/;
function parseDependency(dependencyStr: string) {
    const matched = dependencyStr.match(re_dependency);
    return {
        name: matched![1],
        semver: matched![2]
    };
}

export function parsePackageMap(lockData: LockFile.Content): PackageMap {
    const packageMap: PackageMap = new Map();
    const dependencies = lockData.object;
    Object.keys(dependencies).forEach(expectedDependency => {
        const resolved = dependencies[expectedDependency];
        const depInfo = parseDependency(expectedDependency);

        const tgtMap: Map<string, LockFile.LockTarget> = packageMap.get(depInfo.name) || new Map();
        tgtMap.set(depInfo.semver, resolved);
        packageMap.set(depInfo.name, tgtMap);
    });
    return packageMap;
}

export function serializePackageMap(packageMap: PackageMap): LockFile.Content {
    const objects: LockFile.Content['object'] = {};

    packageMap.forEach((semverMap, name) => {
        semverMap.forEach((resolved, semverStr) => {
            objects[`${name}@${semverStr}`] = resolved;
        });
    });

    return {
        type: 'success',
        object: objects
    };
}

function isVersionSatisfied(version: string, packageSemverMap: PackageSemverMap) {
    return Array.from(packageSemverMap.keys()).every(semverStr => {
        return semver.satisfies(version, semverStr);
    });
}

function isDuplicate(packageSemverMap: PackageSemverMap) {
    return !isAllSame(Array.from(packageSemverMap.values()).map(item => item.version));
}

function findDedupeVersion(packageSemverMap: PackageSemverMap) {
    return Array.from(packageSemverMap.values())
        .find(item => isVersionSatisfied(item.version, packageSemverMap));
}

export function dedupe(lockData: LockFile.Content, options: {
    targetPackages?: Array<string|RegExp>;
} = {}): { lockData: LockFile.Content; resolved: string[]; unresolved: string[]; } {
    const packageMap = parsePackageMap(lockData);
    const dedupeResults = {
        resolved: [] as string[],
        unresolved: [] as string[]
    };
    const shouldDedupeFor = (packageName: string) => {
        return !options.targetPackages || options.targetPackages.some(pkgFilter => {
            return typeof pkgFilter === 'string' ? pkgFilter === packageName : pkgFilter.test(packageName);
        })
    };

    packageMap.forEach((pkgSemverMap, packageName) => {
        if (shouldDedupeFor(packageName) && isDuplicate(pkgSemverMap)) {
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
