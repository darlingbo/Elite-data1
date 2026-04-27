const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://wlyobxfsphgrlumzhdlk.supabase.co';
const supabaseKey = '1e49b887918302a18e20efc393cdb932';
const supabase = createClient(supabaseUrl, supabaseKey);

async function addSampleBundles() {
    const bundles = [
        { name: '1GB Data Bundle', price: 5.23, details: 'MTN 1GB Data Bundle', network: 'MTN' },
        { name: '2GB Data Bundle', price: 10.00, details: 'MTN 2GB Data Bundle', network: 'MTN' },
        { name: '5GB Data Bundle', price: 25.00, details: 'MTN 5GB Data Bundle', network: 'MTN' },
        { name: '10GB Data Bundle', price: 50.00, details: 'MTN 10GB Data Bundle', network: 'MTN' },
        { name: '1GB Data Bundle', price: 5.50, details: 'Telecel 1GB Data Bundle', network: 'Telecel' },
        { name: '2GB Data Bundle', price: 10.50, details: 'Telecel 2GB Data Bundle', network: 'Telecel' },
        { name: '5GB Data Bundle', price: 26.00, details: 'Telecel 5GB Data Bundle', network: 'Telecel' },
        { name: '10GB Data Bundle', price: 52.00, details: 'Telecel 10GB Data Bundle', network: 'Telecel' },
        { name: '1GB Data Bundle', price: 5.00, details: 'Airtel Tigo 1GB Data Bundle', network: 'Airtel Tigo' },
        { name: '2GB Data Bundle', price: 9.50, details: 'Airtel Tigo 2GB Data Bundle', network: 'Airtel Tigo' },
        { name: '5GB Data Bundle', price: 24.00, details: 'Airtel Tigo 5GB Data Bundle', network: 'Airtel Tigo' },
        { name: '10GB Data Bundle', price: 48.00, details: 'Airtel Tigo 10GB Data Bundle', network: 'Airtel Tigo' },
    ];

    for (const bundle of bundles) {
        const { data, error } = await supabase
            .from('bundles')
            .insert([bundle]);
        if (error) {
            console.error('Error adding bundle:', bundle, error);
        } else {
            console.log('Added bundle:', bundle);
        }
    }
}

addSampleBundles();