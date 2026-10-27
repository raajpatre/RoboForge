import type { ProductCatalogItem } from "@/types/domain";

/**
 * Hardened Demo Seed Products (Illustrative robotics components for local testing & preview)
 */
export const FALLBACK_DEMO_PRODUCTS: ProductCatalogItem[] = [
  {
    id: "a1111111-1111-4111-8111-111111111111",
    slug: "forgebot-alpha-6dof",
    sku: "RBF-ARM-6DOF",
    category: "manipulators",
    name: "ForgeBot Alpha 6-DOF Robotic Arm",
    description:
      "Precision articulated 6-axis collaborative robotic arm with harmonic drive gearboxes, 3.5kg payload capacity, 0.05mm repeatability, and native ROS2 Galactic/Humble drivers.",
    price_paise: 18500000, // ₹1,85,000.00
    image_url:
      "https://images.unsplash.com/photo-1618042164219-62c820f10723?auto=format&fit=crop&w=800&q=80",
    hsn_code: "84795000",
    tax_rate_bps: 1800,
    is_active: true,
    metadata: {
      payload_kg: 3.5,
      reach_mm: 650,
      degrees_of_freedom: 6,
      interface: "Ethernet / CAN",
      repeatability: "0.05mm",
    },
    in_stock: true,
    available_quantity: 5,
  },
  {
    id: "a2222222-2222-4222-8222-222222222222",
    slug: "lidar-scan-360-pro",
    sku: "RBF-LIDAR-360",
    category: "sensors",
    name: "LiDAR-Scan 360 Pro SLAM Sensor",
    description:
      "360-degree Time-of-Flight 2D/3D LiDAR sensor with 25-meter radius range, 12Hz scanning frequency, and industrial IP65 dust/waterproof enclosure.",
    price_paise: 2499900, // ₹24,999.00
    image_url:
      "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80",
    hsn_code: "90151000",
    tax_rate_bps: 1800,
    is_active: true,
    metadata: {
      range_m: 25,
      scan_rate_hz: 12,
      sample_rate_khz: 16,
      interface: "USB-C / UART",
      protection: "IP65",
    },
    in_stock: true,
    available_quantity: 14,
  },
  {
    id: "a3333333-3333-4333-8333-333333333333",
    slug: "omnidrive-4wd-mobile-base",
    sku: "RBF-AMR-4WD",
    category: "mobility",
    name: "OmniDrive 4WD Heavy-Duty Mobile Platform",
    description:
      "Holonomic Mecanum-wheel autonomous mobile robotics chassis. CNC aluminum structure, four 24V brushless hub motors with built-in optical encoders, 50kg load capacity.",
    price_paise: 6850000, // ₹68,500.00
    image_url:
      "https://images.unsplash.com/photo-1531746790731-6c087fecd65a?auto=format&fit=crop&w=800&q=80",
    hsn_code: "84795000",
    tax_rate_bps: 1800,
    is_active: true,
    metadata: {
      payload_kg: 50,
      max_speed_ms: 1.8,
      voltage: "24V",
      wheel_type: "Mecanum 152mm",
    },
    in_stock: true,
    available_quantity: 8,
  },
  {
    id: "a4444444-4444-4444-8444-444444444444",
    slug: "neuronav-stereo-depth-v2",
    sku: "RBF-CAM-STEREO",
    category: "sensors",
    name: "NeuroNav Stereo Depth Camera V2",
    description:
      "Active infrared stereoscopic 3D camera with integrated 6-DoF IMU and neural depth processor. Delivers 90fps depth point clouds directly over USB 3.1 Gen 1.",
    price_paise: 3200000, // ₹32,000.00
    image_url:
      "https://images.unsplash.com/photo-1508739773434-c26b3d09e071?auto=format&fit=crop&w=800&q=80",
    hsn_code: "85258900",
    tax_rate_bps: 1800,
    is_active: true,
    metadata: {
      depth_resolution: "1280x720",
      fps: 90,
      shutter: "Global",
      baseline_mm: 95,
    },
    in_stock: true,
    available_quantity: 12,
  },
  {
    id: "a5555555-5555-4555-8555-555555555555",
    slug: "titancore-dual-bldc-esc-60a",
    sku: "RBF-ESC-60A",
    category: "controllers",
    name: "TitanCore Dual BLDC Motor ESC 60A",
    description:
      "Field-Oriented Control (FOC) dual brushless motor speed controller. Supports 12V-54V input, 60A continuous per channel, CAN bus telemetry, and programmable regen braking.",
    price_paise: 1150000, // ₹11,500.00
    image_url:
      "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=800&q=80",
    hsn_code: "85044090",
    tax_rate_bps: 1800,
    is_active: true,
    metadata: {
      voltage_range: "12V-54V",
      current_continuous_a: 60,
      bus: "CAN / UART / PWM",
    },
    in_stock: true,
    available_quantity: 25,
  },
  {
    id: "a6666666-6666-4666-8666-666666666666",
    slug: "gripperforge-soft-touch",
    sku: "RBF-GRP-SOFT",
    category: "end_effectors",
    name: "GripperForge Adaptive Soft-Touch Gripper",
    description:
      "Electric parallel 2-finger gripper with integrated force-torque feedback and exchangeable high-friction silicone pads. Stroke 85mm, gripping force 20N-120N.",
    price_paise: 1980000, // ₹19,800.00
    image_url:
      "https://images.unsplash.com/photo-1589254065878-42c9da997008?auto=format&fit=crop&w=800&q=80",
    hsn_code: "84799090",
    tax_rate_bps: 1800,
    is_active: true,
    metadata: {
      stroke_mm: 85,
      grip_force_n: "20-120",
      actuation: "Electric Servo",
    },
    in_stock: true,
    available_quantity: 10,
  },
  {
    id: "a7777777-7777-4777-8777-777777777777",
    slug: "can-bus-shielded-cable-1m",
    sku: "RBF-ACC-CAN1M",
    category: "accessories",
    name: "CAN-Bus Shielded Differential Cable (1m)",
    description:
      "Industrial braided 120-ohm differential CAN-Bus telemetry cable with twisted-pair noise rejection and locking connectors.",
    price_paise: 45000, // ₹450.00 (below ₹500 threshold)
    image_url:
      "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=800&q=80",
    hsn_code: "85444299",
    tax_rate_bps: 1800,
    is_active: true,
    metadata: {
      length_m: 1,
      impedance_ohm: 120,
      shielding: "Tinned Copper Braid",
    },
    in_stock: true,
    available_quantity: 50,
  },
];
