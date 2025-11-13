


export async function cleanupAndExit(code = 0) {
    try {
      await channel.close();
      await connection.close();
    } catch {}
    process.exit(code);
  }