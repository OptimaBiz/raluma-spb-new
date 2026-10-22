import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const projectRoot = new URL('../', import.meta.url);

function loadGoalHelper() {
  const source = readFileSync(new URL('public/js/analytics.js', projectRoot), 'utf8');
  const yandexGoals = [];
  const window = {
    ym(counterId, method, goal) {
      yandexGoals.push({ counterId, method, goal });
    },
  };
  const context = vm.createContext({ window });

  vm.runInContext(source, context);

  return { context, source, window, yandexGoals };
}

test('VK Pixel uses the standard inline bootstrap and loads code.js once', () => {
  const layout = readFileSync(new URL('src/layouts/BaseLayout.astro', projectRoot), 'utf8');
  const pixelBlock = layout.match(
    /<!-- VK Ads pixel -->[\s\S]*?<script is:inline>([\s\S]*?)<\/script>[\s\S]*?<!-- \/VK Ads pixel -->/,
  );

  assert.ok(pixelBlock, 'VK Pixel bootstrap must be inline in the page head');

  const insertedScripts = [];
  const firstScript = {
    parentNode: {
      insertBefore(script) {
        insertedScripts.push(script);
      },
    },
  };
  const document = {
    createElement() {
      return {};
    },
    getElementById(id) {
      return insertedScripts.find((script) => script.id === id) || null;
    },
    getElementsByTagName() {
      return [firstScript];
    },
  };
  const window = {};
  const context = vm.createContext({ window, document, Date });

  vm.runInContext(pixelBlock[1], context);
  vm.runInContext(pixelBlock[1], context);

  assert.deepEqual(
    Array.from(window._tmr, ({ id, type }) => ({ id, type })),
    [{ id: 3805017, type: 'pageView' }],
  );
  assert.equal(insertedScripts.length, 1);
  assert.equal(insertedScripts[0].id, 'tmr-code');
  assert.equal(insertedScripts[0].src, 'https://top-fwz1.mail.ru/js/code.js');
});

test('a conversion goal is sent independently to Yandex Metrika and VK Pixel', () => {
  const analytics = loadGoalHelper();

  analytics.window.safeReachGoal('lead_form_submit');

  assert.deepEqual(analytics.yandexGoals, [
    { counterId: 108496902, method: 'reachGoal', goal: 'lead_form_submit' },
  ]);
  assert.deepEqual(
    Array.from(analytics.window._tmr, ({ id, type, goal }) => ({ id, type, goal })),
    [
      { id: 3805017, type: 'reachGoal', goal: 'lead_form_submit' },
    ],
  );
});

test('the two VK Ads conversion goals use the exact configured names', () => {
  const analytics = loadGoalHelper();

  analytics.window.safeReachGoal('lead_form_submit');
  analytics.window.safeReachGoal('phone_click');

  assert.deepEqual(
    Array.from(analytics.window._tmr, ({ type, id, goal }) => ({ type, id, goal })),
    [
      { type: 'reachGoal', id: 3805017, goal: 'lead_form_submit' },
      { type: 'reachGoal', id: 3805017, goal: 'phone_click' },
    ],
  );
});

test('blank goal names are ignored by both analytics systems', () => {
  const analytics = loadGoalHelper();

  analytics.window.safeReachGoal('');

  assert.equal(analytics.yandexGoals.length, 0);
  assert.equal(analytics.window._tmr, undefined);
});

test('the site wires successful forms and phone clicks to conversion goals', () => {
  const layout = readFileSync(new URL('src/layouts/BaseLayout.astro', projectRoot), 'utf8');
  const leadForm = readFileSync(
    new URL('src/components/sections/LeadFormSection.astro', projectRoot),
    'utf8',
  );

  assert.match(layout, /<script is:inline src="\/js\/analytics\.js"><\/script>/);
  assert.equal((layout.match(/type: "pageView"/g) || []).length, 1);
  assert.equal((layout.match(/top-fwz1\.mail\.ru\/counter/g) || []).length, 1);
  assert.match(layout, /window\.safeReachGoal\('phone_click'\)/);
  assert.match(leadForm, /await postToBackend\([\s\S]*?window\.safeReachGoal\?\.\('lead_form_submit'\)/);
});
