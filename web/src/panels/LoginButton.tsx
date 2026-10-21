import { useEffect, useState } from "preact/hooks";
import { Icon } from "./icons";

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
      <a class="glass login" href={LOGOUT_URL} title={`Prihlásený: ${email} – odhlásiť`}>
        <Icon name="logout" size={16} />
        <span class="login-email">{email}</span>
        <span class="login-short">Odhlásiť</span>
      </a>
    );
  }
  return (
    <a class="glass login" href={LOGIN_PATH}>
      <Icon name="login" size={16} />
      Prihlásiť sa
    </a>
  );
}
