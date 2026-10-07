import { findUserByName, listUsers } from './users.mjs';

export const routes = {
  'GET /users': req => listUsers(Number(req.query.limit ?? 50)),
  'GET /users/search': req => findUserByName(String(req.query.name ?? '')),
};
