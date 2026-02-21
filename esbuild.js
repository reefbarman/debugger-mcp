const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').Plugin} */
const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',
  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd((result) => {
      for (const { text, location } of result.errors) {
        console.error(`> ${location?.file}:${location?.line}:${location?.column}: error: ${text}`);
      }
      console.log('[watch] build finished');
    });
  },
};

const sharedOptions = {
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: !production,
  minify: production,
  sourcesContent: false,
  plugins: [esbuildProblemMatcherPlugin],
  logLevel: 'silent',
};

const extensionBuild = {
  ...sharedOptions,
  entryPoints: ['src/extension/extension.ts'],
  outfile: 'dist/extension.js',
  external: ['vscode'],
};

const mcpServerBuild = {
  ...sharedOptions,
  entryPoints: ['src/mcp-server/server.ts'],
  outfile: 'dist/mcp-server.js',
  external: [],
};

async function main() {
  if (watch) {
    const ctxExt = await esbuild.context(extensionBuild);
    const ctxMcp = await esbuild.context(mcpServerBuild);
    await Promise.all([ctxExt.watch(), ctxMcp.watch()]);
  } else {
    await Promise.all([
      esbuild.build(extensionBuild),
      esbuild.build(mcpServerBuild),
    ]);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
