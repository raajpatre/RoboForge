-- ==============================================================================
-- RoboShop-Forge Seed Data (Explicitly Marked Robotics Demo Products)
-- ==============================================================================
-- Notice: These products represent illustrative demo robotics components.
-- Replacing demo data with production hardware is straightforward:
-- simply update or insert rows into public.products and public.inventory.
-- ==============================================================================

DO $$
DECLARE
    p1 UUID := 'a1111111-1111-4111-8111-111111111111';
    p2 UUID := 'a2222222-2222-4222-8222-222222222222';
    p3 UUID := 'a3333333-3333-4333-8333-333333333333';
    p4 UUID := 'a4444444-4444-4444-8444-444444444444';
    p5 UUID := 'a5555555-5555-4555-8555-555555555555';
    p6 UUID := 'a6666666-6666-4666-8666-666666666666';
BEGIN
    -- Product 1: ForgeBot 6-DOF Robotic Arm
    INSERT INTO public.products (id, slug, sku, category, name, description, price_paise, image_url, hsn_code, tax_rate_bps, is_active, metadata)
    VALUES (
        p1,
        'forgebot-alpha-6dof',
        'RBF-ARM-6DOF',
        'manipulators',
        'ForgeBot Alpha 6-DOF Robotic Arm',
        'Precision articulated 6-axis collaborative robotic arm with harmonic drive gearboxes, 3.5kg payload capacity, 0.05mm repeatability, and native ROS2 Galactic/Humble drivers.',
        18500000, -- ₹1,85,000.00
        'https://images.unsplash.com/photo-1618042164219-62c820f10723?auto=format&fit=crop&w=800&q=80',
        '84795000',
        1800,
        true,
        '{"payload_kg": 3.5, "reach_mm": 650, "degrees_of_freedom": 6, "interface": "Ethernet / CAN"}'::jsonb
    ) ON CONFLICT (id) DO UPDATE SET 
        sku = EXCLUDED.sku,
        category = EXCLUDED.category,
        price_paise = EXCLUDED.price_paise;

    INSERT INTO public.inventory (product_id, stock_on_hand, stock_reserved)
    VALUES (p1, 5, 0)
    ON CONFLICT (product_id) DO UPDATE SET stock_on_hand = EXCLUDED.stock_on_hand;

    -- Product 2: LiDAR-Scan 360 Pro
    INSERT INTO public.products (id, slug, sku, category, name, description, price_paise, image_url, hsn_code, tax_rate_bps, is_active, metadata)
    VALUES (
        p2,
        'lidar-scan-360-pro',
        'RBF-LIDAR-360',
        'sensors',
        'LiDAR-Scan 360 Pro SLAM Sensor',
        '360-degree Time-of-Flight 2D/3D LiDAR sensor with 25-meter radius range, 12Hz scanning frequency, and industrial IP65 dust/waterproof enclosure.',
        2499900, -- ₹24,999.00
        'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80',
        '90151000',
        1800,
        true,
        '{"range_m": 25, "scan_rate_hz": 12, "sample_rate_khz": 16, "interface": "USB-C / UART"}'::jsonb
    ) ON CONFLICT (id) DO UPDATE SET 
        sku = EXCLUDED.sku,
        category = EXCLUDED.category,
        price_paise = EXCLUDED.price_paise;

    INSERT INTO public.inventory (product_id, stock_on_hand, stock_reserved)
    VALUES (p2, 14, 0)
    ON CONFLICT (product_id) DO UPDATE SET stock_on_hand = EXCLUDED.stock_on_hand;

    -- Product 3: OmniDrive 4WD AMR Platform
    INSERT INTO public.products (id, slug, sku, category, name, description, price_paise, image_url, hsn_code, tax_rate_bps, is_active, metadata)
    VALUES (
        p3,
        'omnidrive-4wd-mobile-base',
        'RBF-AMR-4WD',
        'mobility',
        'OmniDrive 4WD Heavy-Duty Mobile Platform',
        'Holonomic Mecanum-wheel autonomous mobile robotics chassis. CNC aluminum structure, four 24V brushless hub motors with built-in optical encoders, 50kg load capacity.',
        6850000, -- ₹68,500.00
        'https://images.unsplash.com/photo-1531746790731-6c087fecd65a?auto=format&fit=crop&w=800&q=80',
        '84795000',
        1800,
        true,
        '{"payload_kg": 50, "max_speed_ms": 1.8, "voltage": "24V", "wheel_type": "Mecanum 152mm"}'::jsonb
    ) ON CONFLICT (id) DO UPDATE SET 
        sku = EXCLUDED.sku,
        category = EXCLUDED.category,
        price_paise = EXCLUDED.price_paise;

    INSERT INTO public.inventory (product_id, stock_on_hand, stock_reserved)
    VALUES (p3, 8, 0)
    ON CONFLICT (product_id) DO UPDATE SET stock_on_hand = EXCLUDED.stock_on_hand;

    -- Product 4: NeuroNav Stereo Depth Camera V2
    INSERT INTO public.products (id, slug, sku, category, name, description, price_paise, image_url, hsn_code, tax_rate_bps, is_active, metadata)
    VALUES (
        p4,
        'neuronav-stereo-depth-v2',
        'RBF-CAM-STEREO',
        'sensors',
        'NeuroNav Stereo Depth Camera V2',
        'Active infrared stereoscopic 3D camera with integrated 6-DoF IMU and neural depth processor. Delivers 90fps depth point clouds directly over USB 3.1 Gen 1.',
        3200000, -- ₹32,000.00
        'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?auto=format&fit=crop&w=800&q=80',
        '85258900',
        1800,
        true,
        '{"depth_resolution": "1280x720", "fps": 90, "shutter": "Global", "baseline_mm": 95}'::jsonb
    ) ON CONFLICT (id) DO UPDATE SET 
        sku = EXCLUDED.sku,
        category = EXCLUDED.category,
        price_paise = EXCLUDED.price_paise;

    INSERT INTO public.inventory (product_id, stock_on_hand, stock_reserved)
    VALUES (p4, 12, 0)
    ON CONFLICT (product_id) DO UPDATE SET stock_on_hand = EXCLUDED.stock_on_hand;

    -- Product 5: TitanCore Dual BLDC Motor ESC 60A
    INSERT INTO public.products (id, slug, sku, category, name, description, price_paise, image_url, hsn_code, tax_rate_bps, is_active, metadata)
    VALUES (
        p5,
        'titancore-dual-bldc-esc-60a',
        'RBF-ESC-60A',
        'controllers',
        'TitanCore Dual BLDC Motor ESC 60A',
        'Field-Oriented Control (FOC) dual brushless motor speed controller. Supports 12V-54V input, 60A continuous per channel, CAN bus telemetry, and programmable regen braking.',
        1150000, -- ₹11,500.00
        'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=800&q=80',
        '85044090',
        1800,
        true,
        '{"voltage_range": "12V-54V", "current_continuous_a": 60, "bus": "CAN / UART / PWM"}'::jsonb
    ) ON CONFLICT (id) DO UPDATE SET 
        sku = EXCLUDED.sku,
        category = EXCLUDED.category,
        price_paise = EXCLUDED.price_paise;

    INSERT INTO public.inventory (product_id, stock_on_hand, stock_reserved)
    VALUES (p5, 25, 0)
    ON CONFLICT (product_id) DO UPDATE SET stock_on_hand = EXCLUDED.stock_on_hand;

    -- Product 6: GripperForge Adaptive Soft-Touch Gripper
    INSERT INTO public.products (id, slug, sku, category, name, description, price_paise, image_url, hsn_code, tax_rate_bps, is_active, metadata)
    VALUES (
        p6,
        'gripperforge-soft-touch',
        'RBF-GRP-SOFT',
        'end_effectors',
        'GripperForge Adaptive Soft-Touch Gripper',
        'Electric parallel 2-finger gripper with integrated force-torque feedback and exchangeable high-friction silicone pads. Stroke 85mm, gripping force 20N-120N.',
        1980000, -- ₹19,800.00
        'https://images.unsplash.com/photo-1589254065878-42c9da997008?auto=format&fit=crop&w=800&q=80',
        '84799090',
        1800,
        true,
        '{"stroke_mm": 85, "grip_force_n": "20-120", "actuation": "Electric Servo"}'::jsonb
    ) ON CONFLICT (id) DO UPDATE SET 
        sku = EXCLUDED.sku,
        category = EXCLUDED.category,
        price_paise = EXCLUDED.price_paise;

    INSERT INTO public.inventory (product_id, stock_on_hand, stock_reserved)
    VALUES (p6, 10, 0)
    ON CONFLICT (product_id) DO UPDATE SET stock_on_hand = EXCLUDED.stock_on_hand;

END $$;
