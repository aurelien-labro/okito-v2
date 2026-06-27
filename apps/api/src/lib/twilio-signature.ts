import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Valide la signature `X-Twilio-Signature` d'une requête entrante.
 *
 * Twilio signe chaque webhook avec :
 *   signature = base64(HMAC-SHA1(authToken, url + concat(sorted params)))
 *
 * `url` = URL complète du webhook (avec protocol + host + path, sans query).
 * `params` = TOUS les paramètres form (form-urlencoded) reçus, triés par clé,
 * concaténés en `key1value1key2value2…` sans séparateur.
 *
 * Doc Twilio : https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
export function validateTwilioSignature(opts: {
  authToken: string;
  url: string;
  params: Record<string, string>;
  signature: string;
}): boolean {
  const { authToken, url, params, signature } = opts;
  if (!signature) return false;

  const sortedKeys = Object.keys(params).sort();
  const data = sortedKeys.reduce((acc, key) => `${acc}${key}${params[key] ?? ""}`, url);

  const expected = createHmac("sha1", authToken).update(data, "utf8").digest("base64");

  const sigBuf = Buffer.from(signature, "utf8");
  const expBuf = Buffer.from(expected, "utf8");
  if (sigBuf.length !== expBuf.length) return false;
  return timingSafeEqual(sigBuf, expBuf);
}
