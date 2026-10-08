export function greet(name, { shout = false, quiet = false } = {}) {
  if (quiet) return '';
  const text = `Hello, ${name}!`;
  return shout ? text.toUpperCase() : text;
}
