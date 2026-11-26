// What Dependabot needs to run, and to land its PRs where check-pr lets them in.
// Run: node --test scripts/lib/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    alertFinding,
    credentiallessFindings,
    defaultRegistryFinding,
    dependabotBase,
    hasDefaultRegistry,
    npmrcEnvAuthFinding,
    npmrcForDependabot,
    npmrcPaths,
    npmrcWithRegistries,
    parseDependabot,
    probingUpdates,
    registryPathFindings,
    targetBranchFindings,
    withPlainGithubUrl,
} from './dependabot.ts';

const GITHUB = `
registries:
    github-npm:
        type: npm-registry
        url: https://npm.pkg.github.com
        token: \${{ secrets.CUSTOM_GITHUB_TOKEN }}
`;
const NPM_UPDATE = (extra = '') => `
updates:
    - package-ecosystem: npm
      directory: /
${extra}      schedule:
          interval: weekly
      registries:
          - github-npm
`;

test('parseDependabot: updates with their directories, target branch and registries', () => {
    const d = parseDependabot(`version: 2
${GITHUB}
updates:
    - package-ecosystem: npm
      directories: ['/', '/apps/web']
      target-branch: develop
      registries: '*'
    - package-ecosystem: github-actions
      directory: /
`);
    assert.deepEqual(d.updates, [
        { ecosystem: 'npm', directories: ['/', '/apps/web'], targetBranch: 'develop', registries: '*' },
        { ecosystem: 'github-actions', directories: ['/'], targetBranch: null, registries: [] },
    ]);
    assert.deepEqual(d.registries, [{ name: 'github-npm', type: 'npm-registry', url: 'https://npm.pkg.github.com', token: '${{ secrets.CUSTOM_GITHUB_TOKEN }}', hasCredentials: true, replacesBase: false }]);
});

test('parseDependabot: an empty file has no updates and no registries; invalid YAML throws', () => {
    assert.deepEqual(parseDependabot(''), { updates: [], registries: [] });
    assert.throws(() => parseDependabot('updates: [\n'));
});

// check-pr: dependabot/* goes into develop, or into the default branch when there is no develop.
test('dependabotBase: develop when the repo has it, else the default branch', () => {
    assert.equal(dependabotBase('main', true), 'develop');
    assert.equal(dependabotBase('main', false), 'main');
    assert.equal(dependabotBase('develop', true), 'develop');
});

test('targetBranchFindings: no target-branch in a repo with develop sends the PRs to main', () => {
    assert.deepEqual(targetBranchFindings(parseDependabot(GITHUB + NPM_UPDATE()), 'main', true), [
        'npm in /: PRs go to main, check-pr lets dependabot/* into develop only: set target-branch: develop',
    ]);
});

test('targetBranchFindings: target-branch develop in a repo with develop is right', () => {
    assert.deepEqual(targetBranchFindings(parseDependabot(GITHUB + NPM_UPDATE('      target-branch: develop\n')), 'main', true), []);
});

test('targetBranchFindings: without develop the default branch is right, and target-branch develop is not', () => {
    assert.deepEqual(targetBranchFindings(parseDependabot(GITHUB + NPM_UPDATE()), 'main', false), []);
    assert.deepEqual(targetBranchFindings(parseDependabot(GITHUB + NPM_UPDATE('      target-branch: develop\n')), 'main', false), [
        'npm in /: PRs go to develop, check-pr lets dependabot/* into main only: remove target-branch',
    ]);
});

test('targetBranchFindings: every update counts, github-actions too', () => {
    const d = parseDependabot(`updates:
    - package-ecosystem: npm
      directory: /
      target-branch: develop
    - package-ecosystem: github-actions
      directory: /
`);
    assert.deepEqual(targetBranchFindings(d, 'main', true), ['github-actions in /: PRs go to main, check-pr lets dependabot/* into develop only: set target-branch: develop']);
});

// Dependabot rejects an npm-registry without credentials: '#/registries/npm/ did not match
// one or more of the required schemas', and the whole file with it (big-chef-webapp #13).
test('credentiallessFindings: an npm-registry without a token or username invalidates the file', () => {
    const d = parseDependabot(`registries:
    npm:
        type: npm-registry
        url: https://registry.npmjs.org/
    private:
        type: npm-registry
        url: https://npm.example.com
${GITHUB.split('\n').slice(2).join('\n')}`);
    assert.deepEqual(credentiallessFindings(d), [
        "registry 'npm' (https://registry.npmjs.org/) has no token or username: Dependabot rejects the whole dependabot.yml and never runs; remove it, registry.npmjs.org needs no entry",
        "registry 'private' (https://npm.example.com) has no token or username: Dependabot rejects the whole dependabot.yml and never runs; give it a token",
    ]);
});

