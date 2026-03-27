
import type { NextApiRequest, NextApiResponse } from 'next';
import { resetDatabaseForFreshStart } from '@/lib/data';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'POST') {
        try {
            await resetDatabaseForFreshStart();
            res.status(200).json({ message: 'Database has been reset successfully.' });
        } catch (error: any) {
            res.status(500).json({ message: 'Failed to reset database.', error: error.message });
        }
    } else {
        res.setHeader('Allow', 'POST');
        res.status(405).end('Method Not Allowed');
    }
}
