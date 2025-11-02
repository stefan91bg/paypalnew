// clients.js

import { verifyToken } from '../../lib/auth';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header missing or malformed' });
    }
    const token = authHeader.split(' ')[1];

    const decodedToken = verifyToken(token);

    // ✅ ISPRAVKA: Robusno pronalaženje URL-a za sva okruženja
    // Umesto direktnog korišćenja `decodedToken.backendUrl`
    const { workspaceId, backendUrl } = decodedToken;
    const safeBackendUrl =
      backendUrl ||
      decodedToken.apiUrl || // Legacy polje koje se koristi u nekim okruženjima
      decodedToken.backend || // Drugo legacy polje
      null;

    if (!safeBackendUrl) {
      throw new Error("Missing backend URL in token");
  }

    //Koristi se 'safeBackendUrl'
    const url = `${safeBackendUrl}/v1/workspaces/${workspaceId}/clients?archived=false&page-size=1000&sort-column=NAME&sort-order=ASCENDING`;

    const response = await fetch(url, {
      headers: { 'X-Addon-Token': token },
    });

    if (!response.ok) {
      const txt = await response.text();
      throw new Error(`Clockify API error ${response.status}: ${txt}`);
    }

    const clients = await response.json();
    res.status(200).json(clients);

  } catch (error) {
    console.error('Failed to fetch clients:', error.message);
    res.status(401).json({ error: error.message });
  }
}
