import { useEffect, useState } from "preact/hooks";

// Prihlásenie cez Cloudflare Access. Aplikácia je verejná; Access chráni iba cestu
// /prihlasenie (pozri docs/rozhodnutia.md, R-007). Po prihlásení Access vráti používateľa
// na /prihlasenie/, odkiaľ statická stránka presmeruje späť do aplikácie.

const LOGIN_PATH = "/prihlasenie/";
const IDENTITY_URL = "/cdn-cgi/access/get-identity";
const LOGOUT_URL = "/cdn-cgi/access/logout";

export function LoginButton() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    // Bez platného cookie Access vráti 4xx alebo HTML; lokálne (vite dev) endpoint neexistuje
    fetch(IDENTITY_URL, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { email?: string } | null) => setEmail(j?.email ?? null))
      .catch(() => setEmail(null));
  }, []);

  if (email) {
    return (
      <span class="login">
        <span class="login-email muted" title={email}>
          {email}
        </span>
        <a class="btn" href={LOGOUT_URL}>
          Odhlásiť
        </a>
      </span>
    );
  }
  return (
    <a class="btn login" href={LOGIN_PATH}>
      Prihlásiť
    </a>
  );
}
