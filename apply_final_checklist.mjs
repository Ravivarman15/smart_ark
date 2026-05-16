import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing config");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log(`Connecting to: ${supabaseUrl}`);

  // 1. Create Academic Year if it doesn't exist to link fee structure to
  let { data: ay } = await supabase.from('academic_years').select('id, name').ilike('name', '%2025%2026%').single();
  
  if (!ay) {
    const { data: newAy, error: ayErr } = await supabase.from('academic_years').insert({
      name: 'AY 2025–2026',
      start_date: '2025-04-01',
      end_date: '2026-03-31',
      is_active: true
    }).select().single();
    if (ayErr) throw ayErr;
    ay = newAy;
    console.log("Created Academic Year:", ay.name);
  }

  // 1.5 Get a standard to link (Class 10)
  let { data: std } = await supabase.from('standards').select('id, name').ilike('name', '%10%').limit(1).single();
  let standardId = std?.id || null;

  // 2. Insert Fee Structures Options A, B, C
  const baseFee = {
    name: 'Class 10 – Complete Academic Program',
    academic_year_id: ay.id,
    standard_id: standardId,
    total_amount: 60000,
    seat_confirmation_amount: 5000,
    first_payment_amount: 16500,
  };

  const options = [
    { name: '(Option A - 2 Installments)', installments: 2 },
    { name: '(Option B - 3 Installments)', installments: 3 },
    { name: '(Option C - 4 Installments)', installments: 4 }
  ];

  for (const opt of options) {
    const fullName = `${baseFee.name} ${opt.name}`;
    const { data: existing } = await supabase.from('fee_structures').select('id').eq('name', fullName).single();
    
    if (!existing) {
      const { error } = await supabase.from('fee_structures').insert({
        ...baseFee,
        name: fullName,
        installment_count: opt.installments
      });
      if (error) console.error("Error inserting fee:", fullName, error.message);
      else console.log(`Added Fee Structure: ${fullName}`);
    } else {
      console.log(`Fee Structure already exists: ${fullName}`);
    }
  }

  // 3. Migrate existing students into student_fees
  const { data: students, error: studentErr } = await supabase.from('students').select(`
    id, name, fee_structure_id, batches(name)
  `);
  if (studentErr) throw studentErr;

  const { data: existingFees, error: feesErr } = await supabase.from('student_fees').select('student_id');
  if (feesErr) throw feesErr;

  const feeStudentIds = new Set(existingFees.map(f => f.student_id));
  
  let migrated = 0;
  for (const s of students) {
    if (!feeStudentIds.has(s.id)) {
      // Need to create student_fee record
      let feeAmt = 0;
      let seatAmt = 0;
      let firstAmt = 0;
      let count = 2;
      
      if (s.fee_structure_id) {
        const { data: fs } = await supabase.from('fee_structures').select('*').eq('id', s.fee_structure_id).single();
        if (fs) {
          feeAmt = fs.total_amount || 0;
          seatAmt = fs.seat_confirmation_amount || 0;
          firstAmt = fs.first_payment_amount || 0;
          count = fs.installment_count || 2;
        }
      }

      const { error } = await supabase.from('student_fees').insert({
        student_id: s.id,
        fee_structure_id: s.fee_structure_id,
        student_name: s.name,
        batch_name: s.batches?.[0]?.name || s.batches?.name || null,
        total_amount: feeAmt,
        seat_confirmation_amount: seatAmt,
        first_payment_amount: firstAmt,
        installment_count: count,
        amount_pending: feeAmt, // Base pending
        status: feeAmt > 0 ? 'pending' : 'paid'
      });
      
      if (error) console.error(`Error migrating student ${s.name}:`, error.message);
      else migrated++;
    }
  }
  console.log(`Migrated ${migrated} legacy students into student_fees. 🚀`);
}

main().catch(console.error);
