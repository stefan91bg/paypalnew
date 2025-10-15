import jwt from 'jsonwebtoken';

// Javni ključ iz Clockify dokumentacije za verifikaciju tokena
const CLOCKIFY_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAubktufFNO/op+E5WBWL6
/Y9QRZGSGGCsV00FmPRl5A0mSfQu3yq2Yaq47IlN0zgFy9IUG8/JJfwiehsmbrKa
49t/xSkpG1u9w1GUyY0g4eKDUwofHKAt3IPw0St4qsWLK9mO+koUo56CGQOEpTui
5bMfmefVBBfShXTaZOtXPB349FdzSuYlU/5o3L12zVWMutNhiJCKyGfsuu2uXa9+
6uQnZBw1wO3/QEci7i4TbC+ZXqW1rCcbogSMORqHAP6qSAcTFRmrjFAEsOWiUUhZ
rLDg2QJ8VTDghFnUhYklNTJlGgfo80qEWe1NLIwvZj0h3bWRfrqZHsD/Yjh0duk6
yQIDAQAB
-----END PUBLIC KEY-----`;

/**
 * Verifikuje JWT token dobijen od Clockify-a
 * @param {string} token - JWT token iz 'Authorization' hedera ili query parametra
 * @returns {object} Dekodirani payload tokena ako je validan
 * @throws {Error} Ako token nije validan
 */
export function verifyToken(token) {
  if (!token) {
    throw new Error('Token is missing.');
  }

  try {
    const decoded = jwt.verify(token, CLOCKIFY_PUBLIC_KEY, {
      algorithms: ['RS256'],
    });

    // Proveravamo da li je token izdat od strane Clockify-a za add-on
    if (decoded.iss !== 'clockify' || decoded.type !== 'addon') {
      throw new Error('Invalid token issuer or type.');
    }
    
    // U 'sub' claim-u se nalazi ključ vašeg addona iz manifest fajla.
    // Ovde možete dodati i proveru za to ako želite dodatnu sigurnost:
    // if (decoded.sub !== 'vas-addon-kljuc') {
    //   throw new Error('Token subject does not match addon key.');
    // }

    return decoded;

  } catch (error) {
    console.error("Token verification failed:", error.message);
    throw new Error('Invalid or expired token.');
  }
}
