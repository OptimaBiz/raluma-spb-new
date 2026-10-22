import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const projectRoot = new URL('../', import.meta.url);

function loadAnalytics() {
  const source = readFileSync(new URL('public/js/analytics.js', projectRoot), 'utf8');
  const insertedScripts = [];
  const yandexGoals = [];
  const firstScript = {
    parentNode: {
      insertBefore(script) {
        insertedScripts.push(script);
      },
    },
  };
  const document = {
    scripts: [firstScript],
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
  const window = {
    ym(counterId, method, goal) {
      yandexGoals.push({ counterId, method, goal });
    },
  };
  const context = vm.createContext({ window, document, Date });

  vm.runInContext(source, context);

  return { context, source, window, insertedScripts, yandexGoals };
}

test('VK Pixel initializes one page view and loads the counter once', () => {
  const analytics = loadAnalytics();

  vm.runInContext(analytics.source, analytics.context);

  assert.deepEqual(
    Array.from(analytics.window._tmr, ({ id, type }) => ({ id, type })),
    [{ id: '3805017', type: 'pageView' }],
  );
  assert.equal(analytics.insertedScripts.length, 1);
  assert.equal(analytics.insertedScripts[0].src, 'https://top-fwz1.mail.ru/js/code.js');
});

test('a conversion goal is sent independently to Yandex Metrika and VK Pixel', () => {
  const analytics = loadAnalytics();

  analytics.window.safeReachGoal('lead_form_submit');

  assert.deepEqual(analytics.yandexGoals, [
    { counterId: 108496902, method: 'reachGoal', goal: 'lead_form_submit' },
  ]);
  assert.deepEqual(
    Array.from(analytics.window._tmr, ({ id, type, goal }) => ({ id, type, goal })),
    [
      { id: '3805017', type: 'pageView', goal: undefined },
      { id: '3805017', type: 'reachGoal', goal: 'lead_form_submit' },
    ],
  );
});

test('blank goal names are ignored by both analytics systems', () => {
  const analytics = loadAnalytics();

  analytics.window.safeReachGoal('');

  assert.equal(analytics.yandexGoals.length, 0);
  assert.equal(analytics.window._tmr.length, 1);
});

test('the site wires successful forms and phone clicks to conversion goals', () => {
  const layout = readFileSync(new URL('src/layouts/BaseLayout.astro', projectRoot), 'utf8');
  const leadForm = readFileSync(
    new URL('src/components/sections/LeadFormSection.astro', projectRoot),
    'utf8',
  );

  assert.match(layout, /<script is:inline src="\/js\/analytics\.js"><\/script>/);
  assert.doesNotMatch(layout, /_tmr\.push/);
  assert.equal((layout.match(/top-fwz1\.mail\.ru\/counter/g) || []).length, 1);
  assert.match(layout, /window\.safeReachGoal\('phone_click'\)/);
  assert.match(leadForm, /await postToBackend\([\s\S]*?window\.safeReachGoal\?\.\('lead_form_submit'\)/);
});
