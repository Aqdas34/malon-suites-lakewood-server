-- Malon Luxury Suites Database Schema
-- Run these commands in your PostgreSQL editor (e.g., pgAdmin or psql)

-- 1. Create Suites Table
CREATE TABLE IF NOT EXISTS suites (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    base_price DECIMAL(10, 2) NOT NULL,
    amenities JSONB DEFAULT '[]',
    images JSONB DEFAULT '[]',
    rating DECIMAL(2, 1) DEFAULT 4.5,
    reviews INTEGER DEFAULT 0,
    address TEXT,
    location_info TEXT,
    map_embed TEXT,
    price_weekday_one DECIMAL(10, 2),
    price_weekday_multiple DECIMAL(10, 2),
    price_shabbos DECIMAL(10, 2),
    price_motzei_shabbos DECIMAL(10, 2),
    price_weekly DECIMAL(10, 2),
    price_monthly DECIMAL(10, 2),
    check_in_info TEXT,
    check_out_info TEXT,
    house_rules TEXT,
    cancellation_policy TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create Discounts Table (Global Rules)
CREATE TABLE IF NOT EXISTS discounts (
    id SERIAL PRIMARY KEY,
    type TEXT NOT NULL, -- 'multiple_nights', 'monthly'
    threshold INTEGER NOT NULL, -- e.g., 3 for multiple_nights, 28 for monthly
    percentage DECIMAL(4, 2) NOT NULL, -- e.g., 10.00 for 10%
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create Bookings Table
CREATE TABLE IF NOT EXISTS bookings (
    id SERIAL PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    mobile TEXT NOT NULL,
    suite_id TEXT REFERENCES suites(id),
    check_in DATE NOT NULL,
    check_out DATE NOT NULL,
    breakfast_dates JSONB DEFAULT '[]', -- List of dates guest wants breakfast
    total_cost DECIMAL(10, 2) NOT NULL,
    status TEXT DEFAULT 'confirmed', -- 'confirmed', 'cancelled'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Create Blocked Dates Table (For manual admin blocking)
CREATE TABLE IF NOT EXISTS blocked_dates (
    id SERIAL PRIMARY KEY,
    suite_id TEXT REFERENCES suites(id),
    blocked_date DATE NOT NULL,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(suite_id, blocked_date)
);

-- 5. Seed Initial Suites (from our current static data)
INSERT INTO suites (id, title, base_price, amenities, images) VALUES
('bellinger-st-suites', 'Bellinger Street Suites', 325.00, '["Kitchenette", "Wi-Fi", "Free Parking"]', '["assets/images/SEV05322.jpg"]'),
('laurel-ave-suite', 'Laurel Avenue Suite', 350.00, '["Full Kitchen", "Wi-Fi", "Garden View"]', '["assets/images/SEV05327.jpg"]'),
('miller-rd-suite', 'Miller Road Suite', 400.00, '["Luxury Bath", "Office Space", "Wi-Fi"]', '["assets/images/SEV05330.jpg"]');

-- 6. Seed Default Discounts
INSERT INTO discounts (type, threshold, percentage) VALUES
('multiple_nights', 3, 10.00), -- 10% off for 3+ nights
('monthly', 28, 25.00);      -- 25% off for 28+ nights

-- 7. Create Contacts Table (Guest Inquiries)
CREATE TABLE IF NOT EXISTS contacts (
    id SERIAL PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    mobile TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- 'pending', 'read', 'replied'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
