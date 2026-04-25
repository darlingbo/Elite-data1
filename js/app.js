// Supabase configuration
const supabaseUrl = 'YOUR_SUPABASE_URL'; // Replace with your Supabase URL
const supabaseKey = 'YOUR_SUPABASE_ANON_KEY'; // Replace with your Supabase anon key
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
    const { data, error } = await supabase.functions.invoke('send-telegram', {
        body: { message }
    });
    if (error) console.error('Error sending Telegram alert:', error);
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
    // Assume payment is handled via Momo integration
    // After payment success, create order
    const { data, error } = await supabase
        .from('orders')
        .insert([
            { user_id: supabase.auth.user().id, bundle_id: bundleId, phone: phoneNumber, status: 'pending' }
        ]);
    if (error) console.error('Error creating order:', error);
    // Send Telegram alert
    sendTelegramAlert(`New order: ${bundleId} for ${phoneNumber}`);
    return data;
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

async function getAllBundles() {
    const { data, error } = await supabase
        .from('bundles')
        .select('*');
    if (error) console.error('Error fetching bundles:', error);
    return data;
}

async function getAllOrders() {
    const { data, error } = await supabase
        .from('orders')
        .select('*');
    if (error) console.error('Error fetching orders:', error);
    return data;
}

async function updateOrderStatus(id, status) {
    const { data, error } = await supabase
        .from('orders')
        .update({ status })
        .eq('id', id);
    if (error) console.error('Error updating order:', error);
    // Notify user
    const { data: order } = await supabase
        .from('orders')
        .select('user_id')
        .eq('id', id)
        .single();
    await supabase
        .from('notifications')
        .insert([
            { user_id: order.user_id, message: `Order status updated to ${status}` }
        ]);
    return data;
}