test('credentiallessFindings: a username and password count as credentials', () => {
    const d = parseDependabot(`registries:
    private:
        type: npm-registry
        url: https://npm.example.com
        username: ci
        password: \${{ secrets.NPM_PASSWORD }}
`);
    assert.deepEqual(credentiallessFindings(d), []);
});

// Without a default registry in .npmrc, Dependabot asks the registries an update lists first,
// for every package (dependabot-core, registry_finder.rb: first_registry_with_dependency_details).
test('probingUpdates: an npm update that lists a private registry', () => {
    assert.equal(probingUpdates(parseDependabot(GITHUB + NPM_UPDATE())).length, 1);
});

test('probingUpdates: not when the update lists no registry, only npmjs, or a registry with replaces-base', () => {
    assert.deepEqual(probingUpdates(parseDependabot(`${GITHUB}
updates:
    - package-ecosystem: npm
      directory: /
`)), []);
    assert.deepEqual(probingUpdates(parseDependabot(`registries:
    npmjs:
        type: npm-registry
        url: https://registry.npmjs.org
        token: \${{ secrets.NPM_TOKEN }}
updates:
    - package-ecosystem: npm
      directory: /
      registries: [npmjs]
`)), []);
    assert.deepEqual(probingUpdates(parseDependabot(`registries:
    mirror:
        type: npm-registry
        url: https://npm.example.com
        token: \${{ secrets.MIRROR_TOKEN }}
        replaces-base: true
updates:
    - package-ecosystem: npm
      directory: /
      registries: [mirror]
`)), []);
});

test('probingUpdates: registries "*" counts, other ecosystems do not', () => {
    const d = parseDependabot(`${GITHUB}
updates:
    - package-ecosystem: npm
      directory: /
      registries: '*'
    - package-ecosystem: docker
      directory: /
      registries: '*'
`);
    assert.deepEqual(probingUpdates(d).map(p => p.update.ecosystem), ['npm']);
});

// dependabot-core file_fetcher.rb: .npmrc in the update's directory, else the nearest parent.
test('npmrcPaths: the directory first, then each parent up to the root', () => {
    assert.deepEqual(npmrcPaths('/'), ['.npmrc']);
    assert.deepEqual(npmrcPaths('/frontend'), ['frontend/.npmrc', '.npmrc']);
    assert.deepEqual(npmrcPaths('/apps/web/'), ['apps/web/.npmrc', 'apps/.npmrc', '.npmrc']);
});

test('hasDefaultRegistry: a registry= line, not a scoped one or a comment', () => {
    assert.equal(hasDefaultRegistry('registry=https://registry.npmjs.org/\n'), true);
    assert.equal(hasDefaultRegistry('# x\nregistry = https://registry.npmjs.org/\n'), true);
    assert.equal(hasDefaultRegistry('@pursuit-amsterdam:registry=https://npm.pkg.github.com\nalways-auth=true\n'), false);
    assert.equal(hasDefaultRegistry('# registry=https://registry.npmjs.org/\n'), false);
    assert.equal(hasDefaultRegistry(null), false);
});

test('defaultRegistryFinding: names the file, the branch and the fix', () => {
    const [p] = probingUpdates(parseDependabot(GITHUB + NPM_UPDATE()));
    assert.deepEqual(p.urls, ['https://npm.pkg.github.com']);
    assert.equal(
        defaultRegistryFinding(p, '/', 'develop', '.npmrc'),
        'npm in /: .npmrc on develop names no default registry, so Dependabot asks https://npm.pkg.github.com first for every package, and GitHub Packages answers slowly, stale or with a 404, so the runs fail or time out: add registry=https://registry.npmjs.org/',
    );
    assert.match(defaultRegistryFinding(p, '/frontend', 'main', null), /^npm in \/frontend: no \.npmrc on main names a default registry, so Dependabot asks https:\/\/npm\.pkg\.github\.com first/);
});

test('npmrcWithRegistries: adds the default registry above the rest, keeps what is there', () => {
    assert.equal(
        npmrcWithRegistries('@pursuit-amsterdam:registry=https://npm.pkg.github.com\nalways-auth=true\n'),
        '# Default registry, spelled out for Dependabot: without it Dependabot asks\n# GitHub Packages first for every public package (see .github/dependabot.yml).\nregistry=https://registry.npmjs.org/\n@pursuit-amsterdam:registry=https://npm.pkg.github.com\nalways-auth=true\n',
    );
});

test('npmrcWithRegistries: a new file gets the default and the @pursuit-amsterdam registry', () => {
    assert.equal(
        npmrcWithRegistries(null),
        '# Default registry, spelled out for Dependabot: without it Dependabot asks\n# GitHub Packages first for every public package (see .github/dependabot.yml).\nregistry=https://registry.npmjs.org/\n@pursuit-amsterdam:registry=https://npm.pkg.github.com\n',
    );
    assert.equal(npmrcWithRegistries('strict-peer-dependencies=true'), npmrcWithRegistries(null)!.replace(/\n$/, '\nstrict-peer-dependencies=true\n'));
});

