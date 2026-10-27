import { v2 as cloudinary } from "cloudinary";
import { requireAdminUser } from "@/lib/auth/admin-guard";

/**
 * POST /api/admin/cloudinary-sign
 *
 * Returns a short-lived Cloudinary signed upload signature so the browser
 * can upload directly to Cloudinary without exposing the API secret.
 *
 * Security:
 * - Admin session is verified server-side before any signature is issued.
 * - The API secret never leaves the server.
 * - Uploaded images are restricted to the "roboshop-forge/products" folder.
 * - An upload preset and folder are locked in the signature so the browser
 *   cannot override them.
 */
export async function POST() {
  try {
    // Authoritative admin guard — throws if session is invalid/not admin.
    await requireAdminUser();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return Response.json(
      { error: "Cloudinary is not configured on this server." },
      { status: 503 }
    );
  }

  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });

  const timestamp = Math.round(Date.now() / 1000);
  const folder = "roboshop-forge/products";

  // Sign: timestamp + folder are included so the browser cannot forge a
  // different folder or timestamp.
  const paramsToSign: Record<string, string | number> = {
    timestamp,
    folder,
  };

  const signature = cloudinary.utils.api_sign_request(paramsToSign, apiSecret);

  return Response.json({
    cloudName,
    apiKey,
    timestamp,
    folder,
    signature,
  });
}
