import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

// === BLOK 1: Statički ključ (za tvoje Developer okruženje) ===
// Ovo je tvoj stari, hardkodovani ključ
const CLOCKIFY_PUBLIC_KEY_DEV = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAubktufFNO/op+E5WBWL6
/Y9QRZGSGGCsV00FmPRl5A0mSfQu3yq2Yaq47IlN0zgFy9IUG8/JJfwiehsmbrKa
49t/xSkpG1u9w1GUyY0g4eKDUwofHKAt3IPw0St4qsWLK9mO+koUo56CGQOEpTui
5bMfmefVBBfShXTaZOtXPB349FdzSuYlU/5o3L12zVWMutNhiJCKyGfsuu2uXa9+
6uQnZBw1wO3/QEci7i4TbC+ZXqW1rCcbogSMORqHAP6qSAcTFRmrjFAEsOWiUUhZ
rLDg2QJ8VTDghFnUhYklNTJlGgfo80qEWe1NLIwvZj0h3bWRfrqZHsD/Yjh0duk6
yQIDAQAB
-----END PUBLIC KEY-----`;

// === BLOK 2: Dinamički JWKS klijent (za QA tim i Produkciju) ===
// Ovo je novi klijent koji smo dodali
const jwksProdClient = jwksClient({
  jwksUri: 'https://marketplace.api.cake.com/.well-known/jwks.json',
  cache: true,
  rateLimit: true,
  jwksRequestsPerMinute: 5,
});

// Funkcija koja dinamički pronalazi ključ (samo za JWKS)
function getKey(header, callback) {
  // Ova funkcija se poziva samo ako token ima 'kid'
  jwksProdClient.getSigningKey(header.kid, (err, key) => {
    if (err) {
      console.error('Failed to get signing key from JWKS:', err);
      return callback(err);
    }
    const signingKey = key.getPublicKey();
    callback(null, signingKey);
  });
}

// === BLOK 3: Glavna "Hibridna" Verify funkcija ===

/**
 * Verifikuje JWT token dobijen od Clockify-a.
 * Koristi dinamički JWKS ako token ima 'kid', u suprotnom koristi statički dev ključ.
 * @param {string} token - JWT token
 * @returns {Promise<object>} Dekodirani payload tokena ako je validan
 */
export function verifyToken(token) {
  if (!token) {
    return Promise.reject(new Error('Token is missing.'));
  }

  // 1. Prvo dekodiramo token da vidimo header (bez verifikacije)
  const decodedTokenHeader = jwt.decode(token, { complete: true })?.header;

  // 2. Proveravamo da li token ima 'kid' (Key ID)
  const hasKid = decodedTokenHeader && decodedTokenHeader.kid;

  if (hasKid) {
    //
    // SCENARIO A: Token ima 'kid' (QA Tim / Produkcija)
    // Koristimo dinamičku JWKS metodu (koja je asinhrona)
    //
    return new Promise((resolve, reject) => {
      jwt.verify(
        token,
        getKey, // Naša dinamička funkcija
        { algorithms: ['RS256'] },
        (err, decoded) => {
          if (err) {
            console.error('Dynamic (JWKS) token verification failed:', err.message);
            return reject(new Error('Invalid or expired token (dynamic).'));
          }
          if (decoded.iss !== 'clockify' || decoded.type !== 'addon') {
            return reject(new Error('Invalid token issuer or type (dynamic).'));
          }
          resolve(decoded);
        }
      );
    });
  } else {
    //
    // SCENARIO B: Token NEMA 'kid' (Tvoje Developer Okruženje)
    // Koristimo staru, statičku metodu (koja je sinhrona)
    // Vraćamo kao Promise da bi tip povratne vrednosti bio isti kao u Scenariju A
    //
    return new Promise((resolve, reject) => {
      try {
        const decoded = jwt.verify(token, CLOCKIFY_PUBLIC_KEY_DEV, {
          algorithms: ['RS256'],
        });

        if (decoded.iss !== 'clockify' || decoded.type !== 'addon') {
          return reject(new Error('Invalid token issuer or type (static).'));
        }
        resolve(decoded);
      } catch (error) {
        console.error('Static (DEV) token verification failed:', error.message);
        return reject(new Error('Invalid or expired token (static).'));
      }
    });
  }
}
