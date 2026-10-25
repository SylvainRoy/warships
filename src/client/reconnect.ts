export function closeOutcome(
  code: number,
  state: { joined: boolean; resuming: boolean; reconnectForLobby: boolean },
): { reconnect: boolean; resuming: boolean; message: string | null } {
  if (code === 4000) return { reconnect: false, resuming: false, message: null };
  if (code === 4001) {
    return { reconnect: false, resuming: false, message: "This captain joined from another tab." };
  }
  const resuming = state.joined || state.resuming;
  return {
    reconnect: resuming || state.reconnectForLobby,
    resuming,
    message: resuming ? "Connection lost — reconnecting…" : null,
  };
}
