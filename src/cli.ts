#!/usr/bin/env node
import { createRequire } from "node:module";
import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { createCommand } from "./commands/create.js";
import { listCommand } from "./commands/list.js";
import { psCommand } from "./commands/ps.js";
import { attachCommand } from "./commands/attach.js";
import { startCommand } from "./commands/start.js";
import { stopCommand } from "./commands/stop.js";
import { rmCommand } from "./commands/rm.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const program = new Command();

program
  .name("janix")
  .description("Docker dev environments for git branches with Claude Code support")
  .version(version);

program.addCommand(initCommand);
program.addCommand(createCommand);
program.addCommand(listCommand);
program.addCommand(psCommand);
program.addCommand(attachCommand);
program.addCommand(startCommand);
program.addCommand(stopCommand);
program.addCommand(rmCommand);

program.parse();
