#!/usr/bin/env bun

import { main } from './index';

const exitCode = await main();
process.exit(exitCode);
