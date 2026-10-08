export function greet(name, { shout = false } = {}) {
  const text = `Hello, ${name}!`;
  return shout ? text.toUpperCase() : text;
}
