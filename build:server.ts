import * as fs from 'fs';
import * as path from 'path';
import { build } from 'esbuild';

async function compileServer() {
  await build({
    entryPoints: ['server.ts'],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    outfile: 'dist/server.cjs',
    external: ['express', 'vite'],
  });
  console.log('Server compiled successfully.');
}
compileServer().catch(console.error);
