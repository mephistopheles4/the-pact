import { token } from './config.mjs';

const t = token();
console.log(t ? `token loaded: ${t}` : 'token loaded: no');
