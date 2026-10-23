// GitHub OAuth round trip. GitHub sends the browser back to the page that
// started it with ?code&state. The state is remembered in this tab so a
// link carrying someone else's code (login CSRF) is ignored.

type GithubFlow = "login" | "bind";

const stateKey = (flow: GithubFlow) => `flyx_github_state_${flow}`;

/** Where GitHub returns to: the login page or the profile page. */
export const githubRedirectUri = (flow: GithubFlow) =>
  `${window.location.origin}${import.meta.env.BASE_URL}${
    flow === "bind" ? "profile" : ""
  }`;

/** Remembers the state in the authorize URL and leaves for GitHub. */
export function goToGithub(flow: GithubFlow, authorizeUrl: string) {
  const state = new URL(authorizeUrl).searchParams.get("state") || "";

  try {
    sessionStorage.setItem(stateKey(flow), state);
  } catch {
    // Without storage the callback is rejected below; nothing else to do.
  }
  window.location.href = authorizeUrl;
}

/**
 * Reads GitHub's answer from the address bar and removes it. Returns null
 * when this page load is not a GitHub callback, or an error message.
 */
export function takeGithubCallback(
  flow: GithubFlow,
): { code: string; state: string } | { error: string } | null {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  const denied = params.get("error");

  if (!code && !denied) return null;

  let expected = "";

  try {
    expected = sessionStorage.getItem(stateKey(flow)) || "";
    sessionStorage.removeItem(stateKey(flow));
  } catch {
    expected = "";
  }
  ["code", "state", "error", "error_description", "error_uri"].forEach((k) =>
    params.delete(k),
  );
  const rest = params.toString();

  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`,
  );

  if (denied) return { error: "已取消 GitHub 授权" };
  if (!state || state !== expected) {
    return { error: "GitHub 授权已失效，请重新操作" };
  }

  return { code: code!, state };
}
