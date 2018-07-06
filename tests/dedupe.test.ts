import  'mocha';
import 'expect.js';
import * as child_process from 'child_process';
import * as path from 'path';
import * as process from 'process';
import * as fse from 'fs-extra';

const expect: (arg?: any) => Expect.Root = require('expect.js');

const binFile = path.resolve(__dirname, '../bin/yarn-dedupe.js');

function testDedupeExecute(testDir: string) {
    process.chdir(testDir);
    try {
        fse.copySync(path.resolve(testDir, 'yarn.lock.source'), path.resolve(testDir, 'yarn.lock'));
        child_process.execSync(`node ${binFile}`);
        expect(fse.readFileSync(path.resolve(testDir, 'yarn.lock'), 'utf8')).to.be(fse.readFileSync(path.resolve(testDir, 'yarn.lock.target'), 'utf8'));
    } finally {
        fse.removeSync(path.resolve(testDir, 'yarn.lock'));
    }

}

describe('Test dedupe', () => {
    it('should be fine', () => {
        testDedupeExecute(path.resolve(__dirname, './resources/should.be.fine'));
    });

    it('should dedupe', () => {
        testDedupeExecute(path.resolve(__dirname, './resources/should.dedupe'));
    });

    it('should fail', () => {
        testDedupeExecute(path.resolve(__dirname, './resources/should.fail'));
    });

    it('should partial dedupe', () => {
        testDedupeExecute(path.resolve(__dirname, './resources/should.partial.dedupe'));
    });
});
