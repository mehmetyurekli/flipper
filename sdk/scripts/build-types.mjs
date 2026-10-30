// Emit .d.ts files into dist/ and vendor shared/types.ts as dist/shared-types.d.ts
// so the published declarations don't point outside the package.
import { execSync } from 'node:child_process';
import { cpSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const tmp = '.types-tmp';
rmSync(tmp, { recursive: true, force: true });
execSync(`npx tsc -p tsconfig.json --noEmit false --declaration --emitDeclarationOnly --rootDir .. --outDir ${tmp}`, { stdio: 'inherit' });
mkdirSync('dist', { recursive: true });
const srcDir = join(tmp, 'sdk', 'src');
for (const f of readdirSync(srcDir)) {
  const p = join(srcDir, f);
  const out = readFileSync(p, 'utf8').replaceAll("'../../shared/types'", "'./shared-types'");
  writeFileSync(join('dist', f), out);
}
cpSync(join(tmp, 'shared', 'types.d.ts'), join('dist', 'shared-types.d.ts'));
rmSync(tmp, { recursive: true, force: true });
