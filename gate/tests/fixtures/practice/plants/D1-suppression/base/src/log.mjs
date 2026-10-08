import { appendFileSync } from 'node:fs';

export function info(line) {
  appendFileSync('logs/request.log', `${new Date().toISOString()} ${line}\n`);
}
