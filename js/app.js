// Supabase configuration
const supabaseUrl = 'https://wlyobxfsphgrlumzhdlk.supabase.co';
const supabaseKey = '1e49b887918302a18e20efc393cdb932';
const supabase = supabase.createClient(supabaseUrl, supabaseKey);

// Function to check if user is logged in
function checkAuth() {
    const user = supabase.auth.user();
    if (user) {
        // User is logged in
        document.getElementById('user-info').innerText = `Welcome, ${user.email}`;
    } else {
        // User not logged in
        window.location.href = 'login.html';
    }
}

// Function to logout
function logout() {
    supabase.auth.signOut();
    window.location.href = 'index.html';
}

// Function to send Telegram alert (via edge function)
async function sendTelegramAlert(message) {
    try {
        const response = await supabase.functions.invoke('telegram-alert', {
            body: { message }
        });
        console.log('Telegram alert sent:', response);
        return response;
    } catch (error) {
        console.error('Error sending Telegram alert:', error);
    }
}

// Function to get notifications
async function getNotifications() {
    const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', supabase.auth.user().id);
    if (error) console.error('Error fetching notifications:', error);
    return data;
}

// Function to update profile
async function updateProfile(phone, password) {
    const { data, error } = await supabase.auth.update({
        phone: phone,
        password: password
    });
    if (error) console.error('Error updating profile:', error);
    return data;
}

// Function to reset password
async function resetPassword(email) {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) console.error('Error resetting password:', error);
    return data;
}

// Function to buy data/airtime
async function purchase(bundleId, phoneNumber) {
    try {
        const user = supabase.auth.user();
        
        // Get bundle details
        const { data: bundle, error: bundleError } = await supabase
            .from('bundles')
            .select('*')
            .eq('id', bundleId)
            .single();
        
        // Create order
        const { data, error } = await supabase
            .from('orders')
            .insert([
                { 
                    user_id: user.id, 
                    bundle_id: bundleId, 
                    phone: phoneNumber, 
                    status: 'pending',
                    created_at: new Date().toISOString()
                }
            ]);
        
        if (error) {
            console.error('Error creating order:', error);
            alert('Failed to create order');
            return null;
        }
        
        // Send Telegram alert with detailed info
        const alertMessage = `✅ NEW PAYMENT\n💰 Amount: GHS ${bundle.price}\n📦 Product: ${bundle.name}\n📱 Phone: ${phoneNumber}\n👤 User: ${user.email}\n⏰ Time: ${new Date().toLocaleString()}`;
        await sendTelegramAlert(alertMessage);
        
        return data;
    } catch (err) {
        console.error('Purchase error:', err);
        alert('Purchase failed');
        return null;
    }
}

// Admin functions
async function updateBundle(id, price, details) {
    const { data, error } = await supabase
        .from('bundles')
        .update({ price, details })
        .eq('id', id);
    if (error) console.error('Error updating bundle:', error);
    return data;
}

async function getAllBundles(network = null) {
    try {
        let query = supabase.from('bundles').select('*');
        if (network) {
            query = query.eq('network', network);
        }
        const { data, error } = await query;
        if (error) {
            console.error('Error fetching bundles:', error);
            return [];
        }
        return data || [];
    } catch (err) {
        console.error('Bundle fetch error:', err);
        return [];
    }
}

async function getAllOrders() {
    const { data, error } = await supabase
        .from('orders')
        .select('*');
    if (error) console.error('Error fetching orders:', error);
    return data;
}

async function updateOrderStatus(id, status) {
    try {
        // Update the order status
        const { data, error } = await supabase
            .from('orders')
            .update({ status })
            .eq('id', id);
        
        if (error) {
            console.error('Error updating order:', error);
            return null;
        }
        
        // Get order details
        const { data: order } = await supabase
            .from('orders')
            .select('*')
            .eq('id', id)
            .single();
        
        // Get bundle details for the alert
        const { data: bundle } = await supabase
            .from('bundles')
            .select('name, price')
            .eq('id', order.bundle_id)
            .single();
        
        // Notify user in database
        await supabase
            .from('notifications')
            .insert([
                { 
                    user_id: order.user_id, 
                    message: `Your order for ${bundle.name} has been ${status}!`
                }
            ]);
        
        // Send admin notification via Telegram
        const statusEmoji = status === 'completed' ? '✅' : status === 'failed' ? '❌' : '⏳';
        const alertMessage = `${statusEmoji} ORDER STATUS UPDATE\n📦 Product: ${bundle.name}\n💰 Price: GHS ${bundle.price}\n📱 Phone: ${order.phone}\nStatus: ${status.toUpperCase()}\nOrder ID: ${id}`;
        await sendTelegramAlert(alertMessage);
        
        return data;
    } catch (err) {
        console.error('Status update error:', err);
        return null;
    }
}