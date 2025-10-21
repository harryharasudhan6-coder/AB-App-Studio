import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';  // Adjust path if needed (e.g., '@/config/firebase')
import { getDocs, collection, doc, updateDoc, Timestamp } from 'firebase/firestore';

export async function GET() {
  try {
    console.log('🚀 API Route loaded: db available?', !!db);  // Debug: True/False in terminal
    if (!db) {
      throw new Error('db not found – fix import in route.ts');
    }
    console.log('🔍 Fetching products collection...');
    const snapshot = await getDocs(collection(db, 'products'));
    console.log('📊 Snapshot size:', snapshot.docs.length);  // Should be 69
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const docId = docSnap.id;
      const productName = data.name || 'Unnamed';

      if (!data.createdAt) {
        try {
          console.log(`⏳ Updating "${productName}" (ID: ${docId})...`);
          await updateDoc(doc(db, 'products', docId), {
            createdAt: Timestamp.fromDate(new Date('2024-01-01T00:00:00Z')),
            updatedAt: Timestamp.now()
          });
          updated++;
          console.log(`✅ Updated: "${productName}"`);
        } catch (err) {
          errors++;
          console.log(`❌ Error on "${productName}": ${err.message}`);
        }
      } else {
        skipped++;
        console.log(`⏭️ Skipped: "${productName}" (has createdAt)`);
      }
    }

    console.log(`
🎉 Batch COMPLETE! Updated: ${updated}, Skipped: ${skipped}, Errors: ${errors}, Total: ${snapshot.docs.length}`);
    return NextResponse.json({ success: true, updated, skipped, errors, total: snapshot.docs.length });
  } catch (error) {
    console.error('🚫 API Batch failed:', error);  // Logs full error in terminal
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}