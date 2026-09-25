"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { IMAGE_ACCEPT, MAX_IMAGE_BYTES } from "@/lib/image-limits";
import { removeLogoAction, uploadLogoAction } from "@/lib/actions/organization";

type Notice = { kind: "error" | "success"; text: string } | null;

export function LogoUploader({
  logoUrl,
  organizationName,
}: {
  logoUrl: string | null;
  organizationName: string;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [isPending, setIsPending] = useState(false);

  const handleUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);

    const form = event.currentTarget;
    const file = fileInput.current?.files?.[0];

    if (!file) {
      setNotice({ kind: "error", text: "Choose an image file to upload." });
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      setNotice({ kind: "error", text: "The image must be 2 MB or smaller." });
      return;
    }

    setIsPending(true);

    const result = await uploadLogoAction(new FormData(form));

    setIsPending(false);

    if (result?.error) {
      setNotice({ kind: "error", text: result.error });
      return;
    }

    form.reset();
    setNotice({ kind: "success", text: "Logo updated." });
    router.refresh();
  };

  const handleRemove = async () => {
    setNotice(null);
    setIsPending(true);

    const result = await removeLogoAction();

    setIsPending(false);

    if (result?.error) {
      setNotice({ kind: "error", text: result.error });
      return;
    }

    setNotice({ kind: "success", text: "Logo removed." });
    router.refresh();
  };

  return (
    <form className="dash-card dash-form" onSubmit={handleUpload}>
      <p className="dash-card-label">Company logo</p>
      <div className="logo-row">
        <div className="logo-preview">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt={`${organizationName} logo`}
              width={144}
              height={144}
              unoptimized
            />
          ) : (
            <span aria-hidden="true">
              {organizationName.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="logo-controls">
          <input
            ref={fileInput}
            className="logo-file"
            id="logo-file"
            name="logo"
            type="file"
            accept={IMAGE_ACCEPT}
            aria-label="Choose a logo image"
          />
          <p className="dash-empty">PNG, JPEG or WebP, up to 2 MB.</p>
        </div>
      </div>
      {notice && (
        <p
          className={notice.kind === "error" ? "auth-error" : "auth-success"}
          role={notice.kind === "error" ? "alert" : "status"}
        >
          {notice.text}
        </p>
      )}
      <div className="dash-inline-actions">
        <button
          className="auth-submit dash-submit"
          type="submit"
          disabled={isPending}
        >
          {isPending ? "Working…" : "Upload logo"}
        </button>
        {logoUrl && (
          <button
            className="dash-danger-link"
            type="button"
            onClick={handleRemove}
            disabled={isPending}
          >
            Remove logo
          </button>
        )}
      </div>
    </form>
  );
}
