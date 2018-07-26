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

function popMax<T>(items: T[], getItemWeight: (item: T) => number): T|undefined {
    let maxItem: { item: T; index: number; weight: number; } | undefined;
    items.forEach((item, index) => {
        const weight = getItemWeight(item);
        if (!maxItem || weight > maxItem.weight) {
            maxItem = { item, index,  weight, };
        }
    });
    if (maxItem) {
        items.splice(maxItem.index, 1);
        return maxItem.item;
    }
    return undefined;
}

function findDedupeVersions(packageSemverMap: PackageSemverMap) {
    interface DedupeSource { target: LockFile.LockTarget; satisfiedRanges: Set<string>; }
    const dedupeVersions = new Map<string/*target version*/, DedupeSource>();
    packageSemverMap.forEach((lockTarget, range) => {
        const version = lockTarget.version;
        const dedupeSource: DedupeSource = dedupeVersions.get(version) || { target: lockTarget, satisfiedRanges: new Set() };
        dedupeSource.satisfiedRanges.add(range);
    });
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

    let dedupeResults: Array<{ ranges: Set<string>; target: LockFile.LockTarget; }> = [];
    dedupeVersions.forEach(dedupeSource => dedupeResults.push({ ranges: dedupeSource.satisfiedRanges, target: dedupeSource.target, }));
    const sortedDedupeResults: typeof dedupeResults = [];

    let mostSatisfiedResult: typeof dedupeResults[0] | undefined;
    while (mostSatisfiedResult = popMax(dedupeResults, item => item.ranges.size)) {
        sortedDedupeResults.push(mostSatisfiedResult);
        const ranges = mostSatisfiedResult.ranges;
        dedupeResults.forEach(item => {
            ranges.forEach(r => item.ranges.delete(r));
        });
        dedupeResults = dedupeResults.filter(item => {
            ranges.forEach(r => item.ranges.delete(r));
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
