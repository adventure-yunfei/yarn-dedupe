import { LockFile } from "@yarnpkg/lockfile";
import * as semver from 'semver';

type PackageSemverMap = Map<string/*expected semver range*/, LockFile.LockTarget>;

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

function parsePackageMap(lockData: LockFile.Content): PackageMap {
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

function serializePackageMap(packageMap: PackageMap): LockFile.Content {
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

function isDuplicate(packageSemverMap: PackageSemverMap) {
    return !isAllSame(Array.from(packageSemverMap.values()).map(item => item.version));
}

type AvailableDedupeResults = Array<{ ranges: Set<string>; target: LockFile.LockTarget; }>;

function findBestDedupeResultIndex(dedupeResults: AvailableDedupeResults): number {
    let maxItemInfo: { item: AvailableDedupeResults[0]; index: number; } | undefined;
    const isBetterThan = (item: AvailableDedupeResults[0], targetItem: AvailableDedupeResults[0]) => {
        if (item.ranges.size > targetItem.ranges.size) {
            return true;
        } else if (item.ranges.size === targetItem.ranges.size) {
            return semver.gt(item.target.version, targetItem.target.version);
        }
        return false;
    };
    dedupeResults.forEach((item, index) => {
        if (!maxItemInfo || isBetterThan(item, maxItemInfo.item)) {
            maxItemInfo = { item, index };
        }
    });
    return maxItemInfo ? maxItemInfo.index : -1;
}

function findDedupeVersions(packageSemverMap: PackageSemverMap) {
    interface DedupeSource { target: LockFile.LockTarget; satisfiedRanges: Set<string>; }
    const dedupeVersions = new Map<string/*target version*/, DedupeSource>();
    packageSemverMap.forEach(lockTarget => {
        const version = lockTarget.version;
        const dedupeSource: DedupeSource = dedupeVersions.get(version) || { target: lockTarget, satisfiedRanges: new Set() };
        dedupeVersions.set(version, dedupeSource);

        packageSemverMap.forEach((t, range) => {
            if (semver.satisfies(version, range)) {
                dedupeSource.satisfiedRanges.add(range);
            }
        });
    });

    let availableDedupeResults: AvailableDedupeResults = [];
    dedupeVersions.forEach(dedupeSource => availableDedupeResults.push({ ranges: dedupeSource.satisfiedRanges, target: dedupeSource.target, }));
    const sortedDedupeResults: typeof availableDedupeResults = [];

    while (availableDedupeResults.length) {
        const bestDedupeResultIndex = findBestDedupeResultIndex(availableDedupeResults);
        if (bestDedupeResultIndex < 0) {
            break;
        }
        const bestDedupeResult = availableDedupeResults[bestDedupeResultIndex];
        availableDedupeResults.splice(bestDedupeResultIndex, 1);
        sortedDedupeResults.push(bestDedupeResult);
        const handledRanges = bestDedupeResult.ranges;
        availableDedupeResults = availableDedupeResults.filter(item => {
            handledRanges.forEach(r => item.ranges.delete(r));
            return item.ranges.size > 1;
        });
    }

    return sortedDedupeResults
        .filter(item => {
            return item.ranges.size > 1 && Array.from(item.ranges).some(range => packageSemverMap.get(range)!.version !== item.target.version);
        });
}

export function dedupe(lockData: LockFile.Content, options: {
    targetPackages?: Array<string|RegExp>;
} = {}): { lockData: LockFile.Content; resolved: string[]; partialResolved: string[]; unresolved: string[]; } {
    const packageMap = parsePackageMap(lockData);
    const dedupeResults = {
        resolved: [] as string[],
        partialResolved: [] as string[],
        unresolved: [] as string[]
    };
    const shouldDedupeFor = (packageName: string) => {
        return !options.targetPackages || options.targetPackages.some(pkgFilter => {
            return typeof pkgFilter === 'string' ? pkgFilter === packageName : pkgFilter.test(packageName);
        })
    };

    packageMap.forEach((pkgSemverMap, packageName) => {
        if (shouldDedupeFor(packageName) && isDuplicate(pkgSemverMap)) {
            const dedupeVersions = findDedupeVersions(pkgSemverMap);
            dedupeVersions.forEach((dedupeItem) => {
                dedupeItem.ranges.forEach(range => {
                    pkgSemverMap.set(range, dedupeItem.target);
                });
            });

            if (dedupeVersions.length === 0) {
                dedupeResults.unresolved.push(packageName);
            } else if (dedupeVersions.length === 1 && dedupeVersions[0].ranges.size === pkgSemverMap.size) {
                dedupeResults.resolved.push(packageName);
            } else {
                dedupeResults.partialResolved.push(packageName);
            }
        }
    });

    return {
        lockData: serializePackageMap(packageMap),
        resolved: dedupeResults.resolved,
        partialResolved: dedupeResults.partialResolved,
        unresolved: dedupeResults.unresolved
    };
}
