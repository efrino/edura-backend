const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ovlztbdevudtxdmbdgwi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bHp0YmRldnVkdHhkbWJkZ3dpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk3OTg0OTgsImV4cCI6MjA2NTM3NDQ5OH0.2yb2O9O0wwRYJbhXDkwXEyTpW6QPMo85AeMyAZdj4X4';

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
