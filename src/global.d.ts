declare module '@yarnpkg/lockfile' {
    namespace LockFile {
        interface LockTarget {
            version: string;
            resolved: string;
            dependencies?: { [name: string]: string; }
        }

        interface Content {
            type: 'success',
            object: {
                [dependency: string]: LockTarget;
            };
        }
    }

    function parse(contentString: string): LockFile.Content;

    function stringify(content: LockFile.Content['object']): string;
}
