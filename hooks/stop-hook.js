#!/usr/bin/env node
// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict';

const fs = require('fs');
const path = require('path');

function log(msg) {
  process.stderr.write(`Ralph: ${msg}\n`);
}

function die(msg) {
  process.stderr.write(`❌ Error: ${msg}\n`);
  process.exit(1);
}

function cleanupState(stateDir, stateFile) {
  try { fs.unlinkSync(stateFile); } catch (e) { /* ignore */ }
  try { fs.rmdirSync(stateDir); } catch (e) { /* not empty or missing — ignore */ }
}

// Setup paths
const STATE_DIR = '.gemini/ralph';
const STATE_FILE = path.join(STATE_DIR, 'state.json');

// Read hook input from stdin
let inputRaw;
try {
  inputRaw = fs.readFileSync(0, 'utf-8');
} catch (e) {
  die('Failed to read stdin');
}

let input;
try {
  input = JSON.parse(inputRaw);
} catch (e) {
  die('Failed to parse stdin JSON');
}

const lastMessage = input.prompt_response || '';
const currentPrompt = input.prompt || '';

// Check if loop is active
if (!fs.existsSync(STATE_FILE)) {
  process.stdout.write('{"decision": "allow"}\n');
  process.exit(0);
}

// Validate that this turn belongs to the Ralph loop
let stateData;
try {
  stateData = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
} catch (e) {
  die('Failed to read state file');
}

const originalPrompt = stateData.original_prompt || '';

if (currentPrompt !== originalPrompt) {
  // Normalize prompts for comparison by stripping prefix and extra whitespace
  // 1. Strip "/ralph:loop" prefix if present
  // 2. Strip common flags like --max-iterations and --completion-promise
  // 3. Trim whitespace
  const cleanCurrent = currentPrompt
    .replace(/^\/ralph:loop\s+/, '')
    .replace(/--max-iterations\s+\S+\s*/g, '')
    .replace(/--completion-promise\s+\S+\s*/g, '')
    .trim();
  const cleanOriginal = originalPrompt.trim();

  // Only perform mismatch check if a prompt was actually provided.
  // Automated retries (like loop iterations) often have an empty prompt in the hook input.
  if (cleanCurrent === '') {
    // Allow empty prompts (likely a Ralph-triggered iteration)
  } else if (cleanCurrent !== cleanOriginal) {
    cleanupState(STATE_DIR, STATE_FILE);
    const msg = `🚨 Ralph detected a prompt mismatch.\nExpected: '${cleanOriginal}'\nGot:      '${cleanCurrent}'`;
    process.stdout.write(JSON.stringify({ decision: 'allow', systemMessage: msg }) + '\n');
    process.exit(0);
  }
}

const active = stateData.active;

if (active !== true) {
  process.stdout.write('{"decision": "allow"}\n');
  process.exit(0);
}

// Check for completion promise BEFORE incrementing/continuing
const completionPromise = stateData.completion_promise || '';
if (completionPromise && lastMessage.includes(`<promise>${completionPromise}</promise>`)) {
  cleanupState(STATE_DIR, STATE_FILE);
  log(`I found a shiny penny! It says ${completionPromise}. The computer is sleeping now.`);
  process.stdout.write(
    `{"decision": "allow", "continue": false, "stopReason": "✅ Ralph found the completion promise: ${completionPromise}", "systemMessage": "✅ Ralph found the completion promise: ${completionPromise}"}\n`,
  );
  process.exit(0);
}

// Load iteration state
const currentIteration = stateData.current_iteration;
const maxIterations = stateData.max_iterations;

// Check for max iterations
if (currentIteration >= maxIterations) {
  cleanupState(STATE_DIR, STATE_FILE);
  log(`I'm tired. I've gone around ${currentIteration} times. The computer is sleeping now.`);
  process.stdout.write(
    '{"decision": "allow", "continue": false, "stopReason": "✅ Ralph has reached the iteration limit.", "systemMessage": "✅ Ralph has reached the iteration limit."}\n',
  );
  process.exit(0);
}

// Increment iteration
const newIteration = currentIteration + 1;
stateData.current_iteration = newIteration;
try {
  fs.writeFileSync(STATE_FILE, JSON.stringify(stateData, null, 4));
} catch (e) {
  die('Failed to increment iteration');
}

// Log progress (persona)
log(`I'm doing a circle! Iteration ${currentIteration} is done.`);

// Re-read original_prompt from updated state
const loopPrompt = stateData.original_prompt || '';

// Maintain the loop by forcing a retry with the original prompt
process.stdout.write(
  JSON.stringify({
    decision: 'deny',
    reason: loopPrompt,
    systemMessage: `🔄 Ralph is starting iteration ${newIteration}...`,
    hookSpecificOutput: {
      clearContext: true,
    },
  }) + '\n',
);

process.exit(0);
