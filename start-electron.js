#!/usr/bin/env node

// Wrapper script to ensure ELECTRON_RUN_AS_NODE is not set
const { spawn } = require('child_process');
const path = require('path');

const electronPath = require('electron');
const args = process.argv.slice(2);

// Create clean environment without ELECTRON_RUN_AS_NODE
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, ['.', ...args], {
  stdio: 'inherit',
  env: env
});

child.on('close', (code) => {
  process.exit(code);
});
