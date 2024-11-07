import chokidar from 'chokidar';

import { ProcessingContext } from '~shared/pipeline/utils/processing-context';

import { ConfigError } from '../src-shared/pipeline/utils/errors';
import { FileChanges, ServerPipeline } from './server-pipeline';

console.clear();

console.log('Watching for changes in input/...');

let rerun = true;
const fileChanges: FileChanges = new Map();

const watcher = chokidar.watch('.', { cwd: 'input', ignoreInitial: true });

watcher.on('all', (event, path) => {
  console.clear();
  console.log(`Detected ${event} in ${path}`);

  rerun = true;
  if (path) {
    fileChanges.set(path, event);
  }
});

let running = false;
// event loop that checks if rerun is needed and runs the pipeline (awaiting its completion)
const eventLoopInterval = setInterval(() => {
  void (async function () {
    if (!running && rerun) {
      rerun = false;
      running = true;
      const fileChangesToProcess = new Map(fileChanges);
      fileChanges.clear();
      await doAll(fileChangesToProcess);
      running = false;
      console.log('Back to watching for changes...');
    }
  })();
}, 100);

process.on('SIGINT', () => {
  // close watcher when Ctrl-C is pressed
  console.log('\nClosing watcher...');
  void watcher.close().then(() => {
    clearInterval(eventLoopInterval);
    process.exit(0);
  });
});

const serverPipeline = new ServerPipeline();

async function doAll(fileChanges: FileChanges) {
  console.log('Rerunning pipeline...');
  try {
    const ctx = new ProcessingContext();
    await ctx.addContext('Dry run:').exec(async (c) => {
      await serverPipeline.dryRun(ctx, fileChanges);
      console.log('Pipeline finished without errors.');
    });
  } catch (e) {
    reportError(e);
  }
}

function reportError(e: unknown) {
  if (e instanceof ConfigError) {
    console.error(e.message);
  } else {
    console.error('An unexpected error occurred. This might be a bug in the pipeline:');
    console.error(e);
  }
}
