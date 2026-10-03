import { readErrorMessage } from './gemini';

export interface RedeemResult {
  questionsAdded: number;
  bonusQuestions: number; // the user's bonus balance after this code
}

/** Redeems an invite code for the signed in user. Throws with a message that is fine to show. */
export const redeemInvite = async (code: string): Promise<RedeemResult> => {
  const token = localStorage.getItem('google_id_token');
  const response = await fetch('/api/invites/redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response, 'Could not redeem that code'));
  return (await response.json()) as RedeemResult;
};

/** Reads ?code= from the page address, as sent in a share link. Returns null when there is none. */
export const codeFromAddress = (): string | null => {
  try {
    const code = new URLSearchParams(window.location.search).get('code');
    return code && code.trim() ? code.trim().slice(0, 40) : null;
  } catch {
    return null;
  }
};

/** Removes ?code= from the address bar so a reload or a shared screenshot does not carry the code. */
export const clearCodeFromAddress = (): void => {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('code')) return;
    url.searchParams.delete('code');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  } catch {
    // Not worth failing for.
  }
};
