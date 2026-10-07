import { get } from './store.mjs';

export function getNote(session, id) {
  if (!session?.userId) throw new Error('sign in first');
  const note = get(id);
  if (!note || note.ownerId !== session.userId) throw new Error('not found');
  return note;
}
