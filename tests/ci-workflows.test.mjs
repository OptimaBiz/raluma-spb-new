import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const projectRoot = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, projectRoot), 'utf8');

test('roof diagnostic validates the current V7 JPG implementation', () => {
  const workflow = read('.github/workflows/roof-v6-diagnostic.yml');

  assert.match(workflow, /name: Roof V7 asset diagnostic/);
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /roof-closed\.jpg/);
  assert.match(workflow, /roof-half-open\.jpg/);
  assert.match(workflow, /roof-open\.jpg/);
  assert.match(workflow, /data-roof-photo-v7/);
  assert.doesNotMatch(workflow, /split_roof_states\.py/);
  assert.doesNotMatch(workflow, /roof-closed\.webp/);
});

test('mobile visual guard accepts intentional responsive heading wraps', () => {
  const workflow = read('.github/workflows/pergolas-mobile-visual.yml');

  assert.doesNotMatch(workflow, /!item\.nowrap/);
  assert.doesNotMatch(workflow, /result\.h2\.length !== 1/);
  assert.match(workflow, /headingFailures: headings\.filter\(\(item\) => item\.overflow\)/);
});

test('only one GitHub Pages workflow deploys automatically from main', () => {
  const automaticWorkflow = read('.github/workflows/deploy-pages.yml');
  const manualWorkflow = read('.github/workflows/deploy.yml');

  assert.match(automaticWorkflow, /push:\s*\n\s+branches: \[main\]/);
  assert.doesNotMatch(manualWorkflow, /push:\s*\n\s+branches: \[main\]/);
  assert.match(manualWorkflow, /workflow_dispatch:/);
});

test('the main Astro quality gate runs analytics tests before building', () => {
  const workflow = read('.github/workflows/astro-build.yml');
  const testPosition = workflow.indexOf('npm test');
  const buildPosition = workflow.indexOf('npm run build');

  assert.ok(testPosition >= 0, 'Astro workflow must run npm test');
  assert.ok(buildPosition > testPosition, 'tests must run before the production build');
});
