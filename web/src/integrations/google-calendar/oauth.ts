// Signs in to Google as *you* (OAuth "Desktop app" client), so the app can read the room
// calendars your account already sees. The token is saved locally in .secrets/ (gitignored).
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { google } from "googleapis";
import { ServiceError } from "@/services/errors";

type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;
type Tokens = Parameters<OAuth2Client["setCredentials"]>[0];

/** Fixed so it can be registered on a "Web application" client; "Desktop app" clients accept any port. */
const REDIRECT_PORT = Number(process.env.GOOGLE_OAUTH_REDIRECT_PORT || 53682);

const READ_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const WRITE_SCOPE = "https://www.googleapis.com/auth/calendar";

/** Writing to the real calendars is off unless GOOGLE_CALENDAR_WRITE=true (and you log in again). */
export function calendarWritesEnabled(): boolean {
  return process.env.GOOGLE_CALENDAR_WRITE === "true";
}

export function tokenPath(): string {
  return path.join(process.cwd(), ".secrets", "google-token.json");
}

function clientCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new ServiceError("Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in .env (see README: Connecting Google Calendar).");
  }
  return { clientId, clientSecret };
}

function saveTokens(tokens: Tokens): void {
  fs.mkdirSync(path.dirname(tokenPath()), { recursive: true });
  fs.writeFileSync(tokenPath(), JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

/** An authorized client from the saved token. Throws if `google login` hasn't been run. */
export function authorizedClient(): OAuth2Client {
  const { clientId, clientSecret } = clientCredentials();
  let tokens: Tokens;
  try {
    tokens = JSON.parse(fs.readFileSync(tokenPath(), "utf8"));
  } catch {
    throw new ServiceError('Not signed in to Google. Run "npm run cli -- google login" first.');
  }
  const client = new google.auth.OAuth2(clientId, clientSecret);
  client.setCredentials(tokens);
  // Keep the refresh token when Google hands back a new access token.
  client.on("tokens", (fresh) => saveTokens({ ...tokens, ...fresh }));
  return client;
}

/** Opens the Google sign-in page and waits for the redirect back to a local port. */
export async function loginWithBrowser(log: (line: string) => void): Promise<{ scope: string }> {
  const { clientId, clientSecret } = clientCredentials();
  const scope = calendarWritesEnabled() ? WRITE_SCOPE : READ_SCOPE;

  const server = http.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", (err: NodeJS.ErrnoException) =>
      reject(err.code === "EADDRINUSE" ? new ServiceError(`Port ${REDIRECT_PORT} is in use. Set GOOGLE_OAUTH_REDIRECT_PORT to another port.`) : err),
    );
    server.listen(REDIRECT_PORT, "127.0.0.1", resolve);
  });
  const redirectUri = `http://127.0.0.1:${REDIRECT_PORT}/oauth2callback`;
  const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const url = client.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: [scope] });

  const code = new Promise<string>((resolve, reject) => {
    server.on("request", (req, res) => {
      const params = new URL(req.url ?? "/", redirectUri).searchParams;
      if (!req.url?.startsWith("/oauth2callback")) return res.end();
      const error = params.get("error");
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(error ? `Sign-in failed: ${error}. You can close this tab.` : "Signed in. You can close this tab and go back to the terminal.");
      if (error) reject(new Error(`Google sign-in failed: ${error}`));
      else resolve(params.get("code")!);
    });
  });

  log(`Redirect URI: ${redirectUri}  (register this if your OAuth client is a "Web application")`);
  log("Opening Google sign-in in your browser. If it doesn't open, visit:\n\n  " + url + "\n");
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  spawn(opener, [url], { stdio: "ignore", detached: true }).on("error", () => {}).unref();

  try {
    const { tokens } = await client.getToken(await code);
    saveTokens(tokens);
    return { scope };
  } finally {
    server.close();
  }
}
