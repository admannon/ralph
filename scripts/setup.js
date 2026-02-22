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

function die(msg) {
  process.stderr.write(`❌ Error: ${msg}\n`);
  process.exit(1);
}

// Setup paths
const STATE_DIR = '.gemini/ralph';
const STATE_FILE = path.join(STATE_DIR, 'state.json');

// Ensure directory exists
try {
  fs.mkdirSync(STATE_DIR, { recursive: true });
} catch (e) {
  die(`Could not create state directory: ${STATE_DIR}`);
}

// Defaults
let maxIterations = 5;
let completionPromise = '';

// Tokenize a string into shell-style arguments (handles double/single quotes and backslashes)
function tokenize(str) {
  const tokens = [];
  let i = 0;
  while (i < str.length) {
    while (i < str.length && /\s/.test(str[i])) i++;
    if (i >= str.length) break;
    let token = '';
    while (i < str.length && !/\s/.test(str[i])) {
      if (str[i] === '"') {
        i++;
        while (i < str.length && str[i] !== '"') {
          if (str[i] === '\\' && i + 1 < str.length) {
            i++;
            token += str[i];
          } else {
            token += str[i];
          }
          i++;
        }
        i++;
      } else if (str[i] === "'") {
        i++;
        while (i < str.length && str[i] !== "'") {
          token += str[i++];
        }
        i++;
      } else if (str[i] === '\\') {
        i++;
        if (i < str.length) token += str[i++];
      } else {
        token += str[i++];
      }
    }
    tokens.push(token);
  }
  return tokens;
}

let args = process.argv.slice(2);

// Workaround for LLM tool invocation passing all args as a single string
if (args.length === 1 && (args[0].startsWith('-') || args[0].includes(' --'))) {
  let single = args[0];
  // Strip /ralph:loop prefix if present
  single = single.replace(/^\/ralph:loop\s+/, '');
  args = tokenize(single);
}

// Parse arguments
const promptArgs = [];
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--max-iterations' || arg.startsWith('--max-iterations=')) {
    const val = arg.includes('=') ? arg.split('=').slice(1).join('=') : args[++i];
    if (!/^\d+$/.test(val || '')) die(`Invalid iteration limit: '${val || ''}'`);
    maxIterations = parseInt(val, 10);
  } else if (arg === '--completion-promise' || arg.startsWith('--completion-promise=')) {
    const val = arg.includes('=') ? arg.split('=').slice(1).join('=') : args[++i];
    if (!val) die('Missing promise text.');
    completionPromise = val;
  } else {
    promptArgs.push(arg);
  }
}

const prompt = promptArgs.join(' ');

// Ensure a prompt was provided
if (!prompt) die('No task specified. Run /ralph:help for usage.');

// Initialize state.json
// Strip milliseconds to produce the same format as the original shell `date -u +"%Y-%m-%dT%H:%M:%SZ"`
const startedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const state = {
  active: true,
  current_iteration: 1,
  max_iterations: maxIterations,
  completion_promise: completionPromise,
  original_prompt: prompt,
  started_at: startedAt,
};

try {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 4));
} catch (e) {
  die(`Failed to initialize state file: ${STATE_FILE}`);
}

// Ralph-style summary for the user and agent
console.log('');
console.log(`Ralph is helping! I'm going in a circle!

>> Config:
   - Max Iterations: ${maxIterations}
   - Completion Promise: ${completionPromise}
   - Original Prompt: ${prompt}

I'm starting now! I hope I don't run out of paste!

⚠️  WARNING: This loop will continue until the task is complete,
    the iteration limit (${maxIterations}) is reached, or a promise is fulfilled.`);

if (completionPromise) {
  console.log('');
  console.log('⚠️  RALPH IS LISTENING FOR A PROMISE TO EXIT');
  console.log(`   You must OUTPUT: <promise>${completionPromise}</promise>`);
}

// Output for persona (stderr)
process.stderr.write('\n');
process.stderr.write("Ralph is helping! I'm setting up my toys.\n");