test('npmrcWithRegistries: null when both registries are there', () => {
    assert.equal(npmrcWithRegistries('registry=https://registry.npmjs.org/\n@pursuit-amsterdam:registry=https://npm.pkg.github.com\n'), null);
});

// A registry URL with a path (Task 33, step 5b): the requests for @pursuit-amsterdam/*
// never match it, so Dependabot leaves the token unused and sends its own (403).
const WITH_PATH = GITHUB.replace('url: https://npm.pkg.github.com', 'url: https://npm.pkg.github.com/Pursuit-Amsterdam');

test('registryPathFindings: a GitHub Packages URL with a path', () => {
    assert.deepEqual(registryPathFindings(parseDependabot(WITH_PATH + NPM_UPDATE())), [
        "registry 'github-npm' (https://npm.pkg.github.com/Pursuit-Amsterdam) has a path: Dependabot then does not send its token for @pursuit-amsterdam/* but its own, which gets a 403 where the package does not grant this repo access: use url: https://npm.pkg.github.com",
    ]);
});

test('registryPathFindings: not for the plain URL, with or without a slash, or another registry', () => {
    assert.deepEqual(registryPathFindings(parseDependabot(GITHUB + NPM_UPDATE())), []);
    assert.deepEqual(registryPathFindings(parseDependabot(GITHUB.replace('npm.pkg.github.com', 'npm.pkg.github.com/') + NPM_UPDATE())), []);
    assert.deepEqual(registryPathFindings(parseDependabot(GITHUB.replace('https://npm.pkg.github.com', 'https://registry.example.com/team') + NPM_UPDATE())), []);
});

test('withPlainGithubUrl: drops the path from a GitHub Packages URL, leaves the rest', () => {
    assert.equal(withPlainGithubUrl(WITH_PATH + NPM_UPDATE()), GITHUB + NPM_UPDATE());
    assert.equal(withPlainGithubUrl(GITHUB + NPM_UPDATE()), GITHUB + NPM_UPDATE());
});

// _authToken=${VAR} in .npmrc (pursuit-projects-dashboard): Dependabot has no such
// variable, so it sends an empty token (401). CI appends its own line (setup-node-pnpm).
const ENV_AUTH = '//npm.pkg.github.com/:_authToken=${NPM_TOKEN}';

test('npmrcEnvAuthFinding: an auth line that reads an environment variable', () => {
    assert.equal(
        npmrcEnvAuthFinding(`@pursuit-amsterdam:registry=https://npm.pkg.github.com\n${ENV_AUTH}\n`, '.npmrc', 'develop'),
        '.npmrc on develop: //npm.pkg.github.com/:_authToken=${NPM_TOKEN} reads NPM_TOKEN, which Dependabot does not have, so it sends an empty token and the private packages fail: remove the line (CI adds its own; locally, put the token in ~/.npmrc)',
    );
});

test('npmrcEnvAuthFinding: nothing for no file, a comment, or no auth line', () => {
    assert.equal(npmrcEnvAuthFinding(null, '.npmrc', 'main'), null);
    assert.equal(npmrcEnvAuthFinding(`# ${ENV_AUTH}\n`, '.npmrc', 'main'), null);
    assert.equal(npmrcEnvAuthFinding('registry=https://registry.npmjs.org/\n', '.npmrc', 'main'), null);
});

test('npmrcForDependabot: both registries, and the environment auth line replaced by a note', () => {
    const out = npmrcForDependabot(`registry=https://registry.npmjs.org/\n@pursuit-amsterdam:registry=https://npm.pkg.github.com\n${ENV_AUTH}\n`)!;
    assert.doesNotMatch(out, /^\/\/npm\.pkg\.github\.com\/:_authToken/m);
    assert.match(out, /^@pursuit-amsterdam:registry=https:\/\/npm\.pkg\.github\.com\n# No _authToken here: CI adds its own \(setup-node-pnpm\)/m);
    assert.equal(npmrcForDependabot('always-auth=true\n'), npmrcWithRegistries('always-auth=true\n'));
    assert.equal(npmrcForDependabot('registry=https://registry.npmjs.org/\n@pursuit-amsterdam:registry=https://npm.pkg.github.com\n'), null);
});

// Alerts (Task 33, option A): on in every repo; the audit names the open critical and high ones.
test('alertFinding: nothing open is no finding', () => {
    assert.equal(alertFinding([]), null);
});

test('alertFinding: counts per severity, most severe first', () => {
    assert.equal(
        alertFinding(['high', 'critical', 'high']),
        '3 open Dependabot alerts (1 critical, 2 high) on the default branch: fix them with a hotfix/* PR, or dismiss them with a reason',
    );
    assert.equal(alertFinding(['high']), '1 open Dependabot alert (1 high) on the default branch: fix it with a hotfix/* PR, or dismiss it with a reason');
});
