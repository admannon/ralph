#!/usr/bin/env node
// Copyright 2026 Google LLC
// Licensed under the Apache License, Version 2.0

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const STATE_FILE = '.gemini/ralph/state.json';
const STATE_DIR = '.gemini/ralph';

function setup() {
  try { fs.unlinkSync(STATE_FILE); } catch (e) { /* ignore */ }
}

function cleanup() {
  try { fs.unlinkSync(STATE_FILE); } catch (e) { /* ignore */ }
  try { fs.rmdirSync(STATE_DIR); } catch (e) { /* ignore */ }
}

process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });

function assertExists(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`FAIL: ${filePath} does not exist`);
    process.exit(1);
  }
}

function assertJsonValue(key, expected) {
  const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  const keys = key.replace(/^\.\s*/, '').split('.');
  let actual = data;
  for (const k of keys) actual = actual[k];
  if (String(actual) !== String(expected)) {
    console.error(`FAIL: Expected ${key} to be ${expected}, but got ${actual}`);
    process.exit(1);
  }
}

function runSetup(...args) {
  execFileSync(process.execPath, ['scripts/setup.js', ...args], { stdio: 'ignore' });
}

console.log('Running Test 1: Basic setup...');
setup();
runSetup('Task');
assertExists(STATE_FILE);
assertJsonValue('.active', 'true');
assertJsonValue('.current_iteration', '1');
const startedAt = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')).started_at;
if (!/^\d{4}-\d{2}-\d{2}T/.test(startedAt)) {
  console.error('FAIL: started_at is missing or not a valid ISO 8601 timestamp');
  process.exit(1);
}

console.log('Running Test 2: Argument parsing (individual)...');
setup();
runSetup('Task', '--max-iterations', '5', '--completion-promise', 'DONE');
assertJsonValue('.max_iterations', '5');
assertJsonValue('.completion_promise', 'DONE');

console.log('Running Test 3: Argument parsing (combined string workaround)...');
setup();
runSetup('/ralph:loop Task --max-iterations 10 --completion-promise FINISHED');
assertJsonValue('.max_iterations', '10');
assertJsonValue('.completion_promise', 'FINISHED');

console.log('Running Test 4: Complex prompt with spaces and quotes...');
setup();
runSetup('/ralph:loop "Solve \'The Riddle\'" --max-iterations 3');
assertJsonValue('.original_prompt', "Solve 'The Riddle'");
assertJsonValue('.max_iterations', '3');

console.log('Running Test 5: Equality flag parsing (--flag=value)...');
setup();
runSetup('Task', '--max-iterations=15', '--completion-promise=FINISH');
assertJsonValue('.max_iterations', '15');
assertJsonValue('.completion_promise', 'FINISH');

console.log('PASS: All tests passed!');
