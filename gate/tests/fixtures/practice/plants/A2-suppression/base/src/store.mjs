const notes = new Map();

export function put(note) {
  notes.set(note.id, note);
}

export function get(id) {
  return notes.get(id);
}

export function remove(id) {
  return notes.delete(id);
}
