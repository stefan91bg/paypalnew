import { verifyToken } from '../../lib/auth';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    // 1. Pročitaj token iz Authorization hedera
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header missing or malformed' });
    }
    const token = authHeader.split(' ')[1];

    // 2. Verifikuj token
    const decodedToken = verifyToken(token);
    
    // 3. Koristi podatke iz tokena za API poziv
    const { workspaceId, backendUrl } = decodedToken;
    
    const url = `${backendUrl}/v1/workspaces/${workspaceId}/clients?archived=false&page-size=1000&sort-column=NAME&sort-order=ASCENDING`;
    
    const response = await fetch(url, { headers: { 'X-Addon-Token': token }, // Koristimo token za komunikaciju sa Clockify-em });

    if (!response.ok) {
      throw new Error(`Clockify API error: ${response.statusText}`);
    }

    const clients = await response.json();
    res.status(200).json(clients);

  } catch (error) {
    console.error('Failed to fetch clients:', error.message);
    res.status(401).json({ error: error.message }); // 401 Unauthorized ako token nije validan
  }
}
