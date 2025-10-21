export async function confirmAction(message: string): Promise<boolean> {
  try {
    // In non-browser contexts or strict environments, guard access to window
    const w: any = (typeof window !== 'undefined') ? window : null;
    if (w && typeof w.confirm === 'function') {
      return !!w.confirm(message);
    }
  } catch { /* ignore */ }
  // Fallback: always resolve false if confirm dialog unavailable
  return false;
}
