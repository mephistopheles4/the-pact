import { listUsers } from './users.mjs';

export const routes = {
  'GET /users': req => listUsers(Number(req.query.limit ?? 50)),
};
