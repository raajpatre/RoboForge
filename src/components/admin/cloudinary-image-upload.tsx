"use client";

import { useRef, useState } from "react";
import { Upload, X, ImageIcon, Loader2, AlertCircle } from "lucide-react";
import Image from "next/image";

interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
}

interface CloudinaryImageUploadProps {
  /** Current image URL (controlled) */
  value: string;
  /** Called with the new Cloudinary secure_url after a successful upload */
  onChange: (url: string) => void;
  /** Optional additional className for the wrapper */
  className?: string;
}

const MAX_FILE_SIZE_MB = 10;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

/**
 * Direct-to-Cloudinary image uploader for the admin product form.
 *
 * Flow:
 * 1. Admin picks a file in the browser.
 * 2. Component POSTs to /api/admin/cloudinary-sign (server verifies admin session
 *    and returns a short-lived signed upload signature — API secret never leaves server).
 * 3. Component uploads the file directly to Cloudinary using the signature.
 * 4. On success, calls onChange(secure_url) so the parent form can persist the URL.
 *
 * The parent form stores the resulting Cloudinary URL (HTTPS) in the product's
 * image_url column — no binary is saved in the database.
 */
export function CloudinaryImageUpload({
  value,
  onChange,
  className = "",
}: CloudinaryImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const displayImage = previewUrl || value || null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!e.target.files) return;
    // Reset input so same file can be re-selected after an error
    e.target.value = "";

    if (!file) return;

    // Client-side validation
    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError("Unsupported file type. Please upload JPEG, PNG, WebP, or AVIF.");
      return;
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setUploadError(`File exceeds ${MAX_FILE_SIZE_MB} MB limit.`);
      return;
    }

    setUploadError(null);
    setIsUploading(true);

    // Show a local preview immediately
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    try {
      // Step 1: Get signed upload parameters from the server
      const signRes = await fetch("/api/admin/cloudinary-sign", {
        method: "POST",
        credentials: "include",
      });

      if (!signRes.ok) {
        const body = await signRes.json().catch(() => ({}));
        throw new Error(body.error || `Server error: ${signRes.status}`);
      }

      const { cloudName, apiKey, timestamp, folder, signature } =
        (await signRes.json()) as {
          cloudName: string;
          apiKey: string;
          timestamp: number;
          folder: string;
          signature: string;
        };

      // Step 2: Upload directly to Cloudinary
      const formData = new FormData();
      formData.append("file", file);
      formData.append("api_key", apiKey);
      formData.append("timestamp", String(timestamp));
      formData.append("signature", signature);
      formData.append("folder", folder);

      const uploadRes = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        { method: "POST", body: formData }
      );

      if (!uploadRes.ok) {
        const errBody = await uploadRes.json().catch(() => ({}));
        throw new Error(errBody?.error?.message || `Cloudinary error: ${uploadRes.status}`);
      }

      const result = (await uploadRes.json()) as CloudinaryUploadResult;

      // Revoke the object URL now that we have the CDN URL
      URL.revokeObjectURL(objectUrl);
      setPreviewUrl(null);

      // Notify parent with the permanent Cloudinary URL
      onChange(result.secure_url);
    } catch (err) {
      URL.revokeObjectURL(objectUrl);
      setPreviewUrl(null);
      setUploadError(
        err instanceof Error ? err.message : "Upload failed. Please try again."
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleClear = () => {
    setPreviewUrl(null);
    setUploadError(null);
    onChange("");
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Drop zone / preview area */}
      <div
        className={`
          relative group rounded-xl border-2 border-dashed transition-all duration-200 overflow-hidden
          ${displayImage
            ? "border-border/40 bg-muted/20"
            : "border-border hover:border-primary/50 hover:bg-primary/5 cursor-pointer"
          }
          ${isUploading ? "border-primary/40 bg-primary/5 pointer-events-none" : ""}
        `}
        style={{ minHeight: 160 }}
        onClick={() => !displayImage && !isUploading && inputRef.current?.click()}
        role={!displayImage ? "button" : undefined}
        aria-label={!displayImage ? "Upload product image" : undefined}
        tabIndex={!displayImage ? 0 : undefined}
        onKeyDown={(e) => {
          if (!displayImage && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        {displayImage ? (
          <>
            {/* Image preview */}
            <div className="relative w-full" style={{ aspectRatio: "16/9" }}>
              <Image
                src={displayImage}
                alt="Product preview"
                fill
                className="object-contain p-2"
                sizes="(max-width: 768px) 100vw, 600px"
                unoptimized={displayImage.startsWith("blob:")}
              />
            </div>

            {/* Overlay actions */}
            <div className="absolute inset-0 bg-background/0 group-hover:bg-background/60 flex items-center justify-center gap-3 transition-all duration-200 opacity-0 group-hover:opacity-100">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  inputRef.current?.click();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-mono font-medium hover:bg-primary/90 transition-colors"
              >
                <Upload className="size-3.5" />
                Replace
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClear();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs font-mono font-medium hover:bg-destructive/20 transition-colors"
              >
                <X className="size-3.5" />
                Remove
              </button>
            </div>
          </>
        ) : isUploading ? (
          <div className="flex flex-col items-center justify-center gap-3 p-10 text-primary">
            <Loader2 className="size-8 animate-spin" />
            <p className="text-xs font-mono">Uploading to Cloudinary…</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 p-10 text-muted-foreground">
            <div className="rounded-full bg-muted/60 p-3">
              <ImageIcon className="size-6" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-xs font-medium text-foreground">
                Click to upload product image
              </p>
              <p className="text-[11px] font-mono">
                JPEG, PNG, WebP or AVIF · max {MAX_FILE_SIZE_MB} MB
              </p>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-mono font-medium hover:bg-muted/50 transition-colors">
              <Upload className="size-3.5" />
              Choose File
            </div>
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_TYPES.join(",")}
        className="hidden"
        onChange={handleFileChange}
        aria-hidden="true"
      />

      {/* Error message */}
      {uploadError && (
        <div className="flex items-start gap-2 text-destructive text-xs rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2">
          <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
          <span>{uploadError}</span>
        </div>
      )}

      {/* Current URL display (manual fallback) */}
      {value && !previewUrl && (
        <p className="text-[11px] font-mono text-muted-foreground break-all">
          <span className="text-foreground/60">CDN URL: </span>
          {value}
        </p>
      )}
    </div>
  );
}
