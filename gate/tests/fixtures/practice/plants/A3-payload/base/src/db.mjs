// A thin wrapper over the app's database driver.
export function all(sql, params = []) {
  return globalThis.__db.all(sql, params);
}
