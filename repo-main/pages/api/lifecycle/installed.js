import { supabase } from '../../../lib/supabaseClient';
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-gcm';

// Pomoćna funkcija za enkripciju
function encrypt(text) {
    if (!ENCRYPTION_KEY) {
        throw new Error('ENCRYPTION_KEY is not set in environment variables.');
    }
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
        iv: iv.toString('hex'),
        tag: authTag.toString('hex'),
        content: encrypted.toString('hex'),
    };
}

export default async function handler(req, res) {
    if (req.method.toUpperCase() !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end('Method Not Allowed');
    }

    try {
        const { workspaceId, authToken } = req.body;

        if (!workspaceId || !authToken) {
            return res.status(400).json({ error: 'Missing workspaceId or authToken in request body.' });
        }

        const encryptedToken = encrypt(authToken);

        const { error } = await supabase
            .from('installations')
            .upsert({ 
                workspace_id: workspaceId,
                installation_token: JSON.stringify(encryptedToken) 
            }, { 
                onConflict: 'workspace_id' 
            });

        if (error) {
            console.error('Supabase error during upsert:', error);
            // ISPRAVKA: Dodati su backticks (`) oko stringa
            throw new Error(`Supabase error: ${error.message}`);
        }

        res.status(200).json({ message: 'Installation successful.' });

    } catch (error) {
        console.error('Installation lifecycle error:', error.message);
        res.status(500).json({ error: 'Failed to process installation.' });
    }
}
