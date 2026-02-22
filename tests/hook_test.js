#!/usr/bin/env node
// Copyright 2026 Google LLC
// Licensed under the Apache License, Version 2.0

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const STATE_FILE = '.gemini/ralph/state.json';
const STATE_DIR = '.gemini/ralph';
const HOOK = 'hooks/stop-hook.js';

function setup() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const state = {
    active: true,
    current_iteration: 1,
    max_iterations: 5,
    completion_promise: '',
    original_prompt: 'Task',
    started_at: '2026-01-27T12:00:00Z',
  };
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 4));
}

function cleanup() {
  try { fs.unlinkSync(STATE_FILE); } catch (e) { /* ignore */ }
  try { fs.rmdirSync(STATE_DIR); } catch (e) { /* ignore */ }
}

process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });

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

function assertExists(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`FAIL: ${filePath} does not exist`);
    process.exit(1);
  }
}

function assertNotExists(filePath) {
  if (fs.existsSync(filePath)) {
    console.error(`FAIL: ${filePath} still exists`);
    process.exit(1);
  }
}

function runHook(input) {
  const result = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(input),
    encoding: 'utf-8',
  });
  if (result.error) {
    console.error(`FAIL: Hook process error: ${result.error.message}`);
    process.exit(1);
  }
  return JSON.parse(result.stdout.trim());
}

console.log('Running Test 1: Iteration increment...');
setup();
const response1 = runHook({ prompt_response: 'Some response', prompt: '/ralph:loop --max-iterations 5 Task' });
assertExists(STATE_FILE);
assertJsonValue('.current_iteration', '2');
if (response1.systemMessage !== '🔄 Ralph is starting iteration 2...') {
  console.error(`FAIL: Expected systemMessage to be '🔄 Ralph is starting iteration 2...', but got '${response1.systemMessage}'`);
  process.exit(1);
}

console.log('Running Test 2: Termination (Max Iterations)...');
setup();
const state2 = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
state2.current_iteration = 5;
fs.writeFileSync(STATE_FILE, JSON.stringify(state2, null, 4));
const response2 = runHook({ prompt_response: 'Last response', prompt: 'Task' });
assertNotExists(STATE_FILE);
if (response2.decision !== 'allow') {
  console.error(`FAIL: Expected decision to be 'allow' upon termination`);
  process.exit(1);
}

console.log('Running Test 3: Termination (Completion Promise)...');
setup();
const state3 = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
state3.completion_promise = 'DONE';
fs.writeFileSync(STATE_FILE, JSON.stringify(state3, null, 4));
const response3 = runHook({ prompt_response: 'I am finished. <promise>DONE</promise>', prompt: 'Task' });
assertNotExists(STATE_FILE);
if (response3.decision !== 'allow') {
  console.error(`FAIL: Expected decision to be 'allow' upon promise fulfillment`);
  process.exit(1);
}

console.log('Running Test 4: Ghost Loop Cleanup (Unrelated Prompt)...');
setup();
const response4 = runHook({ prompt_response: 'Paris', prompt: 'What is the capital of France?' });
assertNotExists(STATE_FILE);
if (response4.decision !== 'allow') {
  console.error(`FAIL: Expected decision to be 'allow' for unrelated prompt`);
  process.exit(1);
}
const expectedMsg = "🚨 Ralph detected a prompt mismatch.\nExpected: 'Task'\nGot:      'What is the capital of France?'";
if (response4.systemMessage !== expectedMsg) {
  console.error(`FAIL: Ghost loop cleanup should show mismatch message\nExpected: ${expectedMsg}\nGot:      ${response4.systemMessage}`);
  process.exit(1);
}

console.log('Running Test 5: Hijack Prevention (Different Loop Command)...');
setup();
const response5 = runHook({ prompt_response: 'New Task response', prompt: '/ralph:loop Different Task' });
assertNotExists(STATE_FILE);
if (response5.decision !== 'allow') {
  console.error(`FAIL: Expected decision to be 'allow' when a different loop command is detected`);
  process.exit(1);
}

console.log('Running Test 6: Automated Retry (Empty Prompt)...');
setup();
const response6 = runHook({ prompt_response: 'Iteration 2 response', prompt: '' });
assertExists(STATE_FILE);
assertJsonValue('.current_iteration', '2');
if (response6.decision !== 'deny') {
  console.error(`FAIL: Expected decision to be 'deny' to continue the loop`);
  process.exit(1);
}

console.log('PASS: All tests passed!');
