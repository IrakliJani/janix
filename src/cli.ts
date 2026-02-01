#!/usr/bin/env node
import { Command } from "commander";
import { createCommand } from "./commands/create.js";
import { listCommand } from "./commands/list.js";
import { attachCommand } from "./commands/attach.js";
import { startCommand } from "./commands/start.js";
import { stopCommand } from "./commands/stop.js";
import { destroyCommand } from "./commands/destroy.js";

const program = new Command();

program
  .name("jaegent")
  .description("Manage Docker dev environments for git branches")
  .version("0.1.0");

program.addCommand(createCommand);
program.addCommand(listCommand);
program.addCommand(attachCommand);
program.addCommand(startCommand);
program.addCommand(stopCommand);
program.addCommand(destroyCommand);

program.parse();
