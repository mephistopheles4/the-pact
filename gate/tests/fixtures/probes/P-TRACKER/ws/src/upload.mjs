// Sends a file through a client, retrying while the server fails.
export async function upload(client, file) {
  for (;;) {
    try {
      return await client.send(file);
    } catch {
      // The server failed; try again.
    }
  }
}
