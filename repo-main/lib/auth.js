import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

// 1. Definišemo JWKS klijent koji zna gde da traži Clockify ključeve
const client = jwksClient({
  jwksUri: 'https://marketplace.api.cake.com/.well-known/jwks.json',
  cache: true, // Omogućava keširanje ključeva da ne bi slao zahtev svaki put
  rateLimit: true, // Sprečava previše zahteva
});

/**
 * Dinamički pronalazi ispravan ključ za potpisivanje sa Clockify servera.
 * Ovu funkciju koristi jwt.verify.
 */
function getKey(header, callback) {
  if (!header.kid) {
    return callback(new Error('Token is missing kid (Key ID) in header.'));
  }

  // client.getSigningKey pronalazi ključ u JWKS listi na osnovu 'kid' iz tokena
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      console.error('Failed to get signing key:', err);
      return callback(err);
    }
    const signingKey = key.getPublicKey();
    callback(null, signingKey);
  });
}

/**
 * Verifikuje JWT token dobijen od Clockify-a koristeći dinamički JWKS
 * @param {string} token - JWT token iz 'Authorization' hedera ili query parametra
 * @returns {Promise<object>} Dekodirani payload tokena ako je validan
 * @throws {Error} Ako token nije validan
 */
export function verifyToken(token) {
  if (!token) {
    // Odmah odbijamo ako tokena nema
    return Promise.reject(new Error('Token is missing.'));
  }

  // Pošto 'getKey' koristi callback, moramo celu verifikaciju da pretvorimo u Promise
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getKey, // Koristimo našu dinamičku funkciju umesto hardkodovanog ključa
      {
        algorithms: ['RS256'], // Važno je da algoritam ostane RS256
      },
      (err, decoded) => {
        if (err) {
          console.error("Token verification failed:", err.message);
          return reject(new Error('Invalid or expired token.'));
        }

        // Proveravamo da li je token izdat od strane Clockify-a za add-on
        if (decoded.iss !== 'clockify' || decoded.type !== 'addon') {
          return reject(new Error('Invalid token issuer or type.'));
        }

        // Token je validan, vraćamo dekodirani payload
        resolve(decoded);
      }
    );
  });
}